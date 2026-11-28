// A fire in one of the Lightning Jet Hangar's rooms on the catwalks' level, and its operator putting it out. Lightning
// over the Jet now and then jumps across the hall to a room's console, the room picked at random as the bolt cracks
// (`hangar-anomaly.js` asks `pick()` then, and hands it `ignite` as the bolt lands): a fire takes on the console's top,
// flames rising off it with embers and smoke and its orange light flickering, and the operator, the gorilla at the
// console, jumps back with a shout, goes to the extinguisher on the room's end wall, takes it, turns on the fire and
// sprays it out, a white cloud rolling off the console as it dies, then hangs the extinguisher back on its bracket and
// goes back to his post. While it runs the routine holds the gorilla (`holding`, which the scene leaves out of the
// crew's update), posing his root and parts itself: walking in steps of his own, his chest upright, his arms out to
// the extinguisher; it hands him back where he stood. Its sound is `hangarAudio`'s (`watchRoom`, `roomCue`).
//
// `create({ root, fx, audio, rooms })`: the scene's root and particles, the hangar's sound, and the rooms, each its
// operator (`gorilla`, a `BL.agent`) and the places its fire plays out (`spots`, `hangarModels.controlRoom()`'s and
// `sideRooms()`'s), an extinguisher on each one's bracket. Returns `pick(i)` (the room the next fire takes in, `i` or
// one at random, while none burns), `ignite()`, `update(dt)`, `lights(Lt, slot)` (the fire's light and the strike's
// flash, after the anomalies'; how many it wrote), `holding` (the gorilla while it holds him, else null), `burning`,
// `at` (where the bolt lands), `dispose` and `debug`. Allocates nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const HM = BL.hangarModels;

  // The routine's beats, s after the strike: the shout; walking to the extinguisher; taking it off its bracket; walking
  // to where he sprays from; spraying; the fire out; lowering it; walking back to the bracket; hanging it up; walking
  // home; done.
  const AT = { shout: 0.15, go: 0.8, take: 2.3, took: 2.75, carry: 3.0, spray: 4.3, out: 7.6, stop: 8.2, back: 8.9, hang: 10.4, hung: 10.85, home: 11.1, done: 12.6 };
  // The fire: how fast it takes, how tall it stands at full (m), its flames' places on the console's top round the spot
  // and their sizes, and its light (rgb at full, how far it reaches, m); the strike's flash (how long, rgb, reach).
  const FIRE = { grow: 1.4, height: 0.75, flames: [[0, 0, 1], [0.1, -0.12, 0.7], [-0.08, 0.13, 0.62]], light: [1.8, 0.8, 0.24], reach: 5.5, flash: 0.35, flashLight: [2.4, 2.8, 3.6], flashReach: 7 };
  // The spray: how many puffs a second, how fast they fly, and how long each lasts; the smoke after: until when.
  const SPRAY = { rate: 90, speed: 3, life: 0.45 };
  // The operator: how fast he walks (m/s) and how long a stride is (m), how far his legs and arms swing, how high he
  // hops at the shout (m), how upright he stands (chest pitch), how far he bends to take and hang the extinguisher, and
  // where he holds it, in front of him (m out, m up).
  const WALKER = { stride: 0.55, legs: 0.5, arms: 0.25, hop: 0.12, upright: 0.16, bend: 0.65, hold: 0.4, holdY: 0.62 };
  const ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const clamp01 = (u) => u < 0 ? 0 : u > 1 ? 1 : u;

  const create = ({ root, fx, audio, rooms }) => {
    const floor = HM.CONTROL.floor;
    // The flames: the arcade's smooth blaze, three of them, hidden while nothing burns.
    const flames = FIRE.flames.map(() => createNode({ geometry: BL.blaze.smooth(), visible: false, sightHidden: true }));
    addChild(root, ...flames);
    // An extinguisher in each room, on its bracket until he takes it.
    const exts = rooms.map((r) => {
      const n = createNode({ geometry: HM.extinguisher() }), B = r.spots.bracket;
      n.position.x = B.x; n.position.y = B.y; n.position.z = B.z; n.rotation.y = B.turn;
      addChild(root, n);
      return n;
    });
    // The room the fire takes in: its places, its operator and his parts, and its extinguisher.
    let room = 0, S = rooms[0].spots, gorilla = rooms[0].gorilla, P = gorilla.parts, ext = exts[0];
    const EMBER = BL.models.particleGeometry("#ff8a2a", 0.05, 1), MIST = BL.models.particleGeometry("#f4f7fa", 0.14, 0.7);
    // The state: whether it runs and how far in; the fire's level; the strike's flash; where he stands, his heading and
    // his stride's phase; and what the sound reads.
    let active = false, t = 0, level = 0, flash = 0, phase = 0, heading = S.post.heading, emberAt = 0, sprayAt = 0, puffAt = 0;
    const at = { x: S.fire.x, y: S.fire.y + 0.1, z: S.fire.z };
    const sound = { x: S.fire.x, y: S.fire.y, z: S.fire.z, level: 0, spray: false };
    const pos = { x: S.post.x, z: S.post.z };
    audio.watchRoom(sound);

    // The extinguisher back on its bracket, or held in front of him.
    const onBracket = () => {
      ext.position.x = S.bracket.x; ext.position.y = S.bracket.y; ext.position.z = S.bracket.z;
      ext.rotation.y = S.bracket.turn;
    };
    const held = () => {
      const s = Math.sin(heading), c = Math.cos(heading);
      ext.position.x = pos.x + s * WALKER.hold; ext.position.y = floor + WALKER.holdY; ext.position.z = pos.z + c * WALKER.hold;
      ext.rotation.y = heading;
    };
    // Where the nozzle's mouth is now, into NOZ.
    const NOZ = { x: 0, y: 0, z: 0 };
    const nozzle = () => {
      const N = HM.NOZZLE, s = Math.sin(ext.rotation.y), c = Math.cos(ext.rotation.y);
      NOZ.x = ext.position.x + N.x * c + N.z * s; NOZ.y = ext.position.y + N.y; NOZ.z = ext.position.z - N.x * s + N.z * c;
    };

    // His pose: where he stands and which way he faces, a hop, his chest's lean, his legs' stride and his arms, as angles
    // from straight down in the world (forward is -pi/2).
    const pose = (hop, lean, legs, armR, armL) => {
      const r = gorilla.root;
      r.position.x = pos.x; r.position.z = pos.z; r.position.y = floor + hop;
      r.rotation.y = heading;
      gorilla.chest.rotation.x = lean;
      gorilla.chest.rotation.z = 0;
      P.legR.rotation.x = legs; P.legL.rotation.x = -legs;
      P.armR.rotation.x = armR - lean; P.armL.rotation.x = armL - lean;
      P.armR.rotation.z = P.armL.rotation.z = 0;
      P.head.rotation.x = -lean * 0.8;
    };
    // A walk from (a) to (b) between beats t0 and t1, turning to face the way it goes, then to `face` as it arrives;
    // carrying the extinguisher holds his arms out in front.
    const walk = (a, b, t0, t1, face, carrying, dt) => {
      const u = ease((t - t0) / (t1 - t0)), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const x = a.x + dx * u, z = a.z + dz * u, moved = Math.hypot(x - pos.x, z - pos.z);
      pos.x = x; pos.z = z;
      phase += moved / WALKER.stride * Math.PI;
      const way = d > 0.01 ? Math.atan2(dx, dz) : face, toward = u < 0.85 ? way : face;
      heading += Math.atan2(Math.sin(toward - heading), Math.cos(toward - heading)) * Math.min(1, dt * 8);
      const swing = Math.sin(phase) * (u > 0 && u < 1 ? 1 : 0);
      if (carrying) { held(); pose(0, WALKER.upright, swing * WALKER.legs, -1.0, -1.0); }
      else pose(0, WALKER.upright, swing * WALKER.legs, swing * WALKER.arms, -swing * WALKER.arms);
    };
    // Bending to the bracket and back up, `u` 0 to 1 and back, his arms reaching down to it.
    const bend = (u) => pose(0, WALKER.upright + (WALKER.bend - WALKER.upright) * u, 0, -0.5 - 0.5 * u, -0.5 - 0.5 * u);

    // The room the next fire takes in, `i` or one at random, while none burns; where the bolt lands follows it.
    const pick = (i = Math.floor(Math.random() * rooms.length)) => {
      if (active) return;
      room = i; S = rooms[i].spots; gorilla = rooms[i].gorilla; P = gorilla.parts; ext = exts[i];
      at.x = S.fire.x; at.y = S.fire.y + 0.1; at.z = S.fire.z;
      sound.x = S.fire.x; sound.y = S.fire.y; sound.z = S.fire.z;
    };
    const ignite = () => {
      if (active) return;
      active = true; t = 0; level = 0; flash = 1; phase = 0;
      pos.x = S.post.x; pos.z = S.post.z; heading = S.post.heading;
      onBracket();
      audio.roomCue("strike", at.x, at.y, at.z);
    };
    // Done: the fire out, the extinguisher on its bracket, and him back at his post as the crew had him.
    const release = () => {
      active = false; level = 0; flash = 0;
      for (const f of flames) f.visible = false;
      sound.level = 0; sound.spray = false;
      onBracket();
      gorilla.place(S.post.x, S.post.z, S.post.heading);
    };

    const update = (dt) => {
      if (flash > 0) flash = Math.max(0, flash - dt / FIRE.flash);
      if (!active) return;
      t += dt;
      // The fire: taking, burning, then dying under the spray.
      level = t < AT.spray ? ease(t / FIRE.grow) : t < AT.out ? 1 - ease((t - AT.spray) / (AT.out - AT.spray)) : 0;
      if (t >= AT.out && t - dt < AT.out) { audio.roomCue("out", at.x, at.y, at.z); fx.sayAt(pos.x, floor + 1.9, pos.z, "...all clear.", 1.8); }
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i], F = FIRE.flames[i], k = level * F[2] * (1 + BL.blaze.flare(t, i * 2.1) * 2.5);
        f.visible = k > 0.03;
        f.position.x = S.fire.x + F[0]; f.position.y = S.fire.y; f.position.z = S.fire.z + F[1];
        f.scale.x = f.scale.z = k * 1.3; f.scale.y = k * FIRE.height / 0.5;
      }
      // Embers off it while it burns, and smoke, black while it burns and white as it dies and after.
      if (level > 0.2 && (emberAt -= dt) <= 0) {
        emberAt = 0.08 / level;
        fx.spawnParticle(EMBER, S.fire.x + (Math.random() - 0.5) * 0.3, S.fire.y + 0.2, S.fire.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, 4, -0.6);
      }
      if (t < AT.done && (puffAt -= dt) <= 0) {
        puffAt = level > 0.1 ? 0.18 : 0.4;
        fx.puff(S.fire.x + (Math.random() - 0.5) * 0.2, S.fire.y + 0.3 + level * 0.4, S.fire.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2, 1.2 + Math.random() * 0.8);
      }
      // The operator.
      const spraying = t >= AT.spray && t < AT.stop;
      if (t < AT.go) {
        // Jumping back from it with his arms up, and the shout.
        const u = clamp01(t / 0.35), hop = Math.sin(Math.min(1, t / 0.4) * Math.PI) * WALKER.hop, back = 0.12 * ease(t / 0.4);
        pos.x = S.post.x - Math.sin(S.post.heading) * back; pos.z = S.post.z - Math.cos(S.post.heading) * back;
        pose(hop, WALKER.upright, 0, -2.6 * u, -2.6 * u);
        if (t >= AT.shout && t - dt < AT.shout) fx.sayAt(pos.x, floor + 1.9, pos.z, "FIRE!", 1.4);
      } else if (t < AT.take) walk(S.post, S.take, AT.go, AT.take, S.take.heading, false, dt);
      else if (t < AT.carry) {
        // Bending to take it off the bracket, and up with it.
        const u = t < AT.took ? ease((t - AT.take) / (AT.took - AT.take)) : 1 - ease((t - AT.took) / (AT.carry - AT.took));
        bend(u);
        if (t >= AT.took) held();
        if (t >= AT.took && t - dt < AT.took) audio.roomCue("clank", S.bracket.x, S.bracket.y, S.bracket.z);
      } else if (t < AT.spray) walk(S.take, S.spray, AT.carry, AT.spray, S.spray.heading, true, dt);
      else if (t < AT.back) {
        // Spraying it, braced, and lowering it once it's out.
        held();
        const lower = t < AT.stop ? 0 : ease((t - AT.stop) / (AT.back - AT.stop));
        pose(0, WALKER.upright + 0.1, 0, -1.25 + 0.3 * lower, -1.1 + 0.3 * lower);
        if (spraying && (sprayAt -= dt) <= 0) {
          sprayAt = 1 / SPRAY.rate;
          nozzle();
          const dx = S.fire.x - NOZ.x, dy = S.fire.y + 0.15 - NOZ.y, dz = S.fire.z - NOZ.z, d = Math.hypot(dx, dy, dz) || 1, v = SPRAY.speed;
          fx.spawnParticle(MIST, NOZ.x, NOZ.y, NOZ.z, dx / d * v + (Math.random() - 0.5) * 0.6, dy / d * v + (Math.random() - 0.3) * 0.5, dz / d * v + (Math.random() - 0.5) * 0.6, SPRAY.life * (0.7 + Math.random() * 0.6), 2, -0.2);
          if (Math.random() < 0.2) fx.puff(S.fire.x + (Math.random() - 0.5) * 0.4, S.fire.y + 0.1, S.fire.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.35, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 0.6);
        }
      } else if (t < AT.hang) walk(S.spray, S.take, AT.back, AT.hang, S.take.heading, true, dt);
      else if (t < AT.home) {
        const u = t < AT.hung ? ease((t - AT.hang) / (AT.hung - AT.hang)) : 1 - ease((t - AT.hung) / (AT.home - AT.hung));
        bend(u);
        if (t < AT.hung) held(); else onBracket();
        if (t >= AT.hung && t - dt < AT.hung) audio.roomCue("clank", S.bracket.x, S.bracket.y, S.bracket.z);
      } else if (t < AT.done) walk(S.take, S.post, AT.home, AT.done, S.post.heading, false, dt);
      else release();
      if (active) { sound.level = level; sound.spray = spraying; }
    };

    // The fire's light, flickering with its flames, and the strike's flash, from `slot`; how many it wrote.
    const put = (Lt, slot, x, y, z, radius, rgb, k) => {
      const w = slot * 8;
      Lt[w] = x; Lt[w + 1] = y; Lt[w + 2] = z; Lt[w + 3] = radius;
      Lt[w + 4] = rgb[0] * k; Lt[w + 5] = rgb[1] * k; Lt[w + 6] = rgb[2] * k; Lt[w + 7] = 0;
    };
    const lights = (Lt, slot) => {
      let n = 0;
      if (level > 0.02) put(Lt, slot + n++, S.fire.x + 0.3, S.fire.y + 0.5, S.fire.z, FIRE.reach, FIRE.light, level * (1 + BL.blaze.flare(t) * 3));
      if (flash > 0) put(Lt, slot + n++, at.x + 0.5, at.y + 0.5, at.z, FIRE.flashReach, FIRE.flashLight, flash * flash);
      return n;
    };
    // Leaving mid-fire: all of it put back at once.
    const dispose = () => { if (active) release(); };
    const debug = {
      ignite: (i) => { if (i !== undefined) pick(i); ignite(); },
      get room() { return room; },
      get t() { return active ? t : -1; },
      get level() { return level; },
      get active() { return active; },
      get extinguisher() { return { x: ext.position.x, y: ext.position.y, z: ext.position.z }; },
      get operator() { return { x: pos.x, z: pos.z, heading }; }
    };
    return { pick, ignite, update, lights, dispose, debug, at, get holding() { return active ? gorilla : null; }, get burning() { return active; } };
  };

  BL.hangarRoomFire = { create, AT, FIRE };
})();
