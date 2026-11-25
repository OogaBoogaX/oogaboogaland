// The island's world: the passive routine of every Ooga nobody drives, as the server runs it for every signed-in page
// (worker/src/games/island.js on game-host.js) and a signed-out page runs it for itself. Shared unchanged by the page
// and the Worker, as ghost-sim.js is. It moves only each Ooga's root (where it stands, which way it faces, what it is
// doing); the page draws the body, its gait, aim and reload from that, and its gorilla from the trips it plans.
//
// The routine is the hub crew's passive one (crew.js with `npcPassive`), reproduced over the island's baked tables
// (island-layout.js, from the real hub) without terrain, props or collision:
// - Working: round the work caves in turn, each trip out along the meadow's paths to the cave's trail, straight to a
//   free place in its fan, a magazine fired into the cave, back to a free slot in the reload fan round the pile, and
//   the magazine eaten back. A cave stops being worked the moment its contributor stops being active there.
// - Chilling: idle a long staggered pause by the fire or at a stroll spot, then a stroll to another; a worker that
//   stops working walks back past the pile first. Nobody idles inside a cave's work zone or the pile's ring.
// - Sleeping and away: not shown here; the page's own crew beams a sleeper into its bed as it does today.
// Every other change of state is a beam, as the passive crew's is. Players never touch it: there are none in here.
//
// Inputs: the cast (`setCast`), each Ooga's state and the caves it is active at (`setActivity`), where an Ooga a crew
// has already placed first shows up (`place`), the pile's platform
// radius (`setPile`, or `setBananas` from its count). Output: game-wire.js rows (`motion`). `step` runs fixed steps on the sim's own clock; nothing in
// it allocates once the cast is set.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { mulberry32, fnv1a } = BL.math;

  const STEP = 0.05, MAX_STEPS = 20;
  const WORKING = 0, CHILLING = 1, SLEEPING = 2, AWAY = 3, STATES = ["working", "chilling", "sleeping", "away"];
  // What an Ooga is doing, a row's low three bits.
  const ACT = { HIDDEN: 0, STAND: 1, SIT: 2, WALK: 3, AIM: 4, FIRE: 5, RELOAD: 6 };
  // Work phases, as crew.js names them.
  const NONE = 0, OUT = 1, STATION = 2, SHOOT = 3, BACK = 4, RELOAD = 5;
  // Chill modes.
  const IDLE = 1, WANDER = 2, RETURN = 3;
  // crew.js's numbers: walking speeds, the magazine and how fast it is fired and eaten back, the pauses.
  const RUSH = 2.8, WANDER_SPEED = 1.3, WANDER_SPREAD = 0.5, CHILL_RETURN = 1.8;
  const AMMO = 30, ROUNDS_PER_BITE = 3, BITE_S = 0.6, BURST_S = 0.44, BURST_ROUNDS = 3, EMPTY_S = 0.45;
  const CHILL_MIN = 120, CHILL_SPREAD = 120, SEAT_CHANCE = 0.6, REST_MIN = 7, REST_SPREAD = 16, RETRY_S = 1;
  // Bodies and the ring round the pile (terrain.js `setPathRadius`), the reload fan (crew.js `assignFanSlots`).
  const RADIUS = 0.3, GAP = 0.15, SHOULDER_GAP = 0.68, PLACE_GAP = 0.9, SKIP_APPROACH = 0.8;
  // A starting place this near a seat or spot is that seat or spot.
  const START_SNAP = 0.35;
  const PATH_UNIT = 0.125, RING_HALF = 1.125, CHILL_CLEAR = 1.5;
  const FAN_ARC = 2.2, FAN_SPREAD = 5, FAN_SLOTS = 128, FAN_CENTER = 1.5 * Math.PI;
  // Work zones (scene-hub.js `refreshWorkZones`) in each cave mouth's frame.
  const ZONE_HALF = 3.4, ZONE_FRONT = 5.8, ZONE_BACK = -7, ZONE_PAD = 0.8;
  const LEGS = 4, LANE = 512;
  // A platform radius for a pile of a few thousand bananas, until the host says otherwise.
  const PLATFORM = 2.4;

  /** The contribution windows of roster-panel.js `stateAt`: working within an hour, chilling within a day, asleep
   * through 30 days, then away. */
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const stateAt = (stamp, at) => {
    const age = at - stamp;
    if (!Number.isFinite(age) || stamp <= 0 || age < 0) return SLEEPING;
    return age < HOUR ? WORKING : age < DAY ? CHILLING : age <= 30 * DAY ? SLEEPING : AWAY;
  };

  const create = ({ layout = BL.islandLayout, seed = 1 } = {}) => {
    const L = layout, sites = L.sites, nSites = sites.length;
    const rand = mulberry32(seed >>> 0);
    const lines = L.lines.map((line) => line.map(([x, z]) => ({ x, z })));
    // The meadow planner (npc-paths.js `fixed`) reads only the island's lines, its meadow and the ring.
    const ring = { inner: 0, center: 0, outer: 0, loading: 0, traffic: 0 };
    const path = { centerlines: lines, version: 0, debug: { ringTrafficRadius: 0, ringCenterRadius: 0 } };
    const planner = BL.npcPaths.fixed({ meadowRadius: L.meadowRadius, path });
    const fireX = L.fire[0], fireZ = L.fire[1], fireClear = L.fire[2] + RADIUS + GAP;
    const fan = new Float64Array(FAN_SLOTS * 2);
    let fanCount = 0, fanFor = -1, fanRadius = 0, platform = 0;
    const zoneActive = new Uint8Array(nSites), zoneHalf = new Float64Array(nSites), zoneFront = new Float64Array(nSites);
    const siteSin = new Float64Array(nSites), siteCos = new Float64Array(nSites);
    sites.forEach((s, i) => { siteSin[i] = Math.sin(s.mouth[3]); siteCos[i] = Math.cos(s.mouth[3]); });
    const tables = [L.seats, L.chillSpots, L.spots];
    const SEATS = 0, CHILL_SPOTS = 1, SPOTS = 2;
    const oogas = [], byName = new Map();
    // `stir` moves whenever anything a page shows did: someone walked, or started doing something else.
    let t = 0, version = 0, stir = 0;

    // The ring moves in PATH_UNIT steps, so a pile shrinking by the hour replans nobody until the ring itself moves.
    const setPile = (radius) => {
      platform = radius;
      const inner = Math.ceil((radius + PATH_UNIT - 1e-9) / PATH_UNIT) * PATH_UNIT;
      if (inner === ring.inner) return;
      ring.inner = inner;
      ring.center = ring.inner + RING_HALF; ring.outer = ring.center + RING_HALF;
      ring.loading = ring.inner + RING_HALF / 2; ring.traffic = ring.outer - RING_HALF / 2;
      path.debug.ringTrafficRadius = ring.traffic; path.debug.ringCenterRadius = ring.center;
      path.version++;
      fanFor = -1;
    };
    setPile(PLATFORM);

    const record = (name, maintainer) => {
      const position = { x: 0, y: 0, z: 0 };
      return { name, index: 0, id: fnv1a(name) & 0xffff, maintainer: !!maintainer, state: AWAY, want: AWAY, mask: 0,
        visible: false, p: position, heading: 0, act: ACT.HIDDEN, shown: -1,
        cave: { root: { position }, pathing: { tx: NaN, tz: NaN, version: -1, count: 0, index: 0, plans: 0, targetX: 0, targetZ: 0,
          laneX: new Float64Array(LANE), laneZ: new Float64Array(LANE) } },
        legs: new Float64Array(LEGS * 3), legCount: 0, leg: 0, speed: 0,
        phase: NONE, site: -1, plan: -1, px: 0, pz: 0, timer: 0, fired: 0, ammo: AMMO, slot: -1, reservedAt: 0,
        mode: 0, until: 0, trips: 0, table: -1, spot: -1, retryAt: 0, start: false, startX: 0, startZ: 0, startHeading: 0 };
    };
    /** The pile as `count` bananas: its platform radius from the layout's table (scene-hub.js `routineLayout`), eased
     * between entries by the cube root, as the pile grows. */
    const setBananas = (count) => {
      const table = L.pile, x = Math.cbrt(Math.max(0, count));
      let k = 1;
      while (k < table.length - 1 && Math.cbrt(table[k][0]) < x) k++;
      const a = Math.cbrt(table[k - 1][0]), b = Math.cbrt(table[k][0]), u = b > a ? Math.min(1, Math.max(0, (x - a) / (b - a))) : 1;
      setPile(table[k - 1][1] + (table[k][1] - table[k - 1][1]) * u);
    };
    /** The cast, in roster order: [{ name, maintainer }]. Oogas kept across calls keep where they are. */
    const setCast = (list) => {
      const kept = new Map(byName);
      oogas.length = 0; byName.clear();
      list.forEach((entry, index) => {
        const o = kept.get(entry.name) || record(entry.name, entry.maintainer);
        o.index = index; o.maintainer = !!entry.maintainer;
        oogas.push(o); byName.set(entry.name, o);
      });
      fanFor = -1; version++;
    };
    /** Ooga `name`'s state ("working", "chilling", "sleeping", "away") and the caves, by index, it is active at. */
    const setActivity = (name, state, mask) => {
      const o = byName.get(name);
      if (!o) return;
      o.want = typeof state === "number" ? state : STATES.indexOf(state);
      o.mask = mask;
    };

    /** Where Ooga `name` stands now, for its first showing alone: a world started beside a crew that has already placed
     * its Oogas (a page's own) takes each up from there rather than beaming it to a spot of its own. */
    const place = (name, x, z, heading) => {
      const o = byName.get(name);
      if (o) { o.start = true; o.startX = x; o.startZ = z; o.startHeading = heading; }
    };

    // ---- what stands where ----
    const near = (o, x, z, gap) => {
      for (let i = 0; i < oogas.length; i++) {
        const q = oogas[i];
        if (q !== o && q.visible && Math.hypot(q.p.x - x, q.p.z - z) < gap) return true;
      }
      return false;
    };
    const inZone = (x, z) => {
      for (let s = 0; s < nSites; s++) {
        if (!zoneActive[s]) continue;
        const m = sites[s].mouth, dx = x - m[0], dz = z - m[1];
        const across = dx * siteCos[s] - dz * siteSin[s], along = dx * siteSin[s] + dz * siteCos[s];
        const ox = Math.max(Math.abs(across) - zoneHalf[s], 0), oz = Math.max(ZONE_BACK - along, 0, along - zoneFront[s]);
        if (ox * ox + oz * oz < RADIUS * RADIUS) return true;
      }
      return false;
    };
    const refreshZones = () => {
      zoneActive.fill(0); zoneHalf.fill(ZONE_HALF); zoneFront.fill(ZONE_FRONT);
      for (let i = 0; i < oogas.length; i++) {
        const o = oogas[i];
        if (!o.visible || o.state !== WORKING || o.phase === NONE || o.site < 0) continue;
        const s = o.site;
        zoneActive[s] = 1;
        if (o.phase !== OUT && o.phase !== STATION && o.phase !== SHOOT) continue;
        const m = sites[s].mouth, dx = o.px - m[0], dz = o.pz - m[1];
        zoneHalf[s] = Math.max(zoneHalf[s], Math.abs(dx * siteCos[s] - dz * siteSin[s]) + ZONE_PAD);
        zoneFront[s] = Math.max(zoneFront[s], dx * siteSin[s] + dz * siteCos[s] + ZONE_PAD);
      }
    };
    const taken = (o, table, i) => {
      for (let k = 0; k < oogas.length; k++) {
        const q = oogas[k];
        if (q !== o && q.visible && q.table === table && q.spot === i && (q.mode === IDLE || q.mode === WANDER)) return true;
      }
      return false;
    };
    const spotClear = (o, table, i, chill) => {
      const s = tables[table][i], r = Math.hypot(s[0], s[1]);
      return s[3] === 1 && r >= platform + RADIUS && (!chill || r >= ring.outer + CHILL_CLEAR) && !inZone(s[0], s[1]) && !taken(o, table, i);
    };

    // ---- walking ----
    const face = (o, x, z) => { o.heading = Math.atan2(x - o.p.x, z - o.p.z); };
    const facePile = (o) => { o.heading = Math.atan2(-o.p.x, -o.p.z); };
    const go = (o, speed) => { o.leg = 0; o.speed = speed; o.act = ACT.WALK; o.cave.pathing.tx = NaN; };
    const leg = (o, x, z, fixed) => {
      const k = o.legCount++ * 3;
      o.legs[k] = x; o.legs[k + 1] = z; o.legs[k + 2] = fixed ? 1 : 0;
    };
    // Walks `o` on along its legs for `dt`: true once it arrives at the last.
    const walk = (o, dt) => {
      let left = o.speed * dt;
      for (let guard = 0; guard < 64 && o.leg < o.legCount; guard++) {
        const k = o.leg * 3, tx = o.legs[k], tz = o.legs[k + 1];
        let gx = tx, gz = tz;
        if (o.legs[k + 2]) { planner.target(o.cave, tx, tz); gx = o.cave.pathing.targetX; gz = o.cave.pathing.targetZ; }
        const dx = gx - o.p.x, dz = gz - o.p.z, d = Math.hypot(dx, dz);
        if (d > 1e-9) o.heading = Math.atan2(dx, dz);
        if (d > left) { o.p.x += dx / d * left; o.p.z += dz / d * left; return false; }
        o.p.x = gx; o.p.z = gz; left -= d;
        if (gx === tx && gz === tz) { o.leg++; o.cave.pathing.tx = NaN; }
      }
      return o.leg >= o.legCount;
    };
    const beam = (o, x, z) => {
      o.p.x = x; o.p.z = z; o.visible = true; o.legCount = o.leg = 0; o.cave.pathing.tx = NaN;
    };
    const hide = (o) => {
      o.visible = false; o.act = ACT.HIDDEN; o.phase = NONE; o.mode = 0; o.slot = -1; o.table = o.spot = -1; o.legCount = o.leg = 0;
    };

    // ---- working ----
    const active = (o, s) => (o.mask >>> s & 1) === 1;
    const nextSite = (o, from) => {
      for (let k = 1; k <= nSites; k++) {
        const s = ((from < 0 ? -1 : from) + k) % nSites;
        if (active(o, s)) return s;
      }
      return -1;
    };
    // The first place in cave `s`'s fan no other worker there is heading for or standing at.
    const freePlace = (o, s) => {
      const places = sites[s].places;
      outer: for (let i = 0; i < places.length; i++) {
        const x = places[i][1], z = places[i][2];
        for (let k = 0; k < oogas.length; k++) {
          const q = oogas[k];
          if (q !== o && q.visible && q.state === WORKING && q.site === s && (q.phase === OUT || q.phase === STATION || q.phase === SHOOT)
            && Math.hypot(q.px - x, q.pz - z) < PLACE_GAP) continue outer;
        }
        return i;
      }
      return -1;
    };
    const startTrip = (o) => {
      const s = o.plan >= 0 && active(o, o.plan) ? o.plan : nextSite(o, o.site);
      const place = s < 0 ? -1 : freePlace(o, s);
      if (place < 0) { o.phase = NONE; o.act = ACT.STAND; o.timer = RETRY_S; return; }
      const site = sites[s];
      o.site = s; o.plan = -1; o.phase = OUT; o.px = site.places[place][1]; o.pz = site.places[place][2];
      o.legCount = 0; leg(o, site.approach[0], site.approach[1], true); go(o, RUSH);
      version++;
    };
    // The reload fan round the pile, spread across however many work.
    const refreshFan = () => {
      let eaters = 0;
      for (let i = 0; i < oogas.length; i++) if (oogas[i].visible && oogas[i].state === WORKING) eaters++;
      if (eaters === fanFor && fanRadius === ring.loading) return;
      fanFor = eaters; fanRadius = ring.loading;
      fanCount = Math.min(FAN_SLOTS, Math.max(eaters, Math.floor(FAN_SPREAD * fanRadius / FAN_ARC) + 1));
      const step = Math.min(FAN_ARC / fanRadius, 1.1, FAN_SPREAD / Math.max(1, fanCount - 1));
      for (let i = 0; i < fanCount; i++) {
        const a = FAN_CENTER + (i - (fanCount - 1) / 2) * step;
        fan[i * 2] = Math.cos(a) * fanRadius; fan[i * 2 + 1] = Math.sin(a) * fanRadius;
      }
      for (let i = 0; i < oogas.length; i++) if (oogas[i].slot >= fanCount) oogas[i].slot = -1;
    };
    const slotFree = (o, j) => {
      const x = fan[j * 2], z = fan[j * 2 + 1];
      for (let k = 0; k < oogas.length; k++) {
        const q = oogas[k];
        if (q === o || !q.visible) continue;
        if (q.slot === j && (q.reservedAt < o.reservedAt || q.reservedAt === o.reservedAt && q.index < o.index)) return false;
        if (q.act !== ACT.WALK && Math.hypot(q.p.x - x, q.p.z - z) < SHOULDER_GAP) return false;
      }
      return true;
    };
    const closestSlot = (o) => {
      let best = -1, distance = Infinity;
      for (let j = 0; j < fanCount; j++) {
        const d = Math.hypot(fan[j * 2] - o.p.x, fan[j * 2 + 1] - o.p.z);
        if (d < distance && slotFree(o, j)) { best = j; distance = d; }
      }
      return best;
    };
    const goBack = (o) => {
      o.phase = BACK; o.reservedAt = t; o.slot = closestSlot(o);
      const site = sites[o.site];
      o.legCount = 0;
      if (Math.hypot(site.approach[0] - o.p.x, site.approach[1] - o.p.z) > SKIP_APPROACH) leg(o, site.approach[0], site.approach[1], false);
      if (o.slot >= 0) leg(o, fan[o.slot * 2], fan[o.slot * 2 + 1], true);
      else { const a = Math.atan2(o.p.x, o.p.z); leg(o, Math.sin(a) * ring.loading, Math.cos(a) * ring.loading, true); }
      go(o, RUSH);
      version++;
    };
    const work = (o, dt) => {
      if (o.phase === NONE) {
        if ((o.timer -= dt) <= 0) startTrip(o);
        return;
      }
      if ((o.phase === OUT || o.phase === STATION || o.phase === SHOOT) && !active(o, o.site)) {
        o.plan = nextSite(o, o.site);
        if (o.phase === SHOOT && o.act === ACT.FIRE) o.ammo = Math.max(0, AMMO - Math.floor(o.fired / BURST_S) * BURST_ROUNDS);
        goBack(o);
        return;
      }
      if (o.phase === OUT) {
        const site = sites[o.site];
        walk(o, dt);
        if (Math.hypot(site.approach[0] - o.p.x, site.approach[1] - o.p.z) <= site.approachDistance || o.leg >= o.legCount) {
          o.phase = STATION; o.legCount = 0; leg(o, o.px, o.pz, false); go(o, RUSH);
        }
      } else if (o.phase === STATION) {
        if (walk(o, dt)) {
          const m = sites[o.site].mouth;
          o.phase = SHOOT; o.act = ACT.AIM; o.timer = 0.2 + o.index * 0.07; o.fired = 0;
          face(o, m[0], m[1]);
        }
      } else if (o.phase === SHOOT) {
        if (o.act === ACT.AIM) {
          if ((o.timer -= dt) <= 0) { o.act = ACT.FIRE; o.fired = 0; }
        } else if (o.act === ACT.FIRE) {
          o.fired += dt;
          if (o.fired >= BURST_S * AMMO / BURST_ROUNDS) { o.act = ACT.STAND; o.ammo = 0; o.timer = EMPTY_S; o.plan = nextSite(o, o.site); version++; }
        } else if ((o.timer -= dt) <= 0) goBack(o);
      } else if (o.phase === BACK) {
        if (walk(o, dt)) {
          o.phase = RELOAD; o.act = ACT.RELOAD; facePile(o);
          o.timer = (AMMO - o.ammo) / ROUNDS_PER_BITE * BITE_S + (o.maintainer ? REST_MIN + rand() * REST_SPREAD : 0);
        }
      } else if (o.phase === RELOAD) {
        o.timer -= dt;
        if (o.act === ACT.RELOAD && o.timer <= (o.maintainer ? REST_MIN : 0) && o.ammo < AMMO) { o.ammo = AMMO; if (o.maintainer) o.act = ACT.STAND; }
        if (o.timer <= 0) { o.ammo = AMMO; o.slot = -1; startTrip(o); }
      }
    };
    // Where a worker turns up: rings round the pile from the inside out, the first free spot (scene-hub.js
    // `pileRespawnSpot` with `initial`).
    const workSpot = (o) => {
      const inner = Math.max(5, platform + 1.3);
      for (let attempt = 0; attempt < 288; attempt++) {
        const angle = (attempt % 48) * Math.PI / 24, distance = inner + 0.5 + Math.floor(attempt / 48);
        const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
        if (Math.hypot(x - fireX, z - fireZ) < fireClear || near(o, x, z, RADIUS * 2 + GAP)) continue;
        beam(o, x, z);
        return;
      }
      beam(o, Math.sin(o.index) * (inner + 6), Math.cos(o.index) * (inner + 6));
    };

    // An Ooga's first showing where `place` put it, settled at the seat or spot it stands on if it stands on one.
    const takeStart = (o) => {
      if (!o.start) return false;
      o.start = false;
      beam(o, o.startX, o.startZ); o.heading = o.startHeading;
      return true;
    };
    const settleHere = (o) => {
      for (let table = 0; table < tables.length; table++) for (let i = 0; i < tables[table].length; i++) {
        const s = tables[table][i];
        if (Math.hypot(s[0] - o.p.x, s[1] - o.p.z) < START_SNAP && !taken(o, table, i)) { settle(o, table, i); return; }
      }
      o.table = o.spot = -1; o.mode = IDLE; o.act = ACT.STAND; o.until = t + pause(o);
    };

    // ---- chilling ----
    const pause = (o) => CHILL_MIN + ((o.index * 0.61803398875 + o.trips * 0.41421356237) % 1) * CHILL_SPREAD;
    const settle = (o, table, i) => {
      const s = tables[table][i];
      o.table = table; o.spot = i; o.mode = IDLE; o.until = t + pause(o);
      o.act = table === SPOTS ? ACT.STAND : ACT.SIT;
      if (s[2] !== null) o.heading = s[2]; else facePile(o);
    };
    const freeSeat = (o) => {
      const start = Math.floor(rand() * L.firstSeats);
      for (let i = 0; i < L.firstSeats; i++) {
        const k = (start + i) % L.firstSeats;
        if (spotClear(o, SEATS, k, false)) return k;
      }
      return -1;
    };
    // A stroll's end (scene-hub.js `wanderSpot`): the fire most of the time, else a spot beside the HQ ramps, else
    // anywhere in the meadow clear of the pile's ring. Sets `o.table` and `o.spot`; false with nowhere to go.
    const wanderSpot = (o) => {
      let table = -1, i = rand() < SEAT_CHANCE ? freeSeat(o) : -1;
      if (i >= 0) table = SEATS;
      if (table < 0) {
        const n = L.chillSpots.length, start = Math.floor(rand() * n);
        for (let k = 0; k < n && table < 0; k++) {
          const c = (start + k) % n;
          if (!(o.table === CHILL_SPOTS && o.spot === c) && spotClear(o, CHILL_SPOTS, c, true)) { table = CHILL_SPOTS; i = c; }
        }
      }
      if (table < 0 && (i = freeSeat(o)) >= 0) table = SEATS;
      if (table < 0) {
        const n = L.spots.length, start = Math.floor(rand() * n);
        for (let k = 0; k < n && table < 0; k++) {
          const c = (start + k) % n;
          if (!(o.table === SPOTS && o.spot === c) && spotClear(o, SPOTS, c, true)) { table = SPOTS; i = c; }
        }
      }
      if (table < 0) return false;
      o.table = table; o.spot = i;
      return true;
    };
    const stroll = (o) => {
      if (!wanderSpot(o)) { o.until = t + pause(o); return; }
      const s = tables[o.table][o.spot];
      o.mode = WANDER; o.trips++; o.legCount = 0; leg(o, s[0], s[1], false); go(o, WANDER_SPEED + rand() * WANDER_SPREAD);
    };
    // A worker done working walks back by its cave's trail and round the pile, then strolls (crew.js `startChillReturn`).
    const chillReturn = (o) => {
      o.legCount = 0;
      if (o.site >= 0) {
        const a = sites[o.site].approach;
        if (Math.hypot(a[0] - o.p.x, a[1] - o.p.z) > SKIP_APPROACH) leg(o, a[0], a[1], false);
      }
      const bearing = Math.atan2(o.p.x, o.p.z);
      leg(o, Math.sin(bearing) * ring.traffic, Math.cos(bearing) * ring.traffic, true);
      o.phase = NONE; o.slot = -1; o.site = -1; o.plan = -1;
      if (wanderSpot(o)) { const s = tables[o.table][o.spot]; leg(o, s[0], s[1], true); }
      o.mode = RETURN; go(o, CHILL_RETURN);
    };
    // A chiller turns up at the first free seat by the fire, clear of the pile's ring (scene-hub.js `settleFireSeat`).
    const seatFirst = (o) => {
      for (let i = 0; i < L.seats.length; i++) {
        const s = L.seats[i];
        if (!spotClear(o, SEATS, i, true) || near(o, s[0], s[1], RADIUS * 2 + GAP)) continue;
        beam(o, s[0], s[1]); settle(o, SEATS, i);
        return true;
      }
      if (!wanderSpot(o)) return false;
      const s = tables[o.table][o.spot];
      beam(o, s[0], s[1]); settle(o, o.table, o.spot);
      return true;
    };
    const chill = (o, dt) => {
      if (o.mode === WANDER || o.mode === RETURN) {
        if (walk(o, dt)) {
          if (o.table >= 0) settle(o, o.table, o.spot);
          else { o.mode = IDLE; o.act = ACT.STAND; o.until = t + pause(o); facePile(o); }
        }
        return;
      }
      if (t >= o.until || inZone(o.p.x, o.p.z) || Math.hypot(o.p.x, o.p.z) < ring.outer + CHILL_CLEAR) stroll(o);
    };

    // The cave an Ooga works, plus one (0 for none): the top bits of its row's flags.
    const planOf = (o) => o.state === WORKING && o.phase !== NONE ? (o.site + 1) & 7 : 0;
    // ---- the routine ----
    const change = (o) => {
      const from = o.state;
      o.state = o.want;
      version++;
      if (o.state === SLEEPING || o.state === AWAY) { hide(o); o.start = false; return; }
      if (o.state === WORKING) {
        hide(o);
        if (!takeStart(o)) { workSpot(o); facePile(o); }
        o.act = ACT.STAND; o.ammo = AMMO; o.timer = 0; o.plan = -1; o.site = -1;
        return;
      }
      if (from === WORKING && o.visible) { o.mode = 0; o.table = o.spot = -1; chillReturn(o); return; }
      hide(o);
      if (takeStart(o)) { settleHere(o); return; }
      // Nowhere to sit or stand: away for now, and asked again in a while, as the crew asks at its next refresh.
      if (!seatFirst(o)) { o.state = AWAY; hide(o); o.retryAt = t + RETRY_S; }
    };
    const tick = (dt) => {
      t += dt;
      refreshZones();
      refreshFan();
      for (let i = 0; i < oogas.length; i++) {
        const o = oogas[i];
        if (o.want !== o.state && o.want >= 0 && t >= o.retryAt) change(o);
        if (o.visible) {
          if (o.state === WORKING) work(o, dt);
          else if (o.state === CHILLING) chill(o, dt);
        }
        const shown = (o.visible ? o.act : ACT.HIDDEN) | o.state << 3 | planOf(o) << 5;
        if (shown !== o.shown || o.act === ACT.WALK) { o.shown = shown; stir++; }
      }
    };
    let owed = 0;
    /** Runs the routine on `dt` seconds, a fixed step at a time (at most a second's worth a call). */
    const step = (dt) => {
      owed = Math.min(owed + dt, STEP * MAX_STEPS);
      while (owed >= STEP) { owed -= STEP; tick(STEP); }
    };

    /** Writes every Ooga into game-wire.js frame `f` as a row: type 0, its roster index, its name's hash, where it
     * stands (the page stands it on its own ground, so y carries instead the cave its gorilla goes ahead to, plus one,
     * in metres), its heading, and flags (what it does, the low three bits; its state, the next two; the cave it
     * works, plus one, the top three). */
    const motion = (f, serverMs) => {
      f.kind = 2; f.serverMs = serverMs; f.gameMs = t * 1000; f.confirms = 0;
      const n = Math.min(oogas.length, f.rows.length / 8, 255);
      for (let i = 0; i < n; i++) {
        const o = oogas[i], k = i * 8;
        f.rows[k] = 0; f.rows[k + 1] = i; f.rows[k + 2] = o.id;
        f.rows[k + 3] = o.p.x; f.rows[k + 4] = o.phase === NONE || o.state !== WORKING ? 0 : (o.plan >= 0 ? o.plan : o.site) + 1;
        f.rows[k + 5] = o.p.z; f.rows[k + 6] = o.heading;
        f.rows[k + 7] = (o.visible ? o.act : ACT.HIDDEN) | o.state << 3 | planOf(o) << 5;
      }
      f.count = n;
      return true;
    };

    return {
      setCast, setActivity, place, setPile, setBananas, step, motion,
      // `clock` is `t` and the time owed it short of a step, which runs on between steps, as a page draws by it.
      get t() { return t; }, get clock() { return t + owed; }, get version() { return version; }, get stir() { return stir; }, get oogas() { return oogas; }, get ring() { return ring; },
      get fan() { return fanCount; }, get platform() { return platform; }, byName: (name) => byName.get(name) || null
    };
  };

  /** Which caves (`sites`, island-layout.js) a contributor is active at now, as a bitmask: within the working hour at a
   * cave's repository or its additional one, the fallback cave for a repository with no cave, or every cave for a
   * maintainer (contributors.js `hasRecentActivity`, crew.js `siteActive`). `activity` maps repositories to stamps. */
  const sitesFor = (sites, activity, maintainer, at) => {
    if (maintainer) return (1 << sites.length) - 1;
    let mask = 0, orphan = false;
    const fresh = (stamp) => stamp > 0 && stamp <= at && at - stamp < HOUR;
    for (const [repo, stamp] of activity) {
      if (!fresh(stamp)) continue;
      let found = false;
      for (let s = 0; s < sites.length; s++) if (sites[s].repo === repo || sites[s].additionalRepo === repo) { mask |= 1 << s; found = true; }
      if (!found) orphan = true;
    }
    if (orphan) for (let s = 0; s < sites.length; s++) if (sites[s].fallback) mask |= 1 << s;
    return mask;
  };

  BL.islandSim = { create, stateAt, sitesFor, STATES, ACT, STEP, KIND: 2 };
})();
