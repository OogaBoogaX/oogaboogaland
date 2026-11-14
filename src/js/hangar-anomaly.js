// The Lightning Jet Hangar's engine anomalies: now and then, with nobody at the booth, the Jet acts up on its own. One
// at a time, at random, a minute to five apart (`GAP`, from the end of one to the start of the next), each kind taking
// its turn from a shuffled bag so none comes round again before the rest have played; never during the static fire
// test or for `AFTER_FIRE` seconds after it hands the controls back, and while one plays the test's button only buzzes
// no. Kortik's Sis jumps out of her skin at each (`sis.spook`).
//
// The failed start (`misfire`): the hangar's lights dim and an electrical hum rises, blue arcs crackling round the
// engines' nozzles; three tries at turning them over, the throats glowing hotter each time and dying in a sputter, the
// last coughing a short flame; then a dead stop, the lights back, the metal ticking as it cools. It drives the engines
// through the static fire's own (`fire.engines`), its sound is `hangarAudio.misfire`, and the scene dims its lights by
// `dim`.
//
// The phantom revs (`phantom`): no lights, no arcs, only the two engines revving by turns, back and forth as if they
// were talking, each throat glowing as it revs and the Jet rocking toward it on its gear and shuddering, then still.
// Their sound is `hangarAudio.revs`, each engine on its own side.
//
// Lightning through the Jet (`lightning`): blue arcs gather at its nose and crawl over it to the tail, the hall browning
// out and the runway's marker lamps running the wrong way (`rabbit`), its gold trim and canopy lighting up as they go
// (the Jet's lit mesh, `jetModels.jet(stage, true)`, swapped in for it); then one crack and a flash, and it's over,
// Kortik's Sis zapped if she stands near it (`sis.zap`). Its sound is `hangarAudio.zap`. Now and then (`ZAP.room`,
// or when `debug.play` asks) the crack doesn't end on the Jet: a bolt leaps off its back across the hall to a room's
// console, the room picked at random at the crack (`room.pick`, the control room or one of the crew's rooms on the
// right wall) (`JUMP`), and the room catches fire there (`room.ignite`, `hangar-room-fire.js`), never while one
// already burns.
//
// The blackout (`blackout`): a flicker and every light dies, the hall's own light nearly gone; only the two nozzles glow
// in the dark like eyes, breathing, and blink once; Kortik's Sis's eyes glow too (`sis.dark`); then the banks clunk
// back on one by one. Its sound is `hangarAudio.blackout`, the hall's electrical hum following its power
// (`hangarAudio.power`). The overhead crane stops while the power is off (`powered`), until the last bank is back.
//
// The lowrider (`lowrider`): the Jet bouncing to a beat, its nose lifting on each about its main gear, which stays on the
// floor, and its nose gear banging back down with a bounce, harder and softer by turns, then settling. Kortik's
// Sis bobs along before she catches herself (`sis.groove`). Its sound is `hangarAudio.lowrider`. It only starts with
// nobody standing on the Jet (`riders`), and stops at once, the Jet at rest, if someone gets on or a frame runs too
// long to trust (`HITCH`); what anyone walks on never moves.
//
// The hangar shuffle (`shuffle`): the brakes letting go with a clunk and the Jet shifting in its bay, a lurch toward
// its nose and back, a sway from wing to wing pivoting on the trestle under the wing that stays down, and a last lurch,
// its gear creaking and its engines giving short bursts; then it settles exactly on its marks. It never goes more than
// SHUFFLE's `along` and `roll`, so it stays in its bay, clear of the gangway, with its booth cables riding along. It
// starts only with everyone clear of where it may reach (`near`, `blocked`: any body within `SAFE.margin` of the Jet's
// cells grown by the motion, at that body's height, or of its nozzles) and stops at once at its rest pose, failing
// closed, if anyone comes that near, or a frame runs too long to trust; meanwhile the hangar's own walkers keep out of
// that reach (`keepsOut`). Kortik's Sis yells at it to stay put. Its sound is `hangarAudio.shuffle`.
//
// `create` builds the arcs once a visit; `update` runs the wait and the anomaly, allocating nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const HM = BL.hangarModels, JM = BL.jetModels;

  // From the end of one anomaly to the start of the next, s, at random between; and how long after the static fire test
  // hands its controls back before one may start.
  const GAP = [60, 300], AFTER_FIRE = 10;
  // The failed start, s from its start: the three tries, each turning over for `spin` and sputtering out for `sputter`,
  // the throats as hot as `heat` at each try's peak and glowing on a little for `embers` after; the last try's burst
  // `burp` into it, `burpLen` long at `thrust`; the cut, and the end. How far the lights dim (`dim`, after `fade`), and
  // further as each try pulls (`dip`), coming back over `back` once it is cut; and how many arcs a second crackle before
  // the tries and through them.
  const MISFIRE = { tries: [2.6, 5.4, 8.4], spin: 1.3, sputter: 0.7, embers: 0.6, heat: [0.4, 0.6, 0.85], burp: 1.2, burpLen: 0.25, thrust: 0.3, cut: 10.6, end: 14, dim: 0.6, fade: 1.5, dip: 0.15, back: 0.6, arcs: [1.2, 3] };
  // The phantom revs, s from their start: the script, each rev [start, engine (0 the left, 1 the right), length, how
  // hard], the two answering each other faster and harder until the right has the last word but one; the end. How hot a
  // throat glows at a full rev, how far the Jet leans toward the engine revving, radians, and how hard it shudders.
  const REVS = {
    script: [[0.5, 0, 1.2, 0.5], [2, 1, 1.3, 0.55], [3.6, 0, 0.8, 0.6], [4.4, 0, 0.8, 0.7], [5.5, 1, 0.8, 0.65], [6.3, 1, 0.8, 0.75],
      [7.1, 1, 1, 0.85], [8.4, 0, 1.5, 0.9], [10.2, 1, 1.8, 1], [12.3, 0, 0.6, 0.4]],
    end: 13.6, heat: 0.55, lean: 0.003, shudder: 0.0015
  };
  // How much of a rev it takes to spool up to its peak (the sound's `REV_UP`).
  const SPOOL = 0.45;
  // Lightning through the Jet, s from its start: its arcs gathering at the nose, then crawling to the tail over `crawl`
  // from `start`, `arcs` a second, each `life` long and `size` times a nozzle's, struck over the Jet's top and down its
  // flanks within `spread` of the front (a flank no more than `FLANK` columns out from its middle); the crack,
  // and the end. How far the hall browns out, over `fade`, and comes back, over `back`; how fast the runway's marker
  // lamps' pulse runs the wrong way, m/s, from `rabbit[0]`; how bright the gold trim burns (the lit mesh's glow, from the
  // plain mesh's glass to full); and the crack's flash, how long it lasts and its light.
  // How often a lightning ends in the jump to the control room instead (0 to 1).
  const ZAP = { start: 0.6, crawl: 4, crack: 5.6, end: 7.2, arcs: 16, life: 0.14, size: 1.7, spread: 1.6, dim: 0.5, fade: 0.8, back: 0.6, rabbit: [0.5, 45], glow: [0.22, 1], flash: 0.25, light: [2.4, 2.8, 3.6], room: 0.35 };
  // The jump: how long the bolt takes to reach the room from the crack, s, and how long each of its lengths burns; how
  // far its lengths kink off the straight line, m, and how thick it is against a nozzle's arc.
  const JUMP = { time: 0.3, life: 0.4, kink: 0.7, thick: 2.2 };
  // The blackout, s from its start: one flicker (`flicker`, [from, to], down to `low`), the power killed at `kill`; how
  // dark the lights go and the hall's own light; the nozzles glowing in the dark like eyes from `wake` after the kill,
  // how bright and how they breathe, and their blink at `blink` for `blinkLen`; the banks coming back on, and the end.
  const BLACKOUT = { flicker: [0.05, 0.12], low: 0.3, kill: 0.2, dark: 0.03, ambient: 0.15, wake: 0.6, eyes: 0.35, breathe: 0.08, blink: 4.2, blinkLen: 0.18, banks: [6.8, 7.4, 8, 8.6], end: 10 };
  // The lowrider, s from its start: its first beat, the beat, how many, and how far into a beat the nose gear comes back
  // down (`slam`); how far the nose lifts at the hardest, radians, about the main gear (`gear`, m along the Jet from its
  // middle); the end; and how hard each beat is, n from 0, easing in and out over the first and last two, every other
  // one softer.
  const LOWRIDER = { start: 0.4, beat: 0.6, beats: 14, slam: 0.5, pitch: 0.035, gear: 1.5, end: 10, hard: (n) => Math.min(1, (n + 1) / 2, (LOWRIDER.beats - n) / 2) * (n % 2 ? 0.65 : 1) };
  // The hangar shuffle, s from its start: the brakes letting go; its keyframes, each [s, along (m, toward the nose
  // less), roll (radians, the right wing up more)], eased between: a lurch forward and back, a sway from wing to wing and
  // a last lurch, settling on its marks; the tyre scrubs and the gear's creaks, s; the engines' bursts, [s, how hard];
  // the end; and the top of the trestles' pads, m, where it pivots. At most `along` m and `roll` radians.
  const SHUFFLE = {
    brake: 0.4, keys: [[0, 0, 0], [0.4, 0, 0], [0.75, -0.2, 0], [1.3, 0.08, 0], [1.9, -0.04, 0], [2.4, 0, 0], [3, 0, 0.0105], [3.7, 0, -0.0105], [4.4, 0, 0.008],
      [5.1, 0, -0.008], [5.8, 0, 0.005], [6.5, 0, -0.004], [7.1, 0, 0], [7.8, -0.12, 0.004], [8.4, 0.06, -0.003], [9.2, 0, 0], [10.5, 0, 0]],
    scrubs: [0.4, 1.3, 1.9, 7.8, 8.4], creaks: [3, 3.7, 4.4, 5.1, 5.8, 6.5], bursts: [[0.75, 0.6], [3, 0.4], [4.4, 0.35], [7.8, 0.7]], end: 11, pad: 3.35, along: 0.2, roll: 0.0105
  };
  // How near anything may come to where the shuffling Jet may reach, m; how far it may reach along, to the side and up,
  // m; and how far its nozzles stand out behind its cells.
  const SAFE = { margin: 1, along: 0.25, side: 0.06, up: 0.12, nozzle: 1.5 };
  const LENGTH = { misfire: MISFIRE.end, phantom: REVS.end, lightning: ZAP.end, blackout: BLACKOUT.end, lowrider: LOWRIDER.end, shuffle: SHUFFLE.end };
  // The longest frame a moving Jet trusts, s; and how near the Jet's top an Ooga's feet must be, and how far off the
  // floor, to stand on it, m.
  const HITCH = 0.1, ON_JET = [0.4, 0.4];
  // How much of the lights' dimming the hall's own light takes, but in the blackout.
  const AMBIENT = 0.5;
  // The arcs: how many at once and how long each lasts, s; where they strike round a nozzle, from how far inside its rim
  // to how far out of it, and from how far into it to how far out behind its exit, m; their light, and the hot throats'.
  const FLANK = 7, ARCS = 8, ARC_LIFE = 0.1, ARC_R = [0.6, 1.15], ARC_Z = [-0.4, 0.5], ARC_LIGHT = [0.5, 0.95, 1.8], HEAT_LIGHT = [1.4, 0.5, 0.18];
  const ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);

  // A crackle of lightning a metre long along x, zigzagging, with a fork off it: three shapes, drawn once.
  const bolts = BL.models.cached(() => [0, 1, 2].map((n) => {
    const { beam, merge } = BL.models, rand = BL.math.mulberry32(0xa4c + n), parts = [];
    let x = -0.5, y = 0, z = 0;
    for (let i = 0; i < 6; i++) {
      const nx = x + 1 / 6, ny = i === 5 ? 0 : (rand() - 0.5) * 0.24, nz = i === 5 ? 0 : (rand() - 0.5) * 0.24;
      parts.push(beam(x, y, z, nx, ny, nz, 0.035, "#cdf3ff", 1));
      if (i === 2) parts.push(beam(nx, ny, nz, nx + 0.22, ny + (rand() - 0.5) * 0.3, nz + 0.18, 0.022, "#9fe4ff", 1));
      x = nx; y = ny; z = nz;
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  }));

  // `root`: the scene's root; `fire`: the static fire test (`hangar-fire.js`), whose engines it drives and whose run
  // holds it off; `sis`: Kortik's Sis; `fx`: the scene's particles; `audio`: the hangar's sound; `jet`: the Jet's node,
  // which the revs rock and put back at rest; `stage`, the stage it shows; `auto`: whether they come by themselves (off
  // on a test page, where only `debug.play` starts one); `gap`, a fixed wait between them instead of GAP's, s; `riders()`,
  // whether any Ooga stands on the Jet (`standsOn` says for one); `near(test)`, whether `test(x, z, feet, height,
  // radius)` holds for anything that walks the hall; `busy()`, whether something else has the hall, which holds the next
  // one off until it is done.
  // `room`: the rooms' fire (`hangar-room-fire.js`: `pick(i)`, where the bolt lands, `ignite()` and `burning`).
  const create = ({ root, fire, sis, fx, audio, jet, stage, room, auto = true, gap = null, riders = () => false, near = () => false, busy = () => false }) => {
    const SPARK = HM.blast().spark, BLUE = BL.models.particleGeometry("#a8ecff", 0.05, 1), J = jet.position;
    const exits = JM.EXHAUST.map((e) => ({ x: J.x + e.x, y: e.y, z: J.z + e.z, r: e.r }));
    // Where Kortik's Sis turns to: between the engines. How the Jet stands at rest. Each throat's glow, in the nozzles'
    // order, for `fire.engines` and the lights.
    const engines = { x: J.x, z: exits[0].z }, REST_X = jet.rotation.x, REST_Z = jet.rotation.z, REST_Y = jet.position.y, REST_PX = jet.position.x, REST_PZ = jet.position.z, glow = new Float32Array(exits.length);
    // The Jet's plain and lit meshes; its cells seen from above, where the lightning runs over it, from nose to tail; and
    // the runway the marker lamps light along.
    const plain = jet.geometry, lit = JM.jet(stage, true), C = JM.columns(stage), nose = J.z + C.k0 * C.U, tail = J.z + (C.k0 + C.nk) * C.U, RUNWAY = HM.LAYOUT.runway;
    // Where the trestles stand across the Jet, m from its middle.
    const PAD_X = Math.abs(HM.LAYOUT.trestles[0][0] - J.x);
    const arcs = Array.from({ length: ARCS }, (_, i) => ({ node: createNode({ geometry: bolts()[i % 3], visible: false, sightHidden: true }), life: 0, len: ARC_LIFE, turn: new Float32Array(4) }));
    // The jump's path: its points off the Jet to the room, ARCS lengths of it, and whether this lightning jumps and
    // whether it has landed.
    const path = new Float32Array((ARCS + 1) * 3);
    let jumping = false, landed = false, into;
    addChild(root, ...arcs.map((a) => a.node));
    // The kinds in their turn: a bag shuffled in place each time it runs out.
    const bag = Object.keys(LENGTH);
    let left = 0;
    const next = () => {
      if (left === 0) {
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), s = bag[i]; bag[i] = bag[j]; bag[j] = s; }
        left = bag.length;
      }
      return bag[--left];
    };
    const pause = () => gap !== null ? gap : GAP[0] + Math.random() * (GAP[1] - GAP[0]);
    // The wait for the next; the one playing and how far in; how far the lights are dimmed (1 full) and how hot the
    // throats are, and the hall's own light; when the next arc strikes; whether Kortik's Sis has jumped yet; where the marker lamps' wrong-way pulse
    // is (null while they run their own way); and the crack's flash.
    let wait = pause(), kind = null, t = 0, dim = 1, ambient = 1, heat = 0, arcAt = 0, spooked = false, rabbit = null, flash = 0;
    // The static fire test running, or not long done.
    const held = () => fire.t >= 0 && fire.t < fire.AT.result + AFTER_FIRE;

    // An arc striking at (x, y, z) for `life`, `size` times as long, turned any way, blue sparks off it: the arc that has
    // least left.
    const arc = (x, y, z, life, size = 1) => {
      let a = arcs[0];
      for (let i = 1; i < arcs.length; i++) if (arcs[i].life < a.life) a = arcs[i];
      const n = a.node;
      n.position.x = x; n.position.y = y; n.position.z = z;
      n.scale.x = n.scale.y = n.scale.z = size;
      n.quaternion = null;
      n.rotation.x = Math.random() * Math.PI * 2; n.rotation.y = Math.random() * Math.PI * 2; n.rotation.z = Math.random() * Math.PI * 2;
      n.visible = true;
      a.life = a.len = life;
      for (let i = 0; i < 3; i++) fx.spawnParticle(BLUE, x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.3 + Math.random() * 0.3, 10, 6);
    };
    // The jump's path, from the Jet's back to where the bolt lands in the room, kinked at random between its ends.
    const lay = () => {
      const top = onJet(J.x, (nose + tail) / 2), sx = top ? SURF.x : J.x, sy = top ? SURF.y : 6, sz = top ? SURF.z : J.z;
      for (let k = 0; k <= ARCS; k++) {
        const u = k / ARCS, kink = k === 0 || k === ARCS ? 0 : JUMP.kink;
        path[k * 3] = sx + (room.at.x - sx) * u + (Math.random() - 0.5) * 2 * kink;
        path[k * 3 + 1] = sy + (room.at.y - sy) * u + Math.sin(u * Math.PI) * 2.5 + (Math.random() - 0.5) * 2 * kink;
        path[k * 3 + 2] = sz + (room.at.z - sz) * u + (Math.random() - 0.5) * 2 * kink;
      }
    };
    // The jump's `k`th length, burning: a bolt laid from its point to the next, turned along it (the bolt's x).
    const length = (k) => {
      const a = arcs[k], n = a.node, o = k * 3, dx = path[o + 3] - path[o], dy = path[o + 4] - path[o + 1], dz = path[o + 5] - path[o + 2];
      // The bolt is the same end for end, so its way is taken toward +x, where the turn below is well defined.
      const d = Math.hypot(dx, dy, dz) || 1, s = dx < 0 ? -1 : 1, x = s * dx / d, y = s * dy / d, z = s * dz / d, q = a.turn;
      // The turn taking +x onto the length's way: about x × way, by the angle between them.
      const w = 1 + x, ql = Math.hypot(w, z, y);
      q[0] = 0; q[1] = -z / ql; q[2] = y / ql; q[3] = w / ql;
      n.quaternion = q;
      n.position.x = path[o] + dx / 2; n.position.y = path[o + 1] + dy / 2; n.position.z = path[o + 2] + dz / 2;
      n.scale.x = d; n.scale.y = n.scale.z = JUMP.thick;
      n.visible = true;
      a.life = a.len = JUMP.life;
    };
    // An arc round a nozzle's rim.
    const strike = () => {
      const e = exits[Math.floor(Math.random() * exits.length)], turn = Math.random() * Math.PI * 2, r = e.r * (ARC_R[0] + Math.random() * (ARC_R[1] - ARC_R[0]));
      arc(e.x + Math.cos(turn) * r, e.y + Math.sin(turn) * r, e.z + ARC_Z[0] + Math.random() * (ARC_Z[1] - ARC_Z[0]), ARC_LIFE);
    };
    // A point on top of the Jet over (x, z), from its columns, into SURF; whether there is one.
    const SURF = { x: 0, y: 0, z: 0 };
    const onJet = (x, z) => {
      const i = Math.floor((x - J.x) / C.U) - C.i0, k = Math.floor((z - J.z) / C.U) - C.k0;
      if (i < 0 || k < 0 || i >= C.ni || k >= C.nk) return false;
      const top = C.top[i * C.nk + k];
      if (top <= 0) return false;
      SURF.x = x; SURF.y = top + 0.05; SURF.z = z;
      return true;
    };
    // A point on the Jet's flank at z, out at the `side` (-1, 1) edge of its body there and somewhere up it, into SURF;
    // whether there is one.
    const onFlank = (z, side) => {
      const k = Math.floor((z - J.z) / C.U) - C.k0, mid = -C.i0;
      if (k < 0 || k >= C.nk) return false;
      let edge = -1;
      for (let d = 0; d < FLANK; d++) {
        const i = mid + side * d;
        if (i < 0 || i >= C.ni || C.top[i * C.nk + k] <= 0) break;
        edge = i;
      }
      if (edge < 0) return false;
      const lo = C.bottom[edge * C.nk + k], hi = C.top[edge * C.nk + k];
      SURF.x = J.x + (edge + C.i0 + (side > 0 ? 1 : 0)) * C.U + side * 0.1; SURF.y = lo + Math.random() * (hi - lo); SURF.z = z;
      return true;
    };

    // A frame of the failed start.
    const misfire = (dt) => {
      const M = MISFIRE, last = M.tries.length - 1;
      // The throats: hotter through each try's turning over, falling away through its sputter, glowing on a moment;
      // and how hard the try pulls on the lights.
      let h = 0, pull = 0;
      for (let i = 0; i < M.tries.length; i++) {
        const u = t - M.tries[i];
        if (u < 0 || u > M.spin + M.sputter + M.embers) continue;
        if (u < M.spin) { pull = ease(u / M.spin); h = M.heat[i] * pull; }
        else if (u < M.spin + M.sputter) { const v = (u - M.spin) / M.sputter; pull = 1 - v; h = M.heat[i] * (1 - v * 0.7) * (0.75 + 0.25 * Math.sin(t * 31)); }
        else h = M.heat[i] * 0.3 * (1 - (u - M.spin - M.sputter) / M.embers);
      }
      if (t >= M.cut) h = 0;
      // The last try's burst: a short flame and its sparks and smoke, the pad thumping.
      const b = t - M.tries[last] - M.burp;
      const thrust = b >= 0 && b < M.burpLen ? M.thrust * Math.sin(b / M.burpLen * Math.PI) : 0;
      if (b >= 0 && b - dt < 0) {
        for (const e of exits) {
          for (let i = 0; i < 8; i++) fx.spawnParticle(SPARK, e.x, e.y, e.z, (Math.random() - 0.5) * 3, (Math.random() - 0.2) * 3, 3 + Math.random() * 5, 0.5 + Math.random() * 0.4, 10, 6);
          fx.puff(e.x, e.y, e.z + 0.6, 0, 0.4, 1.2, 1.6);
        }
        BL.gamepad.rumble(0.2, 0.4, 160);
      }
      heat = h;
      glow.fill(h);
      fire.engines(thrust, h);
      // The lights: dimming over the first seconds and wavering slowly, dipping as each try pulls, back once it is cut.
      dim = t < M.cut ? 1 - (1 - M.dim) * ease(t / M.fade) - M.dip * pull + 0.03 * Math.sin(t * 8.2) * ease(t / M.fade) : M.dim + (1 - M.dim) * ease((t - M.cut) / M.back);
      // The arcs, a few before the tries and more through them, none once it is cut; a wisp of smoke after.
      const rate = t < M.tries[0] ? M.arcs[0] : t < M.cut ? M.arcs[1] : 0;
      if (rate && (arcAt -= dt) <= 0) { arcAt = (0.5 + Math.random()) / rate; strike(); }
      if (t >= M.cut + 0.3 && t - dt < M.cut + 0.3) for (const e of exits) fx.puff(e.x, e.y, e.z + 0.3, 0, 0.5, 0.4, 1.2);
      // Kortik's Sis, at the first try, and told once the engines have died.
      if (!spooked && t >= M.tries[0]) { spooked = true; sis.spook(engines.x, engines.z); }
      if (t >= M.cut && t - dt < M.cut) sis.settle();
    };

    // A frame of the phantom revs.
    const phantom = (dt) => {
      const R = REVS;
      // How hard each engine revs now: spooling up to its rev's peak over `SPOOL` of it, running down over the rest.
      glow.fill(0);
      for (let i = 0; i < R.script.length; i++) {
        const r = R.script[i], u = (t - r[0]) / r[2];
        if (u > 0 && u < 1) glow[r[1]] = Math.max(glow[r[1]], r[3] * (u < SPOOL ? ease(u / SPOOL) : 1 - ease((u - SPOOL) / (1 - SPOOL))));
      }
      const left = glow[0], right = glow[1];
      jet.rotation.z = REST_Z + R.lean * (left - right) + R.shudder * (left + right) * Math.sin(t * 43);
      jet.rotation.x = REST_X + R.shudder * 0.6 * (left + right) * Math.cos(t * 37);
      for (let i = 0; i < glow.length; i++) glow[i] *= R.heat;
      heat = Math.max(glow[0], glow[1]);
      fire.engines(0, 1, glow);
      // Kortik's Sis, at the first rev, and told once the last has died.
      if (!spooked && t >= R.script[0][0]) { spooked = true; sis.spook(engines.x, engines.z); }
      const quiet = R.script[R.script.length - 1][0] + R.script[R.script.length - 1][2];
      if (t >= quiet && t - dt < quiet) sis.settle();
    };

    // A frame of the lightning.
    const lightning = (dt) => {
      const Z = ZAP, u = ease((t - Z.start) / Z.crawl), front = nose + (tail - nose) * u;
      // Arcs round the front, over its top as wide as the wings or down a flank, tried until one lands on the Jet.
      if (t < Z.crack && (arcAt -= dt) <= 0) {
        arcAt = (0.5 + Math.random()) / Z.arcs;
        for (let n = 0; n < 4; n++) {
          const z = front + (Math.random() - 0.5) * 2 * Z.spread;
          if (n % 2 ? onFlank(z, Math.random() < 0.5 ? -1 : 1) : onJet(J.x + (Math.random() - 0.5) * JM.SIZE.span, z)) { arc(SURF.x, SURF.y, SURF.z, Z.life, Z.size); break; }
        }
      }
      // The gold trim and the glass lighting up as the arcs go over, flickering a little; the hall browning out; the
      // marker lamps running the wrong way.
      jet.glow = t < Z.crack ? (Z.glow[0] + (Z.glow[1] - Z.glow[0]) * u) * (0.9 + 0.1 * Math.sin(t * 9)) : 1;
      dim = t < Z.crack ? 1 - (1 - Z.dim) * ease(t / Z.fade) + 0.04 * Math.sin(t * 6) * ease(t / Z.fade) : Z.dim + (1 - Z.dim) * ease((t - Z.crack) / Z.back);
      rabbit = t >= Z.rabbit[0] && t < Z.crack ? RUNWAY.z1 + ((t - Z.rabbit[0]) * Z.rabbit[1]) % (RUNWAY.z0 - RUNWAY.z1) : null;
      // The crack: the flash, the arcs gone, the Jet plain again, Kortik's Sis zapped if she is near and told it's over.
      if (t >= Z.crack && t - dt < Z.crack) {
        jet.geometry = plain;
        for (const a of arcs) { a.life = 0; a.node.visible = false; }
        sis.zap(J.x, nose, tail);
        sis.settle();
        BL.gamepad.rumble(0.4, 0.6, 200);
        if (jumping) { room.pick(into); lay(); }
      }
      // The jump: the bolt running a length at a time from the Jet to the room, and the room catching fire as it lands.
      if (jumping && t >= Z.crack) {
        const u = (t - Z.crack) / JUMP.time;
        for (let k = Math.floor((t - dt - Z.crack) / JUMP.time * ARCS) + 1; k <= Math.min(ARCS - 1, Math.floor(u * ARCS)); k++) if (k >= 0) length(k);
        if (!landed && u >= 1) {
          landed = true;
          room.ignite();
          for (let i = 0; i < 6; i++) fx.spawnParticle(BLUE, room.at.x, room.at.y, room.at.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.3, 10, 6);
        }
      }
      flash = t >= Z.crack ? Math.max(0, 1 - (t - Z.crack) / Z.flash) : 0;
      // Kortik's Sis, as it starts.
      if (!spooked && t >= Z.start / 2) { spooked = true; sis.spook(J.x, (nose + tail) / 2); }
    };

    // A frame of the blackout.
    const blackout = (dt) => {
      const B = BLACKOUT;
      let on = 0;
      for (let i = 0; i < B.banks.length; i++) if (t >= B.banks[i]) on++;
      const k = on / B.banks.length;
      // The lights: a flicker, dead, then back a bank at a time; the hall's own light with them; the hall's hum with the
      // power, and Kortik's Sis's eyes in the dark.
      dim = t < B.kill ? (t >= B.flicker[0] && t < B.flicker[1] ? B.low : 1) : B.dark + (1 - B.dark) * k;
      ambient = t < B.kill ? 1 : B.ambient + (1 - B.ambient) * k;
      if (t >= B.kill && t - dt < B.kill) audio.power(0);
      for (let i = 0; i < B.banks.length; i++) if (t >= B.banks[i] && t - dt < B.banks[i]) audio.power((i + 1) / B.banks.length);
      sis.dark((1 - dim) / (1 - B.dark));
      // The nozzles in the dark, like eyes: waking, breathing, blinking once, gone as the first bank comes on.
      const awake = t < B.kill + B.wake || on > 0 || t >= B.blink && t < B.blink + B.blinkLen ? 0 : B.eyes * ease((t - B.kill - B.wake) / 0.8) * (1 + B.breathe * Math.sin(t * 2));
      glow.fill(awake);
      heat = awake;
      fire.engines(0, 1, glow);
      // Kortik's Sis, as it goes dark, and told once the lights come back.
      if (!spooked && t >= B.kill) { spooked = true; sis.spook(engines.x, engines.z); }
      if (t >= B.banks[0] && t - dt < B.banks[0]) sis.settle();
    };

    // Whether an Ooga with its feet at `feet` stands on the Jet's top at (x, z).
    const standsOn = (x, feet, z) => {
      const i = Math.floor((x - J.x) / C.U) - C.i0, k = Math.floor((z - J.z) / C.U) - C.k0;
      return feet > ON_JET[1] && i >= 0 && k >= 0 && i < C.ni && k < C.nk && C.top[i * C.nk + k] > 0 && Math.abs(C.top[i * C.nk + k] - feet) < ON_JET[0];
    };
    // A frame of the lowrider: stopped at once, at rest, with someone on the Jet or a frame too long to trust.
    const lowrider = (dt) => {
      const L = LOWRIDER;
      if (riders() || dt > HITCH) { end(); return; }
      const u = t - L.start, n = Math.floor(u / L.beat);
      let k = 0;
      if (u >= 0 && n < L.beats) {
        const v = (u - n * L.beat) / L.beat;
        k = L.hard(n) * (v < 0.2 ? ease(v / 0.2) : v < 0.5 ? 1 - ease((v - 0.2) / 0.3) : v < 0.75 ? 0.25 * Math.sin((v - 0.5) / 0.25 * Math.PI) : 0);
      }
      // The nose up about the main gear, the Jet raised as much there so that gear stays on the floor.
      const pitch = L.pitch * k;
      jet.rotation.x = REST_X + pitch;
      J.y = REST_Y + L.gear * Math.sin(pitch);
      // Each bang in the pad, as hard as the beat, as the nose gear comes down.
      const hit = (n + L.slam) * L.beat;
      if (u >= 0 && n < L.beats && u >= hit && u - dt < hit) BL.gamepad.rumble(0.55 * L.hard(n), 0.3 * L.hard(n), 140);
      // Kortik's Sis, at the first beat, and told once the last is done.
      if (!spooked && t >= L.start) { spooked = true; if (!sis.groove(L.beat)) sis.spook(engines.x, engines.z); }
      const last = L.beats * L.beat;
      if (u >= last && u - dt < last) sis.settle();
    };

    // Whether a body at (x, z), its feet at `feet`, `height` tall and `radius` round, comes within SAFE.margin of anywhere
    // the shuffling Jet may reach: any of its cells at the body's height, grown by the motion, or its nozzles.
    const blocked = (x, z, feet, height, radius) => {
      const lx = x - REST_PX, lz = z - REST_PZ, r = radius + SAFE.margin, top = feet + height;
      const i0 = Math.max(0, Math.floor((lx - r - SAFE.side) / C.U) - C.i0), i1 = Math.min(C.ni - 1, Math.floor((lx + r + SAFE.side) / C.U) - C.i0);
      const k0 = Math.max(0, Math.floor((lz - r - SAFE.along) / C.U) - C.k0), k1 = Math.min(C.nk - 1, Math.floor((lz + r + SAFE.along) / C.U) - C.k0);
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const c = i * C.nk + k, hi = C.top[c];
        if (hi <= 0 || C.bottom[c] - SAFE.up >= top || hi + SAFE.up <= feet) continue;
        const x0 = (i + C.i0) * C.U - SAFE.side, x1 = x0 + C.U + 2 * SAFE.side, z0 = (k + C.k0) * C.U - SAFE.along, z1 = z0 + C.U + 2 * SAFE.along;
        if (Math.hypot(Math.max(x0 - lx, 0, lx - x1), Math.max(z0 - lz, 0, lz - z1)) < r) return true;
      }
      for (let n = 0; n < exits.length; n++) {
        const e = exits[n], g = e.r + SAFE.side;
        if (e.y - e.r - SAFE.up >= top || e.y + e.r + SAFE.up <= feet) continue;
        if (Math.hypot(Math.max(e.x - g - x, 0, x - e.x - g), Math.max(e.z - SAFE.nozzle - SAFE.along - z, 0, z - e.z - SAFE.along)) < r) return true;
      }
      return false;
    };
    // A frame of the hangar shuffle: stopped at once, at rest, with anyone near or a frame too long to trust.
    const shuffle = (dt) => {
      const S = SHUFFLE;
      if (dt > HITCH || near(blocked)) { end(); return; }
      // The pose between its keyframes: along the Jet, and rolled about the pad under the wing that stays down.
      let i = 1;
      while (i < S.keys.length - 1 && t > S.keys[i][0]) i++;
      const a = S.keys[i - 1], b = S.keys[i], u = ease((t - a[0]) / (b[0] - a[0])), along = a[1] + (b[1] - a[1]) * u, roll = a[2] + (b[2] - a[2]) * u;
      const px = roll > 0 ? -PAD_X : PAD_X, cos = Math.cos(roll), sin = Math.sin(roll);
      J.x = REST_PX + px - (px * cos - S.pad * sin); J.y = REST_Y + S.pad - (px * sin + S.pad * cos); J.z = REST_PZ + along;
      jet.rotation.z = REST_Z + roll;
      // The engines' bursts: both throats flaring a moment, a puff of smoke from each.
      let h = 0;
      for (let n = 0; n < S.bursts.length; n++) {
        const d = t - S.bursts[n][0];
        if (d >= 0 && d < 0.3) h = Math.max(h, S.bursts[n][1] * 0.6 * (1 - d / 0.3));
        if (d >= 0 && d - dt < 0) for (const e of exits) fx.puff(e.x, e.y, e.z + 0.4, 0, 0.3, 0.6, 1.1);
      }
      heat = h;
      glow.fill(h);
      fire.engines(0, 1, glow);
      // Kortik's Sis, at it for shifting, where she stands.
      if (!spooked && t >= S.brake) { spooked = true; sis.spook(engines.x, engines.z, "stay"); }
    };

    // `jump`, for a lightning: whether it ends in the jump to a room (left to chance when not said), and `to`, which room
    // (one at random when not said).
    const begin = (k, jump, to) => {
      kind = k; t = 0; arcAt = 0; spooked = false;
      if (k === "misfire") audio.misfire(MISFIRE);
      else if (k === "phantom") audio.revs(REVS.script);
      else if (k === "lightning") {
        jumping = !room.burning && (jump === undefined ? Math.random() < ZAP.room : jump);
        into = to;
        landed = false;
        jet.geometry = lit;
        jet.glow = ZAP.glow[0];
        audio.zap(ZAP, { x: J.x, y: 5, z: nose }, { x: J.x, y: 5, z: tail });
      } else if (k === "blackout") audio.blackout(BLACKOUT);
      else if (k === "lowrider") audio.lowrider(LOWRIDER);
      else if (k === "shuffle") audio.shuffle(SHUFFLE);
    };
    // Over, or cut short: the engines cold, the Jet at rest, the lights full, the arcs gone, and the wait for the next.
    const end = () => {
      if (kind === "blackout") { sis.dark(0); audio.power(1); }
      kind = null; dim = 1; ambient = 1; heat = 0;
      glow.fill(0);
      jet.rotation.x = REST_X; jet.rotation.z = REST_Z; J.x = REST_PX; J.y = REST_Y; J.z = REST_PZ;
      jet.geometry = plain; jet.glow = 1; rabbit = null; flash = 0;
      fire.engines(0, 0);
      for (const a of arcs) { a.life = 0; a.node.visible = false; }
      wait = pause();
    };
    const unfit = (k) => k === "lowrider" && riders() || k === "shuffle" && near(blocked);
    // Whether a walker of the hangar's own, `height` tall and `radius` round at (x, z) with its feet at `feet`, must keep
    // out of there: within the shuffling Jet's reach while it shuffles.
    const keepsOut = (x, z, feet, height, radius) => kind === "shuffle" && blocked(x, z, feet, height, radius);
    // Once a frame, before the static fire test's own.
    const update = (dt) => {
      for (const a of arcs) if (a.life > 0 && (a.life -= dt) <= 0) a.node.visible = false;
      if (!kind) {
        if (auto && (wait -= dt) <= 0 && !held() && !busy()) {
          // The lowrider only with nobody on the Jet, the shuffle only with everyone clear of it: the next in the bag
          // instead, or the failed start.
          let k = next();
          if (unfit(k)) k = next();
          begin(unfit(k) ? "misfire" : k);
        }
        return;
      }
      t += dt;
      if (kind === "misfire") misfire(dt);
      else if (kind === "phantom") phantom(dt);
      else if (kind === "lightning") lightning(dt);
      else if (kind === "blackout") blackout(dt);
      else if (kind === "lowrider") lowrider(dt);
      else shuffle(dt);
      if (kind !== "blackout") ambient = 1 - (1 - dim) * AMBIENT;
      if (kind && t >= LENGTH[kind]) end();
    };

    // Its lights into the scene's array from `slot`: each throat's glow while it is hot, an arc's flash while one
    // strikes, and the crack's; how many it wrote.
    const put = (Lt, slot, x, y, z, radius, rgb, k) => {
      const w = slot * 8;
      Lt[w] = x; Lt[w + 1] = y; Lt[w + 2] = z; Lt[w + 3] = radius;
      Lt[w + 4] = rgb[0] * k; Lt[w + 5] = rgb[1] * k; Lt[w + 6] = rgb[2] * k; Lt[w + 7] = 0;
    };
    const lights = (Lt, slot) => {
      let n = 0;
      for (let i = 0; i < exits.length; i++) if (glow[i] > 0.02) put(Lt, slot + n++, exits[i].x, exits[i].y, exits[i].z + 1.2, 8, HEAT_LIGHT, glow[i]);
      let striking = null;
      for (const a of arcs) if (a.life > 0) { striking = a; break; }
      if (striking) { const p = striking.node.position; put(Lt, slot + n++, p.x, p.y, p.z, 6, ARC_LIGHT, striking.life / striking.len); }
      if (flash > 0) put(Lt, slot + n++, J.x, 7, J.z, 30, ZAP.light, flash * flash);
      return n;
    };

    // For debugging: play one now (unless one plays or the static fire holds them off), and where things stand.
    const debug = {
      play: (k = "misfire", jump, to) => { if (kind || held() || !LENGTH[k]) return false; begin(k, jump, to); return true; },
      get kind() { return kind; }, get t() { return t; }, get wait() { return wait; }, get dim() { return dim; }, get heat() { return heat; }, get jumping() { return jumping; }
    };
    // Leaving mid-anomaly: the engines cold, the Jet plain and at rest, and the lights full; the arcs go with the scene's
    // root.
    const dispose = () => { if (kind) end(); };
    // The Jet's lit mesh, kept on the GPU off the graph, so the lightning swaps it in without a hitch.
    const liveGeometry = (set) => { set.add(lit); };
    // Put the next off: none for at least `s` s from now, however long it has been due.
    const defer = (s) => { if (wait < s) wait = s; };
    return { update, lights, liveGeometry, dispose, debug, standsOn, keepsOut, defer, get playing() { return !!kind; }, get dim() { return dim; }, get ambient() { return ambient; }, get rabbit() { return rabbit; },
      get powered() { return kind !== "blackout" || t < BLACKOUT.kill || t >= BLACKOUT.banks[BLACKOUT.banks.length - 1]; } };
  };

  BL.hangarAnomaly = { create, MISFIRE, REVS, ZAP, BLACKOUT, LOWRIDER, SHUFFLE };
})();
