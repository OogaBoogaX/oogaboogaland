// One face-up resting place in a grass patch beside Ooga Arcade. Both palms and the entire
// suspension span stay off paths. Two angled ropes join the trunks directly to the swinging
// bed ends; the axis used to calculate sway is virtual, with no ridgeline or hanging cords.
// Occupancy uses the existing crew seat and remote pose contracts. The seat advertises
// `lying` so the pilot uses the bed's bounded, head-relative first-person view.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb } = BL.math;
  // Metres. TIE is the height of the fixed trunk attachments. The virtual swing axis lies
  // just below them. The bed is BED_LEN along that axis and BED_W across, its ends END_Y above ground and its middle
  // BED_SAG lower, cradled CRADLE across; the trunks stand at least TRUNK_CLEAR from its ends. END_Y keeps the
  // cloth's edge along the middle of the bed under a walker's step (`pilot.WALK.step`, 0.6), so an Ooga walking
  // at its side steps up onto it, while its spreader ends stay too high to step onto.
  const TIE = 3.05, RIDGE_SAG = 0.12, SPAN_MIN = 4.5, SPAN_MAX = 10;
  const BED_LEN = 2.5, BED_W = 0.95, END_Y = 0.68, BED_SAG = 0.2, CRADLE = 0.07, TRUNK_CLEAR = 0.6;
  // The one resting place is centred on the cloth; the crew seat contract owns occupancy and standing up.
  const SEAT_AT = [0], SEAT_LIFT = 0.04, SLOTS = SEAT_AT.length;
  const ENTRY_SECONDS = 0.9, ENTRY_PARTS = ["legL", "legR", "armL", "armR", "head"], AXES = ["x", "y", "z"];
  // Tipped out (`tip`): FALL_SECONDS in all, rolling over the cloth's edge onto the ground (to FALL_ROLL of the way), lying there (to FALL_LIE),
  // then getting up where it landed; the roll turns the body FALL_TURN about the bed's long axis, toward the side it falls to, and it lies
  // FALL_LIE_Y of its height over the ground.
  const FALL_SECONDS = 1.5, FALL_ROLL = 0.4, FALL_LIE = 0.62, FALL_TURN = Math.PI * 0.9, FALL_LIE_Y = 0.14;
  // Where an Ooga stands up: STAND past the bed's swing (`envelope`'s `across`), room for the widest Ooga.
  const STAND = 0.6;
  // The swing: the bed's angle about the virtual swing axis is `amp` sin(phase), the phase turning at OMEGA, `amp` easing toward
  // REST (or REST_HELD with anyone in it) at DECAY a second and never past SWAY_MAX; a sitter's landing and a shaken palm add KICK.
  // Pushes and bananas climb it in steps that the bed remembers: every hit adds to one `count` shared by everyone (a run or a
  // plain walk into the bed is 1; fire is by the burst: the first round of a burst, rounds with no gap longer than BURST_GAP,
  // is 1 however short the burst, and each later round in it (TIP_COUNT - 1) / (BURST_N - 1), so a held trigger
  // reaches TIP_COUNT by itself at the BURST_N-th round), the count forgets itself after RESET_S seconds without a hit or when
  // the bed is taken or left, and each hit lifts the swing to base + count STEP (base the rest the bed has with or without an
  // occupant), however far it has eased down since, so the staircase is as clear after a long gap as after a short one, and
  // each round of a held trigger takes it a little higher. The count reaching TIP_COUNT (four) while the bed is held is
  // `spilling`: the occupant's own page then rolls them out. A hit also sets the phase so the bed sets off away from the pusher
  // or shooter that instant, without jumping, and a push timed as it swings away from them adds up to MOMENTUM more height
  // (never to the count). Climbing in settles the bed to REST_HELD with the count at zero. The hammock hangs where its original
  // planned swing PLAN_SWAY fits (`plan`, `envelope`: the claim on the ground and the stand-up spot), so it hangs where it always has;
  // the pushes swing it further, up to SWAY_MAX (about 23 degrees: a push is meant to be felt), and `swing` is that outline.
  const OMEGA = 2.1, REST = 0.012, REST_HELD = 0.035, DECAY = 0.35, KICK = 0.06, PLAN_SWAY = 0.11, SWAY_MAX = 0.4, TAU = Math.PI * 2;
  // The rifle fires 3-round bursts 0.09 s apart, 0.44 s between them while the trigger is held (crew.js `BURST_ROUNDS`, `BURST_STEP`,
  // `SHOT_PERIOD`; magazine `AMMO_MAX` 30), so no gap in a held trigger is over 0.26 s: BURST_GAP of 0.4 s keeps a hold one burst and
  // parts separate bursts. A held trigger of BURST_N rounds (a magazine is 30) tips an occupant out by itself.
  const STEP = 0.09, RESET_S = 60, TIP_COUNT = 4, BURST_GAP = 0.4, BURST_N = 20, MOMENTUM = 0.03;
  // Lying in it, the visitor rocks it with A and D (`pump`): a key held with the swing for PUMP_HOLD seconds is one good pump, which
  // lifts the swing a step of PUMP_STEP (the ease-back waiting while the key is held with the swing, so each step is kept), a key held
  // against the swing damps it PUMP_DAMP a second, and a tap shorter than PUMP_HOLD does nothing. It never touches the count, but the
  // swing itself passing FALL tips them out, so ten good pumps from rest (one each half-swing, about fifteen seconds of good timing) roll
  // them out of their own hammock, each visibly higher than the last; holding one key, or casual taps, come nowhere near.
  const PUMP_STEP = 0.036, PUMP_HOLD = 0.3, PUMP_DAMP = 0.04;
  // The swing the fourth hit lifts the bed to: a swing this high with the visitor's own Ooga lying in it tips them out however it got there.
  const FALL = REST_HELD + TIP_COUNT * STEP;
  // A body walking into the bed (`bump`): its footprint BUMP_RADIUS across (the hub's walker) touching the swing's
  // outline (`swing`), from the ground up to the shell plus a walker's step (BUMP_RISE), is a push of its speed across the bed times
  // BUMP_GAIN, a full step from 7 m/s (a walk is 7.75, a run 11.6). One contact is one push, however long it is held: a body
  // pushes again only after it has stepped BUMP_REARM from the outline (half a metre clear of the touching distance), whoever it
  // is; a push of half a step or more counts, a gentler one (under 3.5 m/s) only eases the swing up; slower than BUMP_MIN is a
  // lean, not a push, and faster than BUMP_TELEPORT (twice a run, pilot.js `WALK`) is an arrival, not a walk. Neither adds
  // anything. A counted push also shoves the bed along, LEAN (about 11 degrees) at a walk and up to SHOVE_RUN times that at a run: the
  // bed is moving away from the pusher from the very next frame, the shove eases in over LEAN_RISE seconds (one connected push, not a
  // one-frame jolt) and then relaxes over LEAN_TAU seconds while the swing it lifted carries on.
  const BUMP_RADIUS = 0.3, BUMP_REARM = BUMP_RADIUS + 0.5, BUMP_RISE = 0.6, BUMP_GAIN = STEP / 7, BUMP_MIN = 0.5, BUMP_TELEPORT = 2 * 7.75 * 1.5;
  const LEAN = 0.2, LEAN_TAU = 0.45, LEAN_RISE = 0.12, SHOVE_RUN = 1.5;
  const easeInOut = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  // The cloth grid and radii of its spreaders, edge cords and suspension rings.
  const BED_NX = 14, BED_NZ = 4, SPREADER_R = 0.035, SPREADER_KNUCKLE = 1.14, EDGE_R = 0.016, CORD_R = 0.011, DROP_R = 0.022;
  const CORD_Z = [-BED_W / 2 - 0.06, -BED_W / 4, BED_W / 4, BED_W / 2 + 0.06];
  // The suspension ring beyond each end of the bed.
  const RING_OUT = 0.28;
  // The collision shell follows the resting cloth: SHELL_TOP over it (the edge cords' tops), SHELL_UNDER under it,
  // as wide as the cloth and its edge cords and, at the spreaders, as long as the spreaders. Across it also takes the sideways
  // travel of the occupied swing (REST_HELD), so a visitor standing beside it is not swept through; a kick's brief
  // larger swing is visual only.
  const SHELL_TOP = 0.028, SHELL_UNDER = 0.03;
  // Stowed gear lies flat under the cloth, its outline packed on a grid of GEAR_CELL cells, GEAR_LIFT over the ground,
  // at most GEAR_TOP high, and GEAR_CLEAR under the cloth over each of its cells through the occupied bed's resting sway
  // (REST_HELD; a pushed or pumped swing past it is not part of that bound).
  const GEAR_CELL = 0.025, GEAR_LIFT = 0.01, GEAR_TOP = 0.5, GEAR_CLEAR = 0.01;
  // A resting Ooga as another page sends it: within REST_NEAR of a seat across, its feet REST_LOW to REST_HIGH over
  // the ground. Current pages send their rest state explicitly; this inference is only for pages that omit it.
  const REST_NEAR = 0.4, REST_LOW = 0.05, REST_HIGH = 0.9;
  const ROPE = "#c9a36a", CORD = "#7a5a32";
  const WEAVE = ["#b48a52", "#9c7443", "#b48a52", "#c25d3a", "#d7a95a", "#c25d3a"].map(hexToRgb), WEAVE_UNDER = hexToRgb("#6e5233");

  // The virtual sway axis height at t between the tree attachments.
  const ridgeY = (p, t) => p.ay + (p.by - p.ay) * t - Math.sin(Math.PI * t) * RIDGE_SAG;
  // The cloth's height under the pivot at x along the bed and z across it, before any swing.
  const clothY = (p, x, z) => p.endY - Math.sin(Math.PI * (x / BED_LEN + 0.5)) * BED_SAG - Math.cos(Math.PI * z / BED_W) * CRADLE;

  // How far the bed reaches as it swings, in the pivot's frame (x along the virtual swing axis, y up from it, z across): every
  // point `bedGeometry` draws through, with the thickness of the part there, turned through +-`sway` about the
  // virtual axis. Seen from above it is an octagon: the `body` (the cloth, its edge cords and the spreaders) `half` along
  // and `across` either side, and past it the `tip` (each suspension ring), the cords
  // between the two inside the outline; `lo` and `hi` under and over the pivot, `top` the body's highest. `plan`
  // keeps the ground under the octagon clear; the collision shell (`shell`) is the resting cloth, inside it.
  const envelope = (p, sway = PLAN_SWAY) => {
    const body = { half: 0, across: 0 }, tip = { half: 0, across: 0 }, e = { body, tip, lo: Infinity, hi: -Infinity, top: -Infinity, sway };
    const c = Math.cos(sway), s = Math.sin(sway);
    // A cos a + B sin a over the swing: its ends, and where its slope is zero when that falls inside.
    const swung = (A, B) => {
      const out = [A * c - B * s, A * c + B * s], a = A ? Math.atan(B / A) : Infinity;
      if (Math.abs(a) < sway) out.push(A * Math.cos(a) + B * Math.sin(a));
      return out;
    };
    // Turned by a, a point lies y sin a + z cos a across and y cos a - z sin a high.
    const at = (part, x, y, z, r) => {
      part.half = Math.max(part.half, Math.abs(x) + r);
      for (const v of swung(z, y)) part.across = Math.max(part.across, Math.abs(v) + r);
      for (const v of swung(y, -z)) {
        e.lo = Math.min(e.lo, v - r); e.hi = Math.max(e.hi, v + r);
        if (part === body) e.top = Math.max(e.top, v + r);
      }
    };
    for (let i = 0; i <= BED_NX; i++) for (let j = 0; j <= BED_NZ; j++) {
      const x = (i / BED_NX - 0.5) * BED_LEN, z = (j / BED_NZ - 0.5) * BED_W;
      at(body, x, clothY(p, x, z), z, 0);
    }
    for (const z of [-BED_W / 2, BED_W / 2]) for (let i = 0; i <= BED_NX; i += 2) { const x = (i / BED_NX - 0.5) * BED_LEN; at(body, x, clothY(p, x, z) + 0.012, z, EDGE_R); }
    for (const end of [-1, 1]) {
      const x = end * BED_LEN / 2;
      for (const z of [-1, 1]) at(body, x, p.endY + 0.02, z * (BED_W / 2 + 0.1), SPREADER_R * SPREADER_KNUCKLE);
      for (const z of CORD_Z) at(body, x, p.endY + 0.03, z, CORD_R);
      // The fan follows the tree direction. Bound its possible height and sideways
      // travel without raising the walkable top of the cloth's collision shell.
      for (const y of [p.endY + 0.03, p.endY + 1.6]) for (const z of [-0.3, 0.3])
        at(tip, x + end * RING_OUT, y, z, DROP_R);
    }
    // Its bounds, and its corners round from the tip's on +x in the order the shell's faces wind.
    e.half = tip.half; e.across = body.across;
    e.outline = [[tip.half, -tip.across], [tip.half, tip.across], [body.half, body.across], [-body.half, body.across],
      [-tip.half, tip.across], [-tip.half, -tip.across], [-body.half, -body.across], [body.half, -body.across]];
    // The point of the octagon nearest (along, across), written into `out`: itself inside, else the nearest on the
    // edges of its quarter, the tip's end, the slant and the body's side.
    const sx = body.across - tip.across, sz = tip.half - body.half, sl = Math.hypot(sx, sz);
    const edges = [[tip.half, 0, tip.half, tip.across], [tip.half, tip.across, body.half, body.across], [body.half, body.across, 0, body.across]];
    e.nearest = (along, side, out) => {
      const u = Math.abs(along), v = Math.abs(side);
      out[0] = u; out[1] = v;
      if (Math.max(u - tip.half, v - body.across, ((u - body.half) * sx + (v - body.across) * sz) / sl) > 0) {
        let best = Infinity;
        for (const [ax, az, bx, bz] of edges) {
          const dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / (dx * dx + dz * dz)));
          const x = ax + dx * k, z = az + dz * k, d = Math.hypot(u - x, v - z);
          if (d < best) { best = d; out[0] = x; out[1] = z; }
        }
      }
      out[0] *= Math.sign(along) || 1; out[1] *= Math.sign(side) || 1;
      return out;
    };
    return e;
  };

  // The collision shell's sections, in the pivot's frame: at each of the cloth's BED_NX + 1 stations along the bed,
  // BED_NZ + 1 points across, spread `half` either side, `along` the bed (the ends at the spreaders' outer faces), with
  // the shell's `top` and `under` over and under the resting cloth there (and the spreaders at the two ends); `low` and
  // `high` the least and most of its top.
  const shell = (p) => {
    const NX = BED_NX, NZ = BED_NZ, top = new Float64Array((NX + 1) * (NZ + 1)), under = new Float64Array(top.length), half = new Float64Array(NX + 1), along = new Float64Array(NX + 1);
    const bar = p.endY + 0.02, barR = SPREADER_R * SPREADER_KNUCKLE;
    let low = Infinity, high = -Infinity;
    for (let i = 0; i <= NX; i++) {
      const x = (i / NX - 0.5) * BED_LEN, end = i === 0 || i === NX;
      // The end sections stand at the spreader bars' outer faces.
      along[i] = end ? x + Math.sign(x) * barR : x;
      // The occupied swing carries the cloth's edge sideways by its drop under the pivot times sin(REST_HELD).
      half[i] = (end ? BED_W / 2 + 0.1 : BED_W / 2 + EDGE_R) - Math.sin(REST_HELD) * clothY(p, x, BED_W / 2);
      for (let j = 0; j <= NZ; j++) {
        const cloth = clothY(p, x, (j / NZ - 0.5) * BED_W), k = i * (NZ + 1) + j;
        top[k] = end ? Math.max(cloth + SHELL_TOP, bar + barR) : cloth + SHELL_TOP;
        under[k] = end ? Math.min(cloth - SHELL_UNDER, bar - barR) : cloth - SHELL_UNDER;
        low = Math.min(low, top[k]); high = Math.max(high, top[k]);
      }
    }
    return { along, top, under, half, low, high };
  };

  // `a` and `b` are the trunks at the tie, { x, z, ground } with the ground at each foot; `clear(x, z, r)` says a
  // spot r across is off the path and unclaimed, `surfaceAt(x, z)` the island's ground. A plan, or null.
  const plan = ({ a, b, clear, surfaceAt, pathClear = clear }) => {
    const dx = b.x - a.x, dz = b.z - a.z, span = Math.hypot(dx, dz);
    if (span < SPAN_MIN || span > SPAN_MAX) return null;
    const ux = dx / span, uz = dz / span, nx = -uz, nz = ux;
    const p = { ax: a.x, az: a.z, ay: a.ground + TIE, bx: b.x, bz: b.z, by: b.ground + TIE, span, ux, uz, nx, nz };
    // Both trees and every point between them must belong to the same level grass patch.
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, x = a.x + dx * t, z = a.z + dz * t;
      if (!pathClear(x, z, 0.35) || Math.abs(surfaceAt(x, z) - a.ground) > 0.2) return null;
    }
    const t0 = (BED_LEN / 2 + TRUNK_CLEAR) / span;
    // The bed hung t of the way along: its pivot, ground, ends and swing.
    const hang = (t) => {
      p.t = t;
      p.x = a.x + dx * t; p.z = a.z + dz * t; p.ground = surfaceAt(p.x, p.z);
      p.y = ridgeY(p, t);
      p.endY = p.ground + END_Y - p.y;
      p.envelope = envelope(p);
    };
    // Its whole swing on level ground, clear: a grid no coarser than CLEAR_STEP over the envelope's bounds, each spot
    // moved to the outline's nearest point and asked CLEAR_R across. Every point of the outline lies within half a
    // cell's diagonal (under CLEAR_R) of a grid spot, and no nearer to it moved, so the spots cover it all.
    const CLEAR_STEP = 0.4, CLEAR_R = 0.3, at = [0, 0];
    const fits = (t) => {
      hang(t);
      const { half, across, nearest } = p.envelope, ni = Math.ceil(2 * half / CLEAR_STEP), nj = Math.ceil(2 * across / CLEAR_STEP);
      for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
        const [along, side] = nearest(half * (2 * i / ni - 1), across * (2 * j / nj - 1), at), x = p.x + ux * along + nx * side, z = p.z + uz * along + nz * side;
        if (!clear(x, z, CLEAR_R) || Math.abs(surfaceAt(x, z) - p.ground) > 0.2) return false;
      }
      return true;
    };
    // Nearest the middle first, a fifth of a metre at a time each way.
    let tc = NaN;
    for (let k = 0; k <= 50 && Number.isNaN(tc); k++) for (const s of k ? [-1, 1] : [1]) {
      const t = 0.5 + s * k * 0.2 / span;
      if (t >= t0 && t <= 1 - t0 && fits(t)) { tc = t; break; }
    }
    if (Number.isNaN(tc)) return null;
    hang(tc);
    const out = p.envelope.across + STAND;
    // Seats face out to the side whose places to stand are all clear, the side away from the path when both are.
    let side = 0;
    for (const s of [1, -1]) {
      let ok = true;
      for (const at of SEAT_AT) {
        const x = p.x + ux * at + nx * s * out, z = p.z + uz * at + nz * s * out;
        if (!clear(x, z, 0.35) || Math.abs(surfaceAt(x, z) - p.ground) > 0.25) { ok = false; break; }
      }
      if (ok) { side = s; break; }
    }
    if (!side) return null;
    p.side = side;
    p.yaw = Math.atan2(-uz, ux);
    p.seatRy = p.yaw + Math.PI / 2;
    p.seats = SEAT_AT.map((at) => {
      const wx = p.x + ux * at + nx * side * out, wz = p.z + uz * at + nz * side * out;
      return { at, y: clothY(p, at, 0) + SEAT_LIFT, walkAt: { x: wx, z: wz }, floor: surfaceAt(wx, wz) };
    });
    // The whole swing the pushes give it (SWAY_MAX), which pushes, rounds and a tipped Ooga's landing spot go by.
    p.swing = envelope(p, SWAY_MAX);
    // Where stowed gear finds the ground under the bed.
    p.surfaceAt = surfaceAt;
    p.shell = shell(p);
    return p;
  };

  // The bed in the pivot's frame (+x along the virtual swing axis, +z across to the seats' side when `side` is 1, y up from the
  // virtual axis): woven cloth cradled between bamboo spreaders, with cords gathering at
  // each suspension ring and a cord along each edge.
  const bedGeometry = (p) => {
    const M = BL.models, J = BL.hubModels, NX = BED_NX, NZ = BED_NZ, cloth = M.geometry(), v = cloth.verts, ids = [];
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const x = (i / NX - 0.5) * BED_LEN, z = (j / NZ - 0.5) * BED_W;
      v.push(x, clothY(p, x, z), z);
      ids.push(v.length / 3 - 1);
    }
    // Both faces of every cell: the weave's stripes run across the bed on top, a dark underside below.
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const a = ids[i * (NZ + 1) + j], b = ids[(i + 1) * (NZ + 1) + j], c = ids[(i + 1) * (NZ + 1) + j + 1], d = ids[i * (NZ + 1) + j + 1];
      cloth.faces.push({ i: [a, d, c, b], color: WEAVE[(i + (j & 1)) % WEAVE.length], emissive: 0 });
      cloth.faces.push({ i: [a, b, c, d], color: WEAVE_UNDER, emissive: 0 });
    }
    const ends = [-1, 1], round = [];
    for (const e of ends) {
      const x = e * BED_LEN / 2, y = p.endY + 0.02;
      round.push(J.bamboo(x, y, -BED_W / 2 - 0.1, x, y, BED_W / 2 + 0.1, SPREADER_R, "#cdb06a"));
    }
    return J.withJungle(M.shaded(round, [cloth]), (g) => {
      for (const z of [-BED_W / 2, BED_W / 2]) {
        const edge = [];
        for (let i = 0; i <= NX; i += 2) { const x = (i / NX - 0.5) * BED_LEN; edge.push([x, clothY(p, x, z) + 0.012, z]); }
        J.liana(g, edge, EDGE_R, EDGE_R, CORD);
      }
    });
  };

  // Invisible collision shell around the swinging cloth; the lashings belong to the palms.
  const ridgeGeometry = (p) => {
    const M = BL.models, mx = (p.ax + p.bx) / 2, my = (p.ay + p.by) / 2, mz = (p.az + p.bz) / 2;
    const geo = M.geometry();
    // Its collision is the resting cloth (`p.shell`), a closed sheet from just under it to just over it: walkers come
    // up to its side, step up onto its low middle and walk on it, while its higher spreader ends stand in their way;
    // the ropes above it and the virtual swing axis, overhead between the trunks and the bed, block nothing.
    const { along: at, top, under, half } = p.shell, NX = BED_NX, NZ = BED_NZ, row = NZ + 1, layer = (NX + 1) * row;
    const cx = p.x - mx, cy = p.y - my, cz = p.z - mz, shell = M.geometry(), v = shell.verts;
    for (const ys of [top, under]) for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const along = at[i], side = (2 * j / NZ - 1) * half[i];
      v.push(cx + p.ux * along + p.nx * side, cy + ys[i * row + j], cz + p.uz * along + p.nz * side);
    }
    // Each face wound to face away from the sheet: (oa, oy, oc) its outward direction along the bed, up and across.
    const face = (ids, oa, oy, oc) => {
      const [a, b, c] = ids.map(k => k * 3), ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const ox = p.ux * oa + p.nx * oc, oz = p.uz * oa + p.nz * oc;
      shell.faces.push({ i: nx * ox + ny * oy + nz * oz >= 0 ? ids : ids.reverse(), color: WEAVE_UNDER, emissive: 0 });
    };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const k = i * row + j;
      face([k, k + row, k + row + 1, k + 1], 0, 1, 0);
      face([layer + k, layer + k + row, layer + k + row + 1, layer + k + 1], 0, -1, 0);
    }
    for (let i = 0; i < NX; i++) for (const j of [0, NZ]) {
      const k = i * row + j;
      face([k, k + row, layer + k + row, layer + k], 0, 0, j ? 1 : -1);
    }
    for (const i of [0, NX]) for (let j = 0; j < NZ; j++) {
      const k = i * row + j;
      face([k, k + 1, layer + k + 1, layer + k], i ? 1 : -1, 0, 0);
    }
    geo.collisionGeometry = shell;
    return { geo, x: mx, y: my, z: mz };
  };

  // The hammock in `root` from a plan: `ra`, `rb` the trunks' radii at the tie, `seed` its leaves', `bumpSlots` how
  // many bodies `bump` tells apart (the visitor's own Ooga and the room's players).
  const create = ({ plan: p, root, solids, ra, rb, seed, anchors = null, bumpSlots = 64 }) => {
    const { createNode, addChild, removeChild } = BL.scene;
    const ridge = ridgeGeometry(p);
    const ridgeNode = createNode({ geometry: ridge.geo, position: { x: ridge.x, y: ridge.y, z: ridge.z }, sightHidden: true });
    // A visitor may walk on the cloth; the crew and gorillas keep treating it as in their way, as they do tree tops.
    ridgeNode.npcTreeSupport = true;
    // Its +z is the plan's `n`; the seats face +z when `side` is 1 and -z when it is -1, and the swing turns by `side`.
    const bedNode = createNode({ geometry: bedGeometry(p), position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: p.yaw, z: 0 }, sightHidden: true });
    addChild(root, ridgeNode); addChild(root, bedNode);
    solids.add(ridgeNode);
    const { quat, mat4 } = BL.math;
    const ropeGeometry = BL.hubModels.withJungle(BL.models.geometry(), (g) => BL.hubModels.liana(g, [[0, 0, 0], [0, 1, 0]], 0.03, 0.03, ROPE));
    const fanGeometry = BL.hubModels.withJungle(BL.models.geometry(), (g) => BL.hubModels.liana(g, [[0, 0, 0], [0, 1, 0]], CORD_R, CORD_R, ROPE));
    const ropes = [-1, 1].map((end, index) => {
      const radius = end < 0 ? ra : rb;
      const node = createNode({ geometry: ropeGeometry, quaternion: quat.create(), sightHidden: true,
        position: { x: (end < 0 ? p.ax : p.bx) - end * p.ux * radius, y: end < 0 ? p.ay : p.by, z: (end < 0 ? p.az : p.bz) - end * p.uz * radius } });
      addChild(root, node);
      const anchor = anchors?.[index], tree = anchor?.node;
      const tie = tree ? BL.dressing.palmTrunk(anchor.variant, TIE) : null;
      const local = new Float64Array(3);
      let wrap;
      if (tree) {
        // Author the wrap in the palm's own mesh coordinates. Sharing its origin,
        // local heights and sway strength makes the GPU bend both meshes identically.
        const geometry = BL.hubModels.lashing(0, TIE, 0, 0, 1, 0, radius);
        for (let i = 0; i < geometry.verts.length; i += 3) geometry.verts[i] += BL.dressing.palmTrunk(anchor.variant, geometry.verts[i + 1]).x;
        geometry.sway = tree.geometry.sway;
        wrap = createNode({ geometry, sightHidden: true });
        addChild(tree, wrap);
        const ry = tree.rotation.y, dx = -end * p.ux * radius, dz = -end * p.uz * radius;
        local[0] = tie.x + Math.cos(ry) * dx - Math.sin(ry) * dz;
        local[1] = TIE;
        local[2] = Math.sin(ry) * dx + Math.cos(ry) * dz;
      } else {
        // Standalone geometry checks can create a hammock without scene-owned palms.
        const x = end < 0 ? p.ax : p.bx, y = end < 0 ? p.ay : p.by, z = end < 0 ? p.az : p.bz;
        wrap = createNode({ geometry: BL.hubModels.lashing(0, 0, 0, 0, 1, 0, radius), position: { x, y, z }, sightHidden: true });
        addChild(root, wrap);
      }
      const fan = CORD_Z.map((z) => {
        const cord = createNode({ geometry: fanGeometry, quaternion: quat.create(), sightHidden: true,
          position: { x: end * BED_LEN / 2, y: p.endY + 0.03, z } });
        addChild(bedNode, cord);
        return cord;
      });
      return { node, end, tree, wrap, local, fan, ring: new Float64Array(3) };
    });
    const endpoint = new Float64Array(3), poseOffset = new Float64Array(3), anchorLocal = new Float64Array(3), bedInverse = mat4.create();
    const bedRotation = quat.create(), restRotation = quat.create(), bodyRotation = quat.create(), limbTarget = quat.create();
    // A bed sleeper lies on their back. Turn their long axis along the hammock's +x.
    quat.fromEuler(restRotation, -Math.PI / 2, -Math.PI / 2, 0);
    const seats = p.seats.map((s, index) => ({ kind: "hammock", lying: true, keepEquipment: true, pumps: true, index, x: 0, y: 0, z: 0, ry: p.seatRy, floor: s.floor, walkAt: { x: s.walkAt.x, z: s.walkAt.z }, sitter: null, remote: 0, restX: 0, restY: 0, restZ: 0, wire: new Int16Array(6) }));
    let amp = REST, angle = 0, phase = 0, lean = 0, leanIn = 0, leanInT = LEAN_RISE, count = 0, sinceHit = 0, sinceRound = 1e9, wasHeld = false, fallSide = 0, pumping = false, pumpHeld = 0, pumpStepped = 0;
    const bodyRight = new Float64Array(3);
    const occupied = () => { for (const seat of seats) if (seat.sitter || seat.remote) return true; return false; };
    // A seat's place for an angle of swing: the bed turns about the virtual swing axis (+x in its frame), so a point `drop`
    // under it moves `drop` sin(angle) across and rises by drop (1 - cos(angle)).
    const place = (seat, a) => {
      const s = p.seats[seat.index], drop = -s.y, across = -Math.sin(a) * drop * p.side, down = Math.cos(a) * drop;
      seat.x = p.x + p.ux * s.at + p.nx * across;
      seat.z = p.z + p.uz * s.at + p.nz * across;
      seat.y = p.y - down;
    };
    for (const seat of seats) { place(seat, 0); seat.restX = seat.x; seat.restY = seat.y; seat.restZ = seat.z; }
    // Move the actual gear, with its character-specific geometry and magazine, to the ground.
    // This is a visual parent change only: ownership, selection and ammunition stay with the Ooga.
    // Each active body owns one holder; it is released with that body or seat, never on its own timer.
    const parked = [];
    let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
    const measureGear = (node) => {
      if (!node.visible) return;
      const v = node.geometry?.verts, m = node.world;
      if (v) for (let i = 0; i < v.length; i += 3) {
        const x = m[0] * v[i] + m[4] * v[i + 1] + m[8] * v[i + 2] + m[12];
        const y = m[1] * v[i] + m[5] * v[i + 1] + m[9] * v[i + 2] + m[13];
        const z = m[2] * v[i] + m[6] * v[i + 1] + m[10] * v[i + 2] + m[14];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      for (const child of node.children) measureGear(child);
    };
    // Fit to the actual visible geometry, including attachments, in the holder's frame.
    const measurePart = (node) => {
      BL.scene.updateWorld(node);
      minX = minY = minZ = Infinity; maxX = maxY = maxZ = -Infinity;
      measureGear(node);
      return Number.isFinite(minY);
    };
    // Its outline seen from above, in the holder's frame: every drawn triangle of the part and its visible attachments
    // marked conservatively on the gear grid (cell (i, j) spans [i, i + 1) GEAR_CELL along and [j, j + 1) across), so
    // no drawn point lies outside a marked cell; also how low and high it reaches. Read once a park, into a grid the
    // size of the part's bounds (`measurePart` just measured it).
    const tri = new Float64Array(6);
    const triangleMeetsCell = (x0, z0) => {
      const x1 = x0 + GEAR_CELL, z1 = z0 + GEAR_CELL;
      // The cell's own axes are covered by the caller's bounds; each triangle edge's normal must not separate them.
      for (let e = 0; e < 3; e++) {
        const ax = tri[e * 2], az = tri[e * 2 + 1], bx = tri[(e + 1) % 3 * 2], bz = tri[(e + 1) % 3 * 2 + 1];
        const cx = tri[(e + 2) % 3 * 2], cz = tri[(e + 2) % 3 * 2 + 1], nx = bz - az, nz = ax - bx;
        const t = nx * ax + nz * az, side = Math.sign(nx * cx + nz * cz - t);
        if (!side) continue;
        const near = Math.max(side * (nx * x0 + nz * z0), side * (nx * x1 + nz * z0), side * (nx * x0 + nz * z1), side * (nx * x1 + nz * z1));
        if (near < side * t - 1e-12) return false;
      }
      return true;
    };
    // Each marked cell also keeps how low and high the triangles meeting it reach (`lo`, `hi`, in the cells' order), so a
    // part can be laid where the cloth above each of its cells clears it.
    const outline = (node) => {
      if (!measurePart(node)) return { i0: 0, j0: 0, w: 0, h: 0, bottom: 0, top: 0, cells: new Int32Array(0), lo: new Float64Array(0), hi: new Float64Array(0) };
      const i0 = Math.floor(minX / GEAR_CELL), j0 = Math.floor(minZ / GEAR_CELL), w = Math.floor(maxX / GEAR_CELL) - i0 + 1, h = Math.floor(maxZ / GEAR_CELL) - j0 + 1;
      const grid = new Uint8Array(w * h), cellLo = new Float64Array(w * h).fill(Infinity), cellHi = new Float64Array(w * h).fill(-Infinity);
      const o = { i0, j0, w, h, bottom: minY, top: maxY, cells: null, lo: null, hi: null };
      let count = 0;
      const visit = (part) => {
        if (!part.visible) return;
        const g = part.geometry, v = g?.verts, m = part.world;
        if (v && g.faces) {
          const cursor = g.compactGeometry ? BL.compactGeometry.createCursor(g) : null;
          for (let f = 0; f < g.faces.length; f++) {
            const ids = (cursor ? BL.compactGeometry.readFace(g, f, cursor) : g.faces[f]).i;
            for (let k = 1; k + 1 < ids.length; k++) {
              let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity, loY = Infinity, hiY = -Infinity;
              for (let c = 0; c < 3; c++) {
                const at = (c ? ids[k + c - 1] : ids[0]) * 3, x = v[at], y = v[at + 1], z = v[at + 2];
                const px = tri[c * 2] = m[0] * x + m[4] * y + m[8] * z + m[12], pz = tri[c * 2 + 1] = m[2] * x + m[6] * y + m[10] * z + m[14];
                const py = m[1] * x + m[5] * y + m[9] * z + m[13];
                lo0 = Math.min(lo0, px); hi0 = Math.max(hi0, px); lo1 = Math.min(lo1, pz); hi1 = Math.max(hi1, pz);
                loY = Math.min(loY, py); hiY = Math.max(hiY, py);
              }
              const ia = Math.max(i0, Math.floor(lo0 / GEAR_CELL)), ib = Math.min(i0 + w - 1, Math.floor(hi0 / GEAR_CELL));
              const ja = Math.max(j0, Math.floor(lo1 / GEAR_CELL)), jb = Math.min(j0 + h - 1, Math.floor(hi1 / GEAR_CELL));
              for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) {
                const cell = (i - i0) * h + j - j0;
                if (grid[cell] && hiY <= cellHi[cell] && loY >= cellLo[cell]) continue;
                if (!(ia === ib && ja === jb || triangleMeetsCell(i * GEAR_CELL, j * GEAR_CELL))) continue;
                if (!grid[cell]) { grid[cell] = 1; count++; }
                cellLo[cell] = Math.min(cellLo[cell], loY); cellHi[cell] = Math.max(cellHi[cell], hiY);
              }
            }
          }
        }
        for (const child of part.children) visit(child);
      };
      visit(node);
      o.cells = new Int32Array(count * 2); o.lo = new Float64Array(count); o.hi = new Float64Array(count);
      for (let cell = 0, n = 0; cell < grid.length; cell++) if (grid[cell]) {
        o.lo[n >> 1] = cellLo[cell]; o.hi[n >> 1] = cellHi[cell];
        o.cells[n++] = Math.floor(cell / h); o.cells[n++] = cell % h;
      }
      return o;
    };
    // The outline after half a turn about the vertical through the part's origin (`ends`) and about its long axis, the
    // holder's x through that origin (`faces`): each mirrors the cells (cell k becomes -k - 1); a face turn also turns
    // its heights over.
    const turned = (o, way) => {
      const ends = way & 1, faces = way & 2, cells = new Int32Array(o.cells.length), rise = new Float64Array(o.hi.length);
      const flipI = ends, flipJ = !ends !== !faces;
      for (let c = 0; c < cells.length; c += 2) {
        cells[c] = flipI ? o.w - 1 - o.cells[c] : o.cells[c];
        cells[c + 1] = flipJ ? o.h - 1 - o.cells[c + 1] : o.cells[c + 1];
        // How high the part reaches over that cell once laid, above its own lowest point.
        rise[c >> 1] = faces ? o.top - o.lo[c >> 1] : o.hi[c >> 1] - o.bottom;
      }
      return { way, w: o.w, h: o.h, i0: flipI ? -(o.i0 + o.w) : o.i0, j0: flipJ ? -(o.j0 + o.h) : o.j0,
        bottom: faces ? -o.top : o.bottom, top: faces ? -o.bottom : o.top, cells, rise };
    };
    // A part is laid by its outline at rest, never by a passing state that differs between this page, other pages and
    // a guest's own copy at the moment each parks it: every magazine banana shown (a full rifle, as every Ooga starts)
    // whatever the rounds and at its resting size (`models.GUN_BANANA_SCALE`, as the crew sets it once a reload's pop has
    // settled), no muzzle flash or flame, and a nunchaku folded, where the crew and the remote pool both settle it
    // while parked (folded at once here, so every page also draws it so from the start). Shown states and the
    // bananas' drawn sizes are put back once measured.
    const steadied = [], steadiedShown = [], bananaScales = [];
    let steadiedBananas = null;
    const steady = (node, shown) => {
      if (!node) return;
      steadied.push(node); steadiedShown.push(node.visible); node.visible = shown;
    };
    const steadyPart = (gear, node, index) => {
      const cave = gear.cave, parts = cave.parts;
      steadied.length = steadiedShown.length = bananaScales.length = 0;
      steadiedBananas = null;
      if (index === 0 && parts.chuk) cave.chukAngle = parts.chuk.rotation.x = BL.crew.CHUK_FOLD;
      if (index === 1) {
        const rest = BL.models.GUN_BANANA_SCALE, h = cave.traits.height;
        steadiedBananas = parts.gunBananas;
        for (const banana of parts.gunBananas) {
          steady(banana, true);
          const s = banana.scale;
          bananaScales.push(s.x, s.y, s.z);
          s.x = rest.x * h; s.y = rest.y * h; s.z = rest.z * h;
        }
        steady(parts.gunFlash, false);
      }
      // A built-in pack's flame is its own part; the hub's pack (`crew.jetpackNode`) has its flame as its one child.
      if (index === 2) steady(node === parts.jetpack ? parts.jetFlame : node.children[0], false);
    };
    const unsteady = () => {
      for (let i = 0; i < steadied.length; i++) steadied[i].visible = steadiedShown[i];
      if (steadiedBananas) for (let i = 0; i < steadiedBananas.length; i++) {
        const s = steadiedBananas[i].scale;
        s.x = bananaScales[i * 3]; s.y = bananaScales[i * 3 + 1]; s.z = bananaScales[i * 3 + 2];
      }
      steadied.length = steadiedShown.length = bananaScales.length = 0;
      steadiedBananas = null;
    };
    const parkPart = (gear, node, index, temporary = false) => {
      if (!node) return;
      const saved = { node, index, parent: node.parent, position: { ...node.position }, rotation: { ...node.rotation },
        quaternion: node.quaternion, visible: node.visible, poseYaw: node.poseYaw, poseLean: node.poseLean, cameraHidden: node.cameraHidden, temporary,
        flat: { x: 0, y: 0, z: 0 }, ways: null };
      gear.parts.push(saved);
      if (node.parent) removeChild(node.parent, node);
      addChild(gear.holder, node);
      node.position.x = node.position.y = node.position.z = 0;
      // Long axis along the bed: the club's and pack's up (z turns it, applied first), the rifle's barrel (y turns it).
      node.rotation.x = node.rotation.y = 0; node.rotation.z = index === 1 ? 0 : Math.PI / 2;
      if (index === 1) node.rotation.y = Math.PI / 2;
      node.quaternion = null;
      node.poseYaw = node.poseLean = 0;
      node.cameraHidden = false;
      node.visible = true;
      steadyPart(gear, node, index);
      // Roll it about that long axis onto its broad face: the club's and pack's roll is x (after z), the rifle's z
      // (before its turn), so the heading along the bed stays as it was.
      if (measurePart(node) && maxY - minY > maxZ - minZ) {
        if (index === 1) node.rotation.z = Math.PI / 2; else node.rotation.x = Math.PI / 2;
      }
      saved.flat.x = node.rotation.x; saved.flat.y = node.rotation.y; saved.flat.z = node.rotation.z;
      // Four ways to lay it, each still flat with its long axis along the bed: as it is, end for end (half a turn about
      // the vertical) and either face down (half a turn about its long axis), and their outlines.
      const base = outline(node);
      saved.ways = [0, 1, 2, 3].map(way => turned(base, way));
      unsteady();
      layoutGear(gear);
    };
    const setWay = (saved, way) => {
      const r = saved.node.rotation, flat = saved.flat;
      r.x = flat.x; r.y = flat.y + (way & 1 ? Math.PI : 0); r.z = flat.z;
      if (way & 2) { if (saved.index === 1) r.z += Math.PI; else r.x += Math.PI; }
    };
    // Lay the parked parts under the bed, inside the cloth's own rectangle (BED_LEN along, BED_W across, the footprint
    // the cloth draws at rest) and never within a cell of each other. Each part may lie any of its four ways; the
    // placements are searched bottom-left first, largest part first, backing up when a later part finds no room, then
    // the whole group is centred in the rectangle. Each part rests on the highest ground under its cells' corners.
    // Runs only when a part is parked, never a frame.
    const CELLS_ALONG = Math.round(BED_LEN / GEAR_CELL), CELLS_ACROSS = Math.round(BED_W / GEAR_CELL), FIRST_I = -CELLS_ALONG / 2, FIRST_J = -CELLS_ACROSS / 2;
    const taken = new Uint8Array(CELLS_ALONG * CELLS_ACROSS), GEAR_TRIES = 200000;
    const groundUnder = (x, z) => p.surfaceAt ? p.surfaceAt(p.x + p.ux * x + p.nx * z, p.z + p.uz * x + p.nz * z) - p.ground : 0;
    // A lower bound on the cloth's underside over the cell starting x along the bed (from the pivot) and z across, above
    // the ground, at every angle of the occupied swing (|a| <= REST_HELD). Swung by a, the cloth's point at drop y (<= 0)
    // under the pivot and c across stands y cos a - c sin a high (never under y - |c| sin REST_HELD) and y sin a + c cos a
    // across, so what stands over the cell comes from c within the cell widened by the deepest drop there times
    // sin REST_HELD, and |c| at most (the cell's farthest |z| + that) / cos REST_HELD. The cloth falls toward the bed's
    // middle (clothY is a convex bowl, and its drawn faces lie on or over it), so its lowest point in that wider cell is
    // the one nearest the middle.
    const clothOver = (x, z) => {
      const s = Math.sin(REST_HELD), nx = Math.min(Math.max(0, x), x + GEAR_CELL), shift = -clothY(p, nx, 0) * s;
      const nz = Math.min(Math.max(0, z - shift), z + GEAR_CELL + shift), far = (Math.max(Math.abs(z), Math.abs(z + GEAR_CELL)) + shift) / Math.cos(REST_HELD);
      return p.y - p.ground + clothY(p, nx, nz) - far * s;
    };
    // A laid outline's ground (the highest under its corners) with its first cell on grid cell (gi, gj), and whether every
    // one of its cells stays GEAR_CLEAR under the cloth there.
    const groundFor = (o, gi, gj, at) => {
      const a0 = at + (FIRST_I + gi) * GEAR_CELL, a1 = a0 + o.w * GEAR_CELL, c0 = (FIRST_J + gj) * GEAR_CELL, c1 = c0 + o.h * GEAR_CELL;
      return Math.max(groundUnder(a0, c0), groundUnder(a1, c0), groundUnder(a0, c1), groundUnder(a1, c1));
    };
    const underCloth = (o, gi, gj, at) => {
      const cells = o.cells, base = groundFor(o, gi, gj, at) + GEAR_LIFT;
      for (let c = 0; c < cells.length; c += 2) {
        const top = base + o.rise[c >> 1];
        if (top > GEAR_TOP || top > clothOver(at + (FIRST_I + gi + cells[c]) * GEAR_CELL, (FIRST_J + gj + cells[c + 1]) * GEAR_CELL) - GEAR_CLEAR) return false;
      }
      return true;
    };
    // `clothAt` (the bed's along position of the holder) also keeps each part under the cloth while it is searched.
    let clothAt = null;
    const fits = (o, oi, oj) => {
      const cells = o.cells;
      for (let c = 0; c < cells.length; c += 2) if (taken[(oi + cells[c]) * CELLS_ACROSS + oj + cells[c + 1]]) return false;
      return clothAt === null || underCloth(o, oi, oj, clothAt);
    };
    // Mark (1) or clear (-1) a placed outline, grown by a cell each way so the next part keeps its distance.
    const mark = (o, oi, oj, by) => {
      const cells = o.cells;
      for (let c = 0; c < cells.length; c += 2) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const i = oi + cells[c] + di, j = oj + cells[c + 1] + dj;
        if (i >= 0 && i < CELLS_ALONG && j >= 0 && j < CELLS_ACROSS) taken[i * CELLS_ACROSS + j] += by;
      }
    };
    const layoutGear = (gear) => {
      const parts = gear.parts.filter(part => part.ways[0].cells.length).sort((a, b) => b.ways[0].cells.length - a.ways[0].cells.length);
      const chosen = parts.map(() => ({ o: null, oi: 0, oj: 0 }));
      taken.fill(0);
      let tries = 0;
      const place = (k) => {
        if (k === parts.length) return true;
        for (const o of parts[k].ways) for (let oj = 0; oj + o.h <= CELLS_ACROSS; oj++) for (let oi = 0; oi + o.w <= CELLS_ALONG; oi++) {
          if (++tries > GEAR_TRIES) return false;
          if (!fits(o, oi, oj)) continue;
          mark(o, oi, oj, 1);
          if (place(k + 1)) { chosen[k].o = o; chosen[k].oi = oi; chosen[k].oj = oj; return true; }
          mark(o, oi, oj, -1);
        }
        return false;
      };
      const at = p.seats[gear.seat.index].at;
      // The group centred in the rectangle, if every part there stays under the cloth.
      const centred = () => {
        let i0 = CELLS_ALONG, i1 = 0, j0 = CELLS_ACROSS, j1 = 0;
        for (const { o, oi, oj } of chosen) { i0 = Math.min(i0, oi); i1 = Math.max(i1, oi + o.w); j0 = Math.min(j0, oj); j1 = Math.max(j1, oj + o.h); }
        const si = Math.floor((CELLS_ALONG - i1 - i0) / 2), sj = Math.floor((CELLS_ACROSS - j1 - j0) / 2);
        return chosen.every(({ o, oi, oj }) => underCloth(o, oi + si, oj + sj, at)) ? [si, sj] : null;
      };
      // Every roster Ooga's gear fits (the unit tier lays out each one's as the crew builds it); gear that cannot is a
      // new character's to fix, not a pile to draw. Gear too tall for the cloth over the middle, where it sags lowest,
      // is searched again with the cloth's clearance kept for every part (the first fit is nearer an end, where it is
      // higher), and centred only when that still clears.
      if (!place(0)) throw Error(`Stowed gear of ${gear.cave.traits?.name} does not fit flat under the hammock`);
      let shift = centred();
      if (!shift) {
        taken.fill(0); tries = 0; clothAt = at;
        const found = place(0);
        clothAt = null;
        if (!found) throw Error(`Stowed gear of ${gear.cave.traits?.name} does not fit flat under the hammock's cloth`);
        shift = centred() || [0, 0];
      }
      const si = shift[0], sj = shift[1];
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k], { o, oi, oj } = chosen[k], node = part.node;
        setWay(part, o.way);
        // The outline's first cell lands on the grid cell (oi + si, oj + sj) of the rectangle.
        const x = (FIRST_I + oi + si - o.i0) * GEAR_CELL, z = (FIRST_J + oj + sj - o.j0) * GEAR_CELL;
        node.position.x = x; node.position.y = groundFor(o, oi + si, oj + sj, at) + GEAR_LIFT - o.bottom; node.position.z = z;
      }
    };
    const releaseBody = (cave) => { if (cave.hammockRest) upright(cave); else releaseEquipment(cave); };
    const parkEquipment = (cave, seat, shown = true) => {
      let gear = cave.restEquipment;
      if (!gear) {
        const holder = createNode({ position: { x: p.x + p.ux * p.seats[seat.index].at, y: p.ground, z: p.z + p.uz * p.seats[seat.index].at },
          rotation: { x: 0, y: p.yaw, z: 0 }, sightHidden: true });
        gear = cave.restEquipment = { cave, seat, holder, parts: [], pack: null, release: releaseBody };
        parked.push(gear); addChild(root, holder);
        const parts = cave.parts;
        if (parts.gunFlash) parts.gunFlash.visible = false;
        if (cave.jet?.flame) cave.jet.flame.visible = false;
        if (parts.jetFlame) parts.jetFlame.visible = false;
        parkPart(gear, parts.club, 0);
        parkPart(gear, parts.gun, 1);
      }
      if (!gear.pack && cave.jetpackOwned) {
        let pack = cave.presentationJet?.node || cave.jet?.node || cave.parts.jetpack, temporary = false;
        if (!pack && cave.jetpackGeometry && cave.jetpackFlameGeometry) {
          pack = BL.crew.jetpackNode(cave.root, cave.traits.height, cave.viewLift || 0, cave.jetpackGeometry, cave.jetpackFlameGeometry);
          temporary = true;
        }
        if (pack) { gear.pack = pack; parkPart(gear, pack, 2, temporary); }
      }
      const currentPack = cave.presentationJet?.node || cave.jet?.node || cave.parts.jetpack;
      if (gear.pack && currentPack && currentPack !== gear.pack) {
        for (let i = 0; i < gear.parts.length; i++) if (gear.parts[i].index === 2) {
          restorePart(cave, gear.parts[i]); gear.parts.splice(i, 1); break;
        }
        gear.pack = currentPack; parkPart(gear, currentPack, 2);
      }
      gear.holder.visible = shown;
      gear.holder.matrixLiving = !!cave.root.matrixLiving;
      for (const saved of gear.parts) {
        const node = saved.node;
        if (node.parent !== gear.holder) { if (node.parent) removeChild(node.parent, node); addChild(gear.holder, node); }
        node.visible = saved.index === 0 ? !!cave.weapon?.primaryOwned
          : saved.index === 1 ? !!cave.weapon?.secondaryOwned : !!cave.jetpackOwned;
      }
      // Twirl afterimages are arm siblings, rather than children of the parked primary.
      if (cave.parts.chukTrail) for (const trail of cave.parts.chukTrail) trail.visible = false;
      if (cave.parts.gunFlash) cave.parts.gunFlash.visible = false;
      if (cave.jet?.flame) cave.jet.flame.visible = false;
      if (cave.parts.jetFlame) cave.parts.jetFlame.visible = false;
    };
    const restorePart = (cave, saved) => {
      const node = saved.node, pack = saved.index === 2, worn = cave.jet?.node === node;
      if (node.parent) removeChild(node.parent, node);
      if (!saved.temporary && saved.parent && (!pack || worn || node === cave.parts.jetpack || node === cave.presentationJet?.node)) addChild(saved.parent, node);
      for (const axis of AXES) { node.position[axis] = saved.position[axis]; node.rotation[axis] = saved.rotation[axis]; }
      node.quaternion = saved.quaternion;
      node.visible = pack ? worn && saved.visible : saved.visible && (saved.index === 0 ? !!cave.weapon?.primaryOwned : !!cave.weapon?.secondaryOwned);
      node.poseYaw = saved.poseYaw; node.poseLean = saved.poseLean; node.cameraHidden = saved.cameraHidden;
    };
    const releaseEquipment = (cave) => {
      const gear = cave.restEquipment;
      if (!gear) return;
      for (const saved of gear.parts) restorePart(cave, saved);
      removeChild(root, gear.holder);
      parked.splice(parked.indexOf(gear), 1);
      cave.restEquipment = null;
    };
    for (const seat of seats) seat.releaseEquipment = releaseEquipment;
    // Only the entry and exit use changing world transforms. Settled rest reports a stable seat,
    // so its locally animated sway adds no traffic. A late observer can draw any current phase.
    const stateFor = (cave) => {
      const seat = cave?.camp?.seat;
      if (!seat || !seats.includes(seat) || seat.fall) return 0;
      const transition = seat.exit || seat.entry, out = seat.wire, q = cave.root.quaternion;
      out[0] = seat.index; out[1] = seat.exit ? 3 : seat.entry ? 1 : 2;
      out[2] = transition ? Math.round(Math.min(1, transition.time / ENTRY_SECONDS) * 255) : 255;
      const sign = transition && q[3] < 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) out[i + 3] = transition ? Math.round(q[i] * sign * 1000) : 0;
      return out;
    };
    // Reuse the bed's face-up orientation, with straight legs and arms at the sides.
    // Shift the root along the cloth so the torso, head and feet share its length.
    const posed = (cave, seat, entry = null, shown = cave.root.visible) => {
      const r = cave.root, parts = cave.parts;
      r.quaternion = cave.sleepRotation || (cave.hammockRotation ||= quat.create());
      quat.copy(r.quaternion, bodyRotation);
      r.rotation.y = seat.ry;
      const height = cave.traits.height;
      quat.rotateVec(poseOffset, bedRotation, -height * 0.28, height * 0.18, 0);
      r.position.x = seat.x + poseOffset[0]; r.position.y = seat.y + poseOffset[1]; r.position.z = seat.z + poseOffset[2];
      for (const key of ENTRY_PARTS) {
        parts[key].quaternion = null;
        for (const axis of AXES) parts[key].rotation[axis] = 0;
      }
      blendPose(cave, entry, bodyRotation);
      updateHead(cave);
      parkEquipment(cave, seat, shown);
    };
    const blendPose = (cave, transition, targetRotation) => {
      const r = cave.root, parts = cave.parts;
      if (transition) {
        const t = Math.min(1, transition.time / ENTRY_SECONDS), blend = t * t * (3 - 2 * t);
        quat.copy(r.quaternion, transition.rotation);
        quat.slerpTo(r.quaternion, targetRotation, blend);
        r.position.x = transition.position.x + (r.position.x - transition.position.x) * blend;
        r.position.y = transition.position.y + (r.position.y - transition.position.y) * blend + Math.sin(Math.PI * t) * 0.25;
        r.position.z = transition.position.z + (r.position.z - transition.position.z) * blend;
        for (const key of ENTRY_PARTS) {
          const from = transition.parts[key], part = parts[key];
          quat.fromEuler(limbTarget, part.rotation.x, part.rotation.y, part.rotation.z);
          for (const axis of AXES) part.rotation[axis] = from[axis] + (part.rotation[axis] - from[axis]) * blend;
          if (from.quaternion) {
            quat.copy(from.blend, from.quaternion); quat.slerpTo(from.blend, limbTarget, blend);
            part.quaternion = from.blend;
          }
        }
      }
    };
    const updateHead = (cave) => {
      const r = cave.root, parts = cave.parts, height = cave.traits.height;
      const head = parts.head.position;
      quat.rotateVec(poseOffset, r.quaternion, head.x, head.y + height * 3.5 / 16, head.z);
      if (cave.sleepHead) { cave.sleepHead.x = r.position.x + poseOffset[0]; cave.sleepHead.y = r.position.y + poseOffset[1]; cave.sleepHead.z = r.position.z + poseOffset[2]; }
    };
    // Reserve through the crew's normal guarded seat contract, then animate from the
    // exact standing pose. The reservation is immediate; the visible body never snaps.
    const enter = (cave, seat, occupy) => {
      if (!cave || !seats.includes(seat) || seat.sitter || seat.remote) return false;
      const entry = capturePose(cave);
      if (!occupy(seat)) return false;
      seat.entry = entry;
      posed(cave, seat, entry);
      // Climbing in settles the bed to where an occupied one rests (the bed is theirs now, and can be taken back by pushing).
      amp = REST_HELD; count = 0; sinceHit = 0; wasHeld = true;
      return true;
    };
    const capturePose = (cave) => {
      const r = cave.root, rotation = quat.create();
      if (r.quaternion) quat.copy(rotation, r.quaternion);
      else quat.fromEuler(rotation, r.rotation.x, r.rotation.y, r.rotation.z);
      const transition = { cave, time: 0, position: { ...r.position }, rotation, parts: {} };
      for (const key of ENTRY_PARTS) {
        const part = cave.parts[key], from = transition.parts[key] = { ...part.rotation };
        if (part.quaternion) { from.quaternion = quat.create(); quat.copy(from.quaternion, part.quaternion); from.blend = quat.create(); }
      }
      return transition;
    };
    const uprightRotation = quat.create();
    const fallRoll = quat.create(), fallLying = quat.create();
    for (const seat of seats) seat.leave = (cave, target, finish) => {
      if (seat.sitter !== cave || cave.camp.seat !== seat) return false;
      if (seat.exit || seat.fall) return true;
      seat.exit = { ...capturePose(cave), target, finish };
      seat.entry = null;
      return true;
    };
    const poseExit = (cave, seat) => {
      const exit = seat.exit, r = cave.root, parts = cave.parts;
      r.quaternion = cave.sleepRotation || (cave.hammockRotation ||= quat.create());
      r.rotation.y = exit.target.ry;
      quat.fromEuler(uprightRotation, 0, exit.target.ry, 0);
      r.position.x = exit.target.x; r.position.y = exit.target.y; r.position.z = exit.target.z;
      parts.legL.rotation.x = parts.legR.rotation.x = 0;
      parts.legL.rotation.z = parts.legR.rotation.z = 0;
      parts.armL.rotation.x = parts.armR.rotation.x = -0.2;
      parts.head.rotation.x = parts.head.rotation.y = 0;
      parts.head.quaternion = null;
      blendPose(cave, exit, uprightRotation);
      updateHead(cave);
      parkEquipment(cave, seat, cave.root.visible);
    };
    // Tipped out: from the pose it lay in, roll over the edge toward `fall.side` and down onto the ground at the landing spot, lie there, then
    // get up on the spot. The gear stays parked under the bed until the stand-up releases it.
    const poseFall = (cave, seat) => {
      const fall = seat.fall, target = fall.target, r = cave.root, parts = cave.parts, t = Math.min(1, fall.time / FALL_SECONDS);
      const k = Math.min(1, t / FALL_ROLL), roll = k * k * (3 - 2 * k), lieY = target.floor + cave.traits.height * FALL_LIE_Y;
      r.quaternion = cave.sleepRotation || (cave.hammockRotation ||= quat.create());
      r.rotation.y = target.ry;
      quat.fromAxisAngle(fallRoll, p.ux, 0, p.uz, fall.side * FALL_TURN * roll);
      quat.multiply(fallLying, fallRoll, fall.rotation);
      if (t < FALL_LIE) {
        quat.copy(r.quaternion, fallLying);
        r.position.x = fall.position.x + (target.x - fall.position.x) * roll;
        r.position.z = fall.position.z + (target.z - fall.position.z) * roll;
        r.position.y = fall.position.y + (lieY - fall.position.y) * k * k + Math.sin(Math.PI * k) * 0.12;
        const flail = Math.sin(Math.PI * k);
        parts.armL.rotation.x = parts.armR.rotation.x = -0.2 - 2 * flail;
        parts.legL.rotation.x = 0.5 * flail; parts.legR.rotation.x = -0.5 * flail;
      } else {
        const g = (t - FALL_LIE) / (1 - FALL_LIE), up = g * g * (3 - 2 * g);
        quat.fromEuler(uprightRotation, 0, target.ry, 0);
        quat.copy(r.quaternion, fallLying);
        quat.slerpTo(r.quaternion, uprightRotation, up);
        r.position.x = target.x; r.position.z = target.z;
        r.position.y = lieY + (target.y - lieY) * up;
        parts.armL.rotation.x = parts.armR.rotation.x = -0.2 - 0.9 * Math.sin(Math.PI * up);
        parts.legL.rotation.x = parts.legR.rotation.x = 0;
      }
      parts.legL.rotation.z = parts.legR.rotation.z = 0;
      parts.head.rotation.x = parts.head.rotation.y = 0;
      parts.head.quaternion = null;
      updateHead(cave);
    };
    // The occupant `cave` is tipped out: it rolls out to `target` ({ x, z, y its standing root height, floor, ry, side }) over FALL_SECONDS
    // and `finish` is called there, to stand it up. Other pages see it leave the seat at once (`stateFor`).
    const tip = (cave, target, finish) => {
      const seat = cave?.camp?.seat;
      if (!seat || !seats.includes(seat) || seat.sitter !== cave || seat.fall) return false;
      seat.fall = capturePose(cave);
      seat.fall.target = target; seat.fall.side = target.side; seat.fall.finish = finish;
      seat.entry = seat.exit = null;
      return true;
    };
    const aimCord = (node, x, y, z) => {
      const dx = x - node.position.x, dy = y - node.position.y, dz = z - node.position.z;
      const length = Math.hypot(dx, dy, dz), q = node.quaternion;
      q[0] = dz; q[1] = 0; q[2] = -dx; q[3] = length + dy;
      quat.normalize(q); node.scale.y = length;
    };
    // The hub defers this until its prop-shake tweens have applied for the frame.
    const syncRopes = (windTime, windEnabled = true) => {
      BL.scene.updateWorld(bedNode, root.world);
      mat4.invert(bedInverse, bedNode.world);
      for (const rope of ropes) {
        if (rope.tree) {
          const tree = rope.tree, local = rope.local;
          BL.scene.updateWorld(tree, tree.parent?.world);
          mat4.transformPoint(endpoint, tree.world, local[0], local[1], local[2]);
          // Match gl-renderer's world-space wind deformation, using the same frame clock.
          const phase = windTime * 1.9 + tree.world[12] * 0.37 + tree.world[14] * 0.29;
          const sway = windEnabled ? (Math.sin(phase) + 0.35 * Math.sin(phase * 2.3 + 1.7)) * (tree.geometry.sway || 0) * TIE * TIE : 0;
          rope.node.position.x = endpoint[0] + 0.8 * sway;
          rope.node.position.y = endpoint[1];
          rope.node.position.z = endpoint[2] + 0.6 * sway;
        }
        // Extend the spreader-to-tree line through the gathering ring. This keeps
        // the end fan's centerline collinear with the suspension, including sideways sway.
        const origin = rope.node.position, ring = rope.ring, x = rope.end * BED_LEN / 2, y = p.endY + 0.03;
        mat4.transformPoint(anchorLocal, bedInverse, origin.x, origin.y, origin.z);
        const t = Math.min(1, RING_OUT / Math.max(0.01, rope.end * (anchorLocal[0] - x)));
        ring[0] = x + (anchorLocal[0] - x) * t;
        ring[1] = y + (anchorLocal[1] - y) * t;
        ring[2] = anchorLocal[2] * t;
        for (const cord of rope.fan) aimCord(cord, ring[0], ring[1], ring[2]);
        mat4.transformPoint(endpoint, bedNode.world, ring[0], ring[1], ring[2]);
        aimCord(rope.node, endpoint[0], endpoint[1], endpoint[2]);
      }
    };
    const update = (dt, time, still, windTime = 0, windEnabled = true) => {
      for (let i = parked.length - 1; i >= 0; i--) {
        const gear = parked[i], cave = gear.cave;
        if (!cave.root.parent || !cave.hammockRest && cave.camp?.seat !== gear.seat) releaseEquipment(cave);
      }
      for (let i = tipped.length - 1; i >= 0; i--) if (!tipped[i].root.parent) upright(tipped[i]);
      const held = occupied(), rest = held ? REST_HELD : REST;
      if (!pumping) amp += (rest - amp) * Math.min(1, DECAY * dt);
      pumping = false;
      sinceHit += dt; sinceRound += dt;
      if (wasHeld !== held || sinceHit > RESET_S) count = 0;
      wasHeld = held;
      lean = Math.abs(lean) < 1e-5 ? 0 : lean * Math.exp(-dt / LEAN_TAU);
      // The shove still easing in (`push`): this frame's share of it.
      if (leanInT < LEAN_RISE) {
        const from = easeInOut(leanInT / LEAN_RISE); leanInT = Math.min(LEAN_RISE, leanInT + dt);
        lean = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, lean + leanIn * (easeInOut(leanInT / LEAN_RISE) - from)));
      }
      if (!still) { phase = (phase + OMEGA * dt) % TAU; angle = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, amp * Math.sin(phase) + lean)); }
      bedNode.rotation.x = angle * p.side;
      quat.fromEuler(bedRotation, bedNode.rotation.x, p.yaw, 0);
      quat.multiply(bodyRotation, bedRotation, restRotation);
      if (windTime !== null) syncRopes(windTime, windEnabled);
      for (const seat of seats) {
        place(seat, angle);
        if (seat.entry && (seat.entry.cave !== seat.sitter || seat.entry.cave.camp.seat !== seat)) seat.entry = null;
        if (seat.exit && (seat.exit.cave !== seat.sitter || seat.exit.cave.camp.seat !== seat)) seat.exit = null;
        if (seat.fall && (seat.fall.cave !== seat.sitter || seat.fall.cave.camp.seat !== seat)) seat.fall = null;
        if (seat.fall) {
          seat.fall.time += dt;
          poseFall(seat.sitter, seat);
          if (seat.fall.time >= FALL_SECONDS) { const finish = seat.fall.finish; seat.fall = null; finish(); }
        } else if (seat.sitter && seat.sitter.camp.seat === seat && seat.exit) {
          seat.exit.time += dt;
          poseExit(seat.sitter, seat);
          // Keep occupancy and camera ownership until the exact landing is safe.
          if (seat.exit.time >= ENTRY_SECONDS) seat.exit.finish();
        } else if (seat.sitter && seat.sitter.camp.seat === seat) {
          if (seat.entry) seat.entry.time += dt;
          posed(seat.sitter, seat, seat.entry);
          if (seat.entry?.time >= ENTRY_SECONDS) seat.entry = null;
        }
      }
    };
    const kick = (strength = KICK) => { amp = Math.min(SWAY_MAX, amp + strength); };
    // A hit of `weight` steps on the shared count; `dir` (+1 or -1 along the swing's own sign, 0 to carry on as it goes) is where it
    // sends the bed. The swing is lifted to the count's height (plus the momentum of one timed with the swing away from them) with
    // the angle left where it is: the phase is set to the one that holds the angle on the way out, so the bed is moving along `dir` in
    // the very next frame, whatever it was doing.
    const push = (weight, dir, shove = 0) => {
      count = Math.min(TIP_COUNT, count + weight); sinceHit = 0;
      const c = Math.cos(phase), base = occupied() ? REST_HELD : REST;
      // Momentum is for a body's push (`shove`): rounds of fire climb the count's own steps, so a held trigger rises with every round.
      const to = Math.min(SWAY_MAX, Math.max(amp, base + count * STEP) + (shove > 0 && dir !== 0 ? MOMENTUM * Math.max(0, dir * c) : 0));
      let ph = Math.asin(Math.max(-1, Math.min(1, amp * Math.sin(phase) / to)));
      if (Math.cos(ph) * (dir === 0 ? (c >= 0 ? 1 : -1) : dir) < 0) ph = Math.PI - ph;
      phase = ph < 0 ? ph + TAU : ph; amp = to;
      // The side (+1 or -1 along the plan's n) the cloth was last knocked toward: where a tipped occupant rolls out.
      if (dir !== 0) fallSide = -dir * p.side;
      // The shove eases in over LEAN_RISE (`update`), with what was left of an earlier one carried into it.
      if (dir !== 0 && shove > 0) { leanIn = leanIn * (1 - easeInOut(leanInT / LEAN_RISE)) + dir * LEAN * shove; leanInT = 0; }
    };
    // One round of the rifle through the bed, fired from (fx, fz) toward (tx, tz): the bed is knocked away from the shooter, along the
    // shot's direction across the bed (a shot nearly along it, or with no direction, just carries the swing on). The first round of a
    // burst is a whole hit, each later one a share of what is left to TIP_COUNT.
    const hit = (fx, fz, tx, tz) => {
      const dx = tx - fx, dz = tz - fz, along = dx * p.nx + dz * p.nz, first = sinceRound > BURST_GAP;
      sinceRound = 0;
      push(first ? 1 : (TIP_COUNT - 1) / (BURST_N - 1), Math.abs(along) > 0.15 * Math.hypot(dx, dz) ? (along > 0 ? -p.side : p.side) : 0);
    };
    // A body at (x, feet, z) moving (vx, vz) walked into the bed: the weight of the hit it counted (1 for a full step), or 0.
    // `slot` names the body (`bumpSlots`); each body has one contact at a time, and is ready again once it is clear of the bed. Only a
    // body coming at the bed pushes: one that meets it standing, going along or away from it (an Ooga rolling out of it) has used up
    // that contact without a push.
    const bumpIn = new Uint8Array(bumpSlots), bumpAt = new Float64Array(2);
    const bump = (slot, x, feet, z, vx, vz) => {
      if (slot < 0 || slot >= bumpSlots) return 0;
      const dx = x - p.x, dz = z - p.z, along = dx * p.ux + dz * p.uz, across = dx * p.nx + dz * p.nz, e = p.swing;
      if (Math.abs(along) > e.half + BUMP_REARM || Math.abs(across) > e.across + BUMP_REARM
        || feet < p.ground - 0.15 || feet > p.y + p.shell.high + BUMP_RISE) { bumpIn[slot] = 0; return 0; }
      e.nearest(along, across, bumpAt);
      const gap = Math.hypot(along - bumpAt[0], across - bumpAt[1]);
      if (gap > BUMP_REARM) { bumpIn[slot] = 0; return 0; }
      if (bumpIn[slot] || gap > BUMP_RADIUS) return 0;
      bumpIn[slot] = 1;
      const speed = (vx * p.nx + vz * p.nz) * (across < 0 ? 1 : -1);
      if (speed < BUMP_MIN || Math.hypot(vx, vz) > BUMP_TELEPORT) return 0;
      const strength = Math.min(STEP, speed * BUMP_GAIN);
      if (strength < STEP / 2) { amp = Math.min(SWAY_MAX, amp + strength); return 0; }
      push(strength / STEP, across < 0 ? -p.side : p.side, Math.min(SHOVE_RUN, speed / 7));
      return strength / STEP;
    };
    // The occupant rocks the bed: `axis` is A (-1) to D (+1), held for `dt` seconds. D pushes toward the lying body's right (its own +x,
    // through `bodyRotation`, across the bed), A toward its left; pressed while the bed swings that way the swing grows, pressed against
    // it the swing is damped. The count is untouched; `fallSide` follows the push, as a hit's would.
    const pump = (axis, dt) => {
      if (!(axis > 0.05 || axis < -0.05) || !(dt > 0)) { pumpHeld = 0; return; }
      quat.rotateVec(bodyRight, bodyRotation, 1, 0, 0);
      const across = bodyRight[0] * p.nx + bodyRight[2] * p.nz;
      if (Math.abs(across) < 1e-3) return;
      // The bed's motion across, in the plan's n: angle grows toward the seats' side (`place`: across = -sin(angle) drop side).
      const motion = -Math.cos(phase) * p.side, want = (axis > 0 ? 1 : -1) * (across > 0 ? 1 : -1), swing = motion > 0 ? 1 : -1;
      if (motion * want > 0) {
        pumping = true; pumpHeld += dt;
        // One step a half-swing (`pumpStepped` is the swing it was earned on), however the key is worked.
        if (pumpStepped !== swing && pumpHeld >= PUMP_HOLD) { amp = Math.min(SWAY_MAX, amp + PUMP_STEP); pumpStepped = swing; fallSide = want; }
      } else { amp = Math.max(occupied() ? REST_HELD : REST, amp - PUMP_DAMP * dt); pumpHeld = 0; }
    };
    // Whether a walker of radius `r` with its feet at `feet` is within the occupied bed's footprint, which it cannot walk into: the
    // cloth is stepped onto when empty, never through the Ooga lying on it. Above the shell (a jump) is clear.
    const blocks = (x, feet, z, r) => {
      if (!occupied()) return false;
      const dx = x - p.x, dz = z - p.z;
      return Math.abs(dx * p.ux + dz * p.uz) <= p.swing.body.half + r && Math.abs(dx * p.nx + dz * p.nz) <= BED_W / 2 + 0.1 + r
        && feet < p.y + p.shell.high + 0.1;
    };
    // Whether the segment from (fx, fy, fz) to (tx, ty, tz), a banana's flight, passes through the bed's swing: the
    // `swing` outline as a box in the pivot's frame, which reaches the spreaders' height, not the cloth alone.
    // False for a zero-length or non-finite segment.
    const crosses = (fx, fy, fz, tx, ty, tz) => {
      if (!Number.isFinite(fx + fy + fz + tx + ty + tz)) return false;
      const e = p.swing, ax = fx - p.x, az = fz - p.z, bx = tx - p.x, bz = tz - p.z;
      const a0 = ax * p.ux + az * p.uz, a1 = fy - p.y, a2 = ax * p.nx + az * p.nz;
      const d0 = bx * p.ux + bz * p.uz - a0, d1 = ty - fy, d2 = bx * p.nx + bz * p.nz - a2;
      if (d0 === 0 && d1 === 0 && d2 === 0) return false;
      let enter = 0, leave = 1;
      for (let axis = 0; axis < 3; axis++) {
        const o = axis === 0 ? a0 : axis === 1 ? a1 : a2, d = axis === 0 ? d0 : axis === 1 ? d1 : d2;
        const lo = axis === 0 ? -e.body.half : axis === 1 ? e.lo : -e.across, hi = axis === 0 ? e.body.half : axis === 1 ? e.top : e.across;
        if (d === 0) { if (o < lo || o > hi) return false; continue; }
        const t0 = (lo - o) / d, t1 = (hi - o) / d;
        enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
        if (enter > leave) return false;
      }
      return true;
    };
    // The seat a body with its feet at (x, feet, z) rests on, judged against the still bed; -1 for none.
    const restingAt = (x, feet, z) => {
      if (feet - p.ground < REST_LOW || feet - p.ground > REST_HIGH) return -1;
      for (let i = 0; i < seats.length; i++) if (Math.hypot(x - seats[i].restX, z - seats[i].restZ) < REST_NEAR) return i;
      return -1;
    };
    // Who rests where on other pages: the room's remotes (`BL.net.remotes` itself, or any collection with `forEach`)
    // with an Ooga body that `shown` accepts, the lower id holding a seat two claim. The visitor's own Ooga, resting on
    // a seat a lower id holds, moves to a free seat (`move`) or, with none free, stands (`stand`); true when it moved or
    // stood. It runs every frame, so it walks the remotes with `forEach` and the one `claim` made here, never an iterator.
    let shownBy = null;
    const claim = (rec) => {
      if (!rec.body || rec.bodyKind === "gorilla" || !shownBy(rec)) return;
      const k = rec.rest === 0 ? -1 : rec.rest ? rec.rest[0] : restingAt(rec.x, rec.y, rec.z);
      if (k >= 0 && k < seats.length && (!seats[k].remote || rec.id < seats[k].remote)) seats[k].remote = rec.id;
    };
    const settle = (remotes, selfId, shown, move, stand) => {
      for (let i = 0; i < seats.length; i++) seats[i].remote = 0;
      shownBy = shown;
      remotes.forEach(claim);
      shownBy = null;
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i];
        if (!seat.sitter || !seat.remote || !selfId || seat.remote > selfId) continue;
        const to = free(seat);
        if (to) return move(seat.sitter, seat, to);
        return stand(seat.sitter);
      }
      return false;
    };
    // The free seat nearest `from` (a seat, or any { x, z }), skipping `from`; null when the bed is full.
    const free = (from) => {
      let best = null, distance = Infinity;
      for (const seat of seats) {
        if (seat === from || seat.sitter || seat.remote) continue;
        const d = Math.hypot(seat.restX - from.x, seat.restZ - from.z);
        if (d < distance) { best = seat; distance = d; }
      }
      return best;
    };
    // The stand-up spot nearest (x, z): the ground `plan` checked clear of the bed's whole swing, where a pet leaving a body at rest lands.
    const landing = (x, z) => {
      let best = seats[0], distance = Infinity;
      for (const seat of seats) {
        const d = Math.hypot(seat.walkAt.x - x, seat.walkAt.z - z);
        if (d < distance) { best = seat; distance = d; }
      }
      return best.walkAt;
    };
    // Reach the whole cloth from either side or end, including while standing on its shell.
    const near = (x, z, reach) => {
      const dx = x - p.x, dz = z - p.z, along = dx * p.ux + dz * p.uz, across = dx * p.nx + dz * p.nz;
      p.envelope.nearest(along, across, endpoint);
      return Math.hypot(along - endpoint[0], across - endpoint[1]) < reach;
    };
    const reachable = (x, feet, z, reach) => near(x, z, reach)
      && (Math.abs(feet - p.ground) < 0.15 || feet > p.y + p.shell.low - 0.15 && feet < p.y + p.shell.high + 0.15);
    // Other pages' Oogas this bed has tipped back (`cave.hammockRest`), to set upright when they leave it or the bed
    // comes down; one whose body the remote pool has since dropped (off the graph) gives up its place.
    const tipped = [];
    const upright = (cave) => {
      cave.root.rotation.x = 0;
      cave.root.quaternion = null;
      cave.parts.head.quaternion = null;
      cave.hammockRest = false;
      releaseEquipment(cave);
      tipped.splice(tipped.indexOf(cave), 1);
    };
    // Another page's resting Ooga, posed in this bed.
    const poseRemote = (cave, feet, rec = null, shown = true) => {
      const r = cave.root, state = rec?.rest;
      // The shared remote pose already smoothed the current look before the bed tips the body.
      const headPitch = rec?.visual ? cave.parts.head.rotation.x : 0;
      const k = state === 0 ? -1 : state ? state[0] : restingAt(r.position.x, feet, r.position.z);
      if (k < 0 || k >= seats.length || rec && seats[k].remote && seats[k].remote !== rec.id) {
        if (cave.hammockRest) upright(cave);
        return false;
      }
      if (!cave.hammockRest) {
        for (let i = tipped.length - 1; i >= 0; i--) if (!tipped[i].root.parent) upright(tipped[i]);
        tipped.push(cave);
      }
      if (state && state[1] !== 2) {
        // Position already follows this phase through the ordinary pose transport.
        r.quaternion = cave.hammockRotation ||= quat.create();
        let sum = 0;
        for (let i = 0; i < 3; i++) { r.quaternion[i] = state[i + 3] / 1000; sum += r.quaternion[i] ** 2; }
        r.quaternion[3] = Math.sqrt(Math.max(0, 1 - sum));
        quat.normalize(r.quaternion);
        const t = state[2] / 255, blend = t * t * (3 - 2 * t), stand = state[1] === 1 ? 1 - blend : blend;
        for (const key of ENTRY_PARTS) {
          const part = cave.parts[key];
          part.quaternion = null;
          part.rotation.x = key === "armL" || key === "armR" ? -0.2 * stand : 0;
          part.rotation.y = part.rotation.z = 0;
        }
        parkEquipment(cave, seats[k], shown);
      } else posed(cave, seats[k], null, shown);
      cave.parts.head.rotation.x = headPitch;
      cave.hammockRest = true;
      return true;
    };
    const dispose = () => {
      for (const seat of seats) { seat.sitter = null; seat.entry = seat.exit = seat.fall = null; }
      while (tipped.length) upright(tipped[0]);
      while (parked.length) releaseEquipment(parked[0].cave);
      solids.remove(ridgeNode);
      removeChild(root, ridgeNode); removeChild(root, bedNode);
      for (const rope of ropes) { removeChild(root, rope.node); removeChild(rope.wrap.parent, rope.wrap); }
    };
    update(0, 0, false);
    // Whether the bed has taken enough hits to tip out whoever lies in it. Only the occupant's own page acts on it (a bed held
    // only by another page's remote pose never reports it to anyone who could stand them up).
    // ... or, for the visitor's own Ooga lying in it, the swing itself past FALL (rocked there by them, or by others' hits with their
    // pumping on top); a bed another page's Ooga lies in is never judged by this page's swing.
    const spilling = () => {
      for (const seat of seats) if (seat.fall) return false;
      if (count >= TIP_COUNT - 1e-9) return occupied();
      if (amp < FALL) return false;
      for (const seat of seats) if (seat.sitter) return true;
      return false;
    };
    return { plan: p, seats, ridgeNode, bedNode, ropes, update, syncRopes, kick, bump, hit, pump, blocks, crosses, tip, enter, restingAt, settle, free, near, reachable, landing, poseRemote, stateFor, releaseEquipment, dispose, get angle() { return angle; }, get amp() { return amp; }, get spilling() { return spilling(); }, get fallSide() { return fallSide; } };
  };

  BL.hubHammock = { SLOTS, TIE, SPAN_MIN, SPAN_MAX, SWAY_MAX, REST_HELD, STAND, GEAR_TOP, GEAR_CLEAR, plan, create, ridgeY };
})();
