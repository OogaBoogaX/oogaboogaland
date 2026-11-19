// The Block Party's dancing (timechain-room-party.js): how an Ooga standing still on its floor moves to the music, by
// a number its player chooses (`NUMBERS`): 0 standing still, and 1 to 9 a move each, a two-step, a fist pump, the
// running man, a shuffle, a disco point, a T-step travelling to the side and back, a spin, raising the roof and hands
// in the air with a jump, each a little livelier than the one before. A new number starts at once, from standing still
// or from another move, and eases in over SWITCH beats, so a player can change move on the fly; a move turns to its
// other side each PHRASE beats, unless it travels or changes sides itself (the disco point). The number rides the room's pose as `d`. A dancer keeps dancing through a jump.
//
// Every move is smooth curves of the beat (`M.beat`, the music's own), so nothing snaps: an accent is a cosine peak on
// the beat, a step a soft half-sine. A move writes a pose: offsets (`CH`) from the body as the crew stood it, in the
// body's own terms (an arm's raise outward, the chest turning toward the right arm's side), which `apply` turns into
// the rig's joints: the hips' height, a spin, the upper body's dip, forward bend, twist and sway (the torso, head,
// arms and a worn jetpack together, about the hips, by `poseYaw` and `poseLean`), the head, each shoulder's rise, arm
// and elbow, and each leg. The pose is laid over the body after the crew and the other players are posed and taken off
// again before the next frame (`undance`), so the crew, the camera and the room only ever see the body as it stands.
(() => {
  "use strict";
  const BL = window.BL;
  const TAU = Math.PI * 2;
  // A pose's channels: the upper body's dip (m, down), the hips' hop (m, up), a spin (rad), the upper body's sway toward
  // the right arm's side, twist toward it and forward bend (rad); the head's nod (down), look and tilt toward that side;
  // each arm's swing (negative forward and up), twist and raise outward, and its elbow's bend beyond the bend it stands with (negative straightens it); each leg's swing
  // (negative forward), twist (toe out) and opening outward; each shoulder's rise (m); each hand's point (over a half,
  // the fist shows its first finger out straight, as the Lecture Hall's professor points); and the whole body's slide
  // toward the right arm's side (m), drawn only: the body stays where it stands for everything else.
  const CH = { DIP: 0, HOP: 1, SPIN: 2, SWAY: 3, TWIST: 4, BEND: 5, NOD: 6, LOOK: 7, TILT: 8,
    RX: 9, RY: 10, RZ: 11, RF: 12, LX: 13, LY: 14, LZ: 15, LF: 16,
    RLX: 17, RLY: 18, RLZ: 19, LLX: 20, LLY: 21, LLZ: 22, RSH: 23, LSH: 24, RP: 25, LP: 26, SLIDE: 27 };
  const N = 28;
  const { DIP, HOP, SPIN, SWAY, TWIST, BEND, NOD, LOOK, TILT, RX, RY, RZ, RF, LX, LY, LZ, LF, RLX, RLY, RLZ, LLX, LLY, LLZ, RSH, LSH, RP, LP, SLIDE } = CH;
  // An Ooga starts dancing STILL seconds after it stops, easing in over EASE and out over OUT, or at once over QUICK
  // when its number has just changed; a new number eases in over SWITCH beats, a move's turn to its other side over
  // XFADE; the pose follows its target at FOLLOW a second (a little follow-through); each dancer is up to LAG beats
  // behind the beat, as people are.
  const DANCE = { STILL: 0.8, EASE: 1.2, QUICK: 0.2, OUT: 0.3, PHRASE: 8, XFADE: 1.5, SWITCH: 0.5, FOLLOW: 16, LAG: 0.08, MAX: 9, DEFAULT: 1, KEY: "ooga-dance-level" };
  // A shoulder's rise (m) as the arm's lift out from the side (rad), the shoulder held on the body. How far the T-step
  // travels (m).
  const SHRUG = 4, TSTEP = 0.6;
  // How long (beats) the disco point takes to change arms.
  const DISCO_SWAP = 1;

  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  // 1 on the beat and 0 halfway between, smooth all the way.
  const peak = (b) => 0.5 + 0.5 * Math.cos(TAU * b);
  // The positive part of a curve from -1 to 1, eased so it leaves zero without a corner.
  const soft = (x) => x > 0 ? x * x * (3 - 2 * x) : 0;
  // A hand on its hip: the upper arm lifted well out from the side (swung back, then turned out), the elbow bent so the
  // forearm comes back in and down to the hip.
  const hip = (o, x, y, z, f) => { o[x] = 1.3; o[y] = -1.45; o[z] = 0.05; o[f] = 1.25; };

  // The two-step under most moves: the weight shifting side to side over two beats (`s`, toward the right arm's side
  // at its top), the leg on that side opening, the body swaying over it, a dip and a nod on every beat.
  const groove = (o, b, step, sway, dip, nod) => {
    const s = Math.sin(Math.PI * b);
    o[RLZ] += step * soft(s); o[LLZ] += step * soft(-s);
    o[SWAY] += sway * s;
    o[DIP] += dip * peak(b);
    o[NOD] += nod * peak(b - 0.1);
    return s;
  };

  // The moves, each writing a whole pose into `o` (zeroed) at beat `b` and intensity `a` (0 to 1).
  const MOVES = {
    // A two-step: the elbows bent a little, the forearms swinging with the step and the chest turning with it.
    step(o, b, a) {
      const s = groove(o, b, 0.07 + 0.06 * a, 0.045 + 0.03 * a, 0.018 + 0.025 * a, 0.05 + 0.05 * a);
      o[RX] = -0.2 - 0.12 * s; o[LX] = -0.2 + 0.12 * s;
      o[RF] = 0.5 + 0.2 * s; o[LF] = 0.5 - 0.2 * s;
      o[RZ] = o[LZ] = 0.06;
      o[TWIST] = (0.05 + 0.04 * a) * s; o[TILT] = 0.03 * s;
      o[RSH] = 0.012 * soft(s); o[LSH] = 0.012 * soft(-s);
    },
    // A fist pumping up on every beat, the other hand on the hip, the body dipping as the fist goes up.
    pump(o, b, a) {
      groove(o, b, 0.08 + 0.06 * a, 0.04 + 0.02 * a, 0.03 + 0.035 * a, 0.08 + 0.08 * a);
      const k = peak(b - 0.05);
      o[RX] = -2.15 - (0.25 + 0.2 * a) * k; o[RZ] = 0.22; o[RF] = 0.85 - (0.55 + 0.25 * a) * k;
      hip(o, LX, LY, LZ, LF);
      o[RSH] = 0.03 * k; o[TWIST] = 0.06; o[NOD] -= 0.12; o[TILT] = 0.04;
    },
    // The running man: the legs swinging by turns as the feet slide back, the arms pumping against them, a dip on
    // every beat and the body leaning into it.
    running(o, b, a) {
      const s = Math.sin(Math.PI * b), L = 0.25 + 0.2 * a;
      o[RLX] = -L * s; o[LLX] = L * s;
      o[DIP] = (0.035 + 0.03 * a) * peak(b); o[NOD] = (0.06 + 0.06 * a) * peak(b - 0.1); o[BEND] = 0.08 + 0.05 * a;
      o[RX] = -0.4 + 0.45 * s; o[LX] = -0.4 - 0.45 * s; o[RF] = o[LF] = 0.95; o[RZ] = o[LZ] = 0.1;
      o[TWIST] = -0.08 * s; o[RSH] = 0.02 * soft(-s); o[LSH] = 0.02 * soft(s);
    },
    // A shuffle: both feet twisting heel and toe together twice a beat, a foot kicking out by turns, a bounce on every
    // half beat, the arms pumping low in front.
    shuffle(o, b, a) {
      const c = Math.cos(Math.PI * b), tw = 0.22 + 0.15 * a, w = Math.sin(TAU * b);
      o[RLY] = tw * w; o[LLY] = -tw * w;
      o[RLZ] = (0.12 + 0.14 * a) * soft(c); o[LLZ] = (0.12 + 0.14 * a) * soft(-c);
      o[DIP] = (0.02 + 0.02 * a) * peak(2 * b); o[NOD] = 0.06 * peak(b - 0.1); o[BEND] = 0.06;
      o[RX] = -0.35 - 0.25 * soft(c); o[LX] = -0.35 - 0.25 * soft(-c); o[RF] = o[LF] = 0.8;
      o[SWAY] = -0.05 * c; o[TWIST] = 0.06 * c;
    },
    // The disco point, a point on every beat: one arm up and out on one, down and across the body on the next, the
    // other hand on the hip, the head following the hand and the hips swaying under it. It changes arms every eight
    // beats over DISCO_SWAP of a beat: the pointing arm comes down through hanging at the side to the hip as the other
    // comes off the hip through the same and up into the next point, so neither arm ever cuts across from one pose to
    // the other, and the head and hips turn over with them.
    disco(o, b, a) {
      const u = smooth(0.5 - 0.5 * Math.cos(Math.PI * b) * 1.25), v = 2 * u - 1;
      const c = ((b % 16) + 16) % 16, h = (c < 8 ? 8 : 16) - DISCO_SWAP;
      const t = smooth((c - h) / DISCO_SWAP), q = c < 8 ? 1 - 2 * t : -1 + 2 * t, side = Math.sin(q * Math.PI / 2);
      groove(o, b, 0.05 + 0.04 * a, 0, 0.02 + 0.02 * a, 0.03);
      const arm = (x, y, z, f, p, q) => {
        if (q > 0) { const k = smooth(q); o[x] = k * (-0.45 - 1.6 * u); o[z] = k * (-0.45 + 0.7 * u); o[f] = k * -0.55; o[p] = k; }
        else { const k = smooth(-q); o[x] = k * 1.3; o[y] = k * -1.45; o[z] = k * 0.05; o[f] = k * 1.25; }
      };
      arm(RX, RY, RZ, RF, RP, q); arm(LX, LY, LZ, LF, LP, -q);
      o[RLZ] += 0.1 * u * soft(q); o[LLZ] += 0.1 * u * soft(-q);
      o[SWAY] = (0.05 + 0.04 * a) * v * side; o[TWIST] = 0.1 * v * side; o[LOOK] = 0.22 * v * side; o[TILT] = 0.05 * v * side;
      o[NOD] += (-0.2 * u + 0.12 * (1 - u)) * Math.abs(side);
    },
    // The T-step, travelling: the body goes sideways a swivel every half beat, four beats to its left and then two back
    // to its right on longer swivels, so it ends where it began, TSTEP metres out at most. The leg leading the way
    // kicks out to the side and back each swivel while the standing foot twists heel and toe under it; a bounce on each
    // swivel, the arms pumping low, the body leaning and looking the way it goes.
    tstep(o, b, a) {
      const c = ((b % 6) + 6) % 6, going = c < 4, n = going ? c * 2 : (c - 4) * 2, i = Math.floor(n), f = n - i, e = f * f * (3 - 2 * f);
      const out = going ? (i + e) / 8 : 1 - (i + e) / 4, h = Math.sin(Math.PI * f), kick = (0.24 + 0.14 * a) * h, tw = (0.3 + 0.14 * a) * h;
      o[SLIDE] = -TSTEP * out;
      if (going) { o[LLZ] = kick; o[LLX] = -0.1 * h; o[RLY] = tw; } else { o[RLZ] = kick; o[RLX] = -0.1 * h; o[LLY] = tw; }
      // The lean and look toward the way it goes, turning over smoothly as it changes way.
      const way = smooth((c - 3.8) / 0.4) - smooth((c - 5.6) / 0.4), lean = -0.05 + 0.11 * way;
      o[SWAY] = lean; o[LOOK] = lean * 2; o[TWIST] = lean;
      o[DIP] = (0.03 + 0.02 * a) * h; o[HOP] = 0.015 * h; o[BEND] = 0.08; o[NOD] = 0.05 * h;
      o[RX] = o[LX] = -0.45 - 0.15 * h; o[RF] = o[LF] = 1.0; o[RZ] = o[LZ] = 0.15;
    },
    // Raising the roof: the upper arms out level, the forearms up, palms pushing up on every beat.
    roof(o, b, a) {
      groove(o, b, 0.08 + 0.06 * a, 0.04, 0.035 + 0.035 * a, 0.1 + 0.08 * a);
      const k = peak(b - 0.05);
      o[RX] = o[LX] = -1.35; o[RZ] = o[LZ] = 1.25 + (0.15 + 0.15 * a) * k;
      o[RF] = o[LF] = 0.95 - (0.55 + 0.3 * a) * k;
      o[RSH] = o[LSH] = 0.025 * k; o[NOD] -= 0.08;
    },
    // Both hands up and swaying side to side over four beats, jumping on every beat. The arms go up in front in a
    // gentle V, never thrown back past the shoulders, turned so the palms face forward and the backs of the hands
    // back; the sway opens one arm a little and closes the other.
    wave(o, b, a) {
      const w = Math.sin(Math.PI * b / 2), f = b - Math.floor(b);
      o[RX] = -2.35 + 0.2 * w; o[LX] = -2.35 - 0.2 * w; o[RY] = o[LY] = 1.6; o[RZ] = o[LZ] = -0.3; o[RF] = o[LF] = -0.3;
      o[SWAY] = 0.09 * w; o[TILT] = 0.1 * w; o[NOD] = -0.12;
      o[HOP] = (0.05 + 0.08 * a) * Math.sin(Math.PI * f);
      o[DIP] = 0.04 * peak(b); o[RLX] = o[LLX] = -0.12 * Math.sin(Math.PI * f);
      o[RLZ] = o[LLZ] = 0.06;
    },
    // A spin: a whole turn over two beats with the arms out, then two beats of the step to land it.
    spin(o, b, a) {
      const f = clamp01((b - 4 * Math.floor(b / 4)) / 2), e = f * f * f * (f * (f * 6 - 15) + 10), open = Math.sin(Math.PI * f);
      groove(o, b, 0.05 + 0.04 * a, 0.03, 0.02 + 0.02 * a, 0.05);
      o[SPIN] = TAU * e;
      o[RZ] = o[LZ] = 0.3 + 0.75 * open; o[RX] = o[LX] = -0.3 - 0.1 * open; o[RF] = o[LF] = 0.6 - 0.9 * open;
      o[NOD] -= 0.08 * open; o[DIP] += 0.04 * open;
    }
  };
  // The numbers a player dances to, each its move, what it is called and how hard it is danced (0 to 1); 0 stands still.
  // A move that `travels` keeps one side (a turn would send it the other way mid-way) and starts its cycle on the beat
  // it was chosen, so it sets off from where the dancer stands; one that changes `sides` itself is never turned.
  const NUMBERS = [
    { move: null, label: "Standing still", a: 0 }, { move: "step", label: "Two-step", a: 0.6 }, { move: "pump", label: "Fist pump", a: 0.65 },
    { move: "running", label: "Running man", a: 0.7 }, { move: "shuffle", label: "Shuffle", a: 0.75 }, { move: "disco", label: "Disco point", a: 0.8, sides: true },
    { move: "tstep", label: "T-step", a: 0.85, travels: true }, { move: "spin", label: "Spin", a: 0.9 }, { move: "roof", label: "Raise the roof", a: 0.95 },
    { move: "wave", label: "Hands up", a: 1 }
  ];
  for (const n of NUMBERS) if (n.move && !MOVES[n.move]) throw new Error(`Unknown dance move ${n.move}`);
  if (NUMBERS.length !== DANCE.MAX + 1) throw new Error("A dance number a key, 0 to DANCE.MAX");

  // Swaps a pose's sides: the arms, legs and shoulders change places, and every turn toward a side turns the other way.
  const RIGHT = [RX, RY, RZ, RF, RLX, RLY, RLZ, RSH, RP], LEFT = [LX, LY, LZ, LF, LLX, LLY, LLZ, LSH, LP];
  const mirror = (o) => {
    for (let i = 0; i < RIGHT.length; i++) { const t = o[RIGHT[i]]; o[RIGHT[i]] = o[LEFT[i]]; o[LEFT[i]] = t; }
    o[SWAY] = -o[SWAY]; o[TWIST] = -o[TWIST]; o[LOOK] = -o[LOOK]; o[TILT] = -o[TILT]; o[SPIN] = -o[SPIN]; o[SLIDE] = -o[SLIDE];
  };
  // Move `name` at beat `b` and intensity `a` into `o`, mirrored or not.
  const pose = (o, name, b, a, flip) => {
    o.fill(0);
    MOVES[name](o, b, a);
    if (flip) mirror(o);
    return o;
  };
  // Whether a dancer named `name` dances its move mirrored in phrase `phrase`.
  const flipOf = (name, phrase) => (BL.math.fnv1a(`${name}:${phrase}`) & 1) === 1;

  // A dancer's state, one an Ooga: how far into dancing it is (`k`), how long it has stood, its move and the one it
  // eases from, the pose it shows and the body as the crew left it this frame (`saved`).
  const state = (cave) => ({
    cave, still: 0, k: 0, level: -1, asked: -1, quick: false, air: false, phrase: 1e9, name: "", lag: 0,
    move: "step", flip: false, from: "step", fromFlip: false, fromA: 0, fromAt: -1e9, a: 0, xf: 1.5, off: 0, fromOff: 0,
    target: new Float64Array(N), other: new Float64Array(N), shown: new Float64Array(N), saved: new Float64Array(56), jet: null,
    fistR: null, fistL: null
  });

  const create = () => {
    // `hands`: the pointing hands shown this visit, kept on the GPU between their moments on the body (`liveGeometry`).
    const dancers = new WeakMap(), posed = [], hands = new Set();
    // The body's joints the dance moves, read into `saved` in a fixed order and written back from it.
    const UPPER = ["torso", "head", "armR", "armL"];
    const save = (st) => {
      const c = st.cave, p = c.parts, s = st.saved;
      let i = 0;
      s[i++] = c.root.position.x; s[i++] = c.root.position.y; s[i++] = c.root.position.z; s[i++] = c.root.rotation.y;
      for (let u = 0; u < UPPER.length; u++) {
        const n = p[UPPER[u]];
        s[i++] = n.position.x; s[i++] = n.position.y; s[i++] = n.position.z; s[i++] = n.rotation.x; s[i++] = n.rotation.y; s[i++] = n.rotation.z;
        s[i++] = n.poseYaw; s[i++] = n.poseLean; s[i++] = n.poseLeanY;
      }
      s[i++] = p.forearmR ? p.forearmR.rotation.x : 0; s[i++] = p.forearmL ? p.forearmL.rotation.x : 0;
      s[i++] = p.legR.rotation.x; s[i++] = p.legR.rotation.y; s[i++] = p.legR.rotation.z;
      s[i++] = p.legL.rotation.x; s[i++] = p.legL.rotation.y; s[i++] = p.legL.rotation.z;
      const jet = c.jet && c.jet.node && c.jet.node.parent === c.root ? c.jet.node : null;
      st.jet = jet;
      if (jet) { s[i++] = jet.position.y; s[i++] = jet.position.z; s[i++] = jet.rotation.x; s[i++] = jet.poseYaw; s[i++] = jet.poseLean; s[i++] = jet.poseLeanY; }
    };
    const restore = (st) => {
      const c = st.cave, p = c.parts, s = st.saved;
      let i = 0;
      c.root.position.x = s[i++]; c.root.position.y = s[i++]; c.root.position.z = s[i++]; c.root.rotation.y = s[i++];
      for (let u = 0; u < UPPER.length; u++) {
        const n = p[UPPER[u]];
        n.position.x = s[i++]; n.position.y = s[i++]; n.position.z = s[i++]; n.rotation.x = s[i++]; n.rotation.y = s[i++]; n.rotation.z = s[i++];
        n.poseYaw = s[i++]; n.poseLean = s[i++]; n.poseLeanY = s[i++];
      }
      if (p.forearmR) p.forearmR.rotation.x = s[i]; i++;
      if (p.forearmL) p.forearmL.rotation.x = s[i]; i++;
      p.legR.rotation.x = s[i++]; p.legR.rotation.y = s[i++]; p.legR.rotation.z = s[i++];
      p.legL.rotation.x = s[i++]; p.legL.rotation.y = s[i++]; p.legL.rotation.z = s[i++];
      const jet = st.jet;
      if (jet) { jet.position.y = s[i++]; jet.position.z = s[i++]; jet.rotation.x = s[i++]; jet.poseYaw = s[i++]; jet.poseLean = s[i++]; jet.poseLeanY = s[i++]; }
      if (st.fistR) { p.fingersR.geometry = st.fistR; st.fistR = null; }
      if (st.fistL) { p.fingersL.geometry = st.fistL; st.fistL = null; }
    };
    // A hand pointing: the fist's pointing twin in its place (a hand the body was built without one keeps its fist).
    const point = (fingers) => {
      const fist = fingers && fingers.geometry;
      if (!fist || !fist.pointing) return null;
      fingers.geometry = fist.pointing();
      hands.add(fingers.geometry);
      return fist;
    };
    // A modelled arm's top is its deltoid, rounded about a point `d` down the arm, and the rig's shoulder pivot stands
    // out past the trunk (crew.js `keepDeltoid`): an arm turned about the pivot alone swings its deltoid up and away
    // from the shoulder. So the dance turns each arm about that point instead: the arm takes the turn and moves by how
    // far the turn about its pivot carried the point, and its shoulder stays on the body however high it goes.
    const quat = BL.math.quat, DQ = quat.create(), D0 = new Float64Array(3), D1 = new Float64Array(3);
    const turnArm = (arm, d, x, y, z) => {
      const r = arm.rotation;
      quat.rotateVec(D0, quat.fromEuler(DQ, r.x, r.y, r.z), 0, -d, 0);
      r.x += x; r.y += y; r.z += z;
      quat.rotateVec(D1, quat.fromEuler(DQ, r.x, r.y, r.z), 0, -d, 0);
      arm.position.x += D0[0] - D1[0]; arm.position.y += D0[1] - D1[1]; arm.position.z += D0[2] - D1[2];
    };
    // The upper body's part `n` dipped `dip`, bent forward `bend` about the hips (the root's origin), turned `twist`
    // and leaned `lean` about them too.
    const upper = (n, dip, bend, twist, lean) => {
      const y = n.position.y - dip, z = n.position.z, c = Math.cos(bend), s = Math.sin(bend);
      n.position.y = y * c - z * s; n.position.z = y * s + z * c;
      n.rotation.x += bend;
      n.poseYaw += twist;
      if (lean) { n.poseLean += lean; n.poseLeanY = 0; }
    };
    // The shown pose `o`, `k` of it, on the body.
    const apply = (st, o, k) => {
      const c = st.cave, p = c.parts;
      // In the air the dance is laid over the body as it stands, not the jump's reach and tuck.
      if (st.air) { p.armR.rotation.x = p.armL.rotation.x = -0.2; p.legR.rotation.x = p.legL.rotation.x = 0; }
      const sA = p.armR.position.x >= 0 ? 1 : -1, sG = p.legR.position.x >= 0 ? 1 : -1;
      // The slide along the body's right arm's side as it faces now, before any spin turns it.
      const yaw = c.root.rotation.y, slide = sA * k * o[SLIDE];
      c.root.position.x += slide * Math.cos(yaw); c.root.position.z -= slide * Math.sin(yaw);
      c.root.position.y += k * o[HOP];
      c.root.rotation.y += k * o[SPIN];
      const dip = k * o[DIP], bend = k * o[BEND], twist = sA * k * o[TWIST], lean = -sA * k * o[SWAY];
      upper(p.torso, dip, bend, twist, lean);
      upper(p.head, dip, bend, twist, lean);
      upper(p.armR, dip, bend, twist, lean);
      upper(p.armL, dip, bend, twist, lean);
      if (st.jet) upper(st.jet, dip, bend, twist, lean);
      p.head.rotation.x += k * o[NOD]; p.head.rotation.y += sA * k * o[LOOK]; p.head.rotation.z -= sA * k * o[TILT];
      // A shoulder's rise lifts the arm a little out from the side about its deltoid, never off the body.
      const d = c.elbow ? c.elbow.deltoid * (c.armScale || 1) : 0;
      turnArm(p.armR, d, k * o[RX], sA * k * o[RY], sA * k * (o[RZ] + SHRUG * o[RSH]));
      turnArm(p.armL, d, k * o[LX], -sA * k * o[LY], -sA * k * (o[LZ] + SHRUG * o[LSH]));
      // An elbow bends from the bend it stands with, and straightens no further than straight.
      if (p.forearmR) p.forearmR.rotation.x = Math.min(0, p.forearmR.rotation.x - k * o[RF]);
      if (p.forearmL) p.forearmL.rotation.x = Math.min(0, p.forearmL.rotation.x - k * o[LF]);
      p.legR.rotation.x += k * o[RLX]; p.legR.rotation.y += sG * k * o[RLY]; p.legR.rotation.z += sG * k * o[RLZ];
      p.legL.rotation.x += k * o[LLX]; p.legL.rotation.y -= sG * k * o[LLY]; p.legL.rotation.z -= sG * k * o[LLZ];
      if (k * o[RP] > 0.5) st.fistR = point(p.fingersR);
      if (k * o[LP] > 0.5) st.fistL = point(p.fingersL);
    };

    return {
      // Called after the crew and the other players are posed, for each Ooga shown: `off` for one that should stand
      // still now (the visitor's own, seen from its own eyes), `level` its player's number (0 to 9), `M` the room's music.
      dance(cave, dt, off, level, M) {
        let st = dancers.get(cave);
        if (!st) dancers.set(cave, st = state(cave));
        level = Number.isInteger(level) ? Math.max(0, Math.min(DANCE.MAX, level)) : DANCE.DEFAULT;
        // A number just chosen starts at once, without the wait for the body to stand still a moment.
        if (level !== st.asked) { st.asked = level; st.quick = level > 0; }
        const G = BL.crew.GAIT, burning = !!(cave.jet && (cave.jet.thrust || cave.jet.power > 0));
        const can = !off && level > 0 && cave.root.visible && !(cave.camp && cave.camp.seat) && !burning && !cave.grabbedBy;
        const standing = can && cave.gait === G.stand && !(cave.hop > 0);
        // A jump (off its feet, no jetpack burning) holds the dance where it is, so a dancer dances on through it.
        st.air = can && st.k > 0 && !standing && (cave.hop > 0 || cave.gait === G.fly || cave.gait === G.fall);
        if (!st.air) {
          st.still = standing ? st.still + dt : 0;
          if (!standing) st.quick = false;
          st.k = standing && (st.still > DANCE.STILL || st.quick) ? Math.min(1, st.k + dt / (st.quick ? DANCE.QUICK : DANCE.EASE)) : Math.max(0, st.k - dt / DANCE.OUT);
          if (st.k >= 1) st.quick = false;
        }
        if (st.k <= 0) { st.shown.fill(0); st.level = -1; return; }
        const name = cave.traits.name;
        if (name !== st.name) { st.name = name; st.lag = (BL.math.fnv1a(name) % 97) / 97 * DANCE.LAG; }
        const b = M.beat - st.lag, phrase = Math.floor(b / DANCE.PHRASE);
        // The number's move, turned to its other side now and then at a phrase; a new number eases in quickly, from the
        // move before at the strength it had.
        if (level > 0 && (phrase !== st.phrase || level !== st.level)) {
          const n = NUMBERS[level], flip = n.travels || n.sides ? false : flipOf(name, phrase), off = level === st.level ? st.off : n.travels ? Math.floor(b) : 0;
          if (st.level > 0 && (n.move !== st.move || flip !== st.flip)) {
            st.from = st.move; st.fromFlip = st.flip; st.fromA = st.a; st.fromAt = b; st.fromOff = st.off;
            st.xf = level !== st.level ? DANCE.SWITCH : DANCE.XFADE;
          }
          st.move = n.move; st.flip = flip; st.a = n.a; st.off = off; st.phrase = phrase; st.level = level;
        }
        const energy = 0.8 + 0.2 * (M.I || 0), o = pose(st.target, st.move, b - st.off, st.a * energy, st.flip);
        const w = smooth((b - st.fromAt) / st.xf);
        if (w < 1) {
          const q = pose(st.other, st.from, b - st.fromOff, st.fromA * energy, st.fromFlip);
          for (let i = 0; i < N; i++) o[i] = q[i] + (o[i] - q[i]) * w;
        }
        // The pose shown follows the target, so even a change of level or a jump in the beat eases in.
        // A spin's end is where it began, so the shown spin takes the short way round to its target.
        const f = 1 - Math.exp(-dt * DANCE.FOLLOW), shown = st.shown;
        shown[SPIN] = o[SPIN] + Math.atan2(Math.sin(shown[SPIN] - o[SPIN]), Math.cos(shown[SPIN] - o[SPIN]));
        for (let i = 0; i < N; i++) shown[i] += (o[i] - shown[i]) * f;
        save(st);
        apply(st, shown, smooth(st.k));
        posed.push(st);
      },
      // Every body danced last frame back as the crew left it: called before anything moves them again.
      undance() {
        for (let i = 0; i < posed.length; i++) restore(posed[i]);
        posed.length = 0;
      },
      liveGeometry(set) { for (const g of hands) set.add(g); }
    };
  };

  // The visitor's own number, kept in this browser (DANCE.KEY), DEFAULT until chosen.
  let mine = DANCE.DEFAULT;
  try {
    const kept = Number(localStorage.getItem(DANCE.KEY));
    if (localStorage.getItem(DANCE.KEY) !== null && Number.isInteger(kept) && kept >= 0 && kept <= DANCE.MAX) mine = kept;
  } catch { /* storage unavailable: the default */ }
  const level = () => mine;
  const setLevel = (n) => {
    mine = Math.max(0, Math.min(DANCE.MAX, Math.round(n)));
    try { localStorage.setItem(DANCE.KEY, String(mine)); } catch { /* not kept */ }
    return mine;
  };

  BL.partyDance = { CH, N, DANCE, MOVES, NUMBERS, pose, create, level, setLevel };
})();
