// The Ember Den's crowd: its router, then the pool of members walking, watching, sitting and reacting. The router: a lattice of half-metre cells over the room, open where a body of
// `PROBE` may stand on the floor `walkable` answers for, searched 8-way by A* (octile heuristic, no corner cutting,
// typed arrays and a binary heap, as `scene-arcade.js`'s `findPath`) and pulled taut with `walkable` sweeps into at
// most `WAYPOINTS` waypoints. Nothing allocates per route.
(() => {
  "use strict";
  const BL = window.BL, S = BL.scene;
  const CELL = 0.5, X0 = -23, Z0 = -35.5, GW = 92, GH = 142, GN = GW * GH, NEAR = 3, WAYPOINTS = 24;
  const PROBE = { bodyRadius: 0.7 }, LEG = { bodyRadius: 0.4 };
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  const cellX = c => X0 + (c % GW + 0.5) * CELL, cellZ = c => Z0 + (Math.floor(c / GW) + 0.5) * CELL;

  // Only the casino's permanent collision layout can share a grid across visits. Custom walkability
  // functions used by callers may change between searches made with separate routers.
  let hallGrid = null;
  const gridFor = walkable => {
    const permanent = walkable === BL.pokerModels?.walkable;
    if (permanent && hallGrid) return hallGrid;
    const open = new Uint8Array(GN);
    let cells = 0;
    for (let c = 0; c < GN; c++) {
      const x = cellX(c), z = cellZ(c);
      open[c] = walkable(x, z, x, z, 0, 2, PROBE) ? 1 : 0;
      cells += open[c];
    }
    const grid = { open, cells };
    if (permanent) hallGrid = grid;
    return grid;
  };

  const router = walkable => {
    // The 13,064 cell indices fit in 16 bits. A search stamps discovered cells positive and closed cells negative.
    const { open, cells } = gridFor(walkable);
    const cost = new Float32Array(GN), from = new Int16Array(GN), mark = new Int32Array(GN);
    const heap = new Uint16Array(GN * 3), f = new Float32Array(GN * 3);
    let search = 0, heapN = 0;
    // The open cell nearest (x, z) within 1.5 m, or -1.
    const nearOpen = (x, z) => {
      const i0 = Math.floor((x - X0) / CELL), j0 = Math.floor((z - Z0) / CELL);
      let best = -1, bestD = (NEAR * CELL) ** 2;
      for (let j = j0 - NEAR; j <= j0 + NEAR; j++) for (let i = i0 - NEAR; i <= i0 + NEAR; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH || !open[j * GW + i]) continue;
        const c = j * GW + i, d = (cellX(c) - x) ** 2 + (cellZ(c) - z) ** 2;
        if (d <= bestD) { bestD = d; best = c; }
      }
      return best;
    };
    const heapPush = (c, v) => {
      let k = heapN++;
      while (k > 0) { const up = (k - 1) >> 1; if (f[up] <= v) break; heap[k] = heap[up]; f[k] = f[up]; k = up; }
      heap[k] = c; f[k] = v;
    };
    const heapPop = () => {
      const top = heap[0], last = heap[--heapN], lf = f[heapN];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= heapN) break;
        if (c + 1 < heapN && f[c + 1] < f[c]) c++;
        if (f[c] >= lf) break;
        heap[k] = heap[c]; f[k] = f[c]; k = c;
      }
      heap[k] = last; f[k] = lf;
      return top;
    };
    // A* from cell s to cell t; `from` then leads back from t to s.
    const findPath = (s, t) => {
      if (search === 0x7fffffff) { mark.fill(0); search = 0; }
      const id = ++search, ti = t % GW, tj = Math.floor(t / GW), cap = heap.length - 8;
      heapN = 0;
      mark[s] = id; cost[s] = 0; from[s] = -1;
      heapPush(s, 0);
      while (heapN > 0) {
        const c = heapPop();
        if (mark[c] === -id) continue;
        mark[c] = -id;
        if (c === t) return true;
        const ci = c % GW, cj = Math.floor(c / GW);
        for (let k = 0; k < 8; k++) {
          const ni = ci + DI[k], nj = cj + DJ[k];
          if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
          const nc = nj * GW + ni, g = cost[c] + DC[k];
          if (mark[nc] === -id || (mark[nc] === id && cost[nc] <= g) || !open[nc]) continue;
          if (k >= 4 && (!open[cj * GW + ni] || !open[nj * GW + ci])) continue;
          mark[nc] = id; cost[nc] = g; from[nc] = c;
          const di = Math.abs(ni - ti), dj = Math.abs(nj - tj);
          if (heapN < cap) heapPush(nc, g + Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj));
        }
      }
      return false;
    };
    // From (ax, az) to (bx, bz) as waypoints in `out` (x, z pairs), the start left out: from each point it heads for
    // the furthest cell of the path a `PROBE` body sweeps to, and the last leg runs on to the end itself when a walker
    // gets there. Returns the count, 0 with no route; a route longer than the cap stops at the cap.
    const find = (ax, az, bx, bz, out) => {
      const s = nearOpen(ax, az), t = nearOpen(bx, bz);
      if (s < 0 || t < 0 || !findPath(s, t)) return 0;
      // The search is finished, so the heap's cell storage can hold the route back to the start.
      const trail = heap;
      let n = 0;
      for (let c = t; c !== -1; c = from[c]) trail[n++] = c;
      let w = 0, at = n - 1, px = ax, pz = az;
      while (at >= 0 && w < WAYPOINTS) {
        let far = -1;
        for (let m = at; m >= 0; m--) {
          if (walkable(px, pz, cellX(trail[m]), cellZ(trail[m]), 0, 2, PROBE)) far = m;
          else if (far >= 0) break;
        }
        if (far < 0) far = at;
        px = cellX(trail[far]); pz = cellZ(trail[far]);
        out[w * 2] = px; out[w * 2 + 1] = pz; w++;
        at = far - 1;
      }
      if (at < 0 && w < WAYPOINTS && (px !== bx || pz !== bz) && walkable(px, pz, bx, bz, 0, 2, LEG)) { out[w * 2] = bx; out[w * 2 + 1] = bz; w++; }
      return w;
    };
    // Whether a route can end exactly at (x, z): an open cell near it from which a walker's leg reaches it.
    const ends = (x, z) => { const c = nearOpen(x, z); return c >= 0 && walkable(cellX(c), cellZ(c), x, z, 0, 2, LEG); };
    return { find, ends, cells };
  };

  // ---- cigar smoke ---------------------------------------------------------------------------------------------

  // A smoker's cigar smoke: one fixed-capacity instanced batch of small grey-white puffs (`SMOKE_WISP` rising from the
  // lit end without pause, and one more for each of the B's points), placed in the crowd root's frame from the cigar's tip every frame. Every
  // `SMOKE_CYCLE` seconds the extra puffs leave the tip one after another over `SMOKE_EMIT`, rise as the wisp does and
  // ease, slowly, onto the Bitcoin mark's shape `SMOKE_LIFT` over the tip (`smokeTargets`: the points of a square grid
  // `SMOKE_GRID` apart, in the mark's own units, that lie on the faces of `pokerFloor.mark()`, so the B reads as a
  // dot-matrix letter), hold there till `SMOKE_HOLD`, and drift apart and fade by
  // `SMOKE_GONE`. Every length is in the smoker's own heights (the cigar node's scale), so the mark, about a head's
  // size at `SMOKE_SCALE`, hangs just over the head, soft and see-through (`SMOKE_ALPHA`, its inner points `SMOKE_CORE`
  // more), and holds about two seconds, long enough to catch. The renderer draws opacity as an ordered 4x4 dither by
  // screen pixel, so overlapping puffs cover the same pixels and add nothing: the opacity itself sets how solid the B
  // reads (0.18 kept 3 pixels in 16 and the B vanished; 0.5 drew it as a solid sign). The mark stands upright and turned square to the view (its right
  // along the view's right), so it is never seen from behind and never mirrored. On the lite set (Canvas 2D) only the
  // wisp rises. Nothing allocates.
  const SMOKE_WISP = 12, SMOKE_GRID = 0.03, SMOKE_CYCLE = 10, SMOKE_EMIT0 = 3, SMOKE_EMIT = 1.8, SMOKE_FORM = 6, SMOKE_HOLD = 7.8, SMOKE_GONE = 9.6;
  const WISP_LIFE = 2.6, WISP_RISE = 0.24, SMOKE_LIFT = 1.15, SMOKE_SCALE = 0.72, SMOKE_FAR = 30, SMOKE_ALPHA = 0.36, SMOKE_CORE = 0.12, WISP_ALPHA = 0.3;
  // Each B puff is SMOKE_BLEND times the grid's spacing across (the particle is 0.05 units at scale 1), so neighbours run
  // together into soft smoke rather than dots; while it holds, each drifts SMOKE_DRIFT of the smoker's height.
  const SMOKE_BLEND = 1.3, SMOKE_PUFF = SMOKE_BLEND * SMOKE_GRID * SMOKE_SCALE / 0.05, SMOKE_DRIFT = 0.008;
  const SMOKE_STRIDE = 20;
  let targets = null, cores = null;
  // 1 for a target point whose four grid neighbours are all on the mark (the strokes' inner points), else 0.
  const smokeCores = () => {
    if (cores) return cores;
    const T = smokeTargets(), n = T.length / 2, out = new Float32Array(n), near = (u, v) => { for (let k = 0; k < n; k++) if (Math.abs(T[k * 2] - u) < 1e-4 && Math.abs(T[k * 2 + 1] - v) < 1e-4) return true; return false; };
    for (let j = 0; j < n; j++) { const u = T[j * 2], v = T[j * 2 + 1]; out[j] = near(u - SMOKE_GRID, v) && near(u + SMOKE_GRID, v) && near(u, v - SMOKE_GRID) && near(u, v + SMOKE_GRID) ? 1 : 0; }
    return (cores = out);
  };
  // The mark's points in its own (u, v), u to its right and v up (the floor's (x, z) is (u, -v)): a grid from its
  // top left corner, row by row, each point kept when it lies on one of the mark's convex faces.
  const smokeTargets = () => {
    if (targets) return targets;
    const geo = BL.pokerFloor.mark(), v = geo.verts, out = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2]); }
    const onFace = (x, z) => geo.faces.some(f => {
      let sign = 0;
      for (let k = 0; k < f.i.length; k++) {
        const a = f.i[k] * 3, b = f.i[(k + 1) % f.i.length] * 3, c = (v[b] - v[a]) * (z - v[a + 2]) - (v[b + 2] - v[a + 2]) * (x - v[a]);
        if (Math.abs(c) < 1e-12) continue;
        if (sign && Math.sign(c) !== sign) return false;
        sign = Math.sign(c);
      }
      return true;
    });
    for (let z = z0 + SMOKE_GRID / 2; z < z1; z += SMOKE_GRID) for (let x = x0 + SMOKE_GRID / 2; x < x1; x += SMOKE_GRID) if (onFace(x, z)) out.push(x, -z);
    return (targets = Float32Array.from(out));
  };
  // The tip, and one puff's place, size, spin and opacity handed to `put` (in a typed array, so no number is boxed).
  const TIP = new Float64Array(3), PUFF = new Float64Array(6);
  // Smoke needs the current cigar transform before rendering. Update only its ancestors up to the
  // same table or crowd root used for the pose, leaving sibling meshes to the renderer's pass.
  const updateCigar = (node, poseRoot) => {
    if (!node.visible || (node !== poseRoot && !updateCigar(node.parent, poseRoot))) return false;
    S.updateLocal(node);
    if (node === poseRoot) node.world.set(node.local);
    else BL.math.mat4.multiply(node.world, node.parent.world, node.local);
    return true;
  };
  const smoke = ({ root, lite = false, seed = 0 }) => {
    const target = lite ? null : smokeTargets(), core = lite ? null : smokeCores(), SMOKE_B = target ? target.length / 2 : 0, n = SMOKE_WISP + SMOKE_B, data = new Float32Array(n * SMOKE_STRIDE);
    // A geometry of its own: the renderer keeps one record per geometry and draws one batch on it, so smokers sharing
    // the cached particle drew only the last one collected and the rest never showed.
    const geometry = BL.models.box({ w: 0.05, h: 0.05, d: 0.05, color: "#ebe8e3", emissive: 0.45 });
    geometry.castShadow = false;
    const node = S.createNode({ geometry, sightHidden: true, instanceData: data, instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    S.addChild(root, node);
    // The upright puffs share a homogeneous row and tint. The other fixed components start at zero.
    for (let i = 0; i < data.length; i += SMOKE_STRIDE) { data[i + 15] = 1; data[i + 16] = 1; }
    const offset = (seed % 1000) / 1000 * SMOKE_CYCLE;
    const state = new Float64Array(2);
    const put = () => {
      const x = PUFF[0], y = PUFF[1], z = PUFF[2], s = PUFF[3], spin = PUFF[4], alpha = PUFF[5];
      const o = state[0]++ * SMOKE_STRIDE, c = Math.cos(spin) * s, sn = Math.sin(spin) * s;
      data[o] = c; data[o + 2] = -sn; data[o + 5] = s; data[o + 8] = sn; data[o + 10] = c;
      data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 18] = -1 - alpha;
    };
    const hide = () => { if (node.instanceCount) { node.instanceCount = 0; node.instanceVersion++; } };
    // From the cigar's node (its tip `CIGAR_TIP` down its length) and the view `eye` ({ position, target }).
    const update = (elapsed, cigarNode, eye, poseRoot = null) => {
      if (poseRoot && !updateCigar(cigarNode, poseRoot)) { hide(); return; }
      const T = elapsed + offset, t = state[1] = T % SMOKE_CYCLE, w = cigarNode.world;
      BL.math.mat4.transformPoint(TIP, w, 0, 0, BL.pokerCrowdModels.CIGAR_TIP);
      const tx = TIP[0], ty = TIP[1], tz = TIP[2], h = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
      if (eye && (eye.position.x - tx) ** 2 + (eye.position.z - tz) ** 2 > SMOKE_FAR * SMOKE_FAR) { hide(); return; }
      state[0] = 0;
      for (let i = 0; i < SMOKE_WISP; i++) {
        const age = (T + i * WISP_LIFE / SMOKE_WISP) % WISP_LIFE, k = age / WISP_LIFE, ph = i * 2.39;
        PUFF[0] = tx + Math.sin(age * 2.1 + ph) * 0.05 * k * h; PUFF[1] = ty + age * WISP_RISE * h; PUFF[2] = tz + Math.cos(age * 1.7 + ph) * 0.05 * k * h;
        PUFF[3] = (0.6 + 1.1 * k) * h; PUFF[4] = age + ph; PUFF[5] = WISP_ALPHA * (1 - k) * Math.min(1, age * 5);
        put();
      }
      if (target && t >= SMOKE_EMIT0 && t < SMOKE_GONE) {
        // The mark's right along the view's right, upright.
        const fx = eye ? eye.target.x - eye.position.x : 0, fz = eye ? eye.target.z - eye.position.z : -1, l = Math.sqrt(fx * fx + fz * fz);
        const rx = l > 1e-4 ? -fz / l : 1, rz = l > 1e-4 ? fx / l : 0;
        const cy = ty + SMOKE_LIFT * h, sway = 0.03 * h;
        for (let j = 0; j < SMOKE_B; j++) {
          const born = SMOKE_EMIT0 + j / SMOKE_B * SMOKE_EMIT;
          if (t < born) break;
          const u = target[j * 2] * SMOKE_SCALE * h, v = target[j * 2 + 1] * SMOKE_SCALE * h, ph = j * 1.618;
          const gx = tx + rx * u, gy = cy + v, gz = tz + rz * u;
          // Written straight into `PUFF`: a double held in a `let` that branches assign is boxed.
          const size = SMOKE_PUFF * h * (0.9 + 0.2 * ((j * 7) % 5) / 4);
          const alpha = SMOKE_ALPHA + SMOKE_CORE * core[j];
          PUFF[3] = size; PUFF[4] = ph + t * 0.4; PUFF[5] = alpha;
          if (t < SMOKE_FORM) {
            const a = (t - born) / (SMOKE_FORM - born), e = a * a * (3 - 2 * a), rise = (t - born) * WISP_RISE * h;
            PUFF[0] = tx + (gx - tx) * e + Math.sin(t * 2 + ph) * sway * (1 - e); PUFF[1] = ty + rise + (gy - ty - rise) * e; PUFF[2] = tz + (gz - tz) * e + Math.cos(t * 2 + ph) * sway * (1 - e);
            PUFF[5] = alpha * Math.min(1, (t - born) * 3) * (0.6 + 0.4 * e);
          } else if (t < SMOKE_HOLD) {
            PUFF[0] = gx + Math.sin(t * 1.3 + ph) * SMOKE_DRIFT * h; PUFF[1] = gy + Math.cos(t * 1.1 + ph) * SMOKE_DRIFT * h + (t - SMOKE_FORM) * 0.03 * h; PUFF[2] = gz + Math.cos(t * 0.9 + ph) * SMOKE_DRIFT * h;
          } else {
            const d = (t - SMOKE_HOLD) / (SMOKE_GONE - SMOKE_HOLD);
            PUFF[0] = gx + (rx * u * 0.6 + Math.sin(ph) * 0.05 * h) * d; PUFF[1] = gy + (SMOKE_HOLD - SMOKE_FORM) * 0.03 * h + (v * 0.4 + 0.16 * h) * d; PUFF[2] = gz + (rz * u * 0.6 + Math.cos(ph) * 0.05 * h) * d;
            PUFF[5] = alpha * (1 - d); PUFF[3] = size * (1 + d * 0.8);
          }
          put();
        }
      }
      node.instanceCount = state[0]; node.instanceVersion++;
    };
    const dispose = () => { if (node.parent) S.removeChild(node.parent, node); };
    // `t`: where in its cycle the last update stood.
    return { node, update, hide, dispose, capacity: n, get t() { return state[1]; } };
  };

  // ---- the pool --------------------------------------------------------------------------------------------------

  // Walking pace (m/s) by type; staff walk at the gorilla's upright pace.
  const SPEED = { highRoller: 0.9, businessman: 1.6, lady: 1.1, drunk: 0.7 };
  const TURN = 4, LOOK = 1.1, WAIT = 1.5, REACH = 0.6, ARRIVE = 0.35, STRIDE = 6.5;
  const DRUNK_PERIOD = 2.3, DRUNK_SWAY = 0.35, TAU = Math.PI * 2;
  // The router serves pending routes in turn round the pool, at least one a frame and at most `ROUTES_MAX`, stopping
  // once `ROUTE_BUDGET` ms have gone; members are built at least one a frame while `BUILD_BUDGET` ms allow.
  const ROUTES_MAX = 6, ROUTE_BUDGET = 1.5, BUILD_BUDGET = 3;
  // Giving way looks at the members in the 3 by 3 cells of `GRID` m round each walker, bucketed once a frame.
  const GRID = 2, GX0 = -24, GZ0 = -36, GCOLS = 24, GROWS = 36;
  const STEP = { bodyRadius: 0.3 };
  const ground = () => 0, turnTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  // Seats: the height sat on, each seat's top (the floor where a spot has no seat), the 0.4 s blend in and out, the
  // bots' legs, how far a short skirt tips forward over the lap. A sitter's hip rests `pokerModels.SIT_HIP` of its
  // height over the seat, as the card players' do (`sitLift`).
  const SEAT_Y = { stool: 0.62, lounge: 0.4 }, FLOOR_SEAT = 0, SIT_BLEND = 0.4, SIT_LEGS = -1.35, SKIRT_SIT = -0.8;
  const sitLift = who => BL.pokerModels.SIT_HIP * who.traits.height;
  // Reactions and speech: tables read twice a second, a pot of 400 or more is big, two crowd bubbles at most.
  const POLL = 0.5, BIG_POT = 400, LEAN_IN = 0.2, CHEER = 1.2, GASP = 2, SAY = 2.4, TALK = 2.5, BUBBLES = 2;
  const RETURN_LINE = "Who threw me out?";
  // At the gaming tables (poker-games.js): a guest stands leaning on the rail by `GAME_LEAN` and further in by
  // `GAME_IN` while the wheel slows or the dice fly; reaching in to bet brings the right arm to `BET_ARM`; a shrug lifts
  // both arms out by `SHRUG`; the shooter shakes the dice overhead and throws (`TOSS` s). The cues, by number:
  // bet, lean, split (one or two cheer, the rest groan or shrug), cheer, groan, shake, toss.
  const GAME_LEAN = 0.08, GAME_IN = 0.16, BET_ARM = -1.25, SHRUG = 0.45, SHRUG_TIME = 1.6, TOSS = 0.55;
  const GAME = Object.freeze({ BET: 1, LEAN: 2, SPLIT: 3, CHEER: 4, GROAN: 5, SHAKE: 6, TOSS: 7 });
  const GREET_R = 2.5, GREET_EVERY = 60, STAGGER = 1.2, STUMBLES = 3, ESCORT_SIT = 30, SERVE = 4, TRAIL = 1.6, TRAIL_GO = 2.4;
  // The lounges' residents: a sip every `SIP_GAP` to twice that, taking `SIP` s (up, at the lips, down), the glass held
  // at the lap between; the head turns to whoever speaks within `HEED_TALK` m, else whoever passes within `HEED_PASS`,
  // looked for again every `HEED_EVERY` s, never more than `HEED_TURN` off the body's facing.
  const SIP_GAP = 6, SIP = 2.6, SIP_REST = -0.75, SIP_UP = -2.25, HEED_TALK = 6, HEED_PASS = 3.5, HEED_EVERY = 0.5, HEED_TURN = 1;
  // Where a guest goes next, by weight; a kind with no free place falls to a stroll.
  const dest = pairs => Object.freeze({ kinds: pairs.map(p => p[0]), weights: pairs.map(p => p[1]), sum: pairs.reduce((n, p) => n + p[1], 0) });
  const DEST = Object.freeze({
    highRoller: dest([["rail", 5], ["stool", 2], ["stroll", 1], ["rope", 1], ["group", 3], ["glass", 2], ["bar", 2], ["game", 6]]),
    businessman: dest([["cage", 3], ["rail", 3], ["stroll", 2], ["stool", 1], ["group", 3], ["glass", 1], ["bar", 2], ["game", 6]]),
    lady: dest([["stool", 3], ["rail", 2], ["stroll", 1], ["group", 4], ["glass", 3], ["bar", 1], ["game", 5]]),
    drunk: dest([["stool", 3], ["rail", 2], ["stroll", 4], ["bar", 2], ["game", 3]])
  });
  // The pit boss's post in the middle of the floor.
  const POST = Object.freeze({ kind: "post", x: 0, z: 0, yaw: 0, table: -1 });
  const KINDS = ["rail", "stool", "cage", "rope", "door", "stroll", "group", "glass", "bar", "lounge", "game"];

  // `create` keeps a fixed pool of everyone the day could put on the floor (`castFor(day, Infinity)`), built as the
  // cap needs them and shown up to it: `castFor(day, n)` is a subset of that pool, so a cap change only parks or
  // brings back members. A member walks a route from the router (a few `find`s a frame across the whole pool, inside
  // a time budget), gives way to `others()` and to members ahead of it in `TYPES`, and arrives `reached` or short of
  // its target. Seats are reached by `approach(spot)` and a straight scripted move (`slideIn`, then `slideOut` the
  // same way). What a member does there is its state: `watch` a table, the cage, a rope or the view through the
  // glass, `chat` in a group or at the bar, `sit`, staff at a `post` or a `serve` stop, the drunk waiting for his
  // `escort`. Its only view of a table is `publicState(table, out)`, read from the `out` it passed in: `pot`, `phase`,
  // `hand`, `winner` and `allIn`, nothing else. The lounges' seats (`lounge` spots) hold residents, outside the cap:
  // one a seat (on the lite set the sofas' seats only), seated for good, sipping and watching the room. The smokers
  // among the members (`traits.outfit.cigar`) each carry a `smoke` batch.
  const create = ({ root, fx, walkable, spots, publicState, others, day, cap, onStep = null, visitor = null, arrival = false, lite = false }) => {
    const C = BL.pokerCrowdModels, M = BL.models, Cr = BL.crew, GAIT = Cr.GAIT, TYPES = C.TYPES, LINES = C.LINES, Mth = BL.math;
    const TABLE_N = BL.pokerModels.TABLES.length;
    const paths = router(walkable), cast = C.castFor(day, Infinity);
    const members = cast.map((c, index) => {
      const wp = { x: 0, z: 0 }, rand = Mth.mulberry32(Mth.fnv1a(c.id) + day);
      return {
        id: c.id, type: c.type, rig: c.rig, traits: c.traits, index, rank: TYPES.indexOf(c.type), rand,
        root: null, parts: null, agent: null, x: 0, z: 0, yaw: 0, want: 0, speed: SPEED[c.type] || BL.agent.GAITS.upright.speed,
        state: "parked", on: false, clock: 0, phase: 0, step: 0, cycle: 0, route: new Float32Array(48), n: 0, i: 0,
        spot: null, tx: 0, tz: 0, pending: false, reached: false, stuck: 0, armRZ: 0, armLZ: 0, baseY: 0, bodyRadius: 0.4,
        rest: new Float32Array(8), sway: 0, backX: 0, backZ: 0, trailing: false, smoke: null, gesture: rand() * TAU,
        slide: { fromX: 0, fromZ: 0, toX: 0, toZ: 0, fromYaw: 0, toYaw: 0, t: 0, time: 0, next: "", seat: 0 },
        waypoint: [wp], gait: 0, gaitPhase: 0, gaitMix: 0, closeSide: 0, closeBack: false,
        // What it is about: `job` (serve, post, boss, and the escort's fetch, await, escort and escorted), the table it
        // watches and the hand it waits out, its escort partner, the seat's height, the waiter's loop of stops.
        job: "", table: -1, hand: -1, partner: null, seatY: 0, loop: 0, stops: [null, null, null, null],
        lean: 0, cheer: 0, gasp: 0, armUp: 0, handUp: 0, talk: 0, greet: 0, mutter: 12 + 13 * rand(),
        // Walking time to the drunk's next stumble, the stumble under way and how many so far.
        walked: 0, restAt: 20 + 20 * rand(), stagger: 0, stumbles: 0,
        // At a gaming table: which (-1 none), and the cues' timers and blends.
        game: -1, gameLean: 0, bet: 0, betK: 0, shrug: 0, shrugK: 0, shake: 0, toss: 0
      };
    });
    // The residents: one record a lounge seat the floor offers (filled by `setSpots`), each a lounge cast member in turn.
    const residents = [];
    let strolls = null, capNow = -1, buildPending = true, cursor = 0, routes = 0, bubbles = 0, pollClock = 0, railsBy = null, loungeSeats = null;
    const approaches = new Map(), byKind = {};
    let listener=null;
    // Table talk carries to the next rail. A distant guest still reacts in the room.
    const withinEarshot=m=>!listener || (m.x-listener.x)**2+(m.z-listener.z)**2+(1.5-(listener.y??1.5))**2<9**2;
    const stat = { crowd: 0, walking: 0, sitting: 0, crowdBubbles: 0, routes: 0, lounge: 0, smokers: 0, built: 0 };
    // What the crowd last read of each table, and the hand each reaction last fired for.
    const pots = new Float64Array(TABLE_N), hands = new Float64Array(TABLE_N).fill(-1), winners = new Int32Array(TABLE_N).fill(-1);
    const bigHand = new Float64Array(TABLE_N).fill(-1), allInHand = new Float64Array(TABLE_N).fill(-1), live = new Uint8Array(TABLE_N);
    const view = { pot: 0, phase: "waiting", hand: 0, winner: -1, allIn: false };
    // The give-way grid: the first member in each cell and the next in the same cell, rebuilt at the top of `update`.
    const cellHead = new Int16Array(GCOLS * GROWS), cellNext = new Int16Array(members.length);
    const cellOf = (x, z) => {
      const i = Math.min(GCOLS - 1, Math.max(0, Math.floor((x - GX0) / GRID))), j = Math.min(GROWS - 1, Math.max(0, Math.floor((z - GZ0) / GRID)));
      return j * GCOLS + i;
    };
    const bucket = dt => {
      cellHead.fill(-1);
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        // A line expires on the same clock, including while its speaker is parked.
        if (m.talk > 0 && (m.talk -= dt) <= 0) { m.talk = 0; bubbles--; }
        if (!m.on || !m.root) continue;
        const c = cellOf(m.x, m.z);
        cellNext[k] = cellHead[c]; cellHead[c] = k;
      }
    };

    // ---- places ----
    const near = (x, z, px, pz, r) => (x - px) * (x - px) + (z - pz) * (z - pz) < r * r;
    const spotFree = (s, me) => {
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (m !== me && m.on && m.root && (m.spot === s || near(m.x, m.z, s.x, s.z, 1))) return false;
      }
      const bodies = others();
      for (let k = 0; k < bodies.length; k++) if (near(bodies[k].x, bodies[k].z, s.x, s.z, bodies[k].radius + 1)) return false;
      return true;
    };
    // A free spot of the list from a random start, or null.
    const freeIn = (m, list) => {
      const n = list.length, start = Math.floor(m.rand() * n);
      for (let k = 0; k < n; k++) { const s = list[(start + k) % n]; if (s !== m.spot && spotFree(s, m)) return s; }
      return null;
    };
    const freeStroll = m => freeIn(m, strolls) || strolls[Math.floor(m.rand() * strolls.length)];
    const nearest = (list, x, z) => {
      let best = null, bestD = Infinity;
      for (let k = 0; k < list.length; k++) { const s = list[k], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bestD) { bestD = d; best = s; } }
      return best;
    };
    // Where a route to a seat-like spot (stool, cage) ends: the spot when one can, else the nearest point round it, on
    // rings a quarter metre apart out to 4 m, that a walker stands on and a route ends at. Worked out for every such
    // spot whenever the spots change, so nothing a frame calls allocates or searches; any other spot is its own.
    const SEATS = { stool: true, cage: true };
    const findApproach = s => {
      const a = { x: s.x, z: s.z };
      if (walkable(s.x, s.z, s.x, s.z, 0, 2, LEG) && paths.ends(s.x, s.z)) return a;
      for (let ring = 1; ring <= 16; ring++) for (let k = 0; k < 16; k++) {
        const ang = k * Math.PI / 8, x = s.x + Math.sin(ang) * ring * 0.25, z = s.z + Math.cos(ang) * ring * 0.25;
        if (walkable(x, z, x, z, 0, 2, LEG) && paths.ends(x, z)) { a.x = x; a.z = z; return a; }
      }
      return a;
    };
    const approach = s => approaches.get(s) || s;
    const setSpots = list => {
      for (const k of KINDS) byKind[k] = list.filter(s => s.kind === k);
      railsBy = Array.from({ length: TABLE_N }, (_, t) => byKind.rail.filter(s => s.table === t));
      strolls = byKind.stroll;
      approaches.clear();
      for (const s of list) if (SEATS[s.kind]) approaches.set(s, findApproach(s));
      loungeSeats = lite ? byKind.lounge.filter(s => s.seat === "sofa") : byKind.lounge;
      while (residents.length < loungeSeats.length) {
        const c = C.LOUNGE[residents.length % C.LOUNGE.length], rand = Mth.mulberry32(Mth.fnv1a(c.id) + residents.length);
        residents.push({ id: c.id, traits: c.traits, index: residents.length, root: null, parts: null, baseY: 0, armRZ: 0, armLZ: 0, spot: null,
          sip: SIP_GAP * (0.3 + 1.7 * rand()), sipping: -1, heed: rand() * HEED_EVERY, look: 0, lookX: 0, lookZ: 0, looking: false, rand });
      }
      for (let k = 0; k < residents.length; k++) {
        const r = residents[k];
        r.spot = k < loungeSeats.length ? loungeSeats[k] : null;
        if (r.root) seatResident(r);
      }
    };
    const place = (m, x, z, yaw) => {
      m.x = x; m.z = z; m.yaw = m.want = yaw;
      if (m.agent) { m.agent.place(x, z, yaw); return; }
      m.root.position.x = x; m.root.position.y = m.baseY; m.root.position.z = z; m.root.rotation.y = yaw;
    };
    const idle = (m, seconds) => { m.state = "idle"; m.clock = seconds; m.pending = false; m.stuck = 0; m.want = m.yaw; if (m.agent) m.agent.place(m.x, m.z, m.yaw); };
    // Stopped at its place in `state` for `seconds`, turning to face `yaw`.
    const settle = (m, yaw, state, seconds) => {
      m.state = state; m.clock = seconds; m.pending = false; m.stuck = 0; m.want = yaw;
      if (m.agent) { m.yaw = yaw; m.agent.place(m.x, m.z, yaw); }
    };
    const standAt = (m, s) => { place(m, s.x, s.z, s.yaw); m.spot = s; idle(m, 0.5 + m.rand() * 2.5); };

    // ---- building and the cap ----
    const dressStaff = m => {
      const d = C.staffDress(m.type), p = m.parts;
      if (d.head) S.addChild(p.head, S.createNode({ geometry: d.head }));
      S.addChild(p.torso, S.createNode({ geometry: d.torso }));
      if(d.drinks) m.drinks=d.drinks.map(geometry=>{
        const glass=S.createNode({geometry}); glass.visible=false; S.addChild(p.armR,glass); return glass;
      });
      if (d.arm) S.addChild(p.armR, S.createNode({ geometry: d.arm }));
      for (const arm of [p.armR, p.armL]) S.addChild(arm, S.createNode({ geometry: d.sleeve }));
    };
    // A caveman's model with nothing of the island's kit showing: no rifle, snack or jetpack, the club only for an item.
    const dressed = (who, traits) => {
      const model = M.caveman(traits), p = model.parts;
      who.root = model.root; who.parts = p; who.baseY = model.root.position.y;
      who.armRZ = p.armR.rotation.z; who.armLZ = p.armL.rotation.z;
      p.gun.visible = false;
      if (p.snack) p.snack.visible = false;
      if (p.jetpack) p.jetpack.visible = false;
      if (p.jetFlame) p.jetFlame.visible = false;
      p.club.visible = !!traits.outfit.item;
    };
    // Fill the quietest rail first, counting guests still walking to their places.
    // Leave at least one rail position free for a player to approach the game.
    const gameRails = new Int8Array(BL.pokerModels.GAMES.length);
    const quietRail = m => {
      gameRails.fill(0);
      for (const other of members) if(other!==m && other.on && other.spot?.kind==="game") gameRails[other.spot.game]++;
      const target=Math.min(4,Math.floor(capNow/8));
      let best=null, count=target;
      const spots=byKind.game, start=Math.floor(m.rand()*spots.length);
      for(let i=0;i<spots.length;i++){
        const s=spots[(start+i)%spots.length];
        if(gameRails[s.game]<count && spotFree(s,m)){
          best=s; count=gameRails[s.game]; if(!count) break;
        }
      }
      return best;
    };
    const enterFloor=(m,s) => {
      if(m.type==="waiter" && m.id==="waiter-1"){
        const pickup=serveStop(m);
        if(pickup){
          standAt(m,pickup); m.job="serve"; m.loop=1;
          settle(m,pickup.yaw,"serve",SERVE); return;
        }
      }
      // One arriving guest crosses the sightline to the near dealer, then joins the ordinary rail crowd.
      if(arrival && m.rig==="caveman"){
        arrival=false;
        const rail=nearest(railsBy[1],13,26);
        if(rail && walkable(7.4,27.8,7.4,27.8,0,2,LEG)){
          place(m,7.4,27.8,0);go(m,rail);return;
        }
      }
      if(m.rig==="caveman"){
        const rail=quietRail(m);
        if(rail){ standAt(m,rail); m.game=rail.game; settle(m,rail.yaw,"watch",24+32*m.rand()); return; }
      }
      standAt(m,s);
    };
    const build = m => {
      const s = freeStroll(m);
      if (m.rig === "gorilla") {
        m.agent = BL.agent.create({ groundAt: ground, walkable, form: "ape", x: s.x, z: s.z, heading: s.yaw, scale: 0.9 });
        m.root = m.agent.root; m.parts = m.agent.parts;
        dressStaff(m);
      } else {
        dressed(m, m.traits);
        const p = m.parts, r = m.rest;
        r[0] = p.torso.position.y; r[1] = p.torso.position.z; r[2] = p.head.position.y; r[3] = p.head.position.z;
        r[4] = p.armR.position.y; r[5] = p.armR.position.z; r[6] = p.armL.position.y; r[7] = p.armL.position.z;
        if (p.cigar) m.smoke = smoke({ root, lite, seed: Mth.fnv1a(m.id) });
      }
      S.addChild(root, m.root);
      enterFloor(m, s);
    };
    // A resident sits in her seat for good: the legs forward, the hips at the seat, the skirt over the lap.
    const seatResident = r => {
      const s = r.spot;
      r.root.visible = !!s;
      if (!s) return;
      const p = r.parts;
      r.root.position.x = s.x; r.root.position.z = s.z; r.root.rotation.y = s.yaw;
      r.root.position.y = SEAT_Y.lounge + sitLift(r);
      BL.pokerModels.bendKnees(p,true);
      p.legR.rotation.x = SIT_LEGS; p.legL.rotation.x = SIT_LEGS + 0.08;
      p.legR.rotation.z = -0.04; p.legL.rotation.z = 0.04;
      p.armL.rotation.x = -0.55; p.armR.rotation.x = SIP_REST;
      p.armR.rotation.z = r.armRZ; p.armL.rotation.z = r.armLZ;
      if (p.skirt) p.skirt.rotation.x = SKIRT_SIT;
    };
    const buildResident = r => {
      dressed(r, r.traits);
      S.addChild(root, r.root);
      seatResident(r);
    };
    const park = m => {
      if (m.partner) cancelEscort(m);
      // Its bubble goes with it: a caveman's line is hushed, and the count is released at once.
      if (m.talk > 0) { m.talk = 0; bubbles--; stat.crowdBubbles = bubbles; if (!m.agent) fx.hush(m); }
      if(m.drinks) for(const glass of m.drinks) glass.visible=false;
      if(m.parts && !m.agent) BL.pokerModels.bendKnees(m.parts,false);
      m.state = "parked"; m.pending = false; m.n = 0; m.spot = null; m.job = ""; m.table = -1; m.game = -1; m.loop = 0; m.slide.seat = 0; m.stagger = 0;
      if (m.smoke) m.smoke.hide();
      if (m.root) { m.root.visible = false; if (m.agent) m.agent.place(m.x, m.z, m.yaw); }
    };
    const setCap = n => {
      if (n === capNow) return;
      capNow = n; buildPending = true;
      const on = C.castFor(day, n);
      for (let k = 0; k < members.length; k++) {
        const m = members[k], want = on.includes(cast[k]);
        if (want === m.on) continue;
        m.on = want;
        if (!want) park(m);
        else if (m.root) { m.root.visible = true; enterFloor(m, freeStroll(m)); }
      }
    };
    // Who is still to be built: the members on the floor first, then the residents.
    const buildNext = () => {
      for (let k = 0; k < members.length; k++) if (members[k].on && !members[k].root) { build(members[k]); return true; }
      for (let k = 0; k < residents.length; k++) if (residents[k].spot && !residents[k].root) { buildResident(residents[k]); return true; }
      return false;
    };

    // ---- routes ----
    // Ask for a route to (x, z) at `spot`; the router serves a few requests a frame, in turn round the pool.
    let routesWaiting = false;
    const send = (m, x, z, spot) => { routesWaiting = true; m.tx = x; m.tz = z; m.spot = spot; m.pending = true; m.reached = false; };
    // To a spot: a seat-like one by its approach, any other to the spot itself.
    const go = (m, s) => { const a = approach(s); send(m, a.x, a.z, s); };
    const planOne = () => {
      for (let k = 0; k < members.length; k++) {
        const m = members[(cursor + k) % members.length];
        if (!m.pending) continue;
        cursor = (m.index + 1) % members.length;
        m.pending = false; routes++;
        m.n = paths.find(m.x, m.z, m.tx, m.tz, m.route); m.i = 0;
        // No route: it goes somewhere else instead, letting go of an escort.
        if (m.n === 0) { if (m.partner) cancelEscort(m); m.spot = null; m.job = m.job === "boss" ? "" : m.job; idle(m, 0.5); }
        else { m.state = "walk"; if (m.agent) walkAgent(m); }
        return true;
      }
      routesWaiting = false;
      return false;
    };
    const plan = () => {
      if (!routesWaiting) return;
      const t0 = performance.now();
      for (let k = 0; k < ROUTES_MAX; k++) if (!planOne() || performance.now() - t0 > ROUTE_BUDGET) return;
    };
    // The next spot by the guest's weights, for the high roller the busiest table's rail.
    const guestSpot = m => {
      const rail=quietRail(m);
      if(rail) return rail;
      const d = DEST[m.type];
      let r = m.rand() * d.sum, kind = "stroll";
      for (let k = 0; k < d.kinds.length; k++) { r -= d.weights[k]; if (r < 0) { kind = d.kinds[k]; break; } }
      let s = null;
      if (kind === "rail" && m.type === "highRoller") {
        let best = 0;
        for (let t = 1; t < TABLE_N; t++) if (pots[t] > pots[best]) best = t;
        s = freeIn(m, railsBy[best]);
      }
      if (!s && kind !== "stroll") s = freeIn(m, byKind[kind]);
      return s || freeStroll(m);
    };
    // The waiter's loop: the Whale Watch pickup, then rail spots at three different tables, 4 s at each.
    const serveStop = m => {
      if (m.loop === 0) {
        m.stops[0] = nearest(byKind.bar, BL.pokerTerrace.serviceX, -31.95) || nearest(byKind.stool, m.x, m.z);
        if(!spotFree(m.stops[0],m)) return null;
        let a = -1, b = -1;
        for (let k = 1; k < 4; k++) {
          let t = Math.floor(m.rand() * TABLE_N);
          for (let n = 0; n < TABLE_N && (t === a || t === b || !railsBy[t].length); n++) t = (t + 1) % TABLE_N;
          const rails = railsBy[t];
          m.stops[k] = rails[Math.floor(m.rand() * rails.length)];
          if (k === 1) a = t; else b = t;
        }
      }
      return m.stops[m.loop];
    };
    // Security's post: a free door or rope, else a stroll.
    const postSpot = m => {
      const doors = byKind.door, ropes = byKind.rope, n = doors.length + ropes.length, start = Math.floor(m.rand() * n);
      for (let k = 0; k < n; k++) { const i = (start + k) % n, s = i < doors.length ? doors[i] : ropes[i - doors.length]; if (s !== m.spot && spotFree(s, m)) return s; }
      return freeStroll(m);
    };
    // Where to go next, by type.
    const next = m => {
      m.stuck = 0; m.game = -1;
      if (m.partner) cancelEscort(m);
      if (m.job !== "boss") m.table = -1;
      let s;
      if (m.type === "waiter") { m.job = "serve"; s = serveStop(m); }
      else if (m.type === "security") { m.job = "post"; s = postSpot(m); }
      else if (m.type === "pitBoss") {
        s = m.job === "boss" ? freeIn(m, railsBy[m.table]) || railsBy[m.table][0] || null : null;
        if (!s) { m.job = "post"; s = POST; }
      } else { m.job = ""; s = guestSpot(m); }
      if(s) go(m, s); else idle(m,2+m.rand());
    };
    // At the end of its route: `reached` when the route ended at the target, else it stopped short of it and goes on.
    const arrive = m => {
      const last = (m.n - 1) * 2, s = m.spot;
      m.reached = near(m.route[last], m.route[last + 1], m.tx, m.tz, REACH);
      if (m.job === "fetch") { escortGo(m); return; }
      if (m.job === "escort") { if (m.partner) m.partner.partner = null; m.partner = null; m.job = ""; next(m); return; }
      if (!m.reached || !s) {
        if (m.job === "escorted") { if (m.partner) cancelEscort(m); m.job = ""; }
        idle(m, m.reached ? 2 + m.rand() * 4 : 0.5);
        return;
      }
      if (m.job === "serve") {
        m.loop=(m.loop+1)%4;
        settle(m, s.yaw, "serve", SERVE);
      }
      else if (m.job === "post") settle(m, s.yaw, "post", m.type === "security" ? 60 + 30 * m.rand() : Infinity);
      else if (m.job === "boss") { m.table = s.table; settle(m, s.yaw, "watch", Infinity); }
      else if (m.job === "escorted" || SEAT_Y[s.kind] !== undefined) sitDown(m, s, m.job === "escorted" ? ESCORT_SIT : 15 + 25 * m.rand());
      else if (s.kind === "game") { m.table = -1; m.game = s.game; settle(m, s.yaw, "watch", 18 + 24 * m.rand()); }
      else if (s.kind === "rail" || s.kind === "cage" || s.kind === "rope") { m.table = s.table; settle(m, s.yaw, "watch", s.kind === "cage" ? 5 + 4 * m.rand() : 6 + 14 * m.rand()); }
      else if (s.kind === "glass") settle(m, s.yaw, "watch", 8 + 12 * m.rand());
      else if (s.kind === "group" || s.kind === "bar") settle(m, s.yaw, "chat", s.kind === "group" ? 10 + 15 * m.rand() : 6 + 10 * m.rand());
      else idle(m, 2 + m.rand() * 4);
    };
    // Straight to (x, z) over `seconds`, eased, with no walkable test, then into state `next`: a seat's last gap.
    const slideTo = (m, x, z, yaw, seconds, next) => {
      const s = m.slide;
      s.fromX = m.x; s.fromZ = m.z; s.toX = x; s.toZ = z; s.fromYaw = m.yaw; s.toYaw = yaw; s.t = 0; s.time = seconds; s.next = next;
      m.state = "slide"; m.pending = false; m.n = 0;
    };
    const slideIn = (m, x, z, yaw, seconds, next) => { m.backX = m.x; m.backZ = m.z; slideTo(m, x, z, yaw, seconds, next); };
    const slideOut = (m, seconds, next) => slideTo(m, m.backX, m.backZ, Math.atan2(m.backX - m.x, m.backZ - m.z), seconds, next);
    const walkAgent = m => { m.waypoint[0].x = m.route[m.i * 2]; m.waypoint[0].z = m.route[m.i * 2 + 1]; m.agent.walk(m.waypoint); m.agent.setGait("upright"); };
    // Sitting down blends from where the route ended onto the seat in 0.4 s, and standing up back the same way.
    const sitDown = (m, s, seconds) => {
      // `seatY` is where the hip comes to rest: the seat's top and the sitter's lift over it.
      m.seatY = (SEAT_Y[s.kind] ?? FLOOR_SEAT) + sitLift(m); m.clock = seconds;
      slideIn(m, s.x, s.z, s.yaw, SIT_BLEND, "sit"); m.slide.seat = 1;
    };
    const standUp = m => {
      if (m.job === "escorted") { m.job = ""; m.stumbles = 0; if (m.partner) cancelEscort(m); }
      slideOut(m, SIT_BLEND, "idle"); m.slide.seat = -1;
    };

    // ---- the drunk's escort ----
    // After his third stumble the nearest security comes over, walks him to a bar stool to sober up, and goes back to its post once he is on his way to the seat's end of the route.
    // It comes up on his far side from that seat, so he never walks through it as they set off.
    const escortTo = d => nearest(byKind.stool, d.x, d.z);
    const startEscort = d => {
      let sec = null, best = Infinity;
      for (let k = 0; k < members.length; k++) {
        const o = members[k];
        if (o.type !== "security" || !o.on || !o.root || o.partner) continue;
        const dd = (o.x - d.x) ** 2 + (o.z - d.z) ** 2;
        if (dd < best) { best = dd; sec = o; }
      }
      if (!sec) { d.stumbles = 0; return; }
      d.partner = sec; sec.partner = d; d.job = "wait"; d.spot = null; d.n = 0; d.pending = false; d.state = "escort";
      const to = escortTo(d), dx = d.x - to.x, dz = d.z - to.z, l = Math.hypot(dx, dz) || 1;
      sec.job = "fetch"; send(sec, d.x + dx / l * 1.1, d.z + dz / l * 1.1, null);
    };
    const escortGo = sec => {
      const d = sec.partner;
      d.job = "escorted"; go(d, escortTo(d));
      sec.job = "await"; settle(sec, sec.yaw, "escort", 0);
    };
    // Once the drunk has his route, security walks the same one behind him.
    const follow = sec => {
      const d = sec.partner;
      if (d.state !== "walk" || d.pending || d.job !== "escorted") return;
      sec.route.set(d.route); sec.n = d.n; sec.i = 0; sec.tx = d.tx; sec.tz = d.tz; sec.spot = null;
      sec.job = "escort"; sec.state = "walk"; sec.stuck = 0; walkAgent(sec);
    };
    const cancelEscort = m => {
      const o = m.partner, d = m.type === "drunk" ? m : o, sec = d === m ? o : m;
      m.partner = o.partner = null; d.stumbles = 0; d.job = sec.job = "";
      if (o === sec) next(sec);
      else if (o.state === "escort") idle(o, 0.5);
    };

    // ---- giving way ----
    // Whether a body of radius r at (x, z) stands within `LOOK` m ahead of m along (ux, uz).
    const inPath = (m, ux, uz, x, z, r) => {
      const rx = x - m.x, rz = z - m.z, t = rx * ux + rz * uz;
      return t > 0 && t <= LOOK + r && Math.abs(rx * uz - rz * ux) < r + m.bodyRadius;
    };
    // The others' bodies, then the members bucketed in the 3 by 3 cells round m: `LOOK` plus two bodies' radii is
    // under a cell, so nothing in its path stands further out.
    const blocked = (m, ux, uz) => {
      const bodies = others();
      for (let k = 0; k < bodies.length; k++) if (inPath(m, ux, uz, bodies[k].x, bodies[k].z, bodies[k].radius)) return true;
      const ci = Math.min(GCOLS - 1, Math.max(0, Math.floor((m.x - GX0) / GRID))), cj = Math.min(GROWS - 1, Math.max(0, Math.floor((m.z - GZ0) / GRID)));
      for (let j = Math.max(0, cj - 1); j <= Math.min(GROWS - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(GCOLS - 1, ci + 1); i++) {
        for (let k = cellHead[j * GCOLS + i]; k >= 0; k = cellNext[k]) {
          const o = members[k];
          if (o === m || o === m.partner || !o.on || !o.root || (o.rank > m.rank || o.rank === m.rank && o.index > m.index)) continue;
          if (inPath(m, ux, uz, o.x, o.z, o.bodyRadius)) return true;
        }
      }
      return false;
    };
    // Stopped: after `WAIT` it asks for the route again, after twice that it goes somewhere else.
    const hold = (m, dt) => {
      const was = m.stuck;
      m.stuck += dt;
      if (m.stuck >= 2 * WAIT) next(m);
      else if (was < WAIT && m.stuck >= WAIT) send(m, m.tx, m.tz, m.spot);
    };

    // ---- speech and reactions ----
    // A line from the member's type, only while fewer than two crowd bubbles are up and its own is down.
    const sayLine = (m, line) => {
      if (bubbles >= BUBBLES || m.talk > 0 || !withinEarshot(m)) return false;
      if (m.agent) fx.sayAt(m.x, 2.1, m.z, line, SAY); else fx.say(m, line, SAY);
      m.talk = TALK; bubbles++;
      return true;
    };
    const speak = m => { const lines = LINES[m.type]; return bubbles < BUBBLES && m.talk <= 0 && sayLine(m, lines[Math.floor(m.rand() * lines.length)]); };
    // The guests watching table t cheer or put a hand to their head, and one of them says something.
    const react = (t, cheer) => {
      let said = false;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!m.on || !m.root || m.agent || m.state !== "watch" || m.table !== t) continue;
        if (cheer) m.cheer = CHEER; else m.gasp = GASP;
        if (!said) said = speak(m);
      }
    };
    // ---- the gaming tables ----
    // Whether m stands watching gaming table g.
    const atGame = (m, g) => m.on && m.root && !m.agent && m.game === g && m.state === "watch";
    // A cue from gaming table g to the guests standing at it (see `GAME`), lasting `seconds` where it lasts; returns how
    // many took it (for a bet, how many reached in).
    const gameCue = (g, cue, seconds) => {
      let n = 0, cheered = 0;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!atGame(m, g)) continue;
        if (cue === GAME.BET) { if (m.rand() < 0.75) { m.bet = seconds; n++; } continue; }
        n++;
        if (cue === GAME.LEAN) m.gameLean = seconds;
        else if (cue === GAME.CHEER) m.cheer = CHEER;
        else if (cue === GAME.GROAN) m.gasp = GASP;
        else if (cue === GAME.SPLIT) {
          if (cheered < 1 || cheered < 2 && m.rand() < 0.35) { m.cheer = CHEER; cheered++; }
          else if (m.rand() < 0.5) m.gasp = GASP; else m.shrug = SHRUG_TIME;
        } else if ((cue === GAME.SHAKE || cue === GAME.TOSS) && m.spot && m.spot.role === "shooter") {
          if (cue === GAME.SHAKE) m.shake = seconds; else { m.shake = 0; m.toss = TOSS; }
        } else if (cue === GAME.SHAKE || cue === GAME.TOSS) n--;
      }
      return n;
    };
    // One guest at gaming table g says `line` (one cheering, when `cheering`, if any is), within the bubbles' cap.
    const gameSay = (g, line, cheering) => {
      let pick = null;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!atGame(m, g) || m.talk > 0 || !withinEarshot(m)) continue;
        if (!pick || cheering && m.cheer > 0 && !(pick.cheer > 0)) pick = m;
      }
      return !!pick && sayLine(pick, line);
    };
    // The guest standing at gaming table g's shooter's place, or null; whether its place `slot` is taken; how many stand at it.
    const gameShooter = g => { for (let k = 0; k < members.length; k++) { const m = members[k]; if (atGame(m, g) && m.spot && m.spot.role === "shooter") return m; } return null; };
    const gameAt = (g, slot) => { for (let k = 0; k < members.length; k++) { const m = members[k]; if (atGame(m, g) && m.spot && m.spot.slot === slot) return true; } return false; };
    const gameCount = g => { let n = 0; for (let k = 0; k < members.length; k++) if (atGame(members[k], g)) n++; return n; };
    // A big pot: the pit boss walks to that table's rail and watches until the hand is over.
    const bossTo = (t, hand) => {
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (m.type !== "pitBoss" || !m.on || !m.root || m.job === "boss") continue;
        m.job = "boss"; m.table = t; m.hand = hand; next(m);
      }
    };
    const poll = () => {
      for (let t = 0; t < TABLE_N; t++) {
        publicState(t, view);
        const pot = view.pot, phase = view.phase, hand = view.hand, winner = view.winner, allIn = view.allIn, playing = phase !== "waiting";
        live[t] = playing ? 1 : 0;
        if (playing && pot >= BIG_POT && bigHand[t] !== hand) { bigHand[t] = hand; bossTo(t, hand); }
        if (playing && allIn && allInHand[t] !== hand) { allInHand[t] = hand; react(t, false); }
        if (hand === hands[t] && winners[t] < 0 && winner >= 0) react(t, true);
        pots[t] = pot; hands[t] = hand; winners[t] = winner;
      }
    };
    // Whether table t's hand is a big pot still being played: not won, and not cancelled back to waiting.
    const bigLive = t => t >= 0 && live[t] === 1 && bigHand[t] === hands[t] && winners[t] < 0;

    // ---- poses ----
    // The body leaned forward by `lean` from the hips: the torso turns, and the head and arms, which hang from the
    // root beside it, move round the torso's pivot with it.
    const leanBody = (m, lean) => {
      const p = m.parts, r = m.rest, c = Math.cos(lean), s = Math.sin(lean), ty = r[0], tz = r[1];
      p.torso.rotation.x = lean;
      p.head.position.y = ty + (r[2] - ty) * c - (r[3] - tz) * s; p.head.position.z = tz + (r[2] - ty) * s + (r[3] - tz) * c;
      p.armR.position.y = ty + (r[4] - ty) * c - (r[5] - tz) * s; p.armR.position.z = tz + (r[4] - ty) * s + (r[5] - tz) * c;
      p.armL.position.y = ty + (r[6] - ty) * c - (r[7] - tz) * s; p.armL.position.z = tz + (r[6] - ty) * s + (r[7] - tz) * c;
    };
    const roll = (m, angle) => { const p = m.parts; p.torso.poseLean = p.head.poseLean = p.armR.poseLean = p.armL.poseLean = angle; };
    // The type's style over the gait the crew posed, walking or standing, then the reactions: leaning in, both arms up
    // for a cheer (settling back as the crew's does), the free hand to the head at an all in, and in a group or at the
    // bar the free hand talking now and then.
    const style = (m, walking) => {
      const p = m.parts, ph = m.phase, swing = walking ? Math.sin(ph) : 0;
      let lean = 0, headX = 0;
      m.root.rotation.z = 0;
      if (m.type === "highRoller") {
        lean = -0.08;
        p.armR.rotation.x = -0.2 - swing * 0.06; p.armL.rotation.x = -0.2 + swing * 0.06;
      } else if (m.type === "businessman") {
        lean = 0.12; p.armR.rotation.x = -0.05;
      } else if (m.type === "lady") {
        p.legR.rotation.x *= 0.55; p.legL.rotation.x *= 0.55;
        m.root.rotation.z = 0.04 * swing;
      } else if (m.type === "drunk") {
        const w = m.cycle * TAU / DRUNK_PERIOD;
        roll(m, (m.stagger > 0 ? 0.4 : 0.18) * Math.sin(w));
        p.head.rotation.z = 0.22 * Math.sin(w * 1.3 + 1); headX = 0.12;
      }
      if (!walking && m.state === "chat") {
        const g = Math.max(0, Math.sin(m.gesture));
        p.armL.rotation.x += -0.55 * g * g; headX -= 0.06 * g;
      }
      lean += m.lean;
      // At a gaming table, leaning on its rail, further in while the wheel slows or the dice fly.
      if (!walking && m.game >= 0 && m.state === "watch") {
        const rest = .5 + .5*Math.sin(m.gesture*.4 + m.index);
        lean += GAME_LEAN + .08*rest + (m.gameLean > 0 ? GAME_IN : 0);
        p.armL.rotation.x -= .22 + .36*rest;
      }
      leanBody(m, lean);
      if (m.betK > 0.01) p.armR.rotation.x += (BET_ARM - p.armR.rotation.x) * m.betK;
      if (m.shrugK > 0.01) { p.armR.rotation.z -= SHRUG * m.shrugK; p.armL.rotation.z += SHRUG * m.shrugK; p.armL.rotation.x += (-0.7 - p.armL.rotation.x) * m.shrugK; headX += 0.1 * m.shrugK; }
      // The shooter shakes the dice overhead, then throws them down the table.
      if (m.shake > 0) p.armR.rotation.x = -2.3 + 0.28 * Math.sin(m.shake * 30);
      else if (m.toss > 0) { const k = 1 - m.toss / TOSS; p.armR.rotation.x = -2.3 + 1.5 * k * k * (3 - 2 * k); }
      if (m.armUp > 0.01) {
        const k = m.armUp, wave = Math.sin(m.cheer * 14) * 0.35;
        p.armR.rotation.x += (-2.6 + wave - p.armR.rotation.x) * k; p.armL.rotation.x += (-2.6 - wave - p.armL.rotation.x) * k;
        headX -= 0.15 * k;
      } else if (m.handUp > 0.01) {
        p.armL.rotation.x += (-2.7 - p.armL.rotation.x) * m.handUp;
        headX += 0.15 * m.handUp;
      }
      // A glass stays upright whatever the arm holding it does.
      if (m.traits.outfit.item === "glass" || m.traits.outfit.item === "martini") p.club.rotation.x = -p.armR.rotation.x;
      p.head.rotation.x = headX;
    };
    const stand = m => { Cr.poseGait(m, GAIT.stand); style(m, false); };
    // Seated by k (0 standing, 1 sitting): the legs forward as the room's bots sit, the hips at the seat's height, a
    // short skirt tipped over the lap.
    const sitPose = (m, k) => {
      const p = m.parts;
      BL.pokerModels.bendKnees(p,k>=.55);
      p.legR.rotation.x += (SIT_LEGS - p.legR.rotation.x) * k; p.legL.rotation.x += (SIT_LEGS - p.legL.rotation.x) * k;
      m.root.position.y = m.baseY + (m.seatY - m.baseY) * k;
      if (p.skirt) p.skirt.rotation.x = SKIRT_SIT * k;
    };
    const faceTo = (m, dt) => { m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, turnTo(m.yaw, m.want))); m.root.rotation.y = m.yaw; };
    // A footfall: the ladies' heels each step.
    const stepped = m => {
      const k = Math.floor(m.phase / Math.PI);
      if (k === m.step) return;
      m.step = k;
      if (onStep && m.type === "lady") onStep("heel", m.x, m.z);
    };

    // ---- walking ----
    const walkCaveman = (m, dt) => {
      if (m.pending) { stand(m); return; }
      const tx = m.route[m.i * 2], tz = m.route[m.i * 2 + 1], d = Math.hypot(tx - m.x, tz - m.z);
      const ux = d > 1e-6 ? (tx - m.x) / d : Math.sin(m.yaw), uz = d > 1e-6 ? (tz - m.z) / d : Math.cos(m.yaw);
      const v = m.speed;
      if (blocked(m, ux, uz)) { hold(m, dt); stand(m); return; }
      let step = v * dt, nx = m.x, nz = m.z, i = m.i;
      while (step > 0 && i < m.n) {
        const ax = m.route[i * 2] - nx, az = m.route[i * 2 + 1] - nz, left = Math.hypot(ax, az);
        if (left <= step) { nx += ax; nz += az; step -= left; i++; } else { nx += ax / left * step; nz += az / left * step; step = 0; }
      }
      if (!walkable(m.x, m.z, nx, nz, 0, 2, STEP)) { hold(m, dt); stand(m); return; }
      if (nx !== m.x || nz !== m.z) m.stuck = 0;
      m.x = nx; m.z = nz; m.i = i;
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, turnTo(m.yaw, Math.atan2(ux, uz))));
      m.phase += dt * v * STRIDE;
      if (m.phase > 2 * TAU) { m.phase -= 2 * TAU; m.step -= 4; }
      Cr.poseGait(m, GAIT.walk, m.phase);
      style(m, true);
      stepped(m);
      // The drunk weaves across his route, never into anything.
      let ox = 0, oz = 0;
      if (m.type === "drunk") {
        m.cycle = (m.cycle + dt) % DRUNK_PERIOD;
        const o = DRUNK_SWAY * Math.sin(m.cycle * TAU / DRUNK_PERIOD), sx = m.x + uz * o, sz = m.z - ux * o;
        m.sway = Mth.damp(m.sway, walkable(sx, sz, sx, sz, 0, 2, STEP) ? 1 : 0, 4, dt);
        ox = uz * o * m.sway; oz = -ux * o * m.sway;
      }
      m.root.position.x = m.x + ox; m.root.position.z = m.z + oz; m.root.rotation.y = m.yaw;
      if (m.i >= m.n) arrive(m);
    };
    const walkGorilla = (m, dt) => {
      const a = m.agent, o = m.partner;
      // Escorting, security keeps a step behind the drunk while he walks: it stops within `TRAIL` of him and walks on
      // only once he is `TRAIL_GO` ahead, so it does not stop and start at every step of his slower pace.
      m.trailing = m.job === "escort" && !!o && o.state === "walk" && near(m.x, m.z, o.x, o.z, m.trailing ? TRAIL_GO : TRAIL);
      if (m.trailing) { if (a.walking) a.place(m.x, m.z, a.heading); }
      else if (!m.pending) {
        const tx = m.route[m.i * 2], tz = m.route[m.i * 2 + 1], d = Math.hypot(tx - m.x, tz - m.z);
        if (!a.walking && d < ARRIVE) {
          m.i++;
          if (m.i >= m.n) { arrive(m); a.update(dt); return; }
          walkAgent(m);
        }
        const wx = m.route[m.i * 2] - m.x, wz = m.route[m.i * 2 + 1] - m.z, w = Math.hypot(wx, wz) || 1;
        if (blocked(m, wx / w, wz / w)) { if (a.walking) a.place(m.x, m.z, a.heading); hold(m, dt); }
        // Not walking short of its waypoint: walled in on the last step, or let go after giving way. It tries again.
        else if (!a.walking) { hold(m, dt); if (!m.pending && m.state === "walk") walkAgent(m); }
        // The agent re-rolls its gait as it goes; staff keep upright.
        if (a.walking) a.setGait("upright");
      }
      a.update(dt);
      const p = a.root.position;
      if (p.x !== m.x || p.z !== m.z) m.stuck = 0;
      m.x = p.x; m.z = p.z; m.yaw = a.heading;
    };
    // A caveman's walk, paused by the drunk's stumble every so often.
    const walk = (m, dt) => {
      if (m.agent) { walkGorilla(m, dt); return; }
      if (!m.pending && m.job === "" && m.type === "drunk") {
        if (m.stagger > 0) {
          m.stagger -= dt; m.cycle = (m.cycle + dt * 1.5) % DRUNK_PERIOD;
          stand(m);
          if (m.stagger <= 0 && m.stumbles >= STUMBLES) startEscort(m);
          return;
        }
        m.walked += dt;
        if (m.walked >= m.restAt) {
          m.walked = 0; m.restAt = 20 + 20 * m.rand(); m.stagger = STAGGER; m.stumbles++; stand(m); return;
        }
      }
      walkCaveman(m, dt);
    };
    const slideStep = (m, dt) => {
      const s = m.slide;
      s.t = Math.min(s.time, s.t + dt);
      const k = s.time > 0 ? s.t / s.time : 1, e = k * k * (3 - 2 * k);
      place(m, s.fromX + (s.toX - s.fromX) * e, s.fromZ + (s.toZ - s.fromZ) * e, s.fromYaw + turnTo(s.fromYaw, s.toYaw) * e);
      if (m.agent) m.agent.update(dt);
      else { stand(m); if (s.seat) sitPose(m, s.seat > 0 ? e : 1 - e); }
      if (k >= 1) { s.seat = 0; m.state = s.next; if (s.next === "idle") idle(m, 1 + m.rand() * 2); }
    };
    // Standing at its place: a caveman turns to face it and holds the pose, a gorilla stands as its agent does.
    const standing = (m, dt) => { if (m.agent) m.agent.update(dt); else { faceTo(m, dt); stand(m); } };

    // ---- the lounges ----
    // Who a resident heeds: the nearest member talking within `HEED_TALK`, else the nearest walking within `HEED_PASS`,
    // else the visitor within `HEED_PASS`; found through the give-way grid, the cells within `HEED_TALK`.
    const heed = (r, vis) => {
      const s = r.spot, ci = Math.floor((s.x - GX0) / GRID), cj = Math.floor((s.z - GZ0) / GRID), reach = Math.ceil(HEED_TALK / GRID);
      let best = -1, bestD = Infinity, talking = false;
      for (let j = Math.max(0, cj - reach); j <= Math.min(GROWS - 1, cj + reach); j++) for (let i = Math.max(0, ci - reach); i <= Math.min(GCOLS - 1, ci + reach); i++) {
        for (let k = cellHead[j * GCOLS + i]; k >= 0; k = cellNext[k]) {
          const o = members[k], d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2, says = o.talk > 0;
          if (says ? d > HEED_TALK * HEED_TALK : o.state !== "walk" || d > HEED_PASS * HEED_PASS) continue;
          if (says && !talking || says === talking && d < bestD) { best = k; bestD = d; talking = says; }
        }
      }
      r.looking = true;
      if (best >= 0) { r.lookX = members[best].x; r.lookZ = members[best].z; }
      else if (vis && near(vis.x, vis.z, s.x, s.z, HEED_PASS)) { r.lookX = vis.x; r.lookZ = vis.z; }
      else r.looking = false;
    };
    const resident = (r, dt, vis, lookMix) => {
      const p = r.parts, s = r.spot;
      if ((r.heed -= dt) <= 0) { r.heed = HEED_EVERY; heed(r, vis); }
      const want = r.looking ? Math.max(-HEED_TURN, Math.min(HEED_TURN, turnTo(s.yaw, Math.atan2(r.lookX - s.x, r.lookZ - s.z)))) : 0;
      r.look = Mth.lerp(r.look, want, lookMix);
      p.head.rotation.y = r.look;
      // A sip: up over the first third, at the lips the middle, down the last; the head tips back as she drinks.
      let up = 0;
      if (r.sipping >= 0) {
        r.sipping += dt;
        const k = r.sipping / SIP;
        up = k < 1 / 3 ? k * 3 : k < 2 / 3 ? 1 : Math.max(0, 3 - k * 3);
        up = up * up * (3 - 2 * up);
        if (k >= 1) { r.sipping = -1; r.sip = SIP_GAP * (1 + r.rand()); }
      } else if ((r.sip -= dt) <= 0) r.sipping = 0;
      p.armR.rotation.x = SIP_REST + (SIP_UP - SIP_REST) * up;
      p.club.rotation.x = -p.armR.rotation.x + 0.5 * up * up;
      p.head.rotation.x = -0.18 * up;
    };

    const update = (dt, elapsed = 0, eye = null) => {
      listener=eye?.position || eye;
      if (buildPending) {
        const t0 = performance.now();
        do { buildPending = buildNext(); } while (buildPending && performance.now() - t0 < BUILD_BUDGET);
      }
      bucket(dt);
      pollClock += dt;
      if (pollClock >= POLL) { pollClock = 0; poll(); }
      plan();
      const vis = visitor && visitor();
      // All guests share the same time step and gesture rates.
      const cheerMix = Mth.damp(0, 1, 10, dt), handMix = Mth.damp(0, 1, 8, dt);
      const leanMix = Mth.damp(0, 1, 6, dt), lookMix = Mth.damp(0, 1, 3, dt);
      let crowd = 0, walking = 0, sitting = 0, smokers = 0, built = 0;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (m.root) built++;
        if (!m.on || !m.root) continue;
        crowd++;
        if (m.cheer > 0) m.cheer -= dt;
        if (m.gasp > 0) m.gasp -= dt;
        m.gesture += dt * 1.4;
        m.armUp = Mth.lerp(m.armUp, m.cheer > 0 ? 1 : 0, cheerMix); m.handUp = Mth.lerp(m.handUp, m.gasp > 0 ? 1 : 0, handMix);
        if (m.game >= 0 || m.betK > 0.001 || m.shrugK > 0.001 || m.shake > 0 || m.toss > 0) {
          if (m.gameLean > 0) m.gameLean -= dt;
          if (m.bet > 0) m.bet -= dt;
          if (m.shrug > 0) m.shrug -= dt;
          if (m.shake > 0) m.shake -= dt;
          if (m.toss > 0) m.toss -= dt;
          m.betK = Mth.lerp(m.betK, m.bet > 0 ? 1 : 0, handMix); m.shrugK = Mth.lerp(m.shrugK, m.shrug > 0 ? 1 : 0, handMix);
        }
        m.lean = Mth.lerp(m.lean, m.state === "watch" && bigLive(m.table) ? LEAN_IN : 0, leanMix);
        if (m.greet > 0) m.greet -= dt;
        else if (vis && near(m.x, m.z, vis.x, vis.z, GREET_R) && speak(m)) m.greet = GREET_EVERY;
        if (m.type === "drunk" && (m.mutter -= dt) <= 0) { m.mutter = 12 + 13 * m.rand(); speak(m); }
        const st = m.state;
        if (st === "walk") { walking++; walk(m, dt); }
        else if (st === "idle") {
          m.clock -= dt;
          if (m.clock <= 0 && !m.pending) next(m);
          if (m.agent) m.agent.update(dt); else stand(m);
        } else if (st === "slide") slideStep(m, dt);
        else if (st === "sit") {
          sitting++; m.clock -= dt;
          stand(m); sitPose(m, 1);
          if (m.clock <= 0) standUp(m);
        } else if (st === "watch") {
          // Leaning in over a big pot, a guest stays till the hand is won; the pit boss goes back when it is over.
          if (!bigLive(m.table)) m.clock -= dt;
          if (m.job === "boss" && (!live[m.table] || hands[m.table] !== m.hand || winners[m.table] >= 0)) { m.job = ""; next(m); }
          else if (m.clock <= 0 && !m.pending) next(m);
          standing(m, dt);
        } else if (st === "post" || st === "serve" || st === "chat") {
          const handoff=st==="serve" && m.clock>SERVE-1;
          m.clock -= dt;
          if(handoff && m.clock<=SERVE-1){
            if(m.spot===m.stops[0]) {
              for(const glass of m.drinks) glass.visible=true;
            } else if(m.spot===m.stops[1]) m.drinks[0].visible=false;
            else if(m.spot===m.stops[2]) m.drinks[1].visible=false;
          }
          if (m.clock <= 0 && !m.pending) next(m);
          standing(m, dt);
        } else if (st === "escort") {
          if (m.job === "await") follow(m);
          if (m.agent) m.agent.update(dt); else stand(m);
        }
        // Whatever the agent's arms do, a waiter's right one holds the tray out level, however its chest leans.
        if (m.type === "waiter") m.parts.armR.rotation.x = C.TRAY_ARM - m.parts.armR.parent.rotation.x;
        if (m.smoke) { m.smoke.update(elapsed, m.parts.cigar, eye, m.root); smokers++; }
      }
      let lounge = 0;
      for (let k = 0; k < residents.length; k++) {
        const r = residents[k];
        if (!r.root || !r.spot) continue;
        lounge++;
        resident(r, dt, vis, lookMix);
      }
      stat.crowd = crowd; stat.walking = walking; stat.sitting = sitting; stat.routes = routes; stat.crowdBubbles = bubbles;
      stat.lounge = lounge; stat.smokers = smokers; stat.built = built;
    };
    const liveGeometry = set => { for (let k = 0; k < members.length; k++) if (members[k].agent) members[k].agent.liveGeometry(set); };
    const dispose = () => {
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        park(m);
        if (m.smoke) { m.smoke.dispose(); m.smoke = null; }
        if (m.agent) m.agent.dispose();
        else if (m.root && m.root.parent) S.removeChild(m.root.parent, m.root);
        m.root = m.parts = m.agent = null; m.on = false;
      }
      for (let k = 0; k < residents.length; k++) {
        const r = residents[k];
        if (r.root && r.root.parent) S.removeChild(r.root.parent, r.root);
        r.root = r.parts = null;
      }
    };
    // A guest walks back in through the arrival mirror (Ask Ooga To Move's thrown-out guest come home): of the guests
    // on the floor with nothing in hand (no escort, seat or job), the one farthest from `eye` stands at (x, z) facing
    // `yaw`, a hand up to dust itself off and a word, then goes about its evening. Returns it, or null.
    const returnGuest = (x, z, yaw, eye) => {
      let best = null, bestD = -1;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!m.on || !m.root || m.agent || m.partner || m.job || m.pending || m.type === "drunk" || (m.state !== "walk" && m.state !== "idle" && m.state !== "watch" && m.state !== "chat")) continue;
        const d = eye ? (m.x - eye.x) ** 2 + (m.z - eye.z) ** 2 : k;
        if (d > bestD) { bestD = d; best = m; }
      }
      if (!best) return null;
      best.n = 0; best.spot = null; best.table = -1; best.game = -1;
      place(best, x, z, yaw); idle(best, 2.2);
      best.gasp = GASP;
      if (bubbles < BUBBLES && best.talk <= 0) { fx.say(best, RETURN_LINE, SAY); best.talk = TALK; bubbles++; }
      return best;
    };
    setSpots(spots);
    setCap(cap);
    return { update, setCap, liveGeometry, stats: () => stat, dispose, members, residents, send, approach, returnGuest, find: paths.find, gameCue, gameSay, gameShooter, gameAt, gameCount };
  };

  BL.pokerCrowd = { GAME, router, create, smoke, smokeTargets, SMOKE: Object.freeze({ WISP: SMOKE_WISP, get B() { return smokeTargets().length / 2; }, GRID: SMOKE_GRID, CYCLE: SMOKE_CYCLE, FORM: SMOKE_FORM, HOLD: SMOKE_HOLD, GONE: SMOKE_GONE, SCALE: SMOKE_SCALE, LIFT: SMOKE_LIFT }) };
})();
