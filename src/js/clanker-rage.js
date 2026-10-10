// Local-only banana rage. The hub supplies physical movement/capture proofs;
// this bounded planner owns no player input, damage, animation or network state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const HITS = 42, WINDOW = 60, DURATION = 60, SERIALS = 128, DEBUG_RANGE = 35;
  const THROW_CHARGE_TIME = 1, EDGE_NEAR = 2.4;
  const GRID = 181, HALF = 90, STEP = 1.25, CELLS = GRID * GRID, ROUTE = 256;
  const DX = [1, -1, 0, 0, 1, -1, 1, -1], DZ = [0, 0, 1, -1, 1, 1, -1, -1];
  const signedOut = () => !!BL.net && BL.net.state.resolved === true && !BL.net.state.me;
  const state = () => ({ active: false, debug: false, count: 0, first: 0, age: 0, beganAt: 0, expires: 0, phase: "", target: null,
    times: new Float64Array(HITS), hitters: new Uint16Array(HITS), serials: new Float64Array(SERIALS), serial: 0,
    path: new Float64Array(ROUTE * 3), countPath: 0, index: 0, pending: false, planAt: 0,
    blocked: 0, poseBlocked: 0, approachInset: 0, approachAttempt: 0, approachBearing: NaN,
    poseRejectX: 0, poseRejectZ: 0, poseRejectHeading: NaN, poseRejectUntil: 0,
    land: 0, dx: 0, dz: 1, goalX: 0, goalY: 0, goalZ: 0,
    grabHeld: false, throwHeld: false, throwCharge: 0, chargeAt: 0, traversing: false,
    rejected: null, rejectUntil: 0, rejectedTargets: null, agitators: null, search: null, reason: "" });
  const create = (ctx) => {
    const { list, crew } = ctx;
    for (let i = 0; i < list.length; i++) {
      list[i].rage.rejectedTargets = new Uint8Array(crew.list.length);
      list[i].rage.agitators = new Uint8Array(crew.list.length);
    }
    // A bounded workspace per active rager, resumed in round-robin slices.
    // The fixed Oogatron goal admits an A* lower bound; pursuit uses Dijkstra.
    let costs, heights, headings, parents, states, heap, heapAt;
    const reverse = new Uint16Array(ROUTE);
    const edge = { dx: 0, dz: 0 };
    const approach = { x: 0, y: 0, z: 0, heading: 0 };
    let owner = null, size = 0, cursor = -1, neighbor = 0, budget = 0, next = 0, now = 0;
    let originX = 0, originZ = 0, started = 0;
    const eligible = (e, debug = e.rage.debug) => signedOut() && e.active && !e.controlled && e.health.value > 0
      && (debug ? ctx.debugRage === true && (e.mode === "working" || e.mode === "chilling")
        && (crew.stateOf(e.owner) === "working" || crew.stateOf(e.owner) === "chilling")
        : e.mode === "chilling" && crew.stateOf(e.owner) === "chilling");
    const clearHits = r => { r.count = r.first = 0; r.times.fill(0); };
    const resetApproach = r => { r.approachInset = r.approachAttempt = 0; r.approachBearing = NaN; };
    const retryApproach = (e, heading) => {
      const r = e.rage;
      if (!ctx.approach || r.approachAttempt >= 2) return false;
      if (!r.approachAttempt) r.approachBearing = heading;
      r.approachAttempt++; r.approachInset = 0; r.blocked = 0;
      return true;
    };
    const clearRoute = e => {
      const r = e.rage;
      r.countPath = r.index = 0; r.pending = false;
      if (owner === e) { owner = null; size = 0; cursor = -1; }
    };
    const saveSearch = () => {
      if (!owner) return;
      const s = owner.rage.search;
      s.size = size; s.cursor = cursor; s.neighbor = neighbor;
    };
    const loadSearch = e => {
      const s = e.rage.search;
      owner = e; costs = s.costs; heights = s.heights; headings = s.headings; parents = s.parents;
      states = s.states; heap = s.heap; heapAt = s.heapAt;
      size = s.size; cursor = s.cursor; neighbor = s.neighbor;
      originX = s.x; originZ = s.z; started = s.started;
    };
    const cancel = (e, reason = "cancelled") => {
      const r = e.rage, debug = r.debug;
      clearHits(r); clearRoute(e);
      r.debug = false; r.poseBlocked = 0; r.poseRejectHeading = NaN; resetApproach(r);
      if (!r.active) return;
      r.active = false; r.phase = ""; r.target = r.rejected = null; r.age = r.beganAt = r.expires = 0; r.reason = reason;
      r.grabHeld = r.throwHeld = false; r.throwCharge = 0;
      r.rejectedTargets.fill(0); r.agitators.fill(0); r.traversing = false;
      ctx.release(e); effects(e);
      ctx.end(e, debug);
    };
    const accountChanged = () => {
      if (!signedOut()) for (let i = 0; i < list.length; i++) cancel(list[i], "account");
    };
    const unsubscribe = BL.net ? BL.net.subscribe(accountChanged) : null;
    const begin = (e, target, debug = false) => {
      const r = e.rage;
      clearHits(r);
      r.active = true; r.debug = debug; r.beganAt = now; r.expires = debug ? Infinity : now + DURATION;
      r.age = 0; r.phase = "hunt"; r.target = target; r.poseRejectHeading = NaN; resetApproach(r);
      r.grabHeld = true; r.throwHeld = false; r.throwCharge = 0;
      r.rejectedTargets.fill(0); r.rejected = null; r.rejectUntil = 0;
      r.land = ctx.landAt(e.root.position.x, e.root.position.z); r.planAt = now; r.blocked = r.poseBlocked = 0; r.reason = "";
      effects(e); ctx.begin(e); return true;
    };
    const debugRage = (e, on = true) => {
      if (ctx.debugRage !== true || list.indexOf(e) < 0) return false;
      if (!on) {
        if (!e.rage.debug) return false;
        cancel(e, "debug"); return true;
      }
      if (!eligible(e, true)) return false;
      if (e.rage.debug) return true;
      // Selection is exclusive, but unrelated banana-triggered rages keep
      // their own hit window, target list and ordinary expiry.
      for (let i = 0; i < list.length; i++) if (list[i].rage.debug) cancel(list[i], "selection");
      cancel(e, "debug");
      return begin(e, null, true);
    };
    const bananaHit = (e, shooter, serial) => {
      const r = e.rage;
      const shooterIndex = crew.list.indexOf(shooter);
      // Serial numbers belong to actual projectiles, never to damage units or
      // work events. Keep the replay fence across resets of the hit window.
      if (shooterIndex < 0 || !Number.isSafeInteger(serial) || serial <= 0 || serial <= r.serial - SERIALS
        || r.serials[serial % SERIALS] === serial) return false;
      r.serials[serial % SERIALS] = serial; r.serial = Math.max(r.serial, serial);
      if (r.active) return false;
      if (!eligible(e)) { clearHits(r); return false; }
      while (r.count && now - r.times[r.first] >= WINDOW) { r.first = (r.first + 1) % HITS; r.count--; }
      const slot = (r.first + r.count) % HITS;
      r.times[slot] = now; r.hitters[slot] = shooterIndex; r.count++;
      if (r.count !== HITS) return false;
      r.agitators.fill(0);
      for (let i = 0; i < HITS; i++) r.agitators[r.hitters[(r.first + i) % HITS]] = 1;
      return begin(e, shooter);
    };
    const score = cell => {
      const r = owner.rage;
      return costs[cell] + (r.phase === "edge"
        ? Math.max(0, Math.hypot(xOf(cell) - r.goalX, zOf(cell) - r.goalZ) - EDGE_NEAR) : 0);
    };
    const less = (a, b) => score(a) < score(b) || score(a) === score(b) && a < b;
    const push = cell => {
      let at = heapAt[cell];
      if (at < 0) { at = size++; heap[at] = cell; heapAt[cell] = at; }
      while (at > 0) {
        const up = (at - 1) >> 1, other = heap[up];
        if (!less(cell, other)) break;
        heap[at] = other; heapAt[other] = at; at = up;
      }
      heap[at] = cell; heapAt[cell] = at;
    };
    const pop = () => {
      const cell = heap[0], last = heap[--size]; heapAt[cell] = -1;
      if (size) {
        let at = 0;
        while (at * 2 + 1 < size) {
          let child = at * 2 + 1;
          if (child + 1 < size && less(heap[child + 1], heap[child])) child++;
          if (!less(heap[child], last)) break;
          heap[at] = heap[child]; heapAt[heap[at]] = at; at = child;
        }
        heap[at] = last; heapAt[last] = at;
      }
      return cell;
    };
    const xOf = cell => originX + ((cell % GRID) - HALF) * STEP;
    const zOf = cell => originZ + (Math.floor(cell / GRID) - HALF) * STEP;
    const validTarget = (e, cave) => {
      const index = crew.list.indexOf(cave);
      if (index < 0 || !e.rage.debug && !e.rage.agitators[index]
        || e.rage.rejectedTargets[index] || !ctx.captureEligible(e, cave)) return false;
      if (!e.rage.debug) return true;
      const p = e.root.position, q = cave.root.position;
      return (p.x - q.x) ** 2 + (p.z - q.z) ** 2 + (p.y - (q.y - cave.baseY)) ** 2 <= DEBUG_RANGE * DEBUG_RANGE;
    };
    const chooseTarget = e => {
      const r = e.rage, p = e.root.position;
      if (validTarget(e, r.target)) return true;
      let nearest = Infinity; r.target = null; r.poseRejectHeading = NaN; resetApproach(r);
      for (let i = 0; i < crew.list.length; i++) {
        const cave = crew.list[i];
        if (!validTarget(e, cave)) continue;
        const q = cave.root.position, distance = (p.x - q.x) ** 2 + (p.z - q.z) ** 2 + (p.y - (q.y - cave.baseY)) ** 2;
        if (distance < nearest) { nearest = distance; r.target = cave; }
      }
      // Try every eligible body before retrying unreachable ones. Remembering
      // only the last failure made two blocked Oogas starve a reachable third.
      if (!r.target && now >= r.rejectUntil) { r.rejectedTargets.fill(0); r.rejected = null; r.rejectUntil = now + 4; }
      return !!r.target;
    };
    const failed = e => {
      const r = e.rage;
      clearRoute(e);
      if (r.phase === "edge") {
        // A route or launch failure is not a G release. Keep the captive and
        // charge while trying another checked approach to the Oogatron.
        r.planAt = now + 0.3; r.blocked = 0; r.throwHeld = true; return;
      }
      const index = crew.list.indexOf(r.target);
      if (index >= 0) r.rejectedTargets[index] = 1;
      r.rejected = r.target; r.rejectUntil = now + 4; r.target = null; r.planAt = now + 0.3; r.blocked = 0;
      r.phase = "hunt"; r.throwHeld = false; r.throwCharge = 0; r.poseRejectHeading = NaN; resetApproach(r);
    };
    const start = e => {
      const r = e.rage, p = e.root.position;
      if (!r.search) r.search = { costs: new Float64Array(CELLS), heights: new Float64Array(CELLS), headings: new Float64Array(CELLS),
        parents: new Int16Array(CELLS), states: new Uint8Array(CELLS), heap: new Uint16Array(CELLS), heapAt: new Int16Array(CELLS),
        x: 0, z: 0, started: 0, size: 0, cursor: -1, neighbor: 0,
        lead: -1, leadScore: 0, routedLead: -1, outwardX: 0, outwardZ: 0 };
      const s = r.search;
      s.x = p.x; s.z = p.z; s.started = now; s.size = 0; s.cursor = -1; s.neighbor = 0;
      loadSearch(e);
      owner = e; originX = p.x; originZ = p.z; started = now; cursor = -1; neighbor = 0; size = 0;
      states.fill(0); heapAt.fill(-1); parents.fill(-1); costs.fill(Infinity);
      const cell = HALF * GRID + HALF;
      heights[cell] = p.y; headings[cell] = e.heading; costs[cell] = 0; states[cell] = 1; push(cell);
      s.lead = cell; s.leadScore = 0; s.routedLead = cell;
      if (r.phase === "edge") {
        ctx.edgeHeading(e, edge);
        s.outwardX = edge.dx; s.outwardZ = edge.dz;
        if (ctx.edgeGoal) ctx.edgeGoal(e, r);
        s.leadScore = ctx.edgeGoal ? Math.max(0, Math.hypot(p.x - r.goalX, p.z - r.goalZ) - EDGE_NEAR) : 0;
      }
      r.pending = true;
      if (r.phase === "hunt") {
        const q = r.target.root.position;
        r.goalX = q.x; r.goalY = q.y - r.target.baseY; r.goalZ = q.z;
      }
    };
    const routeTo = (e, cell, provisional = false) => {
      const r = e.rage;
      const continuing = r.index > 0 && r.index < r.countPath, oldAt = r.index * 3;
      const fromX = continuing ? r.path[oldAt - 3] : 0, fromY = continuing ? r.path[oldAt - 2] : 0, fromZ = continuing ? r.path[oldAt - 1] : 0;
      const toX = continuing ? r.path[oldAt] : 0, toY = continuing ? r.path[oldAt + 1] : 0, toZ = continuing ? r.path[oldAt + 2] : 0;
      let length = 0, at = cell;
      while (at >= 0 && length < ROUTE) { reverse[length++] = at; at = parents[at]; }
      if (at >= 0) { if (!provisional) failed(e); return false; }
      for (let i = 0; i < length; i++) {
        at = reverse[length - 1 - i];
        r.path[i * 3] = xOf(at); r.path[i * 3 + 1] = heights[at]; r.path[i * 3 + 2] = zOf(at);
      }
      r.countPath = length; r.index = 1; r.blocked = 0;
      if (continuing) {
        // A new search slice may extend the route while its current leg is
        // still being walked. Keep that checked segment instead of rewinding.
        for (let i = 1; i < length; i++) {
          const at = i * 3;
          if (r.path[at - 3] === fromX && r.path[at - 2] === fromY && r.path[at - 1] === fromZ
            && r.path[at] === toX && r.path[at + 1] === toY && r.path[at + 2] === toZ) {
            r.index = i; return true;
          }
        }
      }
      // A changed branch can resume from any reached node, including the
      // origin or an exhausted prefix's endpoint, without walking back.
      const p = e.root.position;
      for (let i = 0; i < length; i++) {
        const at = i * 3;
        if (Math.hypot(r.path[at] - p.x, r.path[at + 2] - p.z) < 0.07
          && Math.abs(r.path[at + 1] - p.y) < 0.15) { r.index = i + 1; return true; }
      }
      // There is no certified connector from the current position to this
      // branch. Start its next search at that actual position.
      clearRoute(e); r.planAt = now; return false;
    };
    const finish = (e, cell) => {
      const r = e.rage;
      if (!routeTo(e, cell)) return;
      r.pending = false;
      if (r.phase === "edge") { r.dx = edge.dx; r.dz = edge.dz; }
      owner = null; size = 0; cursor = -1;
    };
    const search = e => {
      const r = e.rage;
      if (now - started > 12) { failed(e); return; }
      while (budget > 0 && owner === e) {
        if (cursor < 0) {
          if (!size) { failed(e); return; }
          cursor = pop(); states[cursor] = 2; neighbor = 0;
          const x = xOf(cursor), y = heights[cursor], z = zOf(cursor);
          if (r.phase === "edge" ? ctx.edgeAt(e, x, y, z, edge, headings[cursor])
            : Math.hypot(x - r.goalX, z - r.goalZ) < (ctx.huntRange ? ctx.huntRange(e) : 2.6)
              && Math.abs(y - r.goalY) < 0.75) {
            finish(e, cursor); return;
          }
        }
        const dir = neighbor++, col = cursor % GRID + DX[dir], row = Math.floor(cursor / GRID) + DZ[dir]; budget--;
        if (neighbor === 8) neighbor = 0;
        const previous = cursor;
        if (!neighbor) cursor = -1;
        if (col < 0 || col >= GRID || row < 0 || row >= GRID) continue;
        const cell = row * GRID + col;
        if (states[cell] === 2) continue;
        const x = xOf(previous), z = zOf(previous), y = heights[previous], nx = xOf(cell), nz = zOf(cell);
        const heading = Math.atan2(DX[dir], DZ[dir]);
        // A real animated pose can refuse a leg that the route shell admits.
        // Replanning at that same spot must choose a different first step.
        if (previous === HALF * GRID + HALF && Number.isFinite(r.poseRejectHeading)
          && Math.hypot(x - r.poseRejectX, z - r.poseRejectZ) < 0.3
          && Math.cos(heading - r.poseRejectHeading) >= Math.SQRT1_2 - 1e-7) continue;
        const ny = ctx.floorAt(e, nx, nz, y, heading);
        if (!Number.isFinite(ny)) continue;
        const cost = costs[previous] + Math.hypot(nx - x, ny - y, nz - z);
        if (cost >= costs[cell] || !ctx.legClear(e, x, y, z, nx, ny, nz, headings[previous], heading)) continue;
        costs[cell] = cost; heights[cell] = ny; headings[cell] = heading; parents[cell] = previous; states[cell] = 1; push(cell);
        if (r.phase === "edge") {
          const s = r.search, remaining = ctx.edgeGoal
            ? Math.max(0, Math.hypot(nx - r.goalX, nz - r.goalZ) - EDGE_NEAR)
            : -((nx - originX) * s.outwardX + (nz - originZ) * s.outwardZ);
          if (remaining < s.leadScore - 0.3) { s.lead = cell; s.leadScore = remaining; }
        }
      }
      // Advance a checked prefix toward the launch area, never farther along
      // the outward ray merely because the throwing stance is still pending.
      const s = r.search;
      if (r.phase === "edge" && r.pending && s.lead !== s.routedLead) {
        routeTo(e, s.lead, true);
        s.routedLead = s.lead;
      }
    };
    const frame = time => {
      now = time; budget = 96;
      saveSearch(); owner = null;
      accountChanged();
      for (let i = 0; i < list.length; i++) {
        const index = (next + i) % list.length, e = list[index], r = e.rage;
        if (!r.active || r.countPath && !r.pending || now < r.planAt || r.phase === "throw" || ctx.suspended(e) || ctx.traversing?.(e)) continue;
        if (r.phase === "hunt" && !chooseTarget(e)) { r.planAt = now + 0.5; continue; }
        next = (index + 1) % list.length;
        if (r.pending) loadSearch(e); else start(e);
        break;
      }
    };
    const check = (e, time) => {
      now = time;
      const r = e.rage;
      if (!eligible(e)) { cancel(e, e.health.value <= 0 ? "health" : "eligibility"); return false; }
      if (!r.active) {
        while (r.count && now - r.times[r.first] >= WINDOW) { r.first = (r.first + 1) % HITS; r.count--; }
        return false;
      }
      if (!r.debug && now >= r.expires) { cancel(e, "expired"); return false; }
      if (Number.isFinite(r.poseRejectHeading)
        && (now >= r.poseRejectUntil
          || Math.hypot(e.root.position.x - r.poseRejectX, e.root.position.z - r.poseRejectZ) >= 0.5))
        r.poseRejectHeading = NaN;
      r.age = now - r.beganAt;
      if (r.phase === "edge" && r.throwHeld)
        r.throwCharge = Math.min(1, (now - r.chargeAt) / THROW_CHARGE_TIME);
      if (ctx.suspended(e)) {
        ctx.release(e); clearRoute(e); r.phase = "hunt"; r.planAt = now + 0.3;
        r.grabHeld = r.throwHeld = false; r.throwCharge = 0; return false;
      }
      const traversing = !!ctx.traversing?.(e);
      if (r.traversing && !traversing) { clearRoute(e); r.planAt = now; }
      r.traversing = traversing;
      return true;
    };
    const contact = (e, time) => {
      const r = e.rage;
      if (!r.active || r.phase !== "hunt" || !r.grabHeld || !eligible(e)
        || ctx.suspended(e) || ctx.traversing?.(e) || !validTarget(e, r.target)) return false;
      now = time;
      if (!ctx.grab(e, r.target)) return false;
      clearRoute(e); r.phase = "edge"; r.planAt = now; r.blocked = r.poseBlocked = 0;
      r.poseRejectHeading = NaN; r.poseRejectUntil = 0; resetApproach(r);
      r.throwHeld = true; r.throwCharge = 0; r.chargeAt = now; return true;
    };
    const poseResult = (e, dt, time, accepted) => {
      const r = e.rage;
      if (!r.active) return;
      if (accepted) { r.poseBlocked = 0; return; }
      // walk may have advanced before the animated captive rejects that
      // step. Count only the committed pose as progress, not that rollback.
      r.poseBlocked += dt;
      r.blocked = Math.max(r.blocked, r.poseBlocked);
      if (r.poseBlocked <= 0.5 || r.phase === "throw") return;
      if (r.index < r.countPath) {
        const p = e.root.position, at = r.index * 3, dx = r.path[at] - p.x, dz = r.path[at + 2] - p.z;
        if (Math.hypot(dx, dz) > 0.07) {
          r.poseRejectX = p.x; r.poseRejectZ = p.z; r.poseRejectHeading = Math.atan2(dx, dz); r.poseRejectUntil = time + 3;
        }
      }
      clearRoute(e); r.planAt = time + 0.2; r.blocked = r.poseBlocked = 0;
    };
    const update = (e, dt, time) => {
      if (!check(e, time)) return false;
      if (e.rage.traversing) return false;
      const r = e.rage;
      const p = e.root.position;
      e.speed = 0;
      if (r.phase === "throw" && !ctx.captive(e)) {
        // The click has already been released. Release G only after the
        // swing actually launches the Ooga, then press it for the next hunt.
        r.grabHeld = false; r.throwHeld = false; r.throwCharge = 0;
        clearRoute(e); r.phase = "hunt"; r.target = null; r.planAt = now; r.poseRejectHeading = NaN; resetApproach(r);
        return true;
      }
      if (r.phase === "throw" && ctx.throwing && !ctx.throwing(e)) {
        clearRoute(e); r.phase = "edge"; r.planAt = now;
        r.throwHeld = true; return true;
      }
      if (r.phase !== "hunt" && !ctx.captive(e)) {
        clearRoute(e); r.phase = "hunt"; r.target = null; r.planAt = now; r.poseRejectHeading = NaN; resetApproach(r);
        r.throwHeld = false; r.throwCharge = 0;
      }
      if (r.phase === "throw") return true;
      if (r.phase === "hunt") {
        if (!chooseTarget(e)) { clearRoute(e); return true; }
        r.grabHeld = true;
        if (contact(e, time)) return true;
        const q = r.target.root.position;
        if ((r.countPath || r.pending) && Math.hypot(q.x - r.goalX, q.z - r.goalZ) > 2.5) {
          clearRoute(e); r.planAt = now;
        }
      } else r.grabHeld = true;
      if (owner === e) search(e);
      if (!r.countPath) {
        if (r.phase === "edge" && !r.pending && (r.blocked += dt) > 0.5 && ctx.traverse?.(e, r.goalX, r.goalY, r.goalZ)) {
          clearRoute(e); r.traversing = true; r.blocked = 0;
        }
        return true;
      }
      // Facing changes the prop support footprint. A waypoint's old height
      // must not pin a stopped gorilla after its XZ destination is reached.
      while (r.index < r.countPath) {
        const at = r.index * 3;
        if (Math.hypot(r.path[at] - p.x, r.path[at + 2] - p.z) >= 0.07) break;
        const floor = ctx.floorAt(e, p.x, p.z, p.y, e.heading);
        if (!Number.isFinite(floor) || Math.abs(floor - p.y) >= 0.15) break;
        r.index++;
      }
      if (r.index >= r.countPath) {
        if (r.phase === "edge") {
          // Exhausting a provisional prefix means wait for the search, not
          // jump past the launch area. G and the charged click remain held.
          if (r.pending) return true;
          if (!ctx.edgeAt(e, p.x, p.y, p.z, edge)) { failed(e); return true; }
          const heading = Math.atan2(edge.dx, edge.dz);
          const before = e.heading, walked = ctx.walk(e, dt, p.x, p.y, p.z, heading);
          if (Math.abs(Math.atan2(Math.sin(e.heading - heading), Math.cos(e.heading - heading))) < 0.035 && r.throwCharge >= 1) {
            if (ctx.throw(e, edge.dx, edge.dz, r.throwCharge)) { r.throwHeld = false; r.phase = "throw"; }
            else failed(e);
          } else if (walked && (r.throwCharge < 1 || Math.abs(e.heading - before) > 1e-5)) r.blocked = 0;
          else if ((r.blocked += dt) > 1.5) failed(e);
        } else {
          const q = r.target.root.position;
          if (ctx.approach) {
            if (!ctx.approach(e, r.target, approach)) { failed(e); return true; }
            // Close in through supported steps, then try each fixed side
            // of the original approach. The bearing stays anchored so a
            // blocked hand cannot send the gorilla into an endless orbit.
            if (Math.hypot(approach.x - p.x, approach.z - p.z) < 0.07) {
              let changed = r.approachInset < 0.6;
              if (changed) { r.approachInset = Math.min(0.6, r.approachInset + 0.2); r.blocked = 0; }
              else changed = retryApproach(e, approach.heading);
              if (changed && !ctx.approach(e, r.target, approach)) { failed(e); return true; }
            }
          } else { approach.x = q.x; approach.y = q.y - r.target.baseY; approach.z = q.z; approach.heading = Math.atan2(q.x - p.x, q.z - p.z); }
          const x = p.x, y = p.y, z = p.z, heading = e.heading;
          if (ctx.walk(e, dt, approach.x, approach.y, approach.z, approach.heading)
            && (Math.hypot(p.x - x, p.y - y, p.z - z) > 1e-5 || Math.abs(e.heading - heading) > 1e-5)) r.blocked = 0;
          else if ((r.blocked += dt) > 1.5 && !retryApproach(e, approach.heading)) failed(e);
        }
        return true;
      }
      const at = r.index * 3, x = r.path[at], y = r.path[at + 1], z = r.path[at + 2];
      const beforeX = p.x, beforeY = p.y, beforeZ = p.z, heading = e.heading;
      if (ctx.walk(e, dt, x, y, z, Math.atan2(x - p.x, z - p.z))
        && (Math.hypot(p.x - beforeX, p.y - beforeY, p.z - beforeZ) > 1e-5 || Math.abs(e.heading - heading) > 1e-5)) r.blocked = 0;
      else if ((r.blocked += dt) > 0.5) {
        if (r.phase === "edge") {
          if (r.pending) return true;
          if (ctx.traverse?.(e, r.goalX, r.goalY, r.goalZ)) { clearRoute(e); r.traversing = true; r.blocked = 0; }
          else failed(e);
        }
        else { clearRoute(e); r.planAt = now + 0.2; }
      }
      return true;
    };
    const dispose = () => {
      for (let i = 0; i < list.length; i++) { cancel(list[i], "dispose"); list[i].rage.search = null; }
      if (unsubscribe) unsubscribe(); owner = null;
    };
    return { frame, check, update, contact, poseResult, bananaHit, debugRage, cancel, dispose };
  };

  // Reuse the mirror cave's moving glyph pattern on the complete rig. The
  // inherited flag adds no geometry and leaves fire and global Matrix alone.
  const effects = e => { e.root.matrixHighlight = e.rage.active && e.active; };
  BL.clankerRage = { create, state, signedOut, effects, HITS, WINDOW, DURATION, DEBUG_RANGE };
})();
