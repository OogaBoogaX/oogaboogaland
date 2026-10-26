// The Lightning Jet Hangar's engine static fire test: the booth beside the runway behind the Jet's left engine
// (`HM.fireStation`, standing at `LAYOUT.fireTest`, its back to the Jet) and the test its big red button starts, about
// ten seconds from the press to waking up (`AT`). The press flips the guard and sinks the button, the siren sounds and
// the lights flash; the engines spool up, the throats glowing; they light, roaring, each throwing its plume (a white
// core in a blue mantle inside the orange envelope, shock diamonds, the heat's shimmer drifting back) while the Jet
// shudders and the floor's dust blows aft; they falter, the plumes coughing and spitting sparks; and they blow up in a
// cartoon blast: a flash, fireballs, smoke, a shockwave over the floor, sparks and bits of iron, the view shaking. The
// presser is thrown backward and lies out cold on their back, sooted, the stun birds circling, their view dimmed and
// their hearing muffled and ringing (the sound is `hangar-audio.js`'s `test`); after about three seconds they come to,
// get up and play on, and the screen says how the test went. From the press the controls are the test's and the view
// glides out to watch it all from the show's place, handed back as the presser opens their eyes. A pad, if there is
// one, rumbles in step. Then a cooldown, the lamps under the screen filling, until the booth is ready again. Only the
// presser is knocked down; nothing is lost.
//
// `create` builds it all once a visit from fixed pools, and `update` moves it in place, allocating nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, updateWorld, boundsOf } = BL.scene;
  const { quat, mulberry32 } = BL.math;
  const HM = BL.hangarModels, JM = BL.jetModels;

  // The test from the press, in seconds: armed, the engines spooling up, firing, faltering (warning) and blowing (boom),
  // the presser out cold (out), and the result standing until the booth is ready again.
  const AT = { spool: 0.5, fire: 3, warning: 6, boom: 7.5, out: 7.6, result: 10.6, ready: 30.6 };
  // What the screen shows in each phase.
  const SCREEN = { ready: "ready", armed: "armed", spool: "spool", fire: "fire", warning: "warning", boom: "boom", out: "boom", result: "result" };
  const SCREENS = ["ready", "armed", "spool", "fire", "warning", "boom", "result", "checks", "days", "rules"];
  // At rest the screen turns through these, each for IDLE_HOLD seconds, a blank IDLE_BLANK seconds between, as a
  // monitor changes.
  const IDLE = ["ready", "checks", "days", "rules"], IDLE_HOLD = 5, IDLE_BLANK = 0.12;
  // How far the guard swings open and how long it takes, the button's travel, how near the button an Ooga reaches it,
  // m, and how high its feet may stand; the strobe's flashes a second; a lamp's glow when out; and how far in front of
  // the faces they lie on the Canvas 2D sort keeps the parts on the booth's faces.
  const GUARD_OPEN = 1.95, GUARD_TIME = 0.25, PRESS_DEPTH = 0.04, REACH = 1.7, FEET = 0.5, STROBE = 6, DIM = 0.12, FRONT = -0.15;
  // The plume: the shock diamonds down its core, its heat's rings, and how long it takes to light.
  const DIAMONDS = [0.75, 1.5, 2.25, 3], HAZE = 4, LIGHT_UP = 0.3;
  // The blast: where it stands (behind the nozzle nearest the booth, from its exit toward the Jet's middle), its pools'
  // sizes, how near it the presser must be to be knocked down, how fast they are thrown backward and up, how long they
  // take to tip over and to get up, and the view's shake.
  const BLAST_AT = { dx: 0.6, dy: -0.3, dz: 0.6 }, FIREBALLS = 22, SMOKE = 16, SPARKS = 50, IRON = 8, KNOCK_REACH = 14;
  const THROW = 6.5, THROW_UP = 5.5, TIP = 0.45, GET_UP = 0.5, QUAKE = { fire: 0.035, warning: 0.08, boom: 0.6, tau: 0.45 };
  // How long the view takes to glide from the presser's to the show's (`LAYOUT.fireTest.view`).
  const GLIDE = 1.2;
  // The lights the test adds to the scene's: the booth's lanterns' glow, each plume's, and the blast's flash.
  const BOOTH_LIGHT = [1.3, 0.75, 0.3], PLUME_LIGHT = [1.3, 0.75, 0.45], FLASH_LIGHT = [3.2, 2.6, 2];
  // The parts of a body set on the floor when it lies down and sooted by the blast, and how the soot fades and smokes.
  const BODY = ["torso", "head", "armR", "armL", "legR", "legL", "fingersR", "fingersL"], SOOT = 0.85, SOOT_FADE = 12, SOOT_SMOKE = 3;
  // The floor's dust blown aft from under the plumes.
  const DUST = BL.models.particleGeometry("#8a7a62", 0.12, 0);

  const phaseAt = (t) => t < 0 ? "ready" : t < AT.spool ? "armed" : t < AT.fire ? "spool" : t < AT.warning ? "fire" : t < AT.boom ? "warning"
    : t < AT.out ? "boom" : t < AT.result ? "out" : "result";
  const ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const clamp01 = (u) => u < 0 ? 0 : u > 1 ? 1 : u;
  // A lamp blinking `hz` times a second on the clock, and a fixed draw in 0..1 for the step `n`.
  const blink = (clock, hz) => (clock * hz) % 1 < 0.5 ? 1 : DIM;
  const draw = (n, salt) => Math.abs((Math.sin(n * 12.9898 + salt) * 43758.5453) % 1);

  // `root`: the scene's root; `jet`: the Jet's node and `nozzles` its nozzles' (sooted by the blast, or null); `fx`: the
  // scene's particles; `audio`: the hangar's sound; `hold(on)`: the controls taken from the presser and the view from
  // the pilot, and given back; `toast(text)` for the result.
  const create = ({ root, jet, nozzles, fx, audio, hold, toast }) => {
    const L = HM.LAYOUT.fireTest, F = HM.FIRE, P = HM.fireStation(), E = HM.exhaust(), B = HM.blast(), c = Math.cos(L.turn), s = Math.sin(L.turn);
    const at = (p, dy = 0) => ({ x: p[0], y: p[1] + dy, z: p[2] });
    const hidden = (geometry, options) => createNode({ geometry, sightHidden: true, visible: false, ...options });

    // ---- the booth ----
    const group = createNode({ position: { x: L.x, y: 0, z: L.z }, rotation: { x: 0, y: L.turn, z: 0 } });
    const body = createNode({ geometry: P.body });
    const button = createNode({ position: at(F.button), geometry: P.button, depthBias: FRONT });
    const guard = createNode({ position: at(F.hinge), geometry: P.guard, sightHidden: true, depthBias: 2 * FRONT });
    const globes = F.posts.map(([x, z]) => createNode({ position: { x, y: F.postY, z }, geometry: P.globe, sightHidden: true }));
    const bars = F.bars.map((p) => createNode({ position: at(p), geometry: P.bar, sightHidden: true }));
    const strobe = createNode({ position: at(F.strobe), geometry: P.strobe, sightHidden: true });
    const lamps = F.lamps.map((p, i) => createNode({ position: at(p), geometry: P.lamps[i], sightHidden: true, depthBias: 2 * FRONT }));
    const leds = F.leds.map((x, i) => createNode({ position: { x, y: F.ledY, z: F.ledZ }, geometry: P.leds[i === 2 || i === 3 ? 1 : 0], sightHidden: true, depthBias: 2 * FRONT }));
    const strips = F.bollards.map(([x, z]) => createNode({ position: { x, y: 0.5, z: z + 0.12 }, geometry: P.strip, sightHidden: true, depthBias: FRONT }));
    const screens = {}, timers = [];
    for (const key of SCREENS) screens[key] = createNode({ position: at(F.screen), geometry: HM.firePicture(key), sightHidden: true, visible: key === "ready", depthBias: FRONT });
    for (let n = 0; n <= 10; n++) timers.push(hidden(HM.firePicture(`timer:${n}`), { position: { x: F.screen[0] + F.timer[0], y: F.screen[1] + F.timer[1], z: F.screen[2] + 0.002 }, depthBias: 2 * FRONT }));
    const [sx, sy, sz] = F.onDesk(F.scope[0], F.scope[1] + 0.043, F.scope[2]);
    const scopes = [0, 1].map((k) => createNode({ position: { x: sx, y: sy, z: sz }, rotation: { x: F.lean - Math.PI / 2, y: 0, z: 0 }, geometry: HM.firePicture(`scope:${k}`), sightHidden: true, visible: !k, depthBias: FRONT }));
    addChild(group, body, createNode({ geometry: P.details, depthBias: FRONT }), button, guard, createNode({ position: at(F.hinge), geometry: P.hinge }),
      ...globes, ...bars, strobe, ...lamps, ...leds, ...strips, ...Object.values(screens), ...timers, ...scopes,
      ...F.pictures.map(([key, x, y, z]) => createNode({ position: { x, y, z }, geometry: HM.firePicture(key), sightHidden: true, depthBias: FRONT })));
    const cables = createNode({ geometry: HM.fireCables() });
    addChild(root, group, cables);
    const booth = { x: L.x, y: 2.5, z: L.z };

    // ---- the plumes, one at each nozzle's exit, blowing along +z ----
    const J = jet.position, jetX = J.x, jetY = J.y, plumes = JM.EXHAUST.map((e) => {
      const n = createNode({ position: { x: J.x + e.x, y: J.y + e.y, z: J.z + e.z } });
      const p = {
        node: n, x: n.position.x, y: n.position.y, z: n.position.z,
        hot: hidden(E.throatHot, { position: { x: 0, y: 0, z: -0.46 } }), blue: hidden(E.throatBlue, { position: { x: 0, y: 0, z: -0.45 } }),
        envelope: hidden(E.envelope), mantle: hidden(E.mantle), core: hidden(E.core),
        diamonds: DIAMONDS.map((z) => hidden(E.diamond, { position: { x: 0, y: 0, z } })), haze: Array.from({ length: HAZE }, () => hidden(E.haze))
      };
      addChild(n, p.hot, p.blue, p.envelope, p.mantle, p.core, ...p.diamonds, ...p.haze);
      addChild(root, n);
      return p;
    });
    let nearest = plumes[0];
    for (const p of plumes) if (Math.hypot(p.x - L.x, p.z - L.z) < Math.hypot(nearest.x - L.x, nearest.z - L.z)) nearest = p;
    const inward = Math.sign(J.x - nearest.x) || 1, blastAt = { x: nearest.x + BLAST_AT.dx * inward, y: nearest.y + BLAST_AT.dy, z: nearest.z + BLAST_AT.dz };

    // ---- the blast's pools: each fireball and smoke puff's own direction, size and timing drawn once ----
    const rand = mulberry32(7700);
    const spread = () => {
      const a = rand() * Math.PI * 2, up = rand() * 0.9 - 0.2, flat = Math.sqrt(1 - up * up);
      return [Math.cos(a) * flat, up, Math.sin(a) * flat];
    };
    const fireballs = Array.from({ length: FIREBALLS }, (_, i) => ({ node: hidden(B.fire[i % 3]), dir: spread(), reach: 0.5 + rand() * 2.8, size: 0.45 + rand() * 0.95, delay: rand() * 0.18, life: 0.8 + rand() * 0.6 }));
    const smoke = Array.from({ length: SMOKE }, (_, i) => ({ node: hidden(B.smoke[i % 2]), dir: spread(), reach: 0.6 + rand() * 2.6, size: 1 + rand() * 1.6, delay: 0.15 + rand() * 0.5, life: 3.5 + rand() * 2.5 }));
    // The sparks' and the iron's directions, drawn once too.
    const sparkDirs = Array.from({ length: SPARKS + IRON }, spread);
    const ring = hidden(B.ring), shell = hidden(B.shell);
    addChild(root, ...fireballs.map((f) => f.node), ...smoke.map((f) => f.node), ring, shell);

    // ---- the overlay's vignette, painted once ----
    const vignette = document.createElement("canvas");
    vignette.width = vignette.height = 256;
    {
      const g = vignette.getContext("2d"), grad = g.createRadialGradient(128, 128, 40, 128, 128, 182);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.55, "rgba(0,0,0,0.55)"); grad.addColorStop(1, "rgba(0,0,0,1)");
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    }

    // `t` is the time since the press, -1 while the booth stands ready; `clock` times the blinking and flicker.
    let t = -1, clock = 0, phase = "ready", shown = "ready", timerShown = -1, near = false, boomed = false, spark = 0, dust = 0, rumbleAt = 0, rumbling = false;
    // The presser while the blast has them: who, which way they faced; whether the test holds the controls and the view;
    // the view's glide and its shake.
    let presser = null, heading = 0, holding = false, quake = 0, glide = 0, from = false;
    // Whose body the blast sooted, how much soot is left on it, and when it last smoked.
    let sooted = null, soot = 0, puffAt = 0;
    const FROM = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, SHOW = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    {
      const [ex, ey, ez] = L.view.eye, [lx, ly, lz] = L.view.look, dx = lx - ex, dy = ly - ey, dz = lz - ez;
      SHOW.x = ex; SHOW.y = ey; SHOW.z = ez; SHOW.yaw = Math.atan2(dx, dz); SHOW.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    const POSE = quat.create(), BIRDS = quat.create(), TILT = quat.fromAxisAngle(quat.create(), 1, 0, 0, Math.PI / 2), SPIN = quat.create();
    const SHAKE = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, on: false };
    const ready = () => t < 0;
    const press = () => {
      if (t >= 0) return false;
      t = 0;
      boomed = false;
      audio.test(AT);
      BL.gamepad.rumble(0.25, 0.5, 90);
      holding = true;
      glide = 0;
      from = false;
      hold(true);
      return true;
    };
    const letGo = () => {
      if (!holding) return;
      holding = false;
      hold(false);
    };
    // Whether an Ooga standing at (x, z), its feet `feet` up, reaches the button: in front of the console and near it.
    const reaches = (x, z, feet) => {
      const dx = x - L.x, dz = z - L.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      return feet < FEET && lz > F.blocks[0][3] && Math.hypot(lx - F.button[0], lz - F.button[2]) < REACH;
    };
    // Space beside the button presses it while the booth is ready; during the test and its cooldown it stays the
    // visitor's own.
    const useNear = (x, z, reach, feet) => ready() && reaches(x, z, feet) && press();
    const actLabel = () => (near && ready() ? "DON'T PRESS" : null);

    // The blast throws the presser backward and up, sooted.
    const knock = (cave) => {
      presser = cave;
      heading = cave.root.rotation.y;
      cave.hopV = THROW_UP;
      cave.leap.vx = -Math.sin(heading) * THROW; cave.leap.vz = -Math.cos(heading) * THROW;
      cave.leap.thrown = true;
      cave.hop = Math.max(cave.hop, 0.05);
      cave.leap.land = 0.25;
      if (sooted && sooted !== cave) smudge(sooted, 0);
      sooted = cave;
      soot = SOOT;
    };
    // The blast's soot on a body, `k` of it.
    const smudge = (cave, k) => {
      for (const key of BODY) if (cave.parts[key]) cave.parts[key].scorch = k;
    };
    // The presser laid on their back by `k` (0 standing, 1 flat): turned about their own heading, the lowest part of the
    // turned body set on the floor once they are down (as the crew's roll does), arms flung back and head lolling; out
    // cold, the stun birds circling over their head.
    const lay = (cave, k, out) => {
      const r = cave.root, parts = cave.parts, h = cave.traits.height;
      quat.fromEuler(POSE, -Math.PI / 2 * k, heading, 0);
      r.quaternion = POSE;
      parts.armR.rotation.x = parts.armL.rotation.x = -2.6 * k;
      parts.head.rotation.z = 0.35 * k * Math.sin(clock * 1.3);
      if (cave.hop === 0 && !cave.leap.thrown) {
        const floor = HM.supportAt(r.position.x, r.position.z, 0.3);
        r.position.y = floor + cave.baseY;
        updateWorld(r, r.parent ? r.parent.world : undefined);
        let bottom = Infinity;
        for (const key of BODY) {
          const b = boundsOf(parts[key].geometry), m = parts[key].world;
          const centre = m[1] * b.center[0] + m[5] * b.center[1] + m[9] * b.center[2] + m[13];
          const extent = (Math.abs(m[1]) * (b.max[0] - b.min[0]) + Math.abs(m[5]) * (b.max[1] - b.min[1]) + Math.abs(m[9]) * (b.max[2] - b.min[2])) * 0.5;
          bottom = Math.min(bottom, centre - extent);
        }
        r.position.y += (floor + 0.02 - bottom) * k;
      }
      const birds = cave.stunBirds;
      birds.visible = out;
      if (out) {
        birds.position.z = 0.45 * h;
        quat.fromAxisAngle(SPIN, 0, 1, 0, clock * 5.5);
        quat.multiply(BIRDS, TILT, SPIN);
        birds.quaternion = BIRDS;
        for (let i = 0; i < birds.children.length; i++) birds.children[i].position.y = Math.sin(clock * 7 + i * 2.1) * 0.045 * h;
      }
    };
    const standUp = (cave) => {
      cave.root.quaternion = null;
      cave.root.rotation.x = cave.root.rotation.z = 0;
      cave.root.rotation.y = heading;
      cave.stunBirds.quaternion = null;
      cave.stunBirds.position.z = 0;
      cave.stunBirds.visible = false;
      cave.parts.head.rotation.z = 0;
    };

    // The blast: sparks and iron from the particles, the nozzles sooted, the view shaken; then its own pieces, `u`
    // seconds after it, until the last smoke is gone.
    const explode = () => {
      for (let i = 0; i < SPARKS; i++) {
        const d = sparkDirs[i], v = 6 + Math.random() * 8;
        fx.spawnParticle(B.spark, blastAt.x, blastAt.y, blastAt.z, d[0] * v, d[1] * v + 3, d[2] * v, 0.8 + Math.random() * 0.8, 10, 6);
      }
      for (let i = SPARKS; i < SPARKS + IRON; i++) {
        const d = sparkDirs[i], v = 3 + Math.random() * 4;
        fx.spawnParticle(B.iron, blastAt.x, blastAt.y, blastAt.z, d[0] * v, 5 + Math.random() * 4, d[2] * v + 2, 2.2, 12, 9.8);
      }
      if (nozzles) nozzles.scorch = 0.8;
      quake = QUAKE.boom;
    };
    const blastPieces = (u) => {
      for (const f of fireballs) {
        const a = u - f.delay, k = a / f.life, n = f.node;
        n.visible = a > 0 && k < 1;
        if (!n.visible) continue;
        const grow = 1 - Math.pow(1 - clamp01(a / 0.3), 3), r = f.size * (k < 0.6 ? grow : grow * (1 - (k - 0.6) / 0.4));
        n.position.x = blastAt.x + f.dir[0] * f.reach * grow;
        n.position.y = blastAt.y + f.dir[1] * f.reach * grow + a * 1.2;
        n.position.z = blastAt.z + f.dir[2] * f.reach * grow;
        n.scale.x = n.scale.y = n.scale.z = Math.max(0.01, r);
        n.glow = 0.95 - k * 0.45;
      }
      for (const f of smoke) {
        const a = u - f.delay, k = a / f.life, n = f.node;
        n.visible = a > 0 && k < 1;
        if (!n.visible) continue;
        const grow = 1 - Math.pow(1 - clamp01(a / 1.5), 2), r = f.size * grow * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
        n.position.x = blastAt.x + f.dir[0] * f.reach * grow;
        n.position.y = blastAt.y + 0.4 + f.dir[1] * f.reach * grow * 0.6 + a * 0.6;
        n.position.z = blastAt.z + f.dir[2] * f.reach * grow + a * 0.35;
        n.scale.x = n.scale.y = n.scale.z = Math.max(0.01, r);
      }
      ring.visible = u < 0.8;
      if (ring.visible) {
        const w = clamp01(u / 0.6), R = 0.5 + 11 * (1 - Math.pow(1 - w, 2));
        ring.position.x = blastAt.x; ring.position.y = 0.15; ring.position.z = blastAt.z;
        ring.scale.x = ring.scale.z = R; ring.scale.y = 1 + w;
        ring.glow = 1 - u / 0.8;
      }
      shell.visible = u < 0.45;
      if (shell.visible) {
        const R = 0.3 + 7 * (1 - Math.pow(1 - clamp01(u / 0.35), 2));
        shell.position.x = blastAt.x; shell.position.y = blastAt.y; shell.position.z = blastAt.z;
        shell.scale.x = shell.scale.y = shell.scale.z = R;
        shell.glow = 1 - u / 0.45;
      }
    };
    const hideBlast = () => {
      for (const f of fireballs) f.node.visible = false;
      for (const f of smoke) f.node.visible = false;
      ring.visible = shell.visible = false;
    };

    // The plumes at `thrust` (0 out, 1 full), the throats at `heat` (0 cold, 1 blue-white), the heat's rings with them,
    // and the Jet shuddering on its gear.
    const burn = (thrust, heat) => {
      for (const p of plumes) {
        const lit = thrust > 0.02, flick = 1 + Math.sin(clock * 31 + p.x) * 0.05 + Math.sin(clock * 57) * 0.03;
        p.hot.visible = heat > 0.02; p.hot.glow = Math.min(1, heat * 1.6);
        p.blue.visible = heat > 0.8; p.blue.glow = (heat - 0.8) * 5;
        for (const n of [p.envelope, p.mantle, p.core]) {
          n.visible = lit;
          n.scale.x = n.scale.y = 0.75 + thrust * 0.25 * flick;
          n.scale.z = Math.max(0.05, thrust * flick);
          n.glow = 0.85 + thrust * 0.15 * flick;
        }
        for (let i = 0; i < p.diamonds.length; i++) {
          const d = p.diamonds[i];
          d.visible = lit && thrust > 0.6;
          d.position.z = DIAMONDS[i] * thrust;
          d.scale.x = d.scale.y = d.scale.z = (1 - i * 0.18) * (0.9 + Math.sin(clock * 43 + i) * 0.1);
        }
        for (let i = 0; i < p.haze.length; i++) {
          const h = p.haze[i], u = (clock * 0.9 + i / p.haze.length) % 1;
          h.visible = thrust > 0.3;
          h.position.z = 0.5 + u * 7 * thrust;
          h.scale.x = h.scale.y = 0.95 + u * 0.5 + Math.sin(clock * 17 + i) * 0.04;
        }
      }
      jet.position.x = jetX + (thrust > 0 ? (Math.random() - 0.5) * 0.024 * thrust : 0);
      jet.position.y = jetY + (thrust > 0 ? (Math.random() - 0.5) * 0.016 * thrust : 0);
    };
    // How hard the plumes burn now: lighting up under fire, and in the malfunction coughing out and catching again on a
    // fixed pattern, ragged.
    const thrustAt = () => {
      if (phase === "fire") return ease((t - AT.fire) / LIGHT_UP);
      if (phase !== "warning") return 0;
      const r = draw(Math.floor((t - AT.warning) / 0.09), 0);
      return r < 0.35 ? 0.1 + r : 0.65 + r * 0.3;
    };

    // The pad's rumble, sent a few times a second: building through the spool-up, strong and sustained under fire,
    // erratic in the malfunction, a hard hit at the blast fading away, and nothing once the presser is out.
    const rumbleFor = () => {
      if (phase === "spool") {
        const u = (t - AT.spool) / (AT.fire - AT.spool);
        return BL.gamepad.rumble(0.05 + 0.35 * u, 0.15 + 0.35 * u, 140);
      }
      if (phase === "fire") return BL.gamepad.rumble(0.85 + 0.1 * Math.sin(clock * 13), 0.7, 140);
      if (phase === "warning") {
        const r = draw(Math.floor(t * 10), 1);
        return BL.gamepad.rumble(r < 0.4 ? 0 : 0.4 + r * 0.6, r < 0.4 ? 0 : 0.3 + r * 0.7, 140);
      }
      const u = t - AT.boom, k = 1 - (u - 0.35) / 1.5;
      if (u >= 0 && u < 0.35) return BL.gamepad.rumble(1, 1, 140);
      if (u >= 0 && k > 0) return BL.gamepad.rumble(k, k * 0.6, 140);
      return false;
    };

    // Once a frame, after the crew has moved, with the Ooga the visitor drives here (or null).
    const update = (dt, driven) => {
      clock += dt;
      if (t >= 0) {
        t += dt;
        if (t >= AT.ready) t = -1;
      }
      phase = phaseAt(t);
      if (driven) {
        const p = driven.root.position;
        near = reaches(p.x, p.z, p.y - driven.baseY);
      } else near = false;
      const running = t >= 0, panic = phase === "warning";
      // The guard opens at the press and closes a second into the result; the button sinks and springs back.
      const open = !running ? 0 : t < AT.result + 1 ? ease(t / GUARD_TIME) : 1 - ease((t - AT.result - 1) / 0.6);
      guard.rotation.x = -GUARD_OPEN * open;
      button.position.y = F.button[1] - PRESS_DEPTH * (running && t > 0.1 && t < 0.5 ? ease((t - 0.1) / 0.08) : 0);
      button.glow = !running ? 0.7 + 0.3 * Math.sin(clock * 3) : phase === "result" ? 0.25 : 1;
      // The warning lights: the lanterns and light bars flashing in turn from the press to the blast, faster in the
      // malfunction, the strobe from the malfunction until the presser comes to; at rest a steady glow.
      const alarm = running && t < AT.boom, rate = panic ? 5 : 2.5;
      for (let i = 0; i < 2; i++) {
        const on = alarm ? ((clock * rate + i * 0.5) % 1 < 0.5 ? 1.2 : 0.2) : 0.85;
        globes[i].glow = on; bars[1 - i].glow = on;
      }
      strobe.glow = panic || phase === "boom" || phase === "out" ? blink(clock, STROBE) : DIM;
      for (let i = 0; i < strips.length; i++) strips[i].glow = panic ? blink(clock + i * 0.1, 4) : alarm ? 1 : 0.7;
      lamps[0].glow = phase === "ready" ? 1 : DIM;
      lamps[1].glow = phase === "armed" || phase === "spool" ? blink(clock, 2) : phase === "result" ? 1 : DIM;
      lamps[2].glow = phase === "fire" || phase === "boom" || phase === "out" ? 1 : panic ? blink(clock, 5) : DIM;
      // The lamps under the screen: lit at rest, climbing with the spool-up, all on under fire, flickering in the
      // malfunction, out from the blast, and filling again through the cooldown.
      const lit = phase === "ready" || phase === "fire" ? leds.length : phase === "spool" ? leds.length * (t - AT.spool) / (AT.fire - AT.spool)
        : phase === "result" ? leds.length * (t - AT.result) / (AT.ready - AT.result) : 0;
      for (let i = 0; i < leds.length; i++) leds[i].glow = panic ? (Math.sin(clock * 37 + i * 2.3) > 0.2 ? 1 : DIM) : i < lit ? 1 : DIM;
      scopes[1].visible = phase === "fire" || panic;
      scopes[0].visible = !scopes[1].visible;
      const idle = phase === "ready" ? clock / IDLE_HOLD : -1;
      const key = idle < 0 ? SCREEN[phase] : idle % 1 * IDLE_HOLD < IDLE_BLANK ? null : IDLE[Math.floor(idle) % IDLE.length];
      if (key !== shown) {
        if (shown) screens[shown].visible = false;
        if (key) screens[key].visible = true;
        shown = key;
      }
      const left = running && t < AT.boom ? Math.max(0, Math.floor(AT.result - t)) : -1;
      if (left !== timerShown) {
        if (timerShown >= 0) timers[timerShown].visible = false;
        if (left >= 0) timers[left].visible = true;
        timerShown = left;
      }

      // The engines: the throats glowing through the spool-up, the plumes, dust blown aft, sparks spat in the malfunction.
      const thrust = thrustAt(), heat = phase === "spool" ? (t - AT.spool) / (AT.fire - AT.spool) * 0.8 : thrust > 0 ? 0.8 + thrust * 0.2 : 0;
      burn(thrust, heat);
      if (thrust > 0.3 && (dust -= dt) <= 0) {
        dust = 0.05;
        for (const p of plumes) fx.spawnParticle(DUST, p.x + (Math.random() - 0.5) * 1.6, 0.08, p.z + 1.5 + Math.random() * 5, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, 5 + Math.random() * 3, 0.7, 4, 0.6);
      }
      if (panic && (spark -= dt) <= 0) {
        spark = 0.06;
        for (const p of plumes) for (let i = 0; i < 3; i++) fx.spawnParticle(B.spark, p.x, p.y, p.z, (Math.random() - 0.5) * 4, (Math.random() - 0.2) * 4, 4 + Math.random() * 6, 0.6 + Math.random() * 0.4, 10, 6);
      }
      if (phase === "fire") quake = Math.max(quake, QUAKE.fire * thrust);
      else if (panic) quake = Math.max(quake, thrust < 0.5 ? QUAKE.warning : QUAKE.fire);
      quake *= Math.exp(-dt / QUAKE.tau);
      if (quake < 0.002) quake = 0;

      // The blast, once, as the test reaches it, knocking down the presser if they are still about; then its pieces.
      if (running && t >= AT.boom && !boomed) {
        boomed = true;
        explode();
        if (driven && Math.hypot(driven.root.position.x - blastAt.x, driven.root.position.z - blastAt.z) < KNOCK_REACH) knock(driven);
      }
      if (boomed && running) blastPieces(t - AT.boom);
      else hideBlast();
      if (nozzles && nozzles.scorch > 0) nozzles.scorch = Math.max(0, nozzles.scorch - dt / 25);
      // The presser's soot fading off them, smoking a while.
      if (sooted) {
        soot = Math.max(0, soot - SOOT / SOOT_FADE * dt);
        smudge(sooted, soot);
        if (soot > SOOT * (1 - SOOT_SMOKE / SOOT_FADE) && (puffAt -= dt) <= 0) {
          puffAt = 0.12;
          const p = sooted.root.position;
          fx.puff(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, 1.4);
        }
        if (soot === 0) sooted = null;
      }

      // The presser: laid down as they fly, out cold till the result, then up again; the controls and the view back
      // as they open their eyes, the result said.
      if (holding && (t < 0 || t >= AT.result)) {
        letGo();
        toast("TEST RESULT: FAILED SUCCESSFULLY · Lightning Jet v2 is still under construction.");
      }
      glide = Math.min(1, glide + dt / GLIDE);
      if (presser) {
        if (t < 0 || t >= AT.result + GET_UP || presser !== driven) {
          standUp(presser);
          presser = null;
        } else if (t < AT.result) lay(presser, ease((t - AT.boom) / TIP), t - AT.boom > 0.5);
        else lay(presser, 1 - ease((t - AT.result) / GET_UP), false);
      }

      // The pad, a few times a second while the test shakes anything, and stopped once it doesn't.
      if ((rumbleAt -= dt) <= 0) {
        rumbleAt = 0.1;
        const on = running && rumbleFor();
        if (rumbling && !on) BL.gamepad.stop();
        rumbling = !!on;
      }
    };

    // The view, once the pilot has set it for the frame: while the test holds it, gliding from where the presser looked
    // to the show and kept there; and shaken, the shake taken off again before the next frame.
    const view = (camera) => {
      if (holding) {
        if (!from) readPose(FROM, camera);
        from = true;
        putPose(camera, FROM, SHOW, ease(glide));
      }
      SHAKE.on = quake > 0;
      if (!SHAKE.on) return;
      const a = quake, p = camera.position, q = camera.target;
      SHAKE.x = (Math.random() - 0.5) * 2 * a; SHAKE.y = (Math.random() - 0.5) * 2 * a; SHAKE.z = (Math.random() - 0.5) * 2 * a;
      SHAKE.tx = SHAKE.x * 0.4 + (Math.random() - 0.5) * a; SHAKE.ty = SHAKE.y * 0.4 + (Math.random() - 0.5) * a; SHAKE.tz = SHAKE.z * 0.4 + (Math.random() - 0.5) * a;
      p.x += SHAKE.x; p.y += SHAKE.y; p.z += SHAKE.z;
      q.x += SHAKE.tx; q.y += SHAKE.ty; q.z += SHAKE.tz;
    };
    const readPose = (out, camera) => {
      const p = camera.position, q = camera.target, dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
      out.x = p.x; out.y = p.y; out.z = p.z;
      out.yaw = Math.atan2(dx, dz);
      out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    const putPose = (camera, a, b, k) => {
      const yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k, pitch = a.pitch + (b.pitch - a.pitch) * k, cp = Math.cos(pitch);
      const p = camera.position, q = camera.target;
      p.x = a.x + (b.x - a.x) * k; p.y = a.y + (b.y - a.y) * k; p.z = a.z + (b.z - a.z) * k;
      q.x = p.x + Math.sin(yaw) * cp; q.y = p.y + Math.sin(pitch); q.z = p.z + Math.cos(yaw) * cp;
    };
    const unshake = (camera) => {
      if (!SHAKE.on) return;
      SHAKE.on = false;
      const p = camera.position, q = camera.target;
      p.x -= SHAKE.x; p.y -= SHAKE.y; p.z -= SHAKE.z;
      q.x -= SHAKE.tx; q.y -= SHAKE.ty; q.z -= SHAKE.tz;
    };

    // The test's lights into the scene's array from `slot`, in priority order: the booth's lanterns, the plumes while
    // they burn and the blast's flash while it lasts; returns how many it wrote.
    const put = (Lt, slot, x, y, z, radius, rgb, k) => {
      const w = slot * 8;
      Lt[w] = x; Lt[w + 1] = y; Lt[w + 2] = z; Lt[w + 3] = radius;
      Lt[w + 4] = rgb[0] * k; Lt[w + 5] = rgb[1] * k; Lt[w + 6] = rgb[2] * k; Lt[w + 7] = 0;
    };
    const lights = (Lt, slot) => {
      let n = 0;
      put(Lt, slot + n++, booth.x, booth.y, booth.z, 5, BOOTH_LIGHT, (globes[0].glow + globes[1].glow) * 0.5);
      const thrust = plumes[0].envelope.visible ? plumes[0].envelope.scale.z : 0;
      if (thrust > 0) for (const p of plumes) put(Lt, slot + n++, p.x, p.y - 0.5, p.z + 3, 16, PLUME_LIGHT, thrust * (0.9 + Math.sin(clock * 29 + p.x) * 0.1));
      const u = boomed && t >= 0 ? t - AT.boom : -1;
      if (u >= 0 && u < 1.6) put(Lt, slot + n++, blastAt.x, blastAt.y, blastAt.z, 30, FLASH_LIGHT, Math.pow(1 - u / 1.6, 2) * 2.2);
      return n;
    };

    // The presser's view: the blast's flash, then dim and dark at the edges while they are out, their eyelids drooping,
    // shut as the view comes back to them and opening as they come to, with a blink. Drawn last on the overlay, in its
    // CSS pixels.
    const overlay = (g) => {
      if (!presser || t < AT.boom) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = g.canvas.width / dpr, H = g.canvas.height / dpr, u = t - AT.boom, r = t - AT.result;
      const out = t < AT.result ? ease((u - 0.3) / 0.9) : 1 - ease(r / 1.2);
      if (out > 0) {
        g.globalAlpha = out;
        g.drawImage(vignette, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
        g.fillStyle = "#000";
        g.globalAlpha = out * 0.25;
        g.fillRect(0, 0, W, H);
        const drowse = 0.12 + 0.04 * Math.sin(clock * 2.4);
        const lid = r < -0.3 ? out * drowse : r < 0 ? 0.5 - (0.5 - drowse) * ease(-r / 0.3) : r < 0.5 ? 0.5 * (1 - ease(r / 0.5)) : r < 0.8 ? 0.35 * Math.sin((r - 0.5) / 0.3 * Math.PI) : 0;
        if (lid > 0) {
          g.globalAlpha = 1;
          g.fillRect(0, 0, W, H * lid);
          g.fillRect(0, H * (1 - lid), W, H * lid);
        }
      }
      if (u < 0.35) {
        g.globalAlpha = 0.9 * (1 - u / 0.35);
        g.fillStyle = "#fff8e8";
        g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = 1;
    };

    // Leaving mid-test: the presser stands with their controls back, the pad stops, the Jet settles; the nodes go with
    // the scene's root.
    const dispose = () => {
      if (presser) standUp(presser);
      if (sooted) smudge(sooted, 0);
      presser = sooted = null;
      letGo();
      if (rumbling) BL.gamepad.stop();
      rumbling = false;
      jet.position.x = jetX; jet.position.y = jetY;
    };

    return {
      group, body, cables, press, update, useNear, actLabel, view, unshake, lights, overlay, dispose, AT, blast: blastAt,
      get phase() { return phase; }, get t() { return t; }, get near() { return near; }, get ready() { return ready(); }, get out() { return !!presser; }
    };
  };

  BL.hangarFire = { create, AT };
})();
