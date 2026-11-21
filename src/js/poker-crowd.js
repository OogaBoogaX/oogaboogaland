// The Ember Den's crowd: its router, then the pool of members walking, watching, sitting and reacting. The router: a lattice of half-metre cells over the room, open where a body of
// `PROBE` may stand on the floor `walkable` answers for, searched 8-way by A* (octile heuristic, no corner cutting,
// typed arrays and a binary heap, as `scene-arcade.js`'s `findPath`) and pulled taut with `walkable` sweeps into at
// most `WAYPOINTS` waypoints. `rebuild` reads the floor again after `pokerModels.setFloor`. Nothing allocates per route.
(() => {
  "use strict";
  const BL = window.BL, S = BL.scene;
  const CELL = 0.5, X0 = -23, Z0 = -35.5, GW = 92, GH = 142, GN = GW * GH, NEAR = 3, WAYPOINTS = 24;
  const PROBE = { bodyRadius: 0.7 }, LEG = { bodyRadius: 0.4 };
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  const cellX = c => X0 + (c % GW + 0.5) * CELL, cellZ = c => Z0 + (Math.floor(c / GW) + 0.5) * CELL;

  const router = walkable => {
    const open = new Uint8Array(GN), cost = new Float32Array(GN), from = new Int32Array(GN), seen = new Uint32Array(GN), done = new Uint32Array(GN);
    const trail = new Int32Array(GN), heap = new Int32Array(GN * 3), f = new Float32Array(GN * 3);
    let search = 0, heapN = 0, cells = 0;
    const rebuild = () => {
      cells = 0;
      for (let c = 0; c < GN; c++) { const x = cellX(c), z = cellZ(c); open[c] = walkable(x, z, x, z, 0, 2, PROBE) ? 1 : 0; cells += open[c]; }
    };
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
      const id = ++search, ti = t % GW, tj = Math.floor(t / GW), cap = heap.length - 8;
      heapN = 0;
      seen[s] = id; cost[s] = 0; from[s] = -1;
      heapPush(s, 0);
      while (heapN > 0) {
        const c = heapPop();
        if (done[c] === id) continue;
        done[c] = id;
        if (c === t) return true;
        const ci = c % GW, cj = Math.floor(c / GW);
        for (let k = 0; k < 8; k++) {
          const ni = ci + DI[k], nj = cj + DJ[k];
          if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
          const nc = nj * GW + ni, g = cost[c] + DC[k];
          if (done[nc] === id || (seen[nc] === id && cost[nc] <= g) || !open[nc]) continue;
          if (k >= 4 && (!open[cj * GW + ni] || !open[nj * GW + ci])) continue;
          seen[nc] = id; cost[nc] = g; from[nc] = c;
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
    // The middle of the open cell nearest (x, z) within 1.5 m into `out`; false with none.
    const snap = (x, z, out) => { const c = nearOpen(x, z); if (c < 0) return false; out.x = cellX(c); out.z = cellZ(c); return true; };
    rebuild();
    return { rebuild, find, ends, snap, get cells() { return cells; } };
  };

  // ---- the pool --------------------------------------------------------------------------------------------------

  // Walking pace (m/s) by type; staff walk at the gorilla's upright pace.
  const SPEED = { highRoller: 0.9, businessman: 1.6, lady: 1.1, cane: 0.55, walker: 0.35, drunk: 0.7 };
  const ITEM = { businessman: true, lady: true, cane: true, drunk: true };
  const BUILD_EVERY = 0.15, TURN = 4, LOOK = 1.1, WAIT = 1.5, REACH = 0.6, ARRIVE = 0.35, STRIDE = 6.5, FULL = 16;
  const WALKER_CYCLE = 1.6, WALKER_LIFT = 0.3, DRUNK_PERIOD = 2.3, DRUNK_SWAY = 0.35, TAU = Math.PI * 2;
  // The cane stands upright on the floor with its arm at `CANE_PLANT` and tips `CANE_TIP` ahead as the arm swings back;
  // the walker's lift raises its arms by `FRAME_LIFT` and the frame with them, up and forward.
  const CANE_PLANT = -0.7, CANE_TIP = -0.65, FRAME_LIFT = 0.4, FRAME_UP = 0.06, FRAME_ON = 0.1;
  const STEP = { bodyRadius: 0.3 }, CLEAR = { x: 0, z: 0 };
  const ground = () => 0, turnTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  // Seats: the height sat on (the floor where a spot has no seat), the 0.4 s blend in and out, the bots' legs.
  const SEAT_Y = { stool: 0.68, sofa: 0.4 }, FLOOR_SEAT = 0.1, SIT_LIFT = 0.06, SIT_BLEND = 0.4, SIT_LEGS = -1.35;
  // Reactions and speech: tables read twice a second, a pot of 400 or more is big, two crowd bubbles at most.
  const POLL = 0.5, BIG_POT = 400, LEAN_IN = 0.2, CHEER = 1.2, GASP = 2, SAY = 2.4, TALK = 2.5, BUBBLES = 2;
  const GREET_R = 2.5, GREET_EVERY = 60, STAGGER = 1.2, STUMBLES = 3, ESCORT_SIT = 30, SERVE = 4, TRAIL = 1.6, TRAIL_GO = 2.4;
  // Where a guest goes next, by weight; a kind the theme lacks falls to a stroll.
  const dest = pairs => Object.freeze({ kinds: pairs.map(p => p[0]), weights: pairs.map(p => p[1]), sum: pairs.reduce((n, p) => n + p[1], 0) });
  const DEST = Object.freeze({
    highRoller: dest([["rail", 5], ["stool", 2], ["stroll", 2], ["rope", 1]]),
    businessman: dest([["cage", 3], ["rail", 3], ["stroll", 3], ["stool", 1]]),
    lady: dest([["stool", 4], ["sofa", 2], ["rail", 2], ["stroll", 2]]),
    cane: dest([["sofa", 3], ["rail", 2], ["stroll", 3]]),
    walker: dest([["sofa", 3], ["rail", 2], ["stroll", 3]]),
    drunk: dest([["stool", 3], ["rail", 2], ["stroll", 4]])
  });
  // The pit boss's post in the middle of the floor.
  const POST = Object.freeze({ kind: "post", x: 0, z: 0, yaw: 0, table: -1 });
  const KINDS = ["rail", "stool", "sofa", "cage", "rope", "door", "stroll"];

  // `create` keeps a fixed pool of the day's sixteen (`castFor(day, 16)`), built one every `BUILD_EVERY` seconds and
  // shown up to the cap: `castFor(day, n)` is a subset of that pool, so a cap change only parks or brings back
  // members. A member walks a route from the router (one `find` a frame across the whole pool),
  // gives way to `others()` and to members ahead of it in `TYPES`, and arrives `reached` or short of its target.
  // Seats are reached by `approach(spot)` and a straight scripted move (`slideIn`, then `slideOut` the same way).
  // What a member does there is its state: `watch` a table, the cage or a rope, `sit`, `rest` on the way, staff at a
  // `post` or a `serve` stop, the drunk waiting for his `escort`. Its only view of a table is `publicState(table, out)`,
  // read from the `out` it passed in: `pot`, `phase`, `hand`, `winner` and `allIn`, nothing else.
  const create = ({ root, fx, walkable, spots, publicState, others, day, cap, onStep = null, visitor = null }) => {
    const C = BL.pokerCrowdModels, M = BL.models, Cr = BL.crew, GAIT = Cr.GAIT, TYPES = C.TYPES, LINES = C.LINES, Mth = BL.math;
    const TABLE_N = BL.pokerModels.TABLES.length;
    const paths = router(walkable), cast = C.castFor(day, FULL);
    const members = cast.map((c, index) => {
      const wp = { x: 0, z: 0 }, rand = Mth.mulberry32(Mth.fnv1a(c.id) + day);
      return {
        id: c.id, type: c.type, rig: c.rig, traits: c.traits, index, rank: TYPES.indexOf(c.type), rand,
        root: null, parts: null, agent: null, x: 0, z: 0, yaw: 0, want: 0, speed: SPEED[c.type] || BL.agent.GAITS.upright.speed,
        state: "parked", on: false, clock: 0, phase: 0, step: 0, cycle: 0, route: new Float32Array(48), n: 0, i: 0,
        spot: null, tx: 0, tz: 0, pending: false, reached: false, stuck: 0, armRZ: 0, armLZ: 0, baseY: 0, bodyRadius: 0.4,
        rest: new Float32Array(8), sway: 0, backX: 0, backZ: 0, frame: null, trailing: false,
        slide: { fromX: 0, fromZ: 0, toX: 0, toZ: 0, fromYaw: 0, toYaw: 0, t: 0, time: 0, next: "", seat: 0 },
        waypoint: [wp], gait: 0, gaitPhase: 0, gaitMix: 0, closeSide: 0, closeBack: false,
        // What it is about: `job` (serve, post, boss, and the escort's fetch, await, escort and escorted), the table it
        // watches and the hand it waits out, its escort partner, the seat's height, the waiter's loop of stops.
        job: "", table: -1, hand: -1, partner: null, seatY: 0, loop: 0, stops: [null, null, null, null],
        lean: 0, cheer: 0, gasp: 0, armUp: 0, handUp: 0, talk: 0, greet: 0, mutter: 12 + 13 * rand(),
        // Walking time to the next rest (cane, walker) or stumble (drunk), the stumble under way and how many so far.
        walked: 0, restAt: c.type === "drunk" ? 20 + 20 * rand() : 8 + 6 * rand(), stagger: 0, stumbles: 0
      };
    });
    let strolls = null, capNow = -1, buildClock = 0, cursor = 0, routes = 0, bubbles = 0, pollClock = 0, railsBy = null;
    const approaches = new Map(), byKind = {};
    const stat = { crowd: 0, walking: 0, sitting: 0, crowdBubbles: 0, routes: 0 };
    // What the crowd last read of each table, and the hand each reaction last fired for.
    const pots = new Float64Array(TABLE_N), hands = new Float64Array(TABLE_N).fill(-1), winners = new Int32Array(TABLE_N).fill(-1);
    const bigHand = new Float64Array(TABLE_N).fill(-1), allInHand = new Float64Array(TABLE_N).fill(-1), live = new Uint8Array(TABLE_N);
    const view = { pot: 0, phase: "waiting", hand: 0, winner: -1, allIn: false };

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
    // Where a route to a seat-like spot (stool, sofa, cage) ends: the spot when one can, else the nearest point round
    // it, on rings a quarter metre apart out to 4 m, that a walker stands on and a route ends at. Worked out for every
    // such spot whenever the spots change, so nothing a frame calls allocates or searches; any other spot is its own.
    const SEATS = { stool: true, sofa: true, cage: true };
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
    };
    setSpots(spots);
    // The spot in `list` at the same place as `s` (a new floor's copy of it), or null.
    const same = (list, s) => {
      for (let k = 0; k < list.length; k++) { const o = list[k]; if (o.kind === s.kind && o.table === s.table && Math.abs(o.x - s.x) < 1e-6 && Math.abs(o.z - s.z) < 1e-6) return o; }
      return null;
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
      if (d.arm) S.addChild(p.armR, S.createNode({ geometry: d.arm }));
      for (const arm of [p.armR, p.armL]) S.addChild(arm, S.createNode({ geometry: d.sleeve }));
    };
    const build = m => {
      const s = freeStroll(m);
      if (m.rig === "gorilla") {
        m.agent = BL.agent.create({ groundAt: ground, walkable, form: "ape", x: s.x, z: s.z, heading: s.yaw, scale: 0.9 });
        m.root = m.agent.root; m.parts = m.agent.parts;
        dressStaff(m);
      } else {
        const model = M.caveman(m.traits), p = model.parts;
        m.root = model.root; m.parts = p; m.baseY = model.root.position.y;
        m.armRZ = p.armR.rotation.z; m.armLZ = p.armL.rotation.z;
        p.gun.visible = false;
        if (p.snack) p.snack.visible = false;
        if (p.jetpack) p.jetpack.visible = false;
        if (p.jetFlame) p.jetFlame.visible = false;
        p.club.visible = !!ITEM[m.type];
        if (m.type === "walker") m.frame = model.root.children.find(n => n.geometry === C.walkingFrame());
        const r = m.rest;
        r[0] = p.torso.position.y; r[1] = p.torso.position.z; r[2] = p.head.position.y; r[3] = p.head.position.z;
        r[4] = p.armR.position.y; r[5] = p.armR.position.z; r[6] = p.armL.position.y; r[7] = p.armL.position.z;
      }
      S.addChild(root, m.root);
      standAt(m, s);
    };
    const park = m => {
      if (m.partner) cancelEscort(m);
      // Its bubble goes with it: a caveman's line is hushed, and the count is released at once.
      if (m.talk > 0) { m.talk = 0; bubbles--; stat.crowdBubbles = bubbles; if (!m.agent) fx.hush(m); }
      m.state = "parked"; m.pending = false; m.n = 0; m.spot = null; m.job = ""; m.table = -1; m.loop = 0; m.slide.seat = 0; m.stagger = 0;
      if (m.root) { m.root.visible = false; if (m.agent) m.agent.place(m.x, m.z, m.yaw); }
    };
    const setCap = n => {
      if (n === capNow) return;
      capNow = n;
      const on = C.castFor(day, n);
      for (let k = 0; k < members.length; k++) {
        const m = members[k], want = on.includes(cast[k]);
        if (want === m.on) continue;
        m.on = want;
        if (!want) park(m);
        else if (m.root) { m.root.visible = true; standAt(m, freeStroll(m)); }
      }
    };

    // ---- routes ----
    // Ask for a route to (x, z) at `spot`; the router serves one request a frame, in turn round the pool.
    const send = (m, x, z, spot) => { m.tx = x; m.tz = z; m.spot = spot; m.pending = true; m.reached = false; };
    // To a spot: a seat-like one by its approach, any other to the spot itself.
    const go = (m, s) => { const a = approach(s); send(m, a.x, a.z, s); };
    const plan = () => {
      for (let k = 0; k < members.length; k++) {
        const m = members[(cursor + k) % members.length];
        if (!m.pending) continue;
        cursor = (m.index + 1) % members.length;
        m.pending = false; routes++;
        m.n = paths.find(m.x, m.z, m.tx, m.tz, m.route); m.i = 0;
        // No route: it goes somewhere else instead, letting go of an escort.
        if (m.n === 0) { if (m.partner) cancelEscort(m); m.spot = null; m.job = m.job === "boss" ? "" : m.job; idle(m, 0.5); }
        else { m.state = "walk"; if (m.agent) walkAgent(m); }
        return;
      }
    };
    // The next spot by the guest's weights, for the high roller the busiest table's rail.
    const guestSpot = m => {
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
    // The waiter's loop: the stool nearest it, then rail spots at three different tables, 4 s at each.
    const serveStop = m => {
      if (m.loop === 0) {
        m.stops[0] = nearest(byKind.stool.length ? byKind.stool : strolls, m.x, m.z);
        let a = -1, b = -1;
        for (let k = 1; k < 4; k++) {
          let t = Math.floor(m.rand() * TABLE_N);
          for (let n = 0; n < TABLE_N && (t === a || t === b || !railsBy[t].length); n++) t = (t + 1) % TABLE_N;
          const rails = railsBy[t];
          m.stops[k] = rails[Math.floor(m.rand() * rails.length)];
          if (k === 1) a = t; else b = t;
        }
      }
      const s = m.stops[m.loop];
      m.loop = (m.loop + 1) % 4;
      return s;
    };
    // Security's post: a free door or rope, else a stroll.
    const postSpot = m => {
      const doors = byKind.door, ropes = byKind.rope, n = doors.length + ropes.length, start = Math.floor(m.rand() * n);
      for (let k = 0; k < n; k++) { const i = (start + k) % n, s = i < doors.length ? doors[i] : ropes[i - doors.length]; if (s !== m.spot && spotFree(s, m)) return s; }
      return freeStroll(m);
    };
    // Where to go next, by type.
    const next = m => {
      m.stuck = 0;
      if (m.partner) cancelEscort(m);
      if (m.job !== "boss") m.table = -1;
      let s;
      if (m.type === "waiter") { m.job = "serve"; s = serveStop(m); }
      else if (m.type === "security") { m.job = "post"; s = postSpot(m); }
      else if (m.type === "pitBoss") {
        s = m.job === "boss" ? freeIn(m, railsBy[m.table]) || railsBy[m.table][0] || null : null;
        if (!s) { m.job = "post"; s = POST; }
      } else { m.job = ""; s = guestSpot(m); }
      go(m, s);
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
      if (m.job === "serve") settle(m, s.yaw, "serve", SERVE);
      else if (m.job === "post") settle(m, s.yaw, "post", m.type === "security" ? 60 + 30 * m.rand() : Infinity);
      else if (m.job === "boss") { m.table = s.table; settle(m, s.yaw, "watch", Infinity); }
      else if (m.job === "escorted" || SEAT_Y[s.kind] !== undefined) sitDown(m, s, m.job === "escorted" ? ESCORT_SIT : 15 + 25 * m.rand());
      else if (s.kind === "rail" || s.kind === "cage" || s.kind === "rope") { m.table = s.table; settle(m, s.yaw, "watch", s.kind === "cage" ? 5 + 4 * m.rand() : 6 + 14 * m.rand()); }
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
      m.seatY = SEAT_Y[s.kind] ?? FLOOR_SEAT; m.clock = seconds;
      slideIn(m, s.x, s.z, s.yaw, SIT_BLEND, "sit"); m.slide.seat = 1;
    };
    const standUp = m => {
      if (m.job === "escorted") { m.job = ""; m.stumbles = 0; if (m.partner) cancelEscort(m); }
      slideOut(m, SIT_BLEND, "idle"); m.slide.seat = -1;
    };
    // Off a seat that is gone, or out of a theme's new fittings: onto the nearest open cell of the lattice.
    const standClear = m => {
      if (!paths.snap(m.x, m.z, CLEAR)) BL.pokerModels.nearestClear(m.x, m.z, LEG, CLEAR);
      m.slide.seat = 0; place(m, CLEAR.x, CLEAR.z, m.yaw);
      if (!m.agent) stand(m);
    };

    // ---- the drunk's escort ----
    // After his third stumble the nearest security comes over, walks him to a sofa (in a cave, the stroll spot
    // furthest from him), and goes back to its post once he is on his way to the seat's end of the route. It comes up
    // on his far side from that seat, so he never walks through it as they set off.
    const escortTo = d => {
      if (byKind.sofa.length) return nearest(byKind.sofa, d.x, d.z);
      let to = null, far = -1;
      for (let k = 0; k < strolls.length; k++) { const s = strolls[k], dd = (s.x - d.x) ** 2 + (s.z - d.z) ** 2; if (dd > far) { far = dd; to = s; } }
      return to;
    };
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
    const blocked = (m, ux, uz) => {
      const bodies = others();
      for (let k = 0; k < bodies.length; k++) if (inPath(m, ux, uz, bodies[k].x, bodies[k].z, bodies[k].radius)) return true;
      for (let k = 0; k < members.length; k++) {
        const o = members[k];
        if (o === m || o === m.partner || !o.on || !o.root || (o.rank > m.rank || o.rank === m.rank && o.index > m.index)) continue;
        if (inPath(m, ux, uz, o.x, o.z, o.bodyRadius)) return true;
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
    const speak = m => {
      if (bubbles >= BUBBLES || m.talk > 0) return false;
      const lines = LINES[m.type], line = lines[Math.floor(m.rand() * lines.length)];
      if (m.agent) fx.sayAt(m.x, 2.1, m.z, line, SAY); else fx.say(m, line, SAY);
      m.talk = TALK; bubbles++;
      return true;
    };
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
    // for a cheer (settling back as the crew's does), the free hand to the head at an all in.
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
      } else if (m.type === "cane") {
        lean = 0.45; headX = lean - 0.3;
        // The item hangs from the right hand: the cane reaches furthest forward as the phase passes a whole turn, and
        // there it stands upright on the floor; standing, it leans on it planted.
        const arm = walking ? -0.35 - 0.35 * (0.5 + 0.5 * Math.cos(ph)) : CANE_PLANT;
        p.armR.rotation.x = arm; p.club.rotation.x = CANE_TIP * (arm - CANE_PLANT) / 0.35 - arm;
      } else if (m.type === "walker") {
        const lift = walking && m.cycle < WALKER_LIFT ? Math.sin(m.cycle / WALKER_LIFT * Math.PI) : 0;
        lean = 0.55; headX = lean - 0.35;
        p.armR.rotation.x = p.armL.rotation.x = C.FRAME_ARM - FRAME_LIFT * lift;
        m.frame.position.y = FRAME_UP * lift; m.frame.position.z = FRAME_ON * lift;
      } else if (m.type === "drunk") {
        const w = m.cycle * TAU / DRUNK_PERIOD;
        roll(m, (m.stagger > 0 ? 0.4 : 0.18) * Math.sin(w));
        p.head.rotation.z = 0.22 * Math.sin(w * 1.3 + 1); headX = 0.12;
      }
      lean += m.lean;
      leanBody(m, lean);
      if (m.armUp > 0.01) {
        const k = m.armUp, wave = Math.sin(m.cheer * 14) * 0.35;
        p.armR.rotation.x += (-2.6 + wave - p.armR.rotation.x) * k; p.armL.rotation.x += (-2.6 - wave - p.armL.rotation.x) * k;
        headX -= 0.15 * k;
      } else if (m.handUp > 0.01) {
        p.armL.rotation.x += (-2.7 - p.armL.rotation.x) * m.handUp;
        headX += 0.15 * m.handUp;
      }
      // The drunk's glass stays upright whatever his arm does.
      if (m.type === "drunk") p.club.rotation.x = -p.armR.rotation.x;
      // A cane lifted in a cheer stays upright in the raised hand.
      if (m.type === "cane") p.club.rotation.x += (-p.armR.rotation.x - p.club.rotation.x) * m.armUp;
      p.head.rotation.x = headX;
    };
    const stand = m => { Cr.poseGait(m, GAIT.stand); style(m, false); };
    // Seated by k (0 standing, 1 sitting): the legs forward as the room's bots sit, the hips at the seat's height.
    const sitPose = (m, k) => {
      const p = m.parts;
      p.legR.rotation.x += (SIT_LEGS - p.legR.rotation.x) * k; p.legL.rotation.x += (SIT_LEGS - p.legL.rotation.x) * k;
      m.root.position.y = m.baseY + (m.seatY + SIT_LIFT - m.baseY) * k;
      // A walking frame stays on the floor in front of the seat.
      if (m.frame) m.frame.position.y = m.baseY - m.root.position.y;
    };
    const faceTo = (m, dt) => { m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, turnTo(m.yaw, m.want))); m.root.rotation.y = m.yaw; };
    // A footfall: the lady's heels each step, the cane's tip every second step.
    const stepped = m => {
      const k = Math.floor(m.phase / Math.PI);
      if (k === m.step) return;
      m.step = k;
      if (!onStep) return;
      if (m.type === "lady") onStep("heel", m.x, m.z);
      else if (m.type === "cane" && k % 2 === 0) onStep("cane", m.x, m.z);
    };

    // ---- walking ----
    const walkCaveman = (m, dt) => {
      if (m.pending) { stand(m); return; }
      const tx = m.route[m.i * 2], tz = m.route[m.i * 2 + 1], d = Math.hypot(tx - m.x, tz - m.z);
      const ux = d > 1e-6 ? (tx - m.x) / d : Math.sin(m.yaw), uz = d > 1e-6 ? (tz - m.z) / d : Math.cos(m.yaw);
      // The frame lifts, plants and shuffles on: it only moves over the shuffle.
      let v = m.speed;
      if (m.type === "walker") {
        const was = m.cycle;
        m.cycle = (m.cycle + dt) % WALKER_CYCLE;
        if (was < WALKER_LIFT && m.cycle >= WALKER_LIFT && onStep) onStep("walker", m.x, m.z);
        v = m.cycle < WALKER_LIFT ? 0 : m.speed * WALKER_CYCLE / (WALKER_CYCLE - WALKER_LIFT);
      }
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
    // A caveman's walk, paused by a rest (cane, walker) or a stumble (drunk) every so often.
    const walk = (m, dt) => {
      if (m.agent) { walkGorilla(m, dt); return; }
      if (!m.pending && m.job === "") {
        if (m.stagger > 0) {
          m.stagger -= dt; m.cycle = (m.cycle + dt * 1.5) % DRUNK_PERIOD;
          stand(m);
          if (m.stagger <= 0 && m.stumbles >= STUMBLES) startEscort(m);
          return;
        }
        m.walked += dt;
        if (m.walked >= m.restAt && (m.type === "cane" || m.type === "walker")) {
          m.walked = 0; m.restAt = 8 + 6 * m.rand(); m.state = "rest"; m.clock = 3 + 2 * m.rand(); stand(m); return;
        }
        if (m.walked >= m.restAt && m.type === "drunk") {
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

    const update = (dt) => {
      buildClock += dt;
      if (buildClock >= BUILD_EVERY) {
        for (let k = 0; k < members.length; k++) if (members[k].on && !members[k].root) { build(members[k]); buildClock = 0; break; }
        if (buildClock >= BUILD_EVERY) buildClock = BUILD_EVERY;
      }
      // A bubble is up for its line's time, parked or not.
      for (let k = 0; k < members.length; k++) { const m = members[k]; if (m.talk > 0 && (m.talk -= dt) <= 0) { m.talk = 0; bubbles--; } }
      pollClock += dt;
      if (pollClock >= POLL) { pollClock = 0; poll(); }
      plan();
      const vis = visitor && visitor();
      let crowd = 0, walking = 0, sitting = 0;
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!m.on || !m.root) continue;
        crowd++;
        if (m.cheer > 0) m.cheer -= dt;
        if (m.gasp > 0) m.gasp -= dt;
        m.armUp = Mth.damp(m.armUp, m.cheer > 0 ? 1 : 0, 10, dt); m.handUp = Mth.damp(m.handUp, m.gasp > 0 ? 1 : 0, 8, dt);
        m.lean = Mth.damp(m.lean, m.state === "watch" && bigLive(m.table) ? LEAN_IN : 0, 6, dt);
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
        } else if (st === "post" || st === "serve") {
          m.clock -= dt;
          if (m.clock <= 0 && !m.pending) next(m);
          standing(m, dt);
        } else if (st === "rest") {
          m.clock -= dt; stand(m);
          if (m.clock <= 0) m.state = "walk";
        } else if (st === "escort") {
          if (m.job === "await") follow(m);
          if (m.agent) m.agent.update(dt); else stand(m);
        }
        // Whatever the agent's arms do, a waiter's right one holds the tray out level, however its chest leans.
        if (m.type === "waiter") m.parts.armR.rotation.x = C.TRAY_ARM - m.parts.armR.parent.rotation.x;
      }
      stat.crowd = crowd; stat.walking = walking; stat.sitting = sitting; stat.routes = routes; stat.crowdBubbles = bubbles;
    };
    // A new floor: the lattice is read again, a spot the new floor still has is kept as its copy, and a member whose
    // spot is gone, or who stands inside the new fittings, steps to the nearest open cell and picks somewhere else.
    const refloor = list => {
      paths.rebuild(); setSpots(list);
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        if (!m.on || !m.root) continue;
        const had = m.spot !== null && m.spot !== POST;
        if (had && !list.includes(m.spot)) m.spot = same(list, m.spot);
        const lost = had && m.spot === null;
        for (let i = 0; i < 4; i++) if (m.stops[i] && !(m.stops[i] = same(list, m.stops[i]))) m.loop = 0;
        // A kept seat is sat inside its furniture, so only a member off a seat, or off a lost one, is moved clear.
        const seated = m.state === "sit" || m.state === "slide";
        if (lost && seated || (!seated || lost) && !walkable(m.x, m.z, m.x, m.z, 0, 2, LEG)) standClear(m);
        if (lost) { if (m.partner) cancelEscort(m); if (m.job !== "boss") m.job = ""; idle(m, 0); }
        else if (m.state === "walk" || m.state === "rest") { if (m.spot && m.spot !== POST) go(m, m.spot); else send(m, m.tx, m.tz, m.spot); }
      }
    };
    const liveGeometry = set => { for (let k = 0; k < members.length; k++) if (members[k].agent) members[k].agent.liveGeometry(set); };
    const dispose = () => {
      for (let k = 0; k < members.length; k++) {
        const m = members[k];
        park(m);
        if (m.agent) m.agent.dispose();
        else if (m.root && m.root.parent) S.removeChild(m.root.parent, m.root);
        m.root = m.parts = m.agent = null; m.on = false;
      }
    };
    setCap(cap);
    return { update, setCap, refloor, liveGeometry, stats: () => stat, dispose, members, send, approach };
  };

  BL.pokerCrowd = { router, create };
})();
