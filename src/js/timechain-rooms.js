// The Timechain Sphere's rooms, each its own kind of place, numbered on the keypad's 0–9: 0 the Conference Room, 1 the
// Lecture Hall, 2 the Mining Museum, 3 Satoshi's Temple, 4 Proof of Work-out, 5 the Movie Theater, 6 the Block Party and
// 7 the Planetarium. 8 and 9 are empty: on the keypad and in the directory, greyed out and never chosen. A room is an
// integer `id`, validated wherever one comes in (`parse`, which refuses an empty number): the keypad, a route, a history
// entry, a stored visit.
// Signed in, a room's zone (`sphere-<id>`, never a dotted name, which would fold every room into one voice group)
// is who is seen and heard there; a solo visit uses the same design and joins nothing.
//
// Every room is a true sphere: radius `R`, its centre `c` over the doorway's floor, the floor at `yMin` (0, or the foot
// of a raked hall's terraces below the doorway's landing). The whole sphere over its screen's lower edge (`edge`, a
// height, or a tilted plane in the raked halls) is the screen, and the dark wall is below it. Each kind keeps the size
// its mock-up was drawn at; the doorway, the arrival, the Exit button, the lock and everything a body touches keep
// human size in every room.
//
// `layout(id)` is pure numbers in the room's own frame: the floor's middle at the origin, the front toward -z, the one
// doorway centred on +z opposite it, so whoever comes in faces the front with the room wrapping as far to the left as
// to the right. An azimuth is measured from the front (-z) toward +x, an elevation from the sphere's centre. Loadable
// in Node for the suite.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const COUNT = 10, DEG = Math.PI / 180, TAU = Math.PI * 2;
  const EXTERIOR_ZONE = "sphere";
  // The parts that keep their size in every room: a doorway in a flat bay of the wall (`casing` high), the vestibule
  // behind it, and the Exit button beside it at hand height.
  const DOOR = { halfW: 1.5, height: 3.2, bay: 2.7, vestibule: 2.6, frame: 0.18, casing: 4 };
  const BODY = 0.3;
  // In keypad order's number: the kind, its name, the line under it and its sphere's radius, as the mock-ups drew them;
  // null for a number with no room behind it yet.
  const KINDS = [
    { kind: "conference", name: "Conference Room", tag: "Live block and mining charts round the dome", R: 10.5 },
    { kind: "lecture", name: "Lecture Hall", tag: "Lectures on the dome, lounge chairs on broad terraces", R: 15 },
    { kind: "mining", name: "The Mining Museum", tag: "From Satoshi's CPU to today's ASICs", R: 15 },
    { kind: "temple", name: "Satoshi's Temple", tag: "A meditation temple; the bell rings every block", R: 15 },
    { kind: "workout", name: "Proof of Work-out", tag: "Pedal to find a fake block", R: 12 },
    { kind: "theater", name: "Movie Theater", tag: "The whole dome is the picture", R: 20 },
    { kind: "party", name: "Block Party", tag: "The bass drops on every block", R: 20 },
    { kind: "planetarium", name: "Planetarium", tag: "Tonight's sky over London", R: 8 },
    null,
    null
  ];
  // Every number on the keypad, an empty one (`empty`) named "Empty" with no kind. Only the Conference Room has a lock:
  // a keypad inside its doors that shuts it to anyone without the PIN.
  const ROOMS = Object.freeze(KINDS.map((k, id) => Object.freeze(k
    ? { id, zone: `sphere-${id}`, kind: k.kind, name: k.name, tag: k.tag, radius: k.R, ambience: k.kind, lockable: k.kind === "conference", empty: false }
    : { id, zone: `sphere-${id}`, kind: null, name: "Empty", tag: "No room here yet", radius: 0, ambience: null, lockable: false, empty: true })));
  const LOCKABLE = Object.freeze(ROOMS.filter((room) => room.lockable).map((room) => room.id));
  const OPEN = Object.freeze(ROOMS.filter((room) => !room.empty).map((room) => room.id));
  // A room id from whatever a boundary hands in: an integer 0–9 or its one-digit string, of a number with a room behind
  // it. Anything else, an empty number included, is null.
  const parse = (value) => {
    const id = typeof value === "number" ? Number.isInteger(value) && value >= 0 && value < COUNT ? value : null
      : typeof value === "string" && /^[0-9]$/.test(value) ? Number(value) : null;
    return id === null || ROOMS[id].empty ? null : id;
  };
  const get = (value) => {
    const id = parse(value);
    return id === null ? null : ROOMS[id];
  };
  // The sphere and its screen for each kind. The raked halls step down from the doorway's landing toward a focus in
  // front (`rake`): rows `depth` deep round it, seats `pitch` apart along them as far round as `psiMax` degrees, either
  // side of an aisle `aisle` wide each way; with `aisleSteps` the aisle has that many steps in every riser, each an
  // equal share of the row's depth and of its riser (the theater's one, a half step; the Lecture Hall's two, a third
  // each, its four broad terraces standing a riser too tall for a walker apart), and with `dais` a round stage stands
  // at the focus.
  const shapeOf = (kind, R) => {
    if (kind === "planetarium") return { c: 1.6, yMin: 0, P: 0, edge: { flat: 1.6 } };
    if (kind === "lecture") {
      const P = 0.26 * R;
      return { c: 0.1 * R, yMin: -P, P, edge: { A: [-R, -P + 2.3], B: [R, 3.7] }, rake: { focus: -0.45 * R, front: 0.94, back: 10, depth: 3.02, pitch: 2.9, psiMax: 58, seatTop: 0.42, aisleSteps: 2, dais: true, aisle: 1.1 } };
    }
    if (kind === "theater") {
      const P = 0.38 * R;
      return { c: -0.145 * R, yMin: -P, P, edge: { A: [-R, -P + 0.6], B: [R, 4.3] }, rake: { focus: -0.6 * R, front: 0.05 * R, back: 0.74 * R, depth: 1.3, pitch: 1.3, psiMax: 72, seatTop: 0.44, aisleSteps: 1, aisle: 0.6 } };
    }
    return { c: 0.3 * R, yMin: 0, P: 0, edge: { flat: 3.75 } };
  };
  const radiusAt = (L, y) => Math.sqrt(Math.max(0, L.R * L.R - (y - L.c) * (y - L.c)));
  // A point on the sphere (or `inset` of the way in) from its azimuth and elevation, in radians.
  const onSphere = (L, az, el, inset = 1, out = {}) => {
    const r = L.R * inset, h = r * Math.cos(el);
    out.x = h * Math.sin(az); out.y = L.c + r * Math.sin(el); out.z = -h * Math.cos(az);
    return out;
  };
  // The screen's lower edge at a point of the room's floor plan: a height, or the tilted plane's at that z.
  const edgeY = (L, z) => {
    const E = L.edge;
    if (E.flat !== undefined) return E.flat;
    return E.A[1] + (z - E.A[0]) * (E.B[1] - E.A[1]) / (E.B[0] - E.A[0]);
  };
  // The elevation of the screen's lower edge at azimuth `az` (radians), found along the meridian.
  const edgeEl = (L, az) => {
    let lo = -89 * DEG, hi = 89 * DEG;
    const p = {};
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      onSphere(L, az, m, 1, p);
      if (p.y > edgeY(L, p.z)) hi = m; else lo = m;
    }
    return hi;
  };
  // The raked halls' rows: curved terraces round the focus, stepping down from the doorway's landing to the front, and
  // the seats along each, either side of the aisle down the middle.
  const rakeOf = (L, K) => {
    const F = K.focus, n = Math.max(3, Math.round((K.back - K.front) / K.depth) + 1), rows = [];
    const fit = (r, lim) => { let best = 0; for (let a = 0; a <= 175; a += 0.5) { const t = a * DEG; if (Math.hypot(r * Math.sin(t), F + r * Math.cos(t)) <= lim) best = a; else break; } return best; };
    for (let i = 0; i < n; i++) {
      const zc = K.front + i * (K.back - K.front) / (n - 1), d = zc - F, y = -L.P + i * L.P / n;
      const yFar = Math.abs(L.yMin - L.c) > Math.abs(y - L.c) ? L.yMin : y;
      const lim = radiusAt(L, yFar) - 0.05, rIn = d - K.depth / 2, rOut = d + K.depth / 2;
      rows.push({ i, zc, d, y, rIn, rOut, psiT: fit(rIn, lim) * DEG, psiS: Math.min(K.psiMax, fit(d, lim - 0.9)) * DEG });
    }
    const seats = [];
    for (const row of rows) {
      for (let s = K.aisle + K.pitch / 2; s / row.d <= row.psiS; s += K.pitch) for (const side of [-1, 1]) {
        const psi = side * s / row.d;
        seats.push({ row: row.i, x: row.d * Math.sin(psi), z: F + row.d * Math.cos(psi), floor: row.y, heading: psi });
      }
    }
    return { F, rows, seats, landing: rows[n - 1].rOut, stage: K.dais ? rows[0].rIn - 1.2 : 0, stageTop: K.dais ? L.yMin + 0.4 : L.yMin };
  };
  const layouts = new Map();
  const layout = (id) => {
    const room = get(id);
    if (!room) throw new Error(`No Timechain room ${id}`);
    if (layouts.has(room.id)) return layouts.get(room.id);
    const R = room.radius, shape = shapeOf(room.kind, R);
    const L = { id: room.id, kind: room.kind, R, radius: R, ...shape };
    L.r0 = radiusAt(L, 0);
    // The doorway's bay is a flat chord of the wall where the sphere is narrowest over the bay's height (at the landing,
    // or at the bay's top where the sphere closes in over it), so the whole bay stands inside it.
    const rDoor = Math.min(L.r0, radiusAt(L, DOOR.casing));
    L.doorZ = Math.sqrt(rDoor * rDoor - DOOR.bay * DOOR.bay) - 0.05;
    L.crown = L.c + R;
    if (L.rake) L.rake = Object.freeze({ ...L.rake, ...rakeOf(L, L.rake) });
    const doorZ = L.doorZ;
    Object.assign(L, {
      door: DOOR,
      // Where a guided arrival begins (in the vestibule, behind the door) and ends, facing the front; the Exit button on
      // the bay to the right of the doorway as one faces it, and where Space reaches it from.
      threshold: { x: 0, z: doorZ + DOOR.vestibule * 0.55 },
      arrival: { x: 0, z: doorZ - 2.4, heading: Math.PI },
      exitButton: { x: -(DOOR.halfW + 0.72), y: 1.2, z: doorZ - 0.07 },
      exitReach: 2.2,
      // A lockable room's lock: a keypad on the bay the other side of the doors from the Exit button, and the sign across
      // the doors while it is locked. Null in every other room.
      lockPad: room.lockable ? { x: DOOR.halfW + 0.72, y: 1.25, z: doorZ - 0.03 } : null, lockReach: 2.2, lockSign: { y: 2.3, z: doorZ - 0.03 },
      // The walk out stops at the door's foot, square to it, before the doors part.
      doorStep: { x: 0, z: doorZ - 0.9 },
      // Where the eye stands when a crossing from the island hands over (in the vestibule, facing the room through the
      // open doors), and the plane at the vestibule's far end where the island's own view hangs for the way back out.
      entry: { z: doorZ + 1.3 }, veil: doorZ + DOOR.vestibule - 0.03,
      // A walker's distance from the wall.
      wallGap: 0.35
    });
    const value = Object.freeze(L);
    layouts.set(room.id, value);
    return value;
  };
  // The floor under (x, z): the landing at 0, a raked hall's terrace or the stage, an aisle's steps.
  const floorAt = (L, x, z) => {
    const K = L.rake;
    if (!K) return 0;
    const d = Math.hypot(x, z - K.F), rows = K.rows;
    if (d >= K.landing) return 0;
    if (d < rows[0].rIn) return K.stage && d < K.stage ? K.stageTop : L.yMin;
    // Rows stand a little closer than their depth, so each runs to the midpoint between its centre and the next's.
    const k = Math.min(rows.length - 1, Math.max(0, Math.round((d - rows[0].d) / (rows[1].d - rows[0].d)))), row = rows[k];
    // In an aisle with steps each row's depth is shared between its own level and the steps up to the next row, so no
    // step there is over a walker's.
    if (K.aisleSteps && Math.abs(x) < K.aisle) return aisleStep(K, k, Math.min(K.aisleSteps, Math.max(0, Math.floor((d - row.rIn) * (K.aisleSteps + 1) / K.depth))));
    return row.y;
  };
  // The height of row `k`'s aisle step `j` in a raked hall: 0 the row's own level, then each step an equal share of
  // the riser up to the next row (or the landing).
  const aisleStep = (K, k, j) => {
    const y = K.rows[k].y;
    return y + j * ((k + 1 < K.rows.length ? K.rows[k + 1].y : 0) - y) / (K.aisleSteps + 1);
  };
  // How far out a body may stand with its feet at `y` and stay inside the sphere from its feet to its head.
  const wallAt = (L, y) => Math.min(radiusAt(L, y + 0.05), radiusAt(L, y + 1.9)) - L.wallGap;
  // How high a walker steps up onto a solid's top without a jump: a step, a low plinth, a cushion, a treadmill's deck.
  const STEP_UP = 0.45;
  // Whether a body of `radius` with its feet at `feet` may stand at (x, z): inside the sphere and short of the closed
  // door's bay, clear of `solids` (circles and boxes, a box turned by `ry`; one with a `top` only below it, less a step,
  // so a body steps up onto it; one with a `below` only for a head that reaches it). `door` opens the doorway and its
  // vestibule to the guided walk alone.
  const clearAt = (L, x, z, radius = BODY, door = false, feet = 0, solids = null) => {
    const r = radius;
    // Reaching back a body's width, so it overlaps the room's own edge below whatever the walker's size.
    if (door && Math.abs(x) < DOOR.halfW - r && z >= L.doorZ - 0.6 - r && z <= L.doorZ + DOOR.vestibule - r) return true;
    // Where the sphere widens over the floor a body in the air keeps to where it can stand, so no jump comes down held
    // by the wall.
    if (Math.hypot(x, z) > Math.min(wallAt(L, feet), wallAt(L, floorAt(L, x, z))) - r || z > L.doorZ - 0.12 - r) return false;
    if (solids) for (const o of solids) {
      if (o.top !== undefined && feet >= o.top - STEP_UP) continue;
      if (o.below !== undefined && feet + 1.8 <= o.below) continue;
      if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false; }
      else {
        const c = o.ry ? Math.cos(o.ry) : 1, s = o.ry ? Math.sin(o.ry) : 0, dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx * c - dz * s) < o.hx + r && Math.abs(dx * s + dz * c) < o.hz + r) return false;
      }
    }
    return true;
  };
  // The height of the ceiling over (x, z): the sphere's inner face as its flat facets lie, a little inside the curve.
  const ceilingAt = (L, x, z) => {
    const R = L.R * 0.99, r = Math.hypot(x, z);
    return r >= R ? L.c : L.c + Math.sqrt(R * R - r * r);
  };
  // A picture that fills the whole view, seen square on from `D` metres at eye height `eye` (camera `fov` high, `aspect`
  // wide), in a corridor `width` wide between `floor` and `ceiling`, no further than `reach`: the distance and the
  // picture's size. Both doorways hang one (the room on the island's side, the island in the room's vestibule), and
  // the crossing hands over where the eye stands `D` in front of it, so the last frame of one side is the first of the
  // other.
  const fill = (fov, aspect, eye, width, floor, ceiling, reach) => {
    const v = Math.tan(fov / 2), h = v * aspect;
    const D = Math.max(0.3, Math.min(width / (2 * h), (eye - floor) / v, (ceiling - eye) / v, reach));
    return { D, w: 2 * D * h, h: 2 * D * v };
  };
  BL.timechainRooms = { COUNT, ROOMS, LOCKABLE, OPEN, EXTERIOR_ZONE, DOOR, BODY, STEP_UP, DEG, TAU, parse, get, layout, radiusAt, onSphere, edgeY, edgeEl, floorAt, aisleStep, wallAt, clearAt, ceilingAt, fill };
})();
