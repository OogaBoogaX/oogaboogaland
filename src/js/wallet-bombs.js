// Free Hardware Wallets' devices (scene-wallets.js): the store's vending machine gives away two parody devices,
// the "Rektdger" (a stick whose tiny screen reads REKT) and the "ClownCard" (a card with a keypad of coloured keys and
// a red clown nose for its button). Each is a little bomb: `FUSE` seconds after it is taken it explodes, whether
// carried, set down or thrown. The driven Ooga carries one in front of it with its name and countdown over it, sets
// it down where the visitor taps the floor (`setDown`), picks a set-down one up again (tap it) and throws it in a
// short arc (the Throw button, or T); one still held at zero blows up in its hands, knocks it back and blackens it
// with soot for a few seconds. A blast sets off every other live device within `CHAIN_RADIUS` in the same frame,
// chained, and the merged blast grows with their number (`blastOf`): it knocks Oogas back, breaks what `breakables`
// holds and leaves a scorch mark that fades. Nobody dies; the joke is that free hardware wallets are never a gift.
//
// Fixed pools throughout: `BOMB_CAP` devices in typed arrays, one instanced batch a look (screen and LED glow
// ride the instance's glow) and one of soft glowing rings under the devices on the floor, `SCORCH_CAP` scorch marks
// in a ring. The labels are prebuilt strings, the beep and boom two pooled synthesized voices on one AudioContext
// opened only after a gesture. The frame loop writes `instanceData` in place and allocates nothing. No camera shake
// (the camera moves only on input): the blast is a flash of point light, particles from the fx pool, smoke and the
// boom.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a } = BL.math;
  const BOMB_CAP = 16, SCORCH_CAP = 24, FIREBALL_CAP = 4, FUSE = 21, COOLDOWN = 3, FIREBALL_SECONDS = 0.5;
  const CHAIN_RADIUS = 2.5, BASE_RADIUS = 2.2, BASE_POWER = 2, POWER_CAP = 8;
  // A lob from over the head carries about three and a half metres, bounce included: well inside the store.
  const GRAVITY = 9.8, THROW_SPEED = 3.2, THROW_LIFT = 2.6, FLASH_SECONDS = 0.35, SCORCH_SECONDS = 25;
  // Drawn this much larger than the models, so they read across the room; a name shows over a device nearer the
  // driven Ooga than NAME_NEAR, and one is picked up from PICK_REACH.
  const SCALE = 1.6, NAME_NEAR = 4, PICK_REACH = 2.5;
  const FREE = 0, CARRIED = 1, FLYING = 2, DROPPED = 3;
  const STATE_NAMES = ["free", "carried", "flying", "dropped"];
  const LOOKS = [{ id: "rektdger", name: "Rektdger" }, { id: "clowncard", name: "ClownCard" }];
  const SECONDS = Array.from({ length: FUSE + 1 }, (_, i) => String(i));
  const NAMED = LOOKS.map((look) => Array.from({ length: FUSE + 1 }, (_, i) => `${look.name} ${i}`));
  const AUDIO_KEY = "oogaboogaland.audio";
  // The merged blast of n devices going off together: wider by the square root, stronger by the count (capped).
  const blastOf = (n) => ({ radius: BASE_RADIUS * Math.sqrt(n), power: BASE_POWER * Math.min(n, POWER_CAP) });
  // Marks in `out` every live device the blast from `start` sets off, through every device it sets off in turn;
  // returns how many go. `live` holds 1 for a device that can still explode.
  const chainFrom = (xs, zs, live, count, start, out) => {
    out.fill(0, 0, count);
    out[start] = 1;
    let n = 1;
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < count; i++) {
        if (out[i] !== 1) continue;
        out[i] = 2;
        for (let j = 0; j < count; j++) {
          if (out[j] || !live[j]) continue;
          const dx = xs[j] - xs[i], dz = zs[j] - zs[i];
          if (dx * dx + dz * dz > CHAIN_RADIUS * CHAIN_RADIUS) continue;
          out[j] = 1;
          n++;
          grew = true;
        }
      }
    }
    return n;
  };

  // The two parody looks, drawn larger than life so they read at island scale. Faces marked emissive are the
  // screen, the REKT on it, the LED and the clown nose, which blink by the instance glow.
  const geometryOf = (() => {
    const cache = [];
    return (look) => cache[look] || (cache[look] = build(look));
  })();
  const build = (look) => {
    const { box, merge } = BL.models;
    if (look === 0) {
      // The Rektdger: an orange stick with a steel cap and a dark screen that reads REKT in the signs' 3x5 letters.
      const parts = [
        box({ w: 0.42, h: 0.1, d: 0.13, color: "#ff8a1f", offset: { y: 0.05 } }),
        box({ w: 0.1, h: 0.08, d: 0.11, color: "#c9ced6", offset: { x: 0.24, y: 0.05 } }),
        box({ w: 0.24, h: 0.012, d: 0.1, color: "#121416", offset: { x: -0.03, y: 0.104 } }),
        box({ w: 0.22, h: 0.014, d: 0.084, color: "#0e2a16", emissive: 0.4, offset: { x: -0.03, y: 0.108 } }),
        box({ w: 0.03, h: 0.02, d: 0.03, color: "#ff3b2f", emissive: 1, offset: { x: 0.14, y: 0.112 } })
      ];
      const px = 0.0125, glyphs = BL.hubModels.SIGN_GLYPHS;
      [..."REKT"].forEach((ch, i) => glyphs[ch].forEach((row, r) => [...row].forEach((on, c) => {
        if (on === "1") parts.push(box({ w: px, h: 0.006, d: px, color: "#ff5a46", emissive: 1, offset: { x: -0.03 + (i * 4 + c - 7) * px, y: 0.117, z: (r - 2) * px } }));
      })));
      return merge(...parts);
    }
    // The ClownCard: a white card with a keypad of coloured keys, a green screen, and a round red clown nose for its
    // button (the blinking light), with two tufts of clown hair at its top corners.
    const KEYS = ["#ff4b3a", "#ffd23a", "#3aa0ff", "#46c85a", "#c06cff", "#ff8a1f"];
    const parts = [
      box({ w: 0.28, h: 0.06, d: 0.38, color: "#f6f1e4", offset: { y: 0.03 } }),
      box({ w: 0.22, h: 0.012, d: 0.1, color: "#121416", offset: { y: 0.064, z: -0.11 } }),
      box({ w: 0.19, h: 0.014, d: 0.07, color: "#46ff72", emissive: 1, offset: { y: 0.07, z: -0.11 } }),
      box({ w: 0.075, h: 0.05, d: 0.075, color: "#ff2a2a", emissive: 1, offset: { y: 0.085, z: 0.02 } }),
      box({ w: 0.055, h: 0.02, d: 0.055, color: "#ff2a2a", emissive: 1, offset: { y: 0.115, z: 0.02 } }),
      box({ w: 0.02, h: 0.012, d: 0.02, color: "#ffd0d0", emissive: 1, offset: { x: -0.015, y: 0.124, z: 0.005 } })
    ];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) parts.push(box({ w: 0.05, h: 0.016, d: 0.04, color: KEYS[(r * 3 + c) % KEYS.length], offset: { x: (c - 1) * 0.07, y: 0.068, z: 0.09 + r * 0.06 } }));
    for (const [x, hair] of [[-0.13, "#3aa0ff"], [0.13, "#ff5ab0"]]) {
      parts.push(box({ w: 0.06, h: 0.05, d: 0.06, color: hair, offset: { x, y: 0.07, z: -0.17 } }));
      parts.push(box({ w: 0.04, h: 0.04, d: 0.04, color: hair, offset: { x: x * 1.25, y: 0.1, z: -0.19 } }));
    }
    return merge(...parts);
  };
  const scorchGeometry = (() => {
    let geo = null;
    return () => geo || (geo = (() => {
      const { makeVox, voxelGeometry } = BL.models;
      const v = makeVox(), rand = BL.math.mulberry32(919);
      for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > 8.6 || d > 6.5 && rand() < 0.5) continue;
        v.set(x, 0, z, d < 3 ? 0 : rand() < 0.3 ? 2 : 1);
      }
      const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#141210", "#2b2724", "#3d3a36"], origin: { x: 0, y: 0, z: 0 } });
      g.castShadow = false;
      return g;
    })());
  })();
  // The blast's ball of fire: a glowing voxel blob, yellow at its heart and orange outside, grown and shrunk by scale.
  const fireballGeometry = (() => {
    let geo = null;
    return () => geo || (geo = (() => {
      const { makeVox, voxelGeometry } = BL.models;
      const v = makeVox(), rand = BL.math.mulberry32(733);
      for (let x = -6; x <= 5; x++) for (let y = -6; y <= 5; y++) for (let z = -6; z <= 5; z++) {
        const d = Math.hypot(x + 0.5, y + 0.5, z + 0.5);
        if (d > 6 || d > 4.8 && rand() < 0.45) continue;
        v.set(x, y, z, d < 3.5 ? 0 : rand() < 0.5 ? 1 : 2);
      }
      const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#fff1b0", "#ffb02e", "#ff6a1f"], emissive: { 0: 1, 1: 1, 2: 1 } });
      g.castShadow = false;
      return g;
    })());
  })();
  // One instance: rotation Ry(yaw) Rz(roll), scaled by s, at (x, y, z), with its glow.
  const writeInstance = (data, o, yaw, roll, s, x, y, z, glow) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    data[o] = cy * cr * s; data[o + 1] = sr * s; data[o + 2] = -sy * cr * s; data[o + 3] = 0;
    data[o + 4] = -cy * sr * s; data[o + 5] = cr * s; data[o + 6] = sy * sr * s; data[o + 7] = 0;
    data[o + 8] = sy * s; data[o + 9] = 0; data[o + 10] = cy * s; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
    data[o + 16] = glow; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
  };
  // The soft ring a device on the floor glows in, so it is easy to find: device orange, lit from within.
  const haloGeometry = (() => {
    let geo = null;
    return () => geo || (geo = (() => {
      const { makeVox, voxelGeometry } = BL.models;
      const v = makeVox();
      for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d >= 7.4 && d <= 9.4) v.set(x, 0, z, d > 8.5 ? 1 : 0);
      }
      const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#ffb02e", "#ff8a1f"], origin: { x: 0, y: 0, z: 0 }, emissive: { 0: 0.9, 1: 0.6 } });
      g.castShadow = false;
      return g;
    })());
  })();

  const create = ({ root, crew, fx, hud, breakables = null, groundAt, addTarget, pickGeometry, onBlast = null }) => {
    const { createNode, addChild, removeChild, updateWorld } = BL.scene;
    const batch = (geometry, cap) => createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, visible: false, fixedInstanceCapacity: true });
    const devices = LOOKS.map((look, i) => batch(geometryOf(i), BOMB_CAP));
    const halos = batch(haloGeometry(), BOMB_CAP);
    const scorches = batch(scorchGeometry(), SCORCH_CAP), fireballs = batch(fireballGeometry(), FIREBALL_CAP);
    for (const node of [...devices, halos, scorches, fireballs]) addChild(root, node);
    const fire = new Float32Array(FIREBALL_CAP * 5);
    let fireNext = 0;
    const state = new Uint8Array(BOMB_CAP), lookOf = new Uint8Array(BOMB_CAP), going = new Uint8Array(BOMB_CAP), live = new Uint8Array(BOMB_CAP);
    const px = new Float32Array(BOMB_CAP), py = new Float32Array(BOMB_CAP), pz = new Float32Array(BOMB_CAP);
    const vx = new Float32Array(BOMB_CAP), vy = new Float32Array(BOMB_CAP), vz = new Float32Array(BOMB_CAP);
    const timer = new Float32Array(BOMB_CAP), yaw = new Float32Array(BOMB_CAP), roll = new Float32Array(BOMB_CAP);
    const carriers = new Array(BOMB_CAP).fill(null);
    const scorchAt = new Float32Array(SCORCH_CAP * 4), scorchAge = new Float32Array(SCORCH_CAP).fill(SCORCH_SECONDS);
    const flash = { x: 0, y: 0, z: 0, t: 0, strength: 0 };
    const cursor = new Int32Array(LOOKS.length);
    let serial = 0, cooldown = 0, scorchNext = 0, blasts = 0, chained = 0, shake = 0, beepIn = 0;
    const picks = [];
    for (let i = 0; i < BOMB_CAP; i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "wallet", wallet: i, weaponType: "none" }, { radius: 0.4 });
      picks.push(node);
    }
    const DEBRIS = [BL.models.particleGeometry("#ff8a1f", 0.07, 1), BL.models.particleGeometry("#ffd66b", 0.06, 1), BL.models.particleGeometry("#3d3d44", 0.07, 0), BL.models.particleGeometry("#efe6cc", 0.05, 0)];
    // Sound: one beep and one boom voice, synthesized, opened after a gesture, honouring the page-wide mute.
    let audio = null, muted = false;
    try {
      muted = localStorage.getItem(AUDIO_KEY) === "off";
    } catch {
      muted = false;
    }
    const openAudio = () => {
      if (audio || muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return !!audio;
      const ctx = new AudioContext(), master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
      const tone = ctx.createOscillator(), beep = ctx.createGain();
      tone.type = "square";
      tone.frequency.value = 1760;
      beep.gain.value = 0;
      tone.connect(beep);
      beep.connect(master);
      tone.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(), low = ctx.createBiquadFilter(), boom = ctx.createGain();
      noise.buffer = buffer;
      noise.loop = true;
      low.type = "lowpass";
      low.frequency.value = 420;
      boom.gain.value = 0;
      noise.connect(low);
      low.connect(boom);
      boom.connect(master);
      noise.start();
      audio = { ctx, beep: beep.gain, boom: boom.gain };
      return true;
    };
    const cue = (gain, level, attack, length) => {
      if (!openAudio()) return;
      if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
      const t = audio.ctx.currentTime;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(0.0001, t);
      gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
      gain.exponentialRampToValueAtTime(0.0001, t + length);
    };
    const slot = () => {
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === FREE) return i;
      return -1;
    };
    const spawn = (x, y, z, look, s = DROPPED, carrier = null) => {
      const i = slot();
      if (i < 0) return -1;
      serial++;
      state[i] = s; lookOf[i] = look; timer[i] = FUSE; carriers[i] = carrier;
      px[i] = x; py[i] = y; pz[i] = z; vx[i] = vy[i] = vz[i] = 0; yaw[i] = (fnv1a(`wallet/${serial}/yaw`) % 628) / 100; roll[i] = 0;
      return i;
    };
    const carried = (cave) => {
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === CARRIED && carriers[i] === cave) return i;
      return -1;
    };
    // The device the driven Ooga holds, -1 for none; its look and whole seconds left.
    const held = () => crew.player ? carried(crew.player) : -1;
    const lookAt = (i) => lookOf[i];
    const secondsLeft = (i) => Math.ceil(timer[i]);
    const count = () => {
      let n = 0;
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) n++;
      return n;
    };
    // Why the driven Ooga cannot take one now, or null: one carried already, the machine still wrapping the last one,
    // or every device out.
    const refusal = () => {
      const player = crew.player;
      if (!player) return "Walk an Ooga in to take one.";
      if (carried(player) >= 0) return "Ooga already holds one. Set it down or throw it first!";
      if (cooldown > 0) return "One free wallet at a time. The next is being wrapped.";
      if (slot() < 0) return "Out of free wallets. Wait for a boom.";
      return null;
    };
    // The driven Ooga takes a device of `look` into its hands; -1 (with a toast) when refused.
    const take = (look) => {
      const why = refusal();
      if (why) {
        hud.toast(why);
        return -1;
      }
      const player = crew.player, i = spawn(0, 0, 0, look, CARRIED, player);
      cooldown = COOLDOWN;
      fx.say(player, "Free wallet! Ooga rich!", 2);
      openAudio();
      return i;
    };
    const throwFrom = (i) => {
      const cave = carriers[i], h = cave.root.rotation.y;
      state[i] = FLYING; carriers[i] = null;
      vx[i] = Math.sin(h) * THROW_SPEED; vz[i] = Math.cos(h) * THROW_SPEED; vy[i] = THROW_LIFT;
      fx.say(cave, "Ooga no want. YEET!", 1.6);
    };
    const throwCarried = () => {
      const i = held();
      if (i < 0) return false;
      throwFrom(i);
      return true;
    };
    // Sets the carried device down on the floor at (x, z), where the Ooga stands by; false with none carried.
    const setDown = (x, z) => {
      const i = held();
      if (i < 0) return false;
      const floor = groundAt(x, z, py[i] + 0.3);
      state[i] = DROPPED; carriers[i] = null;
      px[i] = x; pz[i] = z; py[i] = floor > -100 ? floor : 0; roll[i] = 0;
      fx.say(crew.player, "Ooga put it here. Tick tick.", 1.6);
      return true;
    };
    // A tap on a device on the floor within reach picks it up. False for one further off with the Ooga's hands free
    // (the scene walks it over), else with a toast of its seconds.
    const tap = (i) => {
      const player = crew.player;
      if (state[i] === DROPPED && player && carried(player) < 0) {
        const dx = px[i] - player.root.position.x, dz = pz[i] - player.root.position.z;
        if (dx * dx + dz * dz >= PICK_REACH * PICK_REACH) return false;
        state[i] = CARRIED; carriers[i] = player;
        fx.say(player, "Ooga pick up. Still ticking?", 1.8);
        return true;
      }
      hud.toast(`${LOOKS[lookOf[i]].name} · ${secondsLeft(i)} s left`);
      return false;
    };
    // Where device i lies on the floor, into `out`; null unless it is on the floor.
    const where = (i, out) => {
      if (state[i] !== DROPPED) return null;
      out.x = px[i]; out.y = py[i]; out.z = pz[i];
      return out;
    };
    const tooltip = (i) => `${LOOKS[lookOf[i]].name} · ${secondsLeft(i)} s · ${state[i] === CARRIED ? "Throw, or tap the ground to set it down" : "tap to pick it up"}`;
    // A blast from device `start` and every device it sets off: one merged burst at their middle.
    const detonate = (start) => {
      for (let i = 0; i < BOMB_CAP; i++) live[i] = state[i] !== FREE ? 1 : 0;
      const n = chainFrom(px, pz, live, BOMB_CAP, start, going);
      let x = 0, y = 0, z = 0, victim = null;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (!going[i]) continue;
        x += px[i]; y += py[i]; z += pz[i];
        if (state[i] === CARRIED && !victim) victim = carriers[i];
        state[i] = FREE; carriers[i] = null;
      }
      x /= n; y /= n; z /= n;
      const { radius, power } = blastOf(n);
      blasts++;
      if (n > 1) chained += n;
      flash.x = x; flash.y = y + 0.8; flash.z = z; flash.t = FLASH_SECONDS; flash.strength = Math.min(3, 1 + n * 0.4);
      const f = fireNext * 5;
      fireNext = (fireNext + 1) % FIREBALL_CAP;
      fire[f] = x; fire[f + 1] = y + 0.35; fire[f + 2] = z; fire[f + 3] = 0; fire[f + 4] = radius;
      fx.burst(x, y + 0.2, z, Math.min(48, 14 + n * 6), DEBRIS, 3 + Math.sqrt(n));
      for (let k = 0; k < Math.min(12, 4 + n * 2); k++) fx.puff(x + (Math.random() - 0.5) * radius * 0.5, y + 0.3, z + (Math.random() - 0.5) * radius * 0.5, (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, 1.6 + Math.random());
      const s = scorchNext;
      scorchNext = (scorchNext + 1) % SCORCH_CAP;
      scorchAt[s * 4] = x; scorchAt[s * 4 + 1] = groundAt(x, z, y + 0.5) + 0.012; scorchAt[s * 4 + 2] = z; scorchAt[s * 4 + 3] = Math.min(2.4, 0.45 * radius);
      if (!(scorchAt[s * 4 + 1] > -100)) scorchAt[s * 4 + 1] = y + 0.012;
      scorchAge[s] = 0;
      // Breakables in reach take the blast's power, less toward its edge.
      if (breakables) {
        const props = breakables.list;
        for (let k = 0; k < props.length; k++) {
          const record = props[k], owner = record.owner, at = owner.node.position;
          if (record.broken || !owner.active || !owner.node.visible) continue;
          const d = Math.hypot(at.x - x, at.z - z);
          if (d > radius) continue;
          breakables.hit(null, { owner, x: at.x, y: at.y + 0.3, z: at.z }, power * (1 - 0.5 * d / radius));
        }
      }
      // Oogas in reach are knocked back with a hop; the one holding it is also blackened with soot.
      for (const cave of crew.list) {
        if (!cave.root.visible || cave.health.stunned) continue;
        const p = cave.root.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
        if (d > radius && cave !== victim) continue;
        const k = cave === victim ? 1 : 1 - d / radius, away = d > 0.01 ? 1 / d : 0;
        cave.hopV = Math.max(cave.hopV, 2.4 + 2 * k);
        // Only the driven Ooga's hop carries sideways momentum (crew.js moves it); the others hop in place.
        if (cave === crew.player) { cave.leap.vx = dx * away * 2.5 * k; cave.leap.vz = dz * away * 2.5 * k; }
        crew.damage(cave, 0.5 * power * k);
        if (cave === victim) crew.soot(cave, 5);
        else fx.say(cave, "OOGA?!", 1.2);
      }
      if (victim) hud.toast("Ooga held the free hardware wallet too long. Never trust a free hardware wallet!");
      else if (n > 1) hud.toast(`${n} free wallets went off together. BOOM!`);
      if (onBlast) onBlast(x, z, radius);
      shake = 0.4;
      if (audio) cue(audio.boom, Math.min(1, 0.55 + n * 0.12), 0.01, 1.1 + Math.min(1, n * 0.15));
      return n;
    };
    const update = (dt, elapsed) => {
      if (cooldown > 0) cooldown -= dt;
      if (shake > 0) shake = Math.max(0, shake - dt);
      cursor.fill(0);
      let nearest = Infinity, rings = 0;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (state[i] === FREE) continue;
        if ((timer[i] -= dt) <= 0) {
          detonate(i);
          continue;
        }
        if (timer[i] < nearest) nearest = timer[i];
        if (state[i] === CARRIED) {
          const cave = carriers[i];
          if (!cave.root.visible || cave.health.stunned || cave !== crew.player) {
            state[i] = FLYING; carriers[i] = null; vx[i] = vz[i] = 0; vy[i] = 1;
          } else {
            // Held up in both hands over the head, in plain sight from every side; the arms stay raised to it
            // while it is held (the catch pose, which settles back on its own once it is gone).
            const p = cave.root.position, h = cave.root.rotation.y, sh = Math.sin(h), ch = Math.cos(h);
            px[i] = p.x + sh * 0.3; pz[i] = p.z + ch * 0.3;
            py[i] = p.y - cave.baseY + cave.bodyHeight + 0.08; yaw[i] = h + Math.PI / 2; roll[i] = 0;
            cave.catchT = 1;
          }
        } else if (state[i] === FLYING) {
          vy[i] -= GRAVITY * dt;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
          roll[i] += dt * 9;
          const floor = groundAt(px[i], pz[i], py[i] + 0.3);
          if (floor > -100 && py[i] <= floor && vy[i] < 0) {
            py[i] = floor;
            if (vy[i] < -3) { vy[i] *= -0.3; vx[i] *= 0.5; vz[i] *= 0.5; }
            else { state[i] = DROPPED; roll[i] = 0; }
          } else if (py[i] < -60) state[i] = FREE;
        }
        // The lights blink faster as the fuse runs down: quicker under ten seconds, frantic under five.
        const t = timer[i], rate = t < 5 ? 8 : t < 10 ? 4 : 1.5;
        const glow = Math.sin(elapsed * rate * Math.PI * 2) > 0 ? 1 : 0.25;
        const look = lookOf[i], c = cursor[look];
        writeInstance(devices[look].instanceData, c * 20, yaw[i], roll[i], SCALE, px[i], py[i], pz[i], glow);
        cursor[look] = c + 1;
        if (state[i] === DROPPED) {
          writeInstance(halos.instanceData, rings * 20, 0, 0, 1 + 0.06 * Math.sin(elapsed * rate * 2), px[i], py[i] - 0.05, pz[i], 0.6 + 0.4 * glow);
          rings++;
        }
        const pick = picks[i];
        pick.position.x = px[i]; pick.position.y = py[i] + 0.1; pick.position.z = pz[i];
        pick.visible = true;
        updateWorld(pick);
      }
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === FREE && picks[i].visible) picks[i].visible = false;
      for (let look = 0; look < LOOKS.length; look++) {
        const node = devices[look], n = cursor[look];
        node.instanceCount = n;
        node.visible = n > 0;
        if (n) node.instanceVersion++;
      }
      halos.instanceCount = rings;
      halos.visible = rings > 0;
      if (rings) halos.instanceVersion++;
      // The nearest fuse beeps, in the same steps as the blinking: louder and quicker under ten seconds and under five.
      if (audio && nearest < Infinity && (beepIn -= dt) <= 0) {
        beepIn = nearest < 5 ? 0.14 : nearest < 10 ? 0.4 : 0.9;
        cue(audio.beep, nearest < 5 ? 0.45 : nearest < 10 ? 0.35 : 0.18, 0.004, 0.06);
      }
      let marks = 0;
      const data = scorches.instanceData;
      for (let s = 0; s < SCORCH_CAP; s++) {
        if (scorchAge[s] >= SCORCH_SECONDS) continue;
        scorchAge[s] += dt;
        const k = 1 - Math.max(0, scorchAge[s] - SCORCH_SECONDS * 0.6) / (SCORCH_SECONDS * 0.4);
        if (k <= 0) continue;
        writeInstance(data, marks * 20, s * 1.3, 0, scorchAt[s * 4 + 3] * k, scorchAt[s * 4], scorchAt[s * 4 + 1], scorchAt[s * 4 + 2], 0);
        marks++;
      }
      scorches.instanceCount = marks;
      scorches.visible = marks > 0;
      if (marks) scorches.instanceVersion++;
      if (flash.t > 0) flash.t = Math.max(0, flash.t - dt);
      let balls = 0;
      for (let k = 0; k < FIREBALL_CAP; k++) {
        const f = k * 5;
        if (!fire[f + 4]) continue;
        const t = fire[f + 3] += dt;
        if (t >= FIREBALL_SECONDS) { fire[f + 4] = 0; continue; }
        const grow = Math.min(1, t / 0.12), shrink = 1 - Math.max(0, t - 0.2) / (FIREBALL_SECONDS - 0.2);
        writeInstance(fireballs.instanceData, balls * 20, k * 1.7 + t * 2, 0, fire[f + 4] * 0.42 * grow * shrink * (1 + t), fire[f], fire[f + 1] + t * 0.8, fire[f + 2], 1.4);
        balls++;
      }
      fireballs.instanceCount = balls;
      fireballs.visible = balls > 0;
      if (balls) fireballs.instanceVersion++;
    };
    // The blast's point light while it lasts: false when there is none. The scene places it within its tier.
    const flashLight = (out) => {
      if (flash.t <= 0) return false;
      const k = flash.t / FLASH_SECONDS * flash.strength;
      out[0] = flash.x; out[1] = flash.y; out[2] = flash.z; out[3] = 9 + 3 * flash.strength;
      out[4] = 1.6 * k; out[5] = 1.0 * k; out[6] = 0.45 * k; out[7] = 0;
      return true;
    };
    // Over each live device its seconds, white, red from ten down, with its name over the held one and over any on the
    // floor near the driven Ooga; the labels jitter a moment after a blast.
    const drawOverlay = (ctx, project) => {
      ctx.font = "bold 18px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a0f08";
      const player = crew.player, ox = player ? player.root.position.x : 0, oz = player ? player.root.position.z : 0;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (state[i] === FREE) continue;
        const pos = project(px[i], py[i] + 0.42, pz[i]);
        if (!pos) continue;
        const left = Math.ceil(timer[i]), jitter = shake > 0 ? Math.sin(shake * 90 + i) * 3 : 0;
        const dx = px[i] - ox, dz = pz[i] - oz, named = state[i] === CARRIED || player && dx * dx + dz * dz < NAME_NEAR * NAME_NEAR;
        const text = named ? NAMED[lookOf[i]][left] : SECONDS[left];
        ctx.fillStyle = left <= 10 ? "#ff4b3a" : "#f6ecd2";
        ctx.strokeText(text, pos.x + jitter, pos.y);
        ctx.fillText(text, pos.x + jitter, pos.y);
      }
      ctx.textAlign = "left";
    };
    const dispose = () => {
      for (const node of [...devices, halos, scorches, fireballs]) removeChild(root, node);
      fire.fill(0);
      state.fill(FREE);
      carriers.fill(null);
      picks.length = 0;
      flash.t = 0;
      if (audio) audio.ctx.close().catch(() => {});
      audio = null;
    };
    const stats = () => {
      let wallets = 0, inHand = 0, placed = 0, marks = 0;
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) { wallets++; if (state[i] === CARRIED) inHand++; if (state[i] === DROPPED) placed++; }
      for (let s = 0; s < SCORCH_CAP; s++) if (scorchAge[s] < SCORCH_SECONDS) marks++;
      return { wallets, walletsHeld: inHand, walletsPlaced: placed, walletBlasts: blasts, walletsChained: chained, scorches: marks, fireballs: fireballs.instanceCount };
    };
    const debug = {
      stats, take, refusal, throwCarried, setDown, tap, held, detonate: (i = -1) => {
        for (let k = 0; k < BOMB_CAP; k++) if (state[k] !== FREE && (i < 0 || k === i)) return detonate(k);
        return 0;
      },
      // Lays n devices on the floor in a tight cluster at (x, z), so they chain; `look` pins their look (else they
      // alternate). Lets the cooldown run out at once.
      spawn(n, x, z, look = -1) {
        const out = [];
        for (let k = 0; k < n; k++) {
          const a = k * 2.4, r = k ? 0.5 + 0.25 * k : 0, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
          const i = spawn(sx, groundAt(sx, sz, 3), sz, look >= 0 ? look : k & 1);
          if (i >= 0) out.push(i);
        }
        return out;
      },
      cool() { cooldown = 0; },
      timer(seconds) {
        for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) timer[i] = Math.max(0.01, Math.min(FUSE, seconds));
      },
      list() {
        const out = [];
        for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) out.push({ slot: i, look: LOOKS[lookOf[i]].id, state: STATE_NAMES[state[i]], timer: timer[i], x: px[i], y: py[i], z: pz[i] });
        return out;
      },
      flash
    };
    return { update, drawOverlay, flashLight, take, refusal, throwCarried, setDown, tap, where, held, lookAt, secondsLeft, tooltip, count, stats, dispose, debug };
  };
  BL.walletBombs = { create, BOMB_CAP, SCORCH_CAP, FUSE, CHAIN_RADIUS, BASE_RADIUS, BASE_POWER, POWER_CAP, SCALE, LOOKS, blastOf, chainFrom };
})();
