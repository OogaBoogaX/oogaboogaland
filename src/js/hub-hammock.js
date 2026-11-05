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
  // BED_SAG lower, cradled CRADLE across; the trunks stand at least TRUNK_CLEAR from its ends.
  const TIE = 3.05, RIDGE_SAG = 0.12, SPAN_MIN = 4.5, SPAN_MAX = 10;
  const BED_LEN = 2.5, BED_W = 0.95, END_Y = 0.86, BED_SAG = 0.2, CRADLE = 0.07, TRUNK_CLEAR = 0.6;
  // The one resting place is centred on the cloth; the crew seat contract owns occupancy and standing up.
  const SEAT_AT = [0], SEAT_LIFT = 0.04, SLOTS = SEAT_AT.length;
  const ENTRY_SECONDS = 0.9, ENTRY_PARTS = ["legL", "legR", "armL", "armR", "head"], AXES = ["x", "y", "z"];
  // Where an Ooga stands up: STAND past the bed's swing (`envelope`'s `across`), room for the widest Ooga.
  const STAND = 0.6;
  // The swing: the bed's angle about the virtual swing axis is `amp` sin(OMEGA t), `amp` easing toward REST (or REST_HELD with
  // anyone in it) at DECAY a second and never past SWAY_MAX; a sitter's landing and a shaken palm add KICK.
  const OMEGA = 2.1, REST = 0.012, REST_HELD = 0.035, DECAY = 0.35, KICK = 0.06, SWAY_MAX = 0.11;
  // The cloth grid and radii of its spreaders, edge cords and suspension rings.
  const BED_NX = 14, BED_NZ = 4, SPREADER_R = 0.035, SPREADER_KNUCKLE = 1.14, EDGE_R = 0.016, CORD_R = 0.011, DROP_R = 0.022;
  const CORD_Z = [-BED_W / 2 - 0.06, -BED_W / 4, BED_W / 4, BED_W / 2 + 0.06];
  // The suspension ring beyond each end of the bed.
  const RING_OUT = 0.28;
  // A resting Ooga as another page sends it: within REST_NEAR of a seat across, its feet REST_LOW to REST_HIGH over
  // the ground. No walker reaches a seat's place across (the bed's shell is in the way), and REST_HIGH stays under the
  // shell's top (the swung bed's highest point), so one standing on the bed or flying over is not resting.
  const REST_NEAR = 0.4, REST_LOW = 0.05, REST_HIGH = 0.9;
  const ROPE = "#c9a36a", CORD = "#7a5a32";
  const WEAVE = ["#b48a52", "#9c7443", "#b48a52", "#c25d3a", "#d7a95a", "#c25d3a"].map(hexToRgb), WEAVE_UNDER = hexToRgb("#6e5233");

  // The virtual sway axis height at t between the tree attachments.
  const ridgeY = (p, t) => p.ay + (p.by - p.ay) * t - Math.sin(Math.PI * t) * RIDGE_SAG;
  // The cloth's height under the pivot at x along the bed and z across it, before any swing.
  const clothY = (p, x, z) => p.endY - Math.sin(Math.PI * (x / BED_LEN + 0.5)) * BED_SAG - Math.cos(Math.PI * z / BED_W) * CRADLE;

  // How far the bed reaches as it swings, in the pivot's frame (x along the virtual swing axis, y up from it, z across): every
  // point `bedGeometry` draws through, with the thickness of the part there, turned through +-SWAY_MAX about the
  // virtual axis. Seen from above it is an octagon: the `body` (the cloth, its edge cords and the spreaders) `half` along
  // and `across` either side, and past it the `tip` (each suspension ring), the cords
  // between the two inside the outline; `lo` and `hi` under and over the pivot, `top` the body's highest. The
  // collision shell is this octagon from `lo` to `top`: the suspension above `top` hangs inside the outline, where no
  // walker reaches, and a shell up to `hi` would be a floor at the virtual swing axis for an Ooga coming down on it. `plan`
  // keeps the ground under the octagon clear.
  const envelope = (p) => {
    const body = { half: 0, across: 0 }, tip = { half: 0, across: 0 }, e = { body, tip, lo: Infinity, hi: -Infinity, top: -Infinity };
    const c = Math.cos(SWAY_MAX), s = Math.sin(SWAY_MAX);
    // A cos a + B sin a over the swing: its ends, and where its slope is zero when that falls inside.
    const swung = (A, B) => {
      const out = [A * c - B * s, A * c + B * s], a = A ? Math.atan(B / A) : Infinity;
      if (Math.abs(a) < SWAY_MAX) out.push(A * Math.cos(a) + B * Math.sin(a));
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
    // Its collision is the bed's whole swing (`envelope`), a closed octagonal prism turned with the virtual swing axis from under
    // the bed to the swung bed's top: walkers go round the bed and stand clear of it, one coming down on it stands at
    // the bed, and the ropes above it and the virtual swing axis itself, overhead between the trunks and the bed, block nothing.
    const { outline } = p.envelope, n = outline.length, lo = p.y + p.envelope.lo - my, hi = p.y + p.envelope.top - my;
    const cx = p.x - mx, cz = p.z - mz, shell = M.geometry();
    for (const y of [lo, hi]) for (const [along, side] of outline)
      shell.verts.push(cx + p.ux * along + p.nx * side, y, cz + p.uz * along + p.nz * side);
    shell.faces.push({ i: outline.map((_, k) => k), color: WEAVE_UNDER, emissive: 0 }, { i: outline.map((_, k) => 2 * n - 1 - k), color: WEAVE_UNDER, emissive: 0 });
    for (let k = 0; k < n; k++) shell.faces.push({ i: [k, k + n, (k + 1) % n + n, (k + 1) % n], color: WEAVE_UNDER, emissive: 0 });
    geo.collisionGeometry = shell;
    return { geo, x: mx, y: my, z: mz };
  };

  // The hammock in `root` from a plan: `ra`, `rb` the trunks' radii at the tie, `seed` its leaves'.
  const create = ({ plan: p, root, solids, ra, rb, seed, anchors = null }) => {
    const { createNode, addChild, removeChild } = BL.scene;
    const ridge = ridgeGeometry(p);
    const ridgeNode = createNode({ geometry: ridge.geo, position: { x: ridge.x, y: ridge.y, z: ridge.z }, sightHidden: true });
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
    const seats = p.seats.map((s, index) => ({ kind: "hammock", lying: true, keepEquipment: true, index, x: 0, y: 0, z: 0, ry: p.seatRy, floor: s.floor, walkAt: { x: s.walkAt.x, z: s.walkAt.z }, sitter: null, remote: 0, restX: 0, restY: 0, restZ: 0, wire: new Int16Array(6) }));
    let amp = REST, angle = 0;
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
    let minX = 0, maxX = 0, minY = 0, minZ = 0, maxZ = 0;
    const measureGear = (node) => {
      if (!node.visible) return;
      const v = node.geometry?.verts, m = node.world;
      if (v) for (let i = 0; i < v.length; i += 3) {
        const x = m[0] * v[i] + m[4] * v[i + 1] + m[8] * v[i + 2] + m[12];
        const y = m[1] * v[i] + m[5] * v[i + 1] + m[9] * v[i + 2] + m[13];
        const z = m[2] * v[i] + m[6] * v[i + 1] + m[10] * v[i + 2] + m[14];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      for (const child of node.children) measureGear(child);
    };
    const parkPart = (gear, node, index, temporary = false) => {
      if (!node) return;
      const saved = { node, index, parent: node.parent, position: { ...node.position }, rotation: { ...node.rotation },
        quaternion: node.quaternion, visible: node.visible, poseYaw: node.poseYaw, poseLean: node.poseLean, cameraHidden: node.cameraHidden, temporary };
      gear.parts.push(saved);
      if (node.parent) removeChild(node.parent, node);
      addChild(gear.holder, node);
      node.position.x = node.position.y = node.position.z = 0;
      node.rotation.x = node.rotation.y = 0; node.rotation.z = index === 1 ? 0 : Math.PI / 2;
      if (index === 1) node.rotation.y = Math.PI / 2;
      node.quaternion = null;
      node.poseYaw = node.poseLean = 0;
      node.cameraHidden = false;
      node.visible = true;
      // Fit to the actual visible geometry, including attachments, in the holder's frame.
      BL.scene.updateWorld(node);
      minX = minY = minZ = Infinity; maxX = maxZ = -Infinity;
      measureGear(node);
      if (Number.isFinite(minY)) {
        node.position.x = -(minX + maxX) / 2;
        node.position.y = 0.025 - minY;
        node.position.z = (index - 1) * 0.32 - (minZ + maxZ) / 2;
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
      if (!seat || !seats.includes(seat)) return 0;
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
      kick();
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
    for (const seat of seats) seat.leave = (cave, target, finish) => {
      if (seat.sitter !== cave || cave.camp.seat !== seat) return false;
      if (seat.exit) return true;
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
      let held = false;
      for (const seat of seats) if (seat.sitter || seat.remote) held = true;
      const rest = held ? REST_HELD : REST;
      amp += (rest - amp) * Math.min(1, DECAY * dt);
      if (!still) angle = amp * Math.sin(OMEGA * time);
      bedNode.rotation.x = angle * p.side;
      quat.fromEuler(bedRotation, bedNode.rotation.x, p.yaw, 0);
      quat.multiply(bodyRotation, bedRotation, restRotation);
      if (windTime !== null) syncRopes(windTime, windEnabled);
      for (const seat of seats) {
        place(seat, angle);
        if (seat.entry && (seat.entry.cave !== seat.sitter || seat.entry.cave.camp.seat !== seat)) seat.entry = null;
        if (seat.exit && (seat.exit.cave !== seat.sitter || seat.exit.cave.camp.seat !== seat)) seat.exit = null;
        if (seat.sitter && seat.sitter.camp.seat === seat && seat.exit) {
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
    const kick = () => { amp = Math.min(SWAY_MAX, amp + KICK); };
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
    // Reach the whole cloth from either side or end, including while standing on its shell.
    const near = (x, z, reach) => {
      const dx = x - p.x, dz = z - p.z, along = dx * p.ux + dz * p.uz, across = dx * p.nx + dz * p.nz;
      p.envelope.nearest(along, across, endpoint);
      return Math.hypot(along - endpoint[0], across - endpoint[1]) < reach;
    };
    const reachable = (x, feet, z, reach) => near(x, z, reach)
      && (Math.abs(feet - p.ground) < 0.15 || Math.abs(feet - (p.y + p.envelope.top)) < 0.15);
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
      for (const seat of seats) { seat.sitter = null; seat.entry = seat.exit = null; }
      while (tipped.length) upright(tipped[0]);
      while (parked.length) releaseEquipment(parked[0].cave);
      solids.remove(ridgeNode);
      removeChild(root, ridgeNode); removeChild(root, bedNode);
      for (const rope of ropes) { removeChild(root, rope.node); removeChild(rope.wrap.parent, rope.wrap); }
    };
    update(0, 0, false);
    return { plan: p, seats, ridgeNode, bedNode, ropes, update, syncRopes, kick, enter, restingAt, settle, free, near, reachable, poseRemote, stateFor, releaseEquipment, dispose, get angle() { return angle; }, get amp() { return amp; } };
  };

  BL.hubHammock = { SLOTS, TIE, SPAN_MIN, SPAN_MAX, SWAY_MAX, STAND, plan, create, ridgeY };
})();
