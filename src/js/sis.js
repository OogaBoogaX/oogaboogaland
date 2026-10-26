// Kortik's Sis in the Lightning Jet Hangar: the chief engineer of a Jet she is sure will never fly, always on the move
// all round the Jet between her spots (`LAYOUT.sis.spots`), on the floor on both its sides and up its stair along the
// gangway by the cockpit, walking or, often, running. At one she tries to fix the Jet with her hammer, swinging it up
// and down onto the gear, a wing, the nose gear, an engine or the canopy, sparks and a clang each hit; at another she
// pulls her goggles down and inspects an engine, a wing or the crates, pointing and tapping; she stands back and
// admires the Jet, hopeful for a moment, then goes red and shakes her fist at it; she glares at the booth or the door,
// tapping her foot; she paces up and down, muttering; and now and then she runs at the visitor's Ooga screaming and
// swearing and yells at them about the Jet. She picks what to do next at random, never the spot she just left, so it
// never reads as a loop, keeps quiet a while between lines, and glares at whoever comes near.
//
// She speaks in her own voice (`hangarAudio.voice`): yelled, screamed, muttered or whispered as the line wants, each
// swear a grawlix that her voice bleeps, from where she stands, so she is heard across the hall; her boots thud where
// she walks.
//
// Poke her (Space beside her, the act button reading POKE, or a tap within reach) and she turns on whoever did it,
// angrier each time: "WHAT?!", "STOP POKING ME!", and on, each with its own fit, now and then chasing them a few
// seconds. Poke her past her tether and she goes for the Jet with her hammer, running from spot to spot round it and
// smashing it: sparks, iron and paint flying, the Jet rocking on its gear, smoking dents left behind (all mended in
// time). Then every poke counts: quick enough in a row (`RAMPAGE.stop`, the tally at her feet draining between them)
// and she melts down, "GO POKE MY BROTHER! HE'S NEXT DOOR!", and storms off to sulk by the door; but a poke also sends
// her running for another spot, so the visitor has to chase her. Left alone, she keeps at it until she calls it fixed.
// After a meltdown she won't go off again for a while.
//
// Now and then her brother's shout comes through the hangar's door from the Lightning Factory next door, muffled
// (`kortik.RIVALRY`, his line and her answer), and she turns to the door, cups her hands and shouts back. And rarely,
// at a spot where she would hammer, she lays the hammer down instead and looks the Jet over gently, whispering "Huh...
// maybe this thing might actually work."; a warning light blinks on it, she screams "OH, FOR #@$%'S SAKE!", hunts all
// round herself for the hammer, finds it at her feet and whacks the light until it goes out.
//
// When someone presses the static fire's red button she freaks out: "WHO PRESSED THAT?!", and she runs from the
// engines with her arms flailing (or, already far off, cowers where she is), cowers with her arms over her head as
// they roar, cries "THAT ENGINE ISN'T—" as they falter, and the blast knocks her flat on her back, sooted and smoking.
// She comes to with the presser, gets up blaming everyone else, and goes to hammer the engine.
//
// She walks a grid of her part of the hall built once a visit from the hangar's own checks (`HM.clearAt`,
// `HM.supportAt`, `HM.walkable`), each cell with a place on the floor and one up the Jet's stair or along its gangway
// where those stand over it, kept off the runway, out of the static fire booth's box and clear of the crew's posts; a
// trip is planned by A* over it and pulled straight wherever the floor allows. The visitor's Ooga stops her; she waits,
// then goes somewhere else. She is a walk block for the Oogas (`actor`). Everything runs on the rig's fixed nodes and
// preallocated arrays; update allocates nothing.
(() => {
  "use strict";
  const BL = window.BL, SM = BL.sisModels, HM = BL.hangarModels;
  const { createNode, addChild } = BL.scene;
  const TAU = Math.PI * 2;

  // How near someone must come for her to glare at them, m, how far her head turns to, and how fast it follows;
  // the time between blinks and a blink's length, s.
  const GLARE = 7, TURN = 0.6, FOLLOW = 5, BLINK = [2.2, 5], SHUT = 0.12;
  // Her body for the floor and the Oogas, m; the grid's cell; her walk and run, m/s, and their strides, radians of
  // the walk cycle a metre; how fast she turns, rad/s; how long a trip she may run, and how often she does.
  const RADIUS = 0.45, HEIGHT = 2, CELL = 0.5, WALK = 1.6, RUN = 3.8, STRIDE = { walk: 4.2, run: 3.1 }, YAW_RATE = 7, RUN_FROM = 7, RUN_CHANCE = 0.6;
  // Where the grid's high places start, m off the floor (lower is the floor or a stair's foot); the most a step
  // between two places may climb or drop; and the height she looks for the stair and the gangway from, just under
  // the gangway, so the catwalks above stay out of reach.
  const LOW = 0.65, RISE = 0.5, UP = HM.LAYOUT.gangway.y - 0.5;
  // How long each thing takes, s, [least, most]; how likely each is when she picks the next, by its kind; how long the
  // visitor may stand in her way before she goes elsewhere.
  const TIMES = { fix: [6, 10], inspect: [4.5, 7], admire: [5, 7], glare: [3, 5], pace: [7, 10], yell: [3.2, 4], smash: [60, 60] }, BLOCKED = 1.4;
  const WEIGHT = { fix: 0.4, inspect: 0.22, admire: 0.14, pace: 0.12, glare: 0.12 };
  // Running at the visitor: from how far (across the runway she stops at its edge and yells over it), how often at
  // most, how likely when she picks, and how near she stops.
  const VISIT = { reach: 32, every: 20, chance: 0.35, stop: 1.9 };
  // A hammer swing, s, and when in it the hammer lands; the quiet she keeps between lines, s.
  const SWING = 1.05, LAND = 0.58, QUIET = [7, 14];
  // How each pose eases toward its target, per second.
  const EASE = 8;
  // Her standing pose: her right arm raised with the hammer's handle over her shoulder, her left fist on her hip; each
  // part's rotation, [x, y, z].
  const POSE = { armR: [-0.55, 0, -0.75], foreR: [-1.9, 0, 0.4], hammer: [Math.PI / 2 + 0.25, 0, 0.7], armL: [0.15, 0, 0.7], foreL: [-0.2, 0, -1.7], head: [0.08, 0, 0] };
  const MAX_PATH = 160;
  // What she says: about the Jet, about Lightning, while she hammers and as she goes for it, as she runs at the
  // visitor and once she has caught up with them, muttering, the rare hopeful moment, the rare lines, and the static
  // fire's. A swear is a grawlix, which her voice bleeps.
  const LINES = {
    jet: ["THIS THING WILL NEVER FLY!", "IT'S TOO HEAVY! IT'LL NEVER TAKE OFF!", "WE NEED BIGGER ENGINES!", "I WISH ELON MUSK WAS HERE!", "WHO DESIGNED THIS PIECE OF #@$%?!", "WHERE THE #@%& IS THE FLIGHT MANUAL?!"],
    lightning: ["#@$%&*! ANOTHER CHANNEL?!", "I JUST REBALANCED THAT THING!", "WHY IS ALL THE LIQUIDITY ON THE WRONG SIDE?!", "MY BROTHER STILL REBALANCES MANUALLY! LIKE A CAVEMAN!"],
    hammer: ["COME ON, YOU STUPID THING!", "JUST... ONE... MORE... HIT!"],
    rage: ["AH, #@$% IT! WHERE'S MY HAMMER?!"],
    charge: ["HEY! YOU!", "YOU! YES, YOU!", "WHO THE #@$% LET YOU IN HERE?!", "OI! DON'T TOUCH MY #@$%ING JET!"],
    caught: ["DO YOU KNOW HOW HEAVY THIS #@$%ING THING IS?!", "YOU WANT TO HELP? FIND ME BIGGER ENGINES!", "STOP STANDING AROUND AND HAND ME A WRENCH!", "THIS #@$% WILL NEVER FLY! NEVER!"],
    mutter: ["This thing will never fly...", "Too heavy. Way too heavy...", "Bigger engines. We need bigger engines...", "I just rebalanced that thing...", "Stupid #@$% engines..."],
    hope: ["Huh... maybe this thing might actually work."],
    hush: ["OH, FOR #@$%'S SAKE!"],
    rare: ["IF THIS THING FLIES, I'LL EAT MY HARD HAT!", "WHO KEEPS OPENING CHANNELS TO MY TOASTER?!", "FORCE-CLOSED?! WHO FORCE-CLOSED MY CHANNEL?!"],
    poke: ["WHAT?!", "STOP POKING ME!", "DO I LOOK LIKE A #@$%ING BUTTON?!", "I'M GONNA REBALANCE YOUR FACE!"],
    rampage: ["THAT'S IT! I'M FIXING THIS THING THE HARD WAY!", "AH, #@$% IT! WHERE'S MY HAMMER?!"],
    smash: ["COME ON, YOU STUPID THING!", "JUST... ONE... MORE... HIT!", "TAKE THAT!", "FLY, YOU #@$%ING BUCKET!"],
    shove: ["GET OFF ME!", "I'M BUSY!", "BACK OFF!", "NOT NOW!"],
    chase: ["COME BACK HERE!", "GET BACK HERE, YOU!"],
    meltdown: ["GO POKE MY BROTHER! HE'S NEXT DOOR!"],
    sulk: ["LEAVE ME ALONE!", "I SAID GO POKE MY BROTHER!"],
    fixed: ["There. Fixed it."],
    panic: ["WHO PRESSED THAT?!", "THAT ENGINE ISN'T—"],
    blame: ["THAT WASN'T MY FAULT!", "WHO TOUCHED MY ENGINES?!", "I TOLD YOU THAT ENGINE WASN'T READY!", "NOBODY SAW THAT. NOBODY!"],
    tess: ["TESS! BUZZ OFF!", "NOT NOW, TESS!", "GET OUT OF MY FACE, YOU FLYING TOASTER!", "I CAN'T SEE THE #@$%ING JET!", "I'M FIXING IT! LEAVE ME BE!"]
  };
  // How she says each (a style of `hangarAudio.voice`); how often a line about the Jet or Lightning comes out a rare
  // one instead, and a yell a scream.
  const STYLE = { jet: "yell", lightning: "yell", hammer: "yell", rage: "scream", charge: "scream", caught: "yell", mutter: "mutter", hope: "soft", rare: "yell", panic: "scream", blame: "yell",
    poke: "yell", rampage: "scream", smash: "yell", shove: "yell", chase: "scream", meltdown: "scream", sulk: "yell", fixed: "mutter", hush: "scream", quarrel: "scream", tess: "yell" };
  const RARE = 0.08, SCREAM = 0.2;
  // The static fire: where she runs to, the nearer of them (beside the booth and by the far wall's crates, both where
  // the test's show view keeps her in frame lying down); how far off she may stay put and cower; how near the blast
  // knocks her down, how far it slides her, how long she takes to fall and to get up, and how long she blames
  // everyone after; her soot and how fast it fades.
  const FLEE = [[10.4, 12.4], [22.4, 9.2]];
  const PANIC = { far: 14, knock: 26, slide: 0.8, fall: 0.35, rise: 0.6, blame: 3.6, soot: 0.8, fade: 0.08, run: 1.15 };
  // Poking her: how near the poker must stand and how far their feet and hers may differ, m; how long a fit lasts and
  // her meltdown's tantrum, s; how long she takes to cool a level of anger left alone; the anger that sets her
  // smashing the Jet; how likely a poke at the end of her tether sends her after the poker, for how long and how near;
  // how long after a meltdown she won't go off again, and how long she sulks; how fast she storms off, m/s.
  const POKE = { reach: 2.4, rise: 1.5, fit: 0.75, tantrum: 1.6, calm: 6, rage: 5, chase: 0.3, chaseTime: 3.5, chaseStop: 1.3, cooldown: 45, sulk: 10, storm: 2.6 };
  // Her rampage: how many pokes in quick succession stop her, and how fast that tally drains without one, s a poke;
  // how many blows she lands at a spot before running on, how long a swing takes, how many pokes at one spot send her
  // running to another, and the longest she keeps it up before she calls it fixed, s.
  const RAMPAGE = { stop: 4, drain: 2.2, hits: [3, 5], swing: 0.62, flee: 2, max: 50 };
  // Tess buzzing round her head in her rampage (`distract`): how often she turns on her, s, how long she shouts at her
  // with her fist up instead of swinging, and how much slower her swings come while Tess is there.
  const DISTRACT = { every: [2.6, 4.2], look: 1.5, slow: 1.45 };
  // The Jet's damage, all mended in time: how many smoking dents it carries at once and how long each smokes, s.
  const MARKS = 8, MARK_LIFE = 25;
  // Her quarrel with Kortik next door: when his first shout comes through the hangar's door, and between shouts after,
  // s; how long after his line she answers, and how long she shouts back. The rare quiet moment: how likely at a spot
  // where she would hammer, the least time between two, s, and its beats, s from its start: the hammer laid down, the
  // whisper, the warning light, the scream, the hunt for the hammer, the hammer picked up; and how many blows put the
  // light out. The light's blink, s each way.
  const QUARREL = { first: [35, 60], every: [80, 150], answer: 0.4, shout: 2.6 };
  const HUSH = { chance: 0.15, every: 150, down: 0.7, whisper: 1.3, light: 4.4, scream: 5, hunt: 6.9, grab: 7.5, blows: 3, blink: 0.18 };
  // The tally at her feet while she smashes: its font, its pips' size and gap, px.
  const TALLY_FONT = "bold 10px ui-monospace, monospace", PIP = 9, PIP_GAP = 4;
  // The warning light her quiet moment ends on: a red lamp on a dark mount.
  const BEACON = BL.models.cached(() => BL.models.merge(
    BL.models.box({ w: 0.22, h: 0.06, d: 0.22, color: "#2b2d31", offset: { y: -0.1 } }),
    BL.models.box({ w: 0.16, h: 0.16, d: 0.16, color: "#ff2a1a", emissive: 1 })
  ));

  // `fx` for her lines and sparks, `audio` for her voice, her boots and her hammer's clang, `fire` the static fire test
  // she freaks out at, `jet` the Jet's node, which her rampage rocks, and `toast` for what the visitor should know.
  const create = ({ fx, audio, fire, jet, toast, blocks = null }) => {
    const S = HM.LAYOUT.sis, k = SM.rig(), P = k.parts, H = k.heads, rand = BL.math.mulberry32(0x5153), B = HM.blast(), SPARK = B.spark, IRON = B.iron;
    // The Jet's paint flying off it: its white and its livery's blue.
    const CHIPS = [BL.models.particleGeometry("#eeeae2", 0.1, 0), BL.models.particleGeometry("#2a4fb8", 0.1, 0)];
    // What she leaves about the hall in her quiet moment, for the scene to stand in it (`props`): the hammer laid on the
    // floor and the warning light on the Jet, each hidden until then.
    const props = createNode({}), floorHammer = createNode({ geometry: P.hammer.geometry }), beacon = createNode({ geometry: BEACON() });
    floorHammer.visible = beacon.visible = false;
    addChild(props, floorHammer, beacon);
    const node = createNode({ position: { x: S.x, y: k.HIP, z: S.z }, rotation: { x: 0, y: S.turn, z: 0 } });
    addChild(node, k.root);
    for (const [key, [x, y, z]] of Object.entries(POSE)) { P[key].rotation.x = x; P[key].rotation.y = y; P[key].rotation.z = z; }
    const pick = (lo, hi) => lo + rand() * (hi - lo);
    const one = (list) => list[Math.floor(rand() * list.length)];

    // ---- where she walks: a grid of cells, each with two places to stand, low (the floor, or a stair's foot) and
    // high (up the Jet's stair and along its gangway), each open where it is clear for her body ----
    const [X0, X1, Z0, Z1] = S.floor, NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL), N = NX * NZ, M = N * 2;
    const open = new Uint8Array(M), feetOf = new Float32Array(M);
    const cx = (i) => X0 + (i % N % NX + 0.5) * CELL, cz = (i) => Z0 + (Math.floor(i % N / NX) + 0.5) * CELL;
    const F = HM.LAYOUT.fireTest, fc = Math.cos(F.turn), fs = Math.sin(F.turn);
    // What she keeps out of on the floor besides what the floor blocks: the booth's striped box with the presser's
    // place in it, and the crew's posts.
    const keptOut = (x, z) => {
      const dx = x - F.x, dz = z - F.z, lx = dx * fc - dz * fs, lz = dx * fs + dz * fc;
      if (lx > -2.6 && lx < 2.6 && lz > -1.6 && lz < 2.4) return true;
      for (const [px, py, pz, r] of HM.LAYOUT.crew) if (py === 0 && Math.hypot(x - px, z - pz) < r + RADIUS + 0.1) return true;
      return false;
    };
    // A place is asked as a step from far outside the hall, so one inside anything the floor blocks reads as shut
    // (a step from inside a block may always walk out of it); and the floor is shut under a stair lower than she is.
    for (let c = 0; c < N; c++) {
      const x = cx(c), z = cz(c), low = HM.supportAt(x, z, 0), high = HM.supportAt(x, z, UP);
      feetOf[c] = low; feetOf[N + c] = high;
      open[c] = low < LOW && (high < LOW || high - low > HEIGHT) && HM.clearAt(x, z, low, RADIUS, x + 1e4, z) && !keptOut(x, z) ? 1 : 0;
      open[N + c] = high >= LOW && HM.clearAt(x, z, high, RADIUS, x + 1e4, z) ? 1 : 0;
    }
    // Each place's way on to its eight neighbours' (-1 where there is none), to whichever of the neighbour's places
    // is nearer her height first: across the flat floor any two open side by side, a diagonal only past two open ones;
    // anywhere on a stair or the gangway, a step the hangar's own floor says she can take, climbing or dropping no
    // more than RISE.
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    const link = new Int32Array(M * 8).fill(-1);
    for (let a = 0; a < M; a++) {
      if (!open[a]) continue;
      const c = a % N, ix = c % NX, iz = (c - ix) / NX;
      for (let d = 0; d < 8; d++) {
        const jx = ix + DX[d], jz = iz + DZ[d];
        if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
        const n = jz * NX + jx, nearer = Math.abs(feetOf[n] - feetOf[a]) <= Math.abs(feetOf[N + n] - feetOf[a]);
        for (let l = 0; l < 2; l++) {
          const b = nearer === (l === 0) ? n : N + n;
          if (!open[b] || Math.abs(feetOf[a] - feetOf[b]) > RISE) continue;
          const flat = feetOf[a] < 0.05 && feetOf[b] < 0.05;
          if (flat ? d < 4 || open[iz * NX + jx] && open[jz * NX + ix] : HM.walkable(cx(a), cz(a), cx(b), cz(b), feetOf[a], RADIUS)) { link[a * 8 + d] = b; break; }
        }
      }
    }
    // The open place nearest (x, z) about the height `y`, searching out ring by ring.
    const nearestOpen = (x, z, y = 0) => {
      const ix = Math.floor((x - X0) / CELL), iz = Math.floor((z - Z0) / CELL);
      for (let r = 0; r < 24; r++) {
        let best = -1, bestD = Infinity;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const jx = ix + dx, jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
          for (let l = 0; l < 2; l++) {
            const i = l * N + jz * NX + jx;
            if (!open[i] || Math.abs(feetOf[i] - y) > 1.2) continue;
            const d = (cx(i) - x) ** 2 + (cz(i) - z) ** 2;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    };
    // Her spots that stand on open ground, and the visitor's, a spot of its own moved to them each time.
    const spots = S.spots.filter(([, x, z, , , , , y = 0]) => nearestOpen(x, z, y) >= 0).map(([name, x, z, kind, lx, ly, lz, y = 0]) => ({ name, x, z, kind, lx, ly, lz, cell: nearestOpen(x, z, y), dur: 0, paceYaw: 0 }));
    for (const s of spots) s.paceYaw = Math.atan2(s.lx - s.x, s.lz - s.z) + Math.PI / 2;
    const visitorSpot = { name: "visitor", x: 0, z: 0, kind: "yell", lx: 0, ly: 1.6, lz: 0, cell: -1, dur: 0, paceYaw: 0 };

    // ---- A* over the places, along their links, into preallocated arrays ----
    const g = new Float32Array(M), f = new Float32Array(M), from = new Int32Array(M), state = new Uint8Array(M), heap = new Int32Array(M);
    let heapN = 0;
    const push = (i) => {
      let n = heapN++;
      while (n > 0) { const q = (n - 1) >> 1; if (f[heap[q]] <= f[i]) break; heap[n] = heap[q]; n = q; }
      heap[n] = i;
    };
    const pop = () => {
      const top = heap[0], last = heap[--heapN];
      let n = 0;
      for (;;) {
        let c = n * 2 + 1;
        if (c >= heapN) break;
        if (c + 1 < heapN && f[heap[c + 1]] < f[heap[c]]) c++;
        if (f[heap[c]] >= f[last]) break;
        heap[n] = heap[c]; n = c;
      }
      if (heapN) heap[n] = last;
      return top;
    };
    const octile = (a, b) => {
      const ca = a % N, cb = b % N, ax = Math.abs(ca % NX - cb % NX), az = Math.abs(Math.floor(ca / NX) - Math.floor(cb / NX));
      return Math.max(ax, az) + 0.4142 * Math.min(ax, az);
    };
    const search = (start, goal) => {
      state.fill(0);
      heapN = 0;
      g[start] = 0; f[start] = octile(start, goal); from[start] = -1; state[start] = 1;
      push(start);
      while (heapN) {
        const c = pop();
        if (c === goal) return true;
        if (state[c] === 2) continue;
        state[c] = 2;
        for (let d = 0; d < 8; d++) {
          const n = link[c * 8 + d];
          if (n < 0 || state[n] === 2) continue;
          const cost = g[c] + (d >= 4 ? 1.4142 : 1);
          if (state[n] === 1 && cost >= g[n]) continue;
          g[n] = cost; f[n] = cost + octile(n, goal); from[n] = c; state[n] = 1;
          push(n);
        }
      }
      return false;
    };
    // A trip from where she stands to a place as waypoints, the grid's places pulled straight wherever the floor allows
    // from the height of the last, and only where walking there at that height ends on the place's own level (so a
    // walk across the floor never stands in for the climb to a place up on the gangway over it).
    const cells = new Int32Array(M), path = new Float32Array(MAX_PATH * 2);
    let pathN = 0, pathAt = 0;
    const straight = (ax, az, ay, c) => HM.walkable(ax, az, cx(c), cz(c), ay, RADIUS) && Math.abs(HM.supportAt(cx(c), cz(c), ay) - feetOf[c]) < 0.05;
    const plan = (x, z, goal) => {
      const start = nearestOpen(x, z, feet);
      pathN = pathAt = 0;
      if (start < 0 || goal < 0 || !search(start, goal)) return false;
      let n = 0;
      for (let c = goal; c >= 0; c = from[c]) cells[n++] = c;
      let ax = x, az = z, ay = feet, i = n - 1;
      while (i >= 0 && pathN < MAX_PATH) {
        let j = 0;
        while (j < i && !straight(ax, az, ay, cells[j])) j++;
        ax = cx(cells[j]); az = cz(cells[j]); ay = feetOf[cells[j]];
        path[pathN * 2] = ax; path[pathN * 2 + 1] = az; pathN++;
        i = j - 1;
      }
      return true;
    };

    // ---- what she does ----
    const p = node.position;
    const actor = { x: S.x, y: 0, z: S.z, radius: RADIUS, height: HEIGHT };
    // `feet`: the height she stands at, the floor or up the stair or the gangway.
    let clock = 0, blinkAt = BLINK[0], shut = 0, look = 0, yaw = S.turn, phase = 0, moving = 0, speed = WALK, feet = 0;
    // `doing`: the thing at a spot, or "walk"; its spot, how long it has run; the spot she last left; how long she has
    // been stood in the way; whether she has gone red; the quiet left before her next line and how long her voice runs.
    let doing = "glare", spot = null, t = 0, last = null, blocked = 0, furious = false, quiet = 2, talk = 0, visitedAt = -Infinity;
    // Pacing: up and down a short line through where she stopped; the hammer's swings while she fixes.
    let paceA = 0, paceDir = 1, paceX = 0, paceZ = 0, swingT = 0, swings = 0;
    // A line in her voice, her mouth running as long as it sounds and its bubble up a little longer.
    const say = (text, style, dur = 2.6) => {
      talk = audio.voice(text, style, p);
      fx.say(k, text, Math.max(dur, talk + 0.8));
      quiet = pick(QUIET[0], QUIET[1]);
    };
    // A line from one of her pools, now and then a rare one instead, now and then screamed.
    const sayFrom = (pool, dur) => {
      const rare = (pool === "jet" || pool === "lightning") && rand() < RARE;
      const style = STYLE[pool] === "yell" && rand() < SCREAM ? "scream" : STYLE[pool];
      say(one(LINES[rare ? "rare" : pool]), style, dur);
    };
    const maybeSay = (pool, chance) => { if (quiet <= 0 && rand() < chance) sayFrom(pool); };
    // The static fire's hold on her: whether she is in it, its line at the malfunction said, how far down she is (0
    // standing, 1 flat), which way the blast slides her, her soot and when she last smoked.
    const A = BL.hangarFire.AT;
    let panicking = false, warned = false, down = 0, slideX = 0, slideZ = 0, soot = 0, smokeAt = 0;
    const startPanic = () => {
      panicking = true; warned = false; down = 0; t = 0;
      if (doing === "hush") endHush();
      rampage = storming = false; anger = 0; fitT = 0;
      say(LINES.panic[0], STYLE.panic, 2.4);
      const b = fire.blast, here = Math.hypot(p.x - b.x, p.z - b.z);
      let goal = -1, best = Infinity;
      for (const [x, z] of FLEE) {
        const d = Math.hypot(x - p.x, z - p.z), c = d < best ? nearestOpen(x, z) : -1;
        if (c >= 0) { goal = c; best = d; }
      }
      if (here < PANIC.far && goal >= 0 && plan(p.x, p.z, goal)) { doing = "flee"; speed = RUN * PANIC.run; }
      else { doing = "cower"; pathN = 0; }
    };
    // Up from the floor, blaming everyone, then off to hammer the engine that did it.
    const endPanic = () => {
      panicking = false;
      down = 0;
      const engine = spots.find((q) => q.kind === "fix" && q.name.includes("engine"));
      goTo(engine || nextSpot(null));
    };
    const smudge = (k2) => { for (let i = 0; i < SOOTED.length; i++) P[SOOTED[i]].scorch = k2; };
    const SOOTED = ["torso", "head", "armR", "armL", "foreR", "foreL", "legR", "legL", "shinR", "shinL"];
    // Where the visitor's Ooga stands its feet.
    const feetAt = (driven) => driven.root.position.y - (driven.baseY || 0);
    // Whether a step to (nx, nz) keeps her out of what moves round the hall in circles (`blocks`, the forklift's), or
    // takes her no deeper in; the circle in her way, else null.
    const blockAt = (nx, nz) => {
      const list = blocks ? blocks() : null;
      if (list) for (let i = 0; i < list.length; i++) {
        const b = list[i], r = RADIUS + b.radius, dn = Math.hypot(nx - b.x, nz - b.z);
        if (dn < r && dn < Math.hypot(p.x - b.x, p.z - b.z)) return b;
      }
      return null;
    };
    // The visitor's spot moved to just short of their Ooga, if she can get there, or null.
    const visit = (driven) => {
      const q = driven.root.position, d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d >= VISIT.reach || d <= VISIT.stop + 0.5) return null;
      const k2 = (d - VISIT.stop) / d;
      visitorSpot.cell = nearestOpen(p.x + (q.x - p.x) * k2, p.z + (q.z - p.z) * k2, feetAt(driven));
      if (visitorSpot.cell < 0) return null;
      visitedAt = clock; visitorSpot.x = cx(visitorSpot.cell); visitorSpot.z = cz(visitorSpot.cell);
      return visitorSpot;
    };
    const nextSpot = (driven) => {
      if (rampage) return smashSpot(false);
      if (storming) return doorSpot || spots[0];
      if (driven && clock - visitedAt > VISIT.every && rand() < VISIT.chance) {
        const s = visit(driven);
        if (s) return s;
      }
      let total = 0;
      for (const s of spots) if (s !== last) total += WEIGHT[s.kind];
      let r = rand() * total;
      for (const s of spots) {
        if (s === last) continue;
        r -= WEIGHT[s.kind];
        if (r <= 0) return s;
      }
      return spots[0];
    };
    // Off to a spot: running at the visitor, screaming at them as she sets off; or walking, or now and then running, to
    // one of hers, swearing at the Jet now and then as she goes to hammer it.
    const goTo = (s) => {
      if (doing === "hush") endHush();
      spot = s;
      blocked = 0;
      if (!plan(p.x, p.z, s.cell)) { arrive(); return; }
      const far = Math.hypot(cx(s.cell) - p.x, cz(s.cell) - p.z);
      speed = storming ? POKE.storm : rampage || s === visitorSpot || far > RUN_FROM && rand() < RUN_CHANCE ? RUN : WALK;
      doing = "walk";
      if (s === visitorSpot) sayFrom("charge", 2);
      else if (s.kind === "fix" && !rampage) maybeSay("rage", 0.25);
    };
    const arrive = () => {
      last = spot;
      doing = rampage && spot.kind === "fix" ? "smash" : spot.kind;
      if (doing === "fix" && !storming && (forceHush || clock >= hushNext && rand() < HUSH.chance)) { doing = "hush"; hushNext = clock + HUSH.every; forceHush = false; hushBlows = 0; hushed = 0; }
      t = 0;
      spot.dur = storming && doing === "glare" ? POKE.sulk : doing === "hush" ? 60 : pick(TIMES[doing][0], TIMES[doing][1]);
      furious = false;
      swingT = 0; swings = 0;
      if (doing === "pace") { paceA = 0; paceDir = 1; paceX = p.x; paceZ = p.z; }
      if (doing === "smash") { blows = RAMPAGE.hits[0] + Math.floor(rand() * (RAMPAGE.hits[1] - RAMPAGE.hits[0] + 1)); pokesHere = 0; maybeSay("smash", 0.6); }
      else if (doing === "fix") maybeSay("hammer", 0.5);
      else if (doing === "yell") { sayFrom("caught", 3); spot.dur = Math.max(spot.dur, talk + 0.6); }
    };
    // ---- poking her ----
    // Her anger (0 to POKE.rage) and how long before it cools a level; where the last poke came from and when; the fit
    // she is in (1 to 4 by her anger, 5 shoved off while she smashes, 6 her meltdown's tantrum) and its time left;
    // whether she is smashing the Jet, the quick pokes' tally that stops her, the blows left at her spot and the pokes
    // there, and since when; when she may go off again; whether she is storming off to sulk; a chase's time left and its
    // line said; whether the visitor's Ooga stands near enough to poke her; and how hard the Jet is rocking.
    let anger = 0, coolAt = 0, pokeX = 0, pokeZ = 0, pokedAt = -Infinity, fitKind = 0, fitT = 0, fitLen = 1;
    let rampage = false, pips = 0, blows = 0, pokesHere = 0, rampAt = 0, calmUntil = 0, storming = false, chaseT = 0, chased = false, near = false, jolt = 0;
    // Tess, while she buzzes round her in a rampage: where she is (read live), when Sis next turns on her and how long
    // she has left shouting at her.
    let tess = null, tessIn = 0, tessLook = 0;
    const smashes = spots.filter((s) => s.kind === "fix"), doorSpot = spots.find((s) => s.name === "door");
    const fit = (kind) => { fitKind = kind; fitLen = fitT = kind === 6 ? POKE.tantrum : POKE.fit; swingT = 0; };
    // A spot to smash, not the one she is at: at random, or the farther of two from whoever poked her.
    const smashSpot = (away) => {
      let best = null, bestD = -1;
      for (let n = 0; n < 2; n++) {
        let i = Math.floor(rand() * smashes.length);
        if (smashes[i] === spot && smashes.length > 1) i = (i + 1) % smashes.length;
        const d = away ? Math.hypot(smashes[i].x - pokeX, smashes[i].z - pokeZ) : rand();
        if (d > bestD) { bestD = d; best = smashes[i]; }
      }
      return best;
    };
    const startRampage = () => {
      rampage = true; storming = false; pips = 0; rampAt = clock; pokesHere = 0;
      fit(4);
      say(one(LINES.rampage), STYLE.rampage, 2.6);
      toast("Kortik's Sis is smashing the Jet! Chase her and keep poking her to stop her.");
      goTo(smashSpot(false));
    };
    // Stopped: one last tirade, a tantrum, and off to sulk by the door.
    const meltdown = () => {
      rampage = false; anger = 0; pips = 0; calmUntil = clock + POKE.cooldown; storming = true;
      fit(6);
      say(LINES.meltdown[0], STYLE.meltdown, 3.2);
      BL.gamepad.rumble(0.5, 0.8, 280);
      toast("You stopped her! She's storming off. The Jet survives... for now.");
      goTo(nextSpot(null));
    };
    // Left to it long enough, she calls it fixed.
    const giveUp = () => {
      rampage = false; anger = 0; pips = 0; calmUntil = clock + POKE.cooldown / 2;
      sayFrom("fixed", 2.4);
      goTo(nextSpot(null));
    };
    const startChase = () => { if (doing === "hush") endHush(); doing = "chase"; chaseT = POKE.chaseTime; chased = false; speed = RUN; pathN = 0; };
    // A poke from the visitor's Ooga: her fit and line, angrier each time, the boink and the pad's pulse. At the end of
    // her tether she goes for the Jet; while she smashes it each poke counts toward stopping her, and a second at a
    // spot sends her running for another; storming off or sulking, she only tells them to go away.
    const poke = () => {
      if (panicking || !seen) return false;
      const q = seen.root.position;
      pokeX = q.x; pokeZ = q.z; pokedAt = clock; coolAt = POKE.calm;
      BL.gamepad.rumble(0.2, 0.55, 110);
      audio.poke(p.x, p.y + 0.6, p.z);
      if (rampage) {
        if (++pips >= RAMPAGE.stop) { meltdown(); return true; }
        fit(5);
        sayFrom("shove", 1.4);
        if (++pokesHere >= RAMPAGE.flee) { pokesHere = 0; goTo(smashSpot(true)); }
        return true;
      }
      if (storming) { fit(2); sayFrom("sulk", 1.8); return true; }
      anger = Math.min(POKE.rage, anger + 1);
      if (anger >= POKE.rage && clock >= calmUntil) { startRampage(); return true; }
      fit(Math.min(4, anger));
      if (anger >= POKE.rage) sayFrom("sulk", 1.8);
      else say(LINES.poke[anger - 1], anger >= 3 ? "scream" : STYLE.poke, 1.8);
      if (anger >= 3 && rand() < POKE.chase) startChase();
      return true;
    };
    // A blow in her rampage: sparks, iron and the Jet's paint flying, smoke, the Jet rocking on its gear, the clang
    // twice as loud, a thump in the pad when the visitor is near, and a smoking dent left where it landed; once her
    // blows here are spent, off to the next spot.
    const marks = Array.from({ length: MARKS }, () => ({ x: 0, y: 0, z: 0, life: 0, puff: 0 }));
    const dent = (x, y, z) => {
      let m = marks[0];
      for (const n of marks) {
        if (n.life > 0 && Math.hypot(n.x - x, n.y - y, n.z - z) < 1) { m = n; break; }
        if (n.life < m.life) m = n;
      }
      m.x = x; m.y = y; m.z = z; m.life = MARK_LIFE;
    };
    const smashHit = (hx, hy, hz) => {
      for (let i = 0; i < 16; i++) fx.spawnParticle(SPARK, hx, hy, hz, (rand() - 0.5) * 7, 1 + rand() * 4.5, (rand() - 0.5) * 7, 0.4 + rand() * 0.5, 10, 7);
      for (let i = 0; i < 2; i++) fx.spawnParticle(IRON, hx, hy, hz, (rand() - 0.5) * 4, 2 + rand() * 3, (rand() - 0.5) * 4, 1.6, 12, 9.8);
      for (let i = 0; i < 4; i++) fx.spawnParticle(CHIPS[i % 2], hx, hy, hz, (rand() - 0.5) * 4, 1.5 + rand() * 2.5, (rand() - 0.5) * 4, 1.4, 14, 9.8);
      fx.puff(hx, hy, hz, 0, 0.6, 0, 1.2);
      audio.clang(hx, hy, hz, 2);
      jolt = 1;
      if (seen && Math.hypot(seen.root.position.x - p.x, seen.root.position.z - p.z) < 9) BL.gamepad.rumble(0.25, 0.35, 70);
      dent(hx, hy, hz);
      if (--blows <= 0) goTo(smashSpot(false));
    };
    // Whether she may stand at (x, z), on her own ground at about her height.
    const openAt = (x, z) => {
      const ix = Math.floor((x - X0) / CELL), iz = Math.floor((z - Z0) / CELL);
      if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return false;
      const c = iz * NX + ix;
      return open[c] && Math.abs(feetOf[c] - feet) < RISE || open[N + c] && Math.abs(feetOf[N + c] - feet) < RISE;
    };
    const JET_RX = jet.rotation.x, JET_RZ = jet.rotation.z;

    // ---- her quarrel with Kortik next door, and the rare quiet moment ----
    // When his next shout comes, which line of the quarrel, and when she answers it; where his voice comes from, just
    // inside the door, and his lines as the door's bubble shows them.
    const RIVALRY = BL.kortik.RIVALRY, D = HM.LAYOUT.door, DOOR_AT = { x: D.x, y: D.y + 0.5, z: D.z - 0.6 }, HEARD = RIVALRY.map(([his]) => "KORTIK: " + his);
    let quarrelIn = pick(QUARREL.first[0], QUARREL.first[1]), quarrel = 0, answerIn = 0;
    // Whether she is free to hear him, or to answer: none of her fits, tempers, trips at the visitor or the static fire.
    const free = () => !panicking && !rampage && !storming && fitT <= 0 && doing !== "chase" && doing !== "hush" && spot !== visitorSpot && talk <= 0;
    const hearKortik = () => {
      quarrel = Math.floor(rand() * RIVALRY.length);
      fx.sayAt(DOOR_AT.x, D.y + 3.6, DOOR_AT.z, HEARD[quarrel], 3.2);
      answerIn = audio.voice(RIVALRY[quarrel][0], "kortik", DOOR_AT) + QUARREL.answer;
    };
    // Turned to the door, her hands cupped at her mouth, shouting back.
    const answerKortik = () => {
      pokeX = DOOR_AT.x; pokeZ = DOOR_AT.z;
      fit(7);
      say(RIVALRY[quarrel][1], STYLE.quarrel, QUARREL.shout);
      fitLen = fitT = Math.max(QUARREL.shout, talk + 0.4);
    };
    // The quiet moment: when the next may come, whether debugging has asked for one, the blows at the light so far,
    // and the beats said.
    let hushNext = HUSH.every / 2, forceHush = false, hushBlows = 0, hushed = 0;
    const hammerDown = (on) => {
      P.hammer.visible = !on;
      floorHammer.visible = on;
      if (!on) return;
      // On the floor at her right foot, lying on its side along the way she faces.
      floorHammer.position.x = p.x + Math.cos(yaw) * 0.45; floorHammer.position.y = feet + 0.12; floorHammer.position.z = p.z - Math.sin(yaw) * 0.45;
      floorHammer.rotation.x = 0; floorHammer.rotation.y = yaw; floorHammer.rotation.z = Math.PI / 2;
      // The light, on the Jet where she would have hammered, a little out toward her.
      const dx = p.x - spot.lx, dz = p.z - spot.lz, l = Math.hypot(dx, dz) || 1;
      beacon.position.x = spot.lx + dx / l * 0.15; beacon.position.y = spot.ly; beacon.position.z = spot.lz + dz / l * 0.15;
    };
    const endHush = () => { hammerDown(false); beacon.visible = false; };
    const turnTo = (wantYaw, dt) => {
      let d = wantYaw - yaw;
      d -= TAU * Math.round(d / TAU);
      yaw += Math.max(-YAW_RATE * dt, Math.min(YAW_RATE * dt, d));
    };

    // The pose eased toward its target each frame: the arms, the hammer's angle, the head's nod and tilt, the lean, a
    // crouch and a sway.
    const cur = { armLx: 0.15, armLz: 0.7, foreLx: -0.2, foreLz: -1.7, armRx: POSE.armR[0], armRz: POSE.armR[2], foreRx: POSE.foreR[0], foreRz: POSE.foreR[2], hamX: POSE.hammer[0], hamZ: POSE.hammer[2], headX: 0.08, headZ: 0, lean: 0, crouch: 0, sway: 0 };
    const want = { ...cur }, KEYS = Object.keys(cur);
    const stand = () => {
      want.armLx = 0.15; want.armLz = 0.7; want.foreLx = -0.2; want.foreLz = -1.7;
      want.armRx = POSE.armR[0]; want.armRz = POSE.armR[2]; want.foreRx = POSE.foreR[0]; want.foreRz = POSE.foreR[2]; want.hamX = POSE.hammer[0]; want.hamZ = POSE.hammer[2];
      want.headX = 0.08; want.headZ = 0; want.lean = 0; want.crouch = 0; want.sway = 0;
    };
    // On along her waypoints at `speed`, her feet on whatever she walks over; whether she stepped, and whether she got
    // to the last.
    let arrived = false;
    const along = (dt) => {
      const wx = path[pathAt * 2], wz = path[pathAt * 2 + 1], dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, speed * dt);
      p.x += dx / (d || 1) * step; p.z += dz / (d || 1) * step;
      feet = HM.supportAt(p.x, p.z, feet);
      arrived = d - step < 0.05 && ++pathAt >= pathN;
      return step > 0;
    };

    // Once a frame with the Ooga the visitor drives here (or null) and where the view is.
    let seen = null;
    const update = (dt, driven, eye) => {
      seen = driven;
      clock += dt;
      t += dt;
      quiet -= dt;
      talk = Math.max(0, talk - dt);
      stand();
      let face = H.open, wantYaw = yaw, stepping = false, glareAt = null, swingNow = -1, swingLen = SWING, hop = 0;
      // Her anger cooling while she is left alone; while she smashes, the tally of quick pokes draining between them,
      // and her calling it fixed once she has kept at it long enough; and whether the visitor's Ooga can poke her.
      if (anger > 0 && !rampage && (coolAt -= dt) <= 0) { anger--; coolAt = POKE.calm; }
      if (rampage) {
        if (clock - pokedAt > 1) pips = Math.max(0, pips - dt / RAMPAGE.drain);
        if (clock - rampAt > RAMPAGE.max && fitT <= 0) giveUp();
      }
      // Tess buzzing round her: now and then she stops smashing to shout at her.
      if (rampage && tess && doing === "smash") {
        if (tessLook > 0) tessLook -= dt;
        else if ((tessIn -= dt) <= 0) { tessIn = pick(DISTRACT.every[0], DISTRACT.every[1]); tessLook = DISTRACT.look; say(one(LINES.tess), STYLE.tess, 1.6); }
      } else tessLook = 0;
      near = !!driven && !panicking && Math.hypot(driven.root.position.x - p.x, driven.root.position.z - p.z) < POKE.reach && Math.abs(feetAt(driven) - feet) < POKE.rise;
      // Kortik shouting through the door now and then while she is free to hear it, and her answer once his line is out.
      if (answerIn > 0) { if ((answerIn -= dt) <= 0 && !panicking && !rampage) answerKortik(); }
      else if ((quarrelIn -= dt) <= 0) { quarrelIn = pick(QUARREL.every[0], QUARREL.every[1]); if (free()) hearKortik(); }
      const ft = fire ? fire.t : -1;
      if (!panicking && ft >= 0 && ft < A.boom) startPanic();
      if (panicking && ft < 0 && doing !== "blame") endPanic();
      if (panicking) {
        // The static fire: running, cowering, knocked flat, getting up, blaming.
        const b = fire.blast;
        if ((doing === "flee" || doing === "cower") && ft >= A.boom) {
          if (Math.hypot(p.x - b.x, p.z - b.z) < PANIC.knock) {
            doing = "down"; t = 0;
            yaw = Math.atan2(b.x - p.x, b.z - p.z);
            const d = Math.hypot(p.x - b.x, p.z - b.z) || 1;
            slideX = (p.x - b.x) / d; slideZ = (p.z - b.z) / d;
            soot = PANIC.soot;
          } else if (ft >= A.result) { doing = "blame"; t = 0; sayFrom("blame", 3); }
        }
        if (doing === "flee") {
          if (pathAt < pathN) {
            const wx = path[pathAt * 2], wz = path[pathAt * 2 + 1];
            if (Math.hypot(wx - p.x, wz - p.z) > 0.01) wantYaw = Math.atan2(wx - p.x, wz - p.z);
            stepping = along(dt);
          }
          if (pathAt >= pathN) { doing = "cower"; stepping = false; }
          face = H.redOpen;
          want.armLx = -2.6 + Math.sin(clock * 15) * 0.5; want.armLz = 0.4; want.foreLx = -0.5; want.foreLz = 0;
          want.armRx = -2.6 + Math.cos(clock * 13) * 0.5; want.armRz = -0.4; want.foreRx = -0.5; want.foreRz = 0;
          want.lean = 0.2;
        } else if (doing === "cower") {
          // Facing the engines, crouched, her arms over her head, shaking.
          wantYaw = Math.atan2(b.x - p.x, b.z - p.z);
          face = H.redOpen;
          const shake = Math.sin(clock * 30) * 0.06;
          want.crouch = 0.16; want.lean = -0.08 + shake;
          want.armLx = -2.9; want.armLz = 0.25; want.foreLx = -1.6; want.foreLz = 0;
          want.armRx = -2.9; want.armRz = -0.25; want.foreRx = -1.6; want.foreRz = 0;
          want.headX = 0.25;
          if (!warned && ft >= A.warning + 0.2) { warned = true; say(LINES.panic[1], STYLE.panic, 1.6); }
        } else if (doing === "down") {
          // Thrown flat by the blast and out cold until the presser comes to, then getting up.
          if (ft < A.result) {
            down = Math.min(1, t / PANIC.fall);
            if (t < PANIC.fall + 0.1) {
              const k2 = PANIC.slide * dt / (PANIC.fall + 0.1), nx = p.x + slideX * k2, nz = p.z + slideZ * k2;
              if (HM.walkable(p.x, p.z, nx, nz, feet, RADIUS)) { p.x = nx; p.z = nz; }
            }
          } else {
            down = Math.max(0, 1 - (ft - A.result) / PANIC.rise);
            if (down === 0) { doing = "blame"; t = 0; sayFrom("blame", 3); }
          }
          wantYaw = yaw;
          face = H.closed;
          want.armLx = -2.8; want.armLz = 0.7; want.foreLx = -0.2; want.foreLz = 0;
          want.armRx = -2.8; want.armRz = -0.7; want.foreRx = -0.2; want.foreRz = 0;
        } else if (doing === "blame") {
          // Red in the face, shaking her fist at whoever is here, or the booth: it wasn't her.
          const B = driven ? driven.root.position : HM.LAYOUT.fireTest;
          wantYaw = Math.atan2(B.x - p.x, B.z - p.z);
          face = H.redOpen;
          want.armLx = -2.4 + Math.sin(clock * 15) * 0.3; want.armLz = 0.35; want.foreLx = -0.7; want.foreLz = 0;
          want.armRx = -2.2; want.foreRx = -1.2;
          if (t > PANIC.blame) endPanic();
        }
      } else if (fitT > 0) {
        // Poked: turned on whoever did it, still where she was, in a fit as angry as she is: a startled hop, a wagging
        // finger, a stomp with both fists, the hammer raised over her head, shoved off while she smashes, or her
        // meltdown's tantrum, stamping with both fists going.
        fitT -= dt;
        const r = 1 - fitT / fitLen;
        wantYaw = Math.atan2(pokeX - p.x, pokeZ - p.z);
        face = fitKind === 1 ? H.open : H.redOpen;
        if (fitKind === 1) {
          hop = Math.sin(Math.min(1, r * 2.2) * Math.PI) * 0.22;
          want.armLx = -2.6; want.armLz = 0.6; want.foreLx = -0.4; want.armRx = -1.6; want.lean = -0.12;
        } else if (fitKind === 2) {
          want.armLx = -1.6; want.armLz = 0.2; want.foreLx = -0.4 + Math.sin(clock * 22) * 0.35; want.foreLz = 0; want.lean = -0.08; want.headZ = Math.sin(clock * 11) * 0.12;
        } else if (fitKind === 3) {
          want.crouch = Math.max(0, Math.sin(r * Math.PI * 3)) * 0.1; want.lean = 0.12;
          want.armLx = -0.9 + Math.sin(clock * 18) * 0.4; want.armLz = 0.3; want.foreLx = -1.2; want.foreLz = 0; want.armRx = -0.9;
        } else if (fitKind === 4) {
          want.armRx = -3; want.armRz = -0.2; want.foreRx = -0.6; want.hamX = Math.PI - 0.4; want.lean = 0.18;
          want.armLx = -2.2; want.foreLx = -0.9; want.foreLz = 0;
        } else if (fitKind === 5) {
          want.lean = -0.15; want.armLx = -1.4 + Math.sin(clock * 20) * 0.3; want.armLz = 0.5; want.foreLx = -0.4; want.foreLz = 0;
        } else if (fitKind === 7) {
          // Shouting back at Kortik through the door, her hands cupped at her mouth, leaning into it.
          want.lean = 0.12; want.headX = -0.15;
          want.armLx = -2.1; want.armLz = 0.55; want.foreLx = -1.5; want.foreLz = -0.7;
          want.armRx = -2.1; want.armRz = -0.55; want.foreRx = -1.5; want.foreRz = 0.7;
        } else {
          want.crouch = Math.max(0, Math.sin(clock * 14)) * 0.08;
          want.armLx = -2.6 + Math.sin(clock * 17) * 0.4; want.armLz = 0.4; want.foreLx = -0.8; want.foreLz = 0;
          want.armRx = -2.4 + Math.cos(clock * 15) * 0.4; want.armRz = -0.4; want.foreRx = -1;
        }
      } else if (doing === "chase") {
        // After whoever poked her, fist up, on her own ground, for a few seconds or until they are out of reach.
        chaseT -= dt;
        face = H.redOpen;
        want.lean = 0.18; want.armLx = -2.5 + Math.sin(clock * 16) * 0.3; want.armLz = 0.35; want.foreLx = -0.8; want.foreLz = 0;
        if (!chased) { chased = true; sayFrom("chase", 1.8); }
        const q = driven && driven.root.position;
        if (q) {
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
          wantYaw = Math.atan2(dx, dz);
          if (d > POKE.chaseStop) {
            const step = Math.min(d - POKE.chaseStop, speed * dt), nx = p.x + dx / d * step, nz = p.z + dz / d * step;
            if (openAt(nx, nz) && HM.walkable(p.x, p.z, nx, nz, feet, RADIUS) && !blockAt(nx, nz)) { p.x = nx; p.z = nz; feet = HM.supportAt(p.x, p.z, feet); stepping = true; }
          }
        }
        if (chaseT <= 0 || !q) goTo(nextSpot(null));
      } else if (doing === "walk") {
        // On along her waypoints, turning to each, stopping short of the visitor's Ooga or the forklift where it stands in
        // her way, and off elsewhere if it stays there.
        const wx = path[pathAt * 2], wz = path[pathAt * 2 + 1], dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.01) wantYaw = Math.atan2(dx, dz);
        const step = Math.min(d, speed * dt), nx = p.x + dx / (d || 1) * step, nz = p.z + dz / (d || 1) * step;
        const q = driven && driven.root.position, gap = RADIUS + (driven ? driven.bodyRadius || 0.4 : 0) + 0.1, block = blockAt(nx, nz);
        if (q && Math.abs(feetAt(driven) - feet) < 1.5 && Math.hypot(nx - q.x, nz - q.z) < gap && Math.hypot(nx - q.x, nz - q.z) < Math.hypot(p.x - q.x, p.z - q.z)) {
          blocked += dt;
          glareAt = q;
          if (blocked > BLOCKED) goTo(nextSpot(null));
        } else if (block) {
          blocked += dt;
          glareAt = block;
          if (blocked > BLOCKED) goTo(nextSpot(null));
        } else {
          stepping = along(dt);
          if (arrived) { arrive(); stepping = false; }
        }
        if (speed > WALK) { want.lean = 0.18; want.armLx = 0; want.armLz = 0.25; want.foreLx = -1.4; want.foreLz = 0; }
        else { want.armLx = 0; want.armLz = 0.18; want.foreLx = -0.35; want.foreLz = 0; }
        if (spot === visitorSpot) {
          // Running at them, red, her fist up and shaking.
          face = H.redOpen;
          want.armLx = -2.5 + Math.sin(clock * 16) * 0.3; want.armLz = 0.35; want.foreLx = -0.8;
        } else if (rampage) {
          // Running to the next spot to smash, red, the hammer up over her head.
          face = H.redOpen;
          want.armRx = -2.6; want.armRz = -0.25; want.foreRx = -0.5; want.hamX = Math.PI - 0.5;
        } else if (storming) face = H.redOpen;
      } else if (doing === "pace") {
        // Up and down a three-metre line, fast, head down, turning sharply at each end, muttering.
        speed = 2.2;
        const half = 1.5, hx = Math.sin(spot.paceYaw), hz = Math.cos(spot.paceYaw);
        paceA += paceDir * speed * dt;
        if (Math.abs(paceA) > half) { paceA = Math.sign(paceA) * half; paceDir = -paceDir; maybeSay("mutter", 0.35); }
        const nx = paceX + hx * paceA, nz = paceZ + hz * paceA;
        if (HM.walkable(p.x, p.z, nx, nz, feet, RADIUS)) { p.x = nx; p.z = nz; feet = HM.supportAt(p.x, p.z, feet); stepping = true; } else paceDir = -paceDir;
        wantYaw = Math.atan2(hx * paceDir, hz * paceDir);
        want.headX = 0.3; want.armLx = 0; want.armLz = 0.18; want.foreLx = -0.35; want.foreLz = 0;
        if (t > spot.dur) goTo(nextSpot(driven));
      } else {
        // At a spot: facing what she came for, the visitor's Ooga when she has come to yell at them.
        if (doing === "yell" && driven) { visitorSpot.lx = driven.root.position.x; visitorSpot.lz = driven.root.position.z; visitorSpot.ly = feetAt(driven) + 1.6; }
        wantYaw = Math.atan2(spot.lx - p.x, spot.lz - p.z);
        const u = t / spot.dur, up = Math.atan2(spot.ly - feet - 1.75, Math.hypot(spot.lx - p.x, spot.lz - p.z));
        if (doing === "smash" && tessLook > 0) {
          // Turned on Tess buzzing round her head, red, the hammer up and her fist shaking at her.
          wantYaw = Math.atan2(tess.x - p.x, tess.z - p.z);
          swingT = 0;
          face = H.redOpen;
          want.armLx = -2.5 + Math.sin(clock * 16) * 0.3; want.armLz = 0.35; want.foreLx = -0.8; want.foreLz = 0;
          want.armRx = -2.2; want.foreRx = -1.2; want.lean = -0.08;
          want.headX = -Math.max(-0.6, Math.min(0.6, Math.atan2(tess.y - feet - 1.75, Math.hypot(tess.x - p.x, tess.z - p.z))));
        } else if (doing === "fix" || doing === "smash") {
          // Swinging the hammer up over her head and down onto the Jet, again and again, a breath between some; in her
          // rampage faster, with no breath between, red, and slower while Tess buzzes round her.
          const smash = doing === "smash";
          swingLen = smash ? RAMPAGE.swing * (tess ? DISTRACT.slow : 1) : SWING;
          swingT += dt;
          if (swingT > swingLen + (smash ? 0.05 : swings % 3 === 2 ? 0.7 : 0.1)) { swingT = 0; swings++; if (swings % 3 === 0) maybeSay(smash ? "smash" : "hammer", smash ? 0.7 : 0.45); }
          swingNow = Math.min(1, swingT / swingLen);
          const height = Math.max(0, Math.min(1, (spot.ly - feet - 0.6) / 2.4));
          want.lean = 0.22 - height * 0.25; want.armLx = -0.5; want.armLz = 0.55; want.foreLx = -0.3; want.foreLz = 0;
          want.headX = -up * 0.6;
          face = smash ? H.redOpen : swings % 4 === 3 ? H.goggles : H.open;
        } else if (doing === "inspect") {
          // Goggles down, leaning in, pointing at it and tapping, a shake of the head now and then.
          face = H.goggles;
          want.headX = Math.max(-0.5, Math.min(0.5, -up * 0.8));
          want.headZ = Math.sin(clock * 0.9) * 0.15;
          want.lean = up > 0.3 ? -0.05 : 0.22;
          want.armLx = -1.3 - Math.max(0, up) * 1.2 + Math.sin(clock * 9) * 0.06; want.armLz = 0.15; want.foreLx = -0.25; want.foreLz = 0;
        } else if (doing === "admire") {
          // Looking up at the Jet, hopeful, swaying a little; then red, a stomp, and her fist shaken at it.
          want.headX = Math.max(-0.6, -up);
          want.sway = Math.sin(clock * 1.4) * 0.05;
          if (u > 0.62) {
            if (!furious) { furious = true; maybeSay("jet", 0.8); }
            face = H.redOpen;
            want.armLx = -2.5 + Math.sin(clock * 16) * 0.25; want.armLz = 0.3; want.foreLx = -0.8; want.foreLz = 0;
            want.crouch = u < 0.68 ? 0.06 : 0;
            want.headX = 0.1;
          }
        } else if (doing === "yell") {
          // Red in the face, the hammer up and her fist shaking at them.
          face = H.redOpen;
          want.armLx = -2.4 + Math.sin(clock * 15) * 0.3; want.armLz = 0.35; want.foreLx = -0.7; want.foreLz = 0;
          want.armRx = -2.2; want.foreRx = -1.2; want.lean = -0.05; want.headX = -0.1;
        } else if (doing === "hush") {
          // The quiet moment, beat by beat.
          if (t < HUSH.down) {
            // Laying the hammer down at her feet.
            want.crouch = 0.22 * Math.sin(Math.min(1, t / HUSH.down) * Math.PI);
            want.armRx = -0.3; want.armRz = -0.3; want.foreRx = -0.4; want.foreRz = 0; want.hamX = Math.PI / 2;
            if (t > HUSH.down * 0.6 && P.hammer.visible) hammerDown(true);
          } else if (t < HUSH.scream) {
            // Looking it over gently, a hand on it, whispering; then the light coming on.
            want.headX = -up * 0.7; want.headZ = Math.sin(clock * 0.8) * 0.1; want.lean = 0.12;
            want.armLx = -1.3 + Math.sin(clock * 2.2) * 0.08; want.armLz = 0.15; want.foreLx = -0.3; want.foreLz = 0;
            want.armRx = 0.05; want.armRz = -0.15; want.foreRx = -0.3; want.foreRz = 0;
            if (hushed === 0 && t >= HUSH.whisper) { hushed = 1; say(LINES.hope[0], STYLE.hope, 3.4); }
          } else if (t < HUSH.hunt) {
            // A jump and her scream, then turning all round herself, arms out, looking for the hammer.
            if (hushed === 1) { hushed = 2; say(LINES.hush[0], STYLE.hush, 2.4); }
            face = H.redOpen;
            if (t < HUSH.scream + 0.3) hop = Math.sin((t - HUSH.scream) / 0.3 * Math.PI) * 0.2;
            else { yaw += dt * 5.5; wantYaw = yaw; }
            want.headZ = Math.sin(clock * 9) * 0.3; want.lean = 0.1;
            want.armLx = -1.3; want.armLz = 0.9; want.foreLx = -0.3; want.foreLz = 0; want.armRx = -1.3; want.armRz = -0.9; want.foreRx = -0.3; want.foreRz = 0;
          } else if (t < HUSH.grab) {
            // There it is, at her feet: crouched to snatch it up.
            face = H.redOpen;
            want.crouch = 0.25; want.headX = 0.4; want.armRx = -0.3; want.armRz = -0.3; want.foreRx = -0.3; want.foreRz = 0;
            if (t > HUSH.grab - 0.15 && floorHammer.visible) hammerDown(false);
          } else {
            // Whacking the light until it goes out.
            face = H.redOpen;
            swingLen = SWING * 0.75;
            swingT += dt;
            if (swingT > swingLen + 0.08) swingT = 0;
            swingNow = Math.min(1, swingT / swingLen);
            const height = Math.max(0, Math.min(1, (spot.ly - feet - 0.6) / 2.4));
            want.lean = 0.22 - height * 0.25; want.armLx = -0.5; want.armLz = 0.55; want.foreLx = -0.3; want.foreLz = 0;
            want.headX = -up * 0.6;
          }
          // The warning light blinking from its beat until she puts it out, a beep each time it comes on.
          const on = t >= HUSH.light && Math.floor((t - HUSH.light) / HUSH.blink) % 2 === 0;
          if (on && !beacon.visible) audio.beep(beacon.position.x, beacon.position.y, beacon.position.z);
          beacon.visible = on;
        } else if (doing === "glare" && storming) {
          // Sulking by the door, red, her arms folded.
          face = H.redOpen;
          want.armLx = -1.25; want.armLz = -0.35; want.foreLx = -1.5; want.foreLz = 0.9;
          want.armRx = -1.1; want.armRz = 0.3; want.foreRx = -1.5; want.foreRz = -0.9;
          if (u > 0.5) maybeSay("mutter", 0.02);
        }
        if (u >= 1) { storming = false; goTo(nextSpot(driven)); }
      }
      turnTo(wantYaw, dt);
      node.rotation.y = yaw;
      // The walk: legs and the free arm swinging with her stride, a bob, eased in and out as she starts and stops; a
      // boot coming down each half stride.
      moving += ((stepping ? 1 : 0) - moving) * Math.min(1, dt * 10);
      const run = speed > WALK ? 1 : 0;
      if (stepping) {
        const was = Math.floor(phase / Math.PI);
        phase += speed * (run ? STRIDE.run : STRIDE.walk) * dt;
        if (Math.floor(phase / Math.PI) !== was) audio.boot(p.x, feet, p.z, run);
      }
      const swing = Math.sin(phase) * moving, legAmp = run ? 0.95 : 0.55, kneeAmp = run ? 1.3 : 0.7;
      P.legR.rotation.x = -swing * legAmp;
      P.legL.rotation.x = swing * legAmp;
      P.shinR.rotation.x = Math.max(0, swing) * kneeAmp;
      P.shinL.rotation.x = Math.max(0, -swing) * kneeAmp;
      // Ease the rest of the pose.
      const e = Math.min(1, dt * EASE);
      for (let i = 0; i < KEYS.length; i++) cur[KEYS[i]] += (want[KEYS[i]] - cur[KEYS[i]]) * e;
      const breath = Math.sin(clock * 1.9), walking = doing === "walk" || doing === "pace" ? 1 : 0;
      P.armL.rotation.x = cur.armLx + swing * (run ? 0.9 : 0.5) * walking;
      P.armL.rotation.z = cur.armLz;
      P.foreL.rotation.x = cur.foreLx;
      P.foreL.rotation.z = cur.foreLz;
      if (swingNow >= 0) {
        // The swing: wound up over her head, brought down hard to where the hammer lands, and lifted again.
        const height = Math.max(0, Math.min(1, (spot.ly - feet - 0.6) / 2.4)), strike = -0.85 - height * 1.5;
        const up1 = swingNow < 0.45 ? swingNow / 0.45 : 1, down = swingNow < 0.45 ? 0 : Math.min(1, (swingNow - 0.45) / (LAND - 0.45));
        const lift = swingNow > 0.75 ? (swingNow - 0.75) / 0.25 : 0;
        const wound = -2.9, armX = swingNow < 0.45 ? cur.armRx + (wound - cur.armRx) * up1 * up1 * (3 - 2 * up1) : swingNow < LAND ? wound + (strike - wound) * down * down : strike + (cur.armRx - strike) * lift;
        P.armR.rotation.x = armX;
        P.armR.rotation.z = -0.22;
        P.foreR.rotation.x = swingNow < 0.45 ? -1.2 : -0.25;
        P.foreR.rotation.z = 0;
        P.hammer.rotation.x = Math.PI - 0.2;
        P.hammer.rotation.z = 0;
        if (swingNow >= LAND && swingNow - dt / swingLen < LAND) {
          // Where the hammer lands: sparks off the Jet and the clang, or in her rampage a smash.
          const hx = spot.lx + (rand() - 0.5) * 0.3, hy = spot.ly + (rand() - 0.5) * 0.2, hz = spot.lz + (rand() - 0.5) * 0.3;
          if (doing === "smash") smashHit(hx, hy, hz);
          else {
            for (let i = 0; i < 9; i++) fx.spawnParticle(SPARK, hx, hy, hz, (rand() - 0.5) * 5, 1 + rand() * 3.5, (rand() - 0.5) * 5, 0.4 + rand() * 0.4, 10, 7);
            audio.clang(hx, hy, hz);
            // The quiet moment's light, put out by the last blow.
            if (doing === "hush" && ++hushBlows >= HUSH.blows) goTo(nextSpot(seen));
          }
        }
      } else {
        P.armR.rotation.x = cur.armRx + breath * 0.02 + Math.abs(swing) * 0.08;
        P.armR.rotation.z = cur.armRz;
        P.foreR.rotation.x = cur.foreRx;
        P.foreR.rotation.z = cur.foreRz;
        P.hammer.rotation.x = cur.hamX;
        P.hammer.rotation.z = cur.hamZ;
      }
      P.torso.scale.y = 1 + breath * 0.012;
      k.root.rotation.x = cur.lean;
      k.root.rotation.z = cur.sway;
      p.y = k.HIP + feet + hop - cur.crouch + Math.abs(Math.sin(phase)) * moving * (run ? 0.07 : 0.035);
      if (down > 0) {
        // Flat on her back from the hip, at her body's half depth off what she stands on.
        const e2 = down * down * (3 - 2 * down);
        k.root.rotation.x = -Math.PI / 2 * e2;
        p.y = k.HIP + feet + (0.22 - k.HIP) * e2;
      }
      // The blast's soot fading off her, smoking a while.
      if (soot > 0) {
        soot = Math.max(0, soot - PANIC.fade * dt);
        smudge(soot);
        if (soot > PANIC.soot - 0.25 && (smokeAt -= dt) <= 0) {
          smokeAt = 0.15;
          fx.puff(p.x + (rand() - 0.5) * 0.6, p.y + 0.3, p.z + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.2, 0.7 + rand() * 0.4, (rand() - 0.5) * 0.2, 1.4);
        }
      }
      // The Jet rocking from her blows, settling back; and its dents smoking and, freshly made, crackling.
      if (jolt > 0) {
        jolt = Math.max(0, jolt - dt * 3);
        jet.rotation.z = JET_RZ + Math.sin(clock * 38) * 0.004 * jolt;
        jet.rotation.x = JET_RX + Math.cos(clock * 31) * 0.0025 * jolt;
      }
      for (let i = 0; i < MARKS; i++) {
        const m = marks[i];
        if (m.life <= 0) continue;
        m.life -= dt;
        if ((m.puff -= dt) > 0) continue;
        const k2 = m.life / MARK_LIFE;
        m.puff = 0.18 + (1 - k2) * 0.6;
        fx.puff(m.x + (rand() - 0.5) * 0.3, m.y, m.z + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.15, 0.5 + rand() * 0.4, (rand() - 0.5) * 0.15, 1.2 + k2);
        if (k2 > 0.6 && rand() < 0.3) fx.spawnParticle(SPARK, m.x, m.y, m.z, (rand() - 0.5) * 2, 1 + rand() * 1.5, (rand() - 0.5) * 2, 0.35, 10, 7);
      }
      // Her head: glaring at whoever is near when she isn't busy looking at something, within its reach.
      let wantLook = 0;
      const viewer = glareAt || (driven ? driven.root.position : eye);
      if (viewer && (doing === "glare" || doing === "walk" && !stepping)) {
        const dx = viewer.x - p.x, dz = viewer.z - p.z;
        if (dx * dx + dz * dz < GLARE * GLARE) {
          let a = Math.atan2(dx, dz) - yaw;
          a -= TAU * Math.round(a / TAU);
          wantLook = Math.max(-TURN, Math.min(TURN, a));
        }
      }
      if (doing === "glare" && !wantLook) wantLook = Math.sin(clock * 0.7) * 0.4;
      look += (wantLook - look) * Math.min(1, dt * FOLLOW);
      P.head.rotation.y = look;
      P.head.rotation.x = cur.headX;
      P.head.rotation.z = cur.headZ;
      // Tapping her foot while she glares.
      if (doing === "glare") P.shinR.rotation.x = Math.max(0, Math.sin(clock * 9)) * 0.25;
      // Her mouth running while she talks, and blinking now and then except behind her goggles.
      if (shut > 0) shut -= dt;
      else if ((blinkAt -= dt) <= 0) { shut = SHUT; blinkAt = pick(BLINK[0], BLINK[1]); }
      const mouth = talk > 0 && Math.sin(clock * 18) > -0.2;
      P.head.geometry = face === H.closed ? H.closed : face === H.redOpen ? (mouth ? H.redTalk : H.redOpen) : face === H.goggles ? (mouth ? H.gogglesTalk : H.goggles) : mouth ? H.talk : shut > 0 ? H.closed : H.open;
      actor.x = p.x; actor.y = feet; actor.z = p.z;
    };
    // Her other faces, off the graph until she wears them, kept on the GPU.
    const liveGeometry = (set) => { for (const geo of Object.values(H)) set.add(geo); };
    // Space beside her pokes her, the act button reading POKE.
    const useNear = () => near && poke();
    const actLabel = () => (near ? "POKE" : null);
    // While she smashes the Jet, the tally of quick pokes at her feet: STOP HER! over a pip a poke, filled as they
    // count, the last one filling as it drains away.
    const overlay = (ctx, project) => {
      if (!rampage) return;
      const at = project(p.x, feet, p.z);
      if (!at) return;
      const w = RAMPAGE.stop * PIP + (RAMPAGE.stop - 1) * PIP_GAP, x0 = Math.round(at.x - w / 2), y0 = Math.round(at.y + 10);
      ctx.save();
      ctx.font = TALLY_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(20, 14, 10, 0.78)";
      ctx.fillRect(x0 - 6, y0 - 14, w + 12, PIP + 20);
      ctx.fillStyle = "#ffcf5a";
      ctx.fillText("STOP HER!", x0 + w / 2, y0 - 3);
      for (let i = 0; i < RAMPAGE.stop; i++) {
        const x = x0 + i * (PIP + PIP_GAP), fill = Math.max(0, Math.min(1, pips - i));
        ctx.fillStyle = "#4a3a2c";
        ctx.fillRect(x, y0 + 2, PIP, PIP);
        if (fill > 0) {
          ctx.fillStyle = "#ff5a3c";
          ctx.fillRect(x, y0 + 2 + PIP * (1 - fill), PIP, PIP * fill);
        }
      }
      ctx.restore();
    };
    // For debugging: send her to a spot by name, or running at the visitor's Ooga, and what she is doing.
    const debug = {
      go: (name) => { const s = spots.find((q) => q.name === name); if (s) goTo(s); return !!s; },
      charge: () => { const s = !panicking && seen && visit(seen); if (s) goTo(s); return !!s; },
      poke: () => poke(), rampage: () => { if (!panicking) startRampage(); return rampage; },
      hush: (name = "wingtip") => { const s = spots.find((q) => q.name === name && q.kind === "fix"); if (s) { forceHush = true; goTo(s); } return !!s; },
      get fit() { return fitT > 0 ? fitKind : 0; },
      quarrel: () => { if (free()) hearKortik(); return answerIn > 0; },
      get anger() { return anger; }, get rampaging() { return rampage; }, get pips() { return pips; }, get storming() { return storming; }, get near() { return near; },
      get doing() { return doing; }, get panicking() { return panicking; }, get down() { return down; }, get spot() { return spot && spot.name; }, get spots() { return spots.map((s) => s.name); }, get path() { return pathN; },
      get position() { return { x: p.x, y: feet, z: p.z }; }, open: () => { let n = 0; for (let i = 0; i < M; i++) n += open[i]; return n; }
    };
    goTo(nextSpot(null));

    // Tess come to distract her in a rampage, by where she is (read live), or gone (null).
    const distract = (at) => {
      if (at && !tess) { tessIn = pick(0.8, 1.6); tessLook = 0; }
      tess = at;
    };
    // How cross she is, 0 to 4 by her anger, 5 while she smashes: the terminals' mood page shows it.
    return { node, props, body: P.torso, actor, update, liveGeometry, poke, useNear, actLabel, overlay, distract, debug, get near() { return near; }, get rampaging() { return rampage; }, get mood() { return rampage ? 5 : Math.min(4, anger); } };
  };

  BL.sis = { create };
})();
