// Ooga Raid's bank interiors: the art for the two rooms stages, The Counting House (stage 2, `counting`) and The
// Treasury Vaults (stage 4, `treasury`), registered into `BL.raidArt` beside the other stages' art. Geometry only: no
// nodes, no state, nothing per frame. Every builder is cached once a page; the scene places the results.
//
// `BL.raidArt.stages[id].roomShell(stage, i)` is the art for room i of `stage`, a rooms stage as raid-stages.js parses
// it, cached for that stage object. Its layout is read from the stage at the build and never written back: the targets
// (type numbers named through BL.raidStages.ENEMY as it stands then), the doors, the wires, the doors that DROP_GUARD
// waves come through (the hatches), the twin cores' pair (the gauge) and the boss room's parts. The file keeps only the
// art's own: each room's name and its dressing, so a stage whose room count differs throws. Every piece is in the
// scene's flat room frame: x and y already
// put through the sim's projection (`projectX`, `projectY`, depth 1 at the back wall, so the back wall's face is where
// the depth-1 targets draw), z only an order. Built in room metres (x along the wall, y up, d metres back from the front
// line), each vertex is projected, and its z set from its depth (deeper is further back) plus a little for its
// distance from the side walls and the floor, which is how a camera on the room's middle would order them. The
// colours carry the shading of each face's facing in the room, since after the projection every face turns to the
// camera and both renderers light them alike. It returns:
//   shell    the floor, side walls, back wall and their dressing, in four layers (base, inlay, overlay, decor) at
//            local z -1.59 to -0.005. Place it at the scene's SHELL_Z (-2.6): it then stands behind every target
//            (depth 1 at -2, scaled 0.65) and every actor.
//   front    the front edge: the lintel over the opening (from ROOM_H up), the jambs and the sill, with any drop
//            hatches; local z 0 to 0.1. Place it at z +0.6, outside the room view the advance grows: it stays the
//            view's frame while the back wall grows up to meet it, and what leaves the room above the opening goes
//            behind it.
//   barrier  the room's bars across the back wall, local z about 0, with gaps over each target's box and door (the build
//            throws if a bar face overlaps one, `barClash`); place at SHELL_Z + 0.15.
//   door     one wave door about its foot's middle, under a metre wide so a door at x 0.5 or 7.5 stays on the wall;
//            place at (projectX(door, 1), projectY(0, 1), SHELL_Z + 0.05).
//   wires    one `{ geometry, x0, x1, h }` a tripwire, its live beam in place at depth 0; its brass posts are in
//            the shell. Show it while the wire is live (and flicker it in its warning).
//   lamps    one `{ geometry, door, x, y }` a drop hatch, its warning lamp lit, in place, `door` the x of the door it
//            hangs over; show it to warn of a drop.
//   needle   `{ geometry, x, y }` in the twin rooms: the gauge's needle about its pivot, pointing up, to turn about
//            z toward the open twin; null elsewhere.
//   keep     the screen rectangles no dressing in the decor layer may overlap: each target's bullet box and each
//            door's true extent, at depth 1. The build throws if a decor face overlaps one or a door leaves the wall.
//   doorOverTargets  the targets the stage itself stands in front of a door, `{ type, x, y, door }` each (the door
//            draws behind them; the art cannot move either).
// The shell never covers what plays: it is behind everything, and its decor keeps off every target's box and door.
//
// `BL.raidArt.types[NAME]` is each type's look for these stages: `build()`, `shut()` where the type shuts, `turned()`
// for a facing type (mirrored in x with its faces rewound, as raid-models does), and a few extras (the searchlight's
// `dark`, `cone`, `pool` and `poolLocked`; the bill-bat's `flap`; the counter's `digits`). A look stands on the type's
// anchor, the sim's x, y (a walker's feet; ORIGIN over it is its box's middle), in room metres facing the camera, and
// its silhouette keeps inside its tier's bullet box (`box`). Back-wall looks are drawn at depth 1, scaled 0.65.
// `stages[id].boss(stage)` is the boss room's parts, `{ type, x, y, attr }` from its records, each wearing its look.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const M = BL.models;
  const { box, bevelBox, lathe, merge, cached, moved, turnedX, turnedY, turnedZ, forwardLathe, along, beam } = M;
  const { SIGN_GLYPHS } = BL.hubModels;
  const { ROOM_W, ROOM_H } = BL.raidStages;
  const { RULES, TUNE, ROOM, projectX, projectY } = BL.raidSim;
  const { hexToRgb, mulberry32 } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-bank: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI, DEPTH = TUNE.ROOM_DEPTH, MID = ROOM_W / 2;

  // Each type's tier and origin (raid-enemies' defs and the stage specs' table); its bullet box about its anchor.
  const SPEC = Object.freeze({
    GUARD: [0, 0.5], COIN_BARREL: [0, 0.25], LEDGER_CORE: [1, 0], WALL_TELLER: [1, 0], SENSOR: [0, 0.25],
    BILL_BAT: [0, 0], DROP_GUARD: [0, 0.5], SHUTTER_CORE: [1, 0], TWIN_CORE: [1, 0], SEARCHLIGHT: [1, 0],
    PRESS_DIE: [1, 0], MINT_COUNTER: [3, 0], PRINT_HEAD: [1, 0], PRINTER_KING: [3, 0]
  });
  const boxOf = (name) => { const [tier, o] = SPEC[name], b = RULES.SHOT_BOX[tier]; return [b[0], b[1], o + b[2], o + b[3]]; };
  // SPEC must be the sim's tier and origin for every type it names, which the sim must have, or a look's box drifts
  // from its hit box: checked at load and again at each room's build.
  const checkSpec = () => {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-bank: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-bank: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  };
  checkSpec();
  // A type number's name in BL.raidStages.ENEMY as it stands now; a back-wall target's must have a look here.
  const typeName = (t) => {
    const { ENEMY } = BL.raidStages;
    for (const name of Object.keys(ENEMY)) if (ENEMY[name] === t) return name;
    throw new Error(`raid-art-bank: enemy type ${t} is not in BL.raidStages.ENEMY`);
  };
  const lookName = (t) => {
    const name = typeName(t);
    if (!SPEC[name]) throw new Error(`raid-art-bank: a ${name} has no look on a bank room's back wall`);
    return name;
  };

  // ---- small builders ----------------------------------------------------------------------------------------------
  const flat = (geo) => Object.assign(geo, { castShadow: false });
  const rgbOf = (c) => typeof c === "string" ? hexToRgb(c) : c;
  const dim = (hex, k) => "#" + hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, "0")).join("");
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  // A disc facing the camera (+z), a round bar from a to b, a ball.
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  const rod = (ax, ay, az, bx, by, bz, r, color, emissive = 0, segments = 8) => {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    return along(lathe({ profile: [[0, 0], [r, 0], [r, len], [0, len]], segments, color, emissive }), ax, ay, az, bx - ax, by - ay, bz - az);
  };
  const ball = (r, x, y, z, color, emissive = 0, segments = 10) =>
    moved(lathe({ profile: [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], segments, color, emissive }), x, y, z);
  const scaled = (geo, sx, sy, sz) => { const v = geo.verts; for (let i = 0; i < v.length; i += 3) { v[i] *= sx; v[i + 1] *= sy; v[i + 2] *= sz; } return geo; };
  // Turns parts about z round a pivot (a positive angle swings +x toward +y).
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
  // A part `len` long hung down from a pivot, turned by `a` about z (a positive angle swings its end toward +x), and
  // where its end lands: the Legion's limbs, as raid-models builds them.
  const hang = (px, py, pz, len, w, d, a, color) => moved(turnedZ(B(-w / 2, w / 2, -len, 0, -d / 2, d / 2, color), a), px, py, pz);
  const endOf = (px, py, len, a) => [px + len * Math.sin(a), py - len * Math.cos(a)];
  const newell = (v, idx) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0, m = idx.length; k < m; k++) {
      const a = idx[k] * 3, b = idx[(k + 1) % m] * 3;
      nx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
      ny += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
      nz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  // Every face of geo turned to face `want`.
  const orient = (geo, want) => {
    for (const f of geo.faces) { const n = newell(geo.verts, f.i); if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) f.i.reverse(); }
    return geo;
  };
  const UP = [0, 1, 0], TOWARD = [0, 0, 1], RIGHTWARD = [1, 0, 0], LEFTWARD = [-1, 0, 0];
  // One flat face through the points, facing `want`.
  const quad = (pts, want, color, emissive = 0) => {
    const g = M.geometry();
    M.face(g, pts.map((p) => M.pushVert(g, p[0], p[1], p[2])), rgbOf(color), { emissive });
    return orient(g, want);
  };
  // The same geometry mirrored in x about `cx` with its faces rewound, so it still faces the way it did.
  const mirrorAbout = (geo, cx) => {
    const out = { verts: Array.from(geo.verts), faces: geo.faces.map((f) => ({ ...f, i: f.i.slice().reverse() })), lines: [] };
    for (let i = 0; i < out.verts.length; i += 3) out.verts[i] = 2 * cx - out.verts[i];
    if (geo.castShadow === false) out.castShadow = false;
    return out;
  };
  const mirrored = (geo) => mirrorAbout(geo, 0);
  const mirrorRoom = (geo) => mirrorAbout(geo, MID);
  // A word in the island's 3x5 alphabet (capitals and digits) as flat runs facing +z, `cell` square, centred at (x, y).
  const glyphs = (text, cell, x, y, z, color, emissive = 0) => {
    const g = M.geometry(), rgb = rgbOf(color), w = text.length * 4 - 1;
    for (let n = 0; n < text.length; n++) {
      const rows = SIGN_GLYPHS[text[n]];
      if (!rows) {
        if (text[n] === " ") continue;
        throw new Error(`raid-art-bank: the sign alphabet has no "${text[n]}"`);
      }
      for (let r = 0; r < 5; r++) {
        const line = rows[r];
        for (let c = 0; c < line.length;) {
          if (line[c] !== "1") { c++; continue; }
          let e = c;
          while (e < line.length && line[e] === "1") e++;
          const x0 = x + (n * 4 + c - w / 2) * cell, x1 = x0 + (e - c) * cell, y1 = y + (2.5 - r) * cell, y0 = y1 - cell;
          M.face(g, [M.pushVert(g, x0, y0, z), M.pushVert(g, x1, y0, z), M.pushVert(g, x1, y1, z), M.pushVert(g, x0, y1, z)], rgb, { emissive });
          c = e;
        }
      }
    }
    return g;
  };
  // A sheet of rough rock on a plane: a grid of jittered points (u across, v up, both clamped at the sheet's edge),
  // bumped by up to `bump` along the plane's normal, each cell its own shade. map(u, v, bump) gives the point.
  const sheet = ({ u0, u1, v0, v1, step, map, want, palette, seed, bump = 0.12, jit = 0.5 }) => {
    const rand = mulberry32(seed), nu = Math.max(1, Math.round((u1 - u0) / step)), nv = Math.max(1, Math.round((v1 - v0) / step));
    const geo = M.geometry(), grid = [];
    for (let j = 0; j <= nv; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) {
        const inner = i > 0 && i < nu && j > 0 && j < nv;
        const u = u0 + (u1 - u0) * i / nu + (inner ? (rand() - 0.5) * step * jit : 0);
        const v = v0 + (v1 - v0) * j / nv + (inner ? (rand() - 0.5) * step * jit : 0);
        const p = map(u, v, inner ? rand() * bump : 0);
        row.push(M.pushVert(geo, p[0], p[1], p[2]));
      }
      grid.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      M.face(geo, [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], hexToRgb(palette[(rand() * palette.length) | 0]));
    }
    return orient(geo, want);
  };
  const gear = (r, teeth, x, y, z, color, hub) => {
    const parts = [disc(r, 0.06, x, y, z, color, 0, 16), disc(r * 0.35, 0.08, x, y, z + 0.01, hub, 0.2, 12)];
    for (let k = 0; k < teeth; k++) parts.push(moved(turnedZ(B(-r * 0.12, r * 0.12, r * 0.9, r * 1.18, -0.03, 0.03, color), k * 2 * PI / teeth), x, y, z));
    for (let k = 0; k < 4; k++) parts.push(moved(turnedZ(B(-0.02, 0.02, r * 0.3, r * 0.85, 0.02, 0.04, hub), k * PI / 2 + PI / 4), x, y, z));
    return parts;
  };
  // A fiat seal: a gold disc, a sunk ring, eight rays and a boss.
  const seal = (r, x, y, z, gold, dark) => {
    const parts = [disc(r, 0.05, x, y, z, gold, 0.35, 20), disc(r * 0.78, 0.055, x, y, z + 0.004, dark, 0.15, 20), disc(r * 0.62, 0.06, x, y, z + 0.008, gold, 0.4, 18), disc(r * 0.16, 0.1, x, y, z + 0.02, dark, 0.2, 10)];
    for (let k = 0; k < 8; k++) parts.push(moved(turnedZ(B(-r * 0.05, r * 0.05, r * 0.2, r * 0.56, 0.05, 0.062, dark, 0.15), k * PI / 4), x, y, z));
    return parts;
  };

  // ---- the room frame --------------------------------------------------------------------------------------------
  // Room metres: x along, y up, z = -d (d metres back from the front line, 0 to DEPTH).
  const R = (x0, x1, y0, y1, d0, d1, color, emissive = 0) => B(x0, x1, y0, y1, -d1, -d0, color, emissive);
  const RB = (x0, x1, y0, y1, d0, d1, color, bevel) => BB(x0, x1, y0, y1, -d1, -d0, color, bevel);
  const floorQ = (x0, x1, d0, d1, y, color, emissive = 0) => quad([[x0, y, -d0], [x1, y, -d0], [x1, y, -d1], [x0, y, -d1]], UP, color, emissive);
  const sideQ = (x, d0, d1, y0, y1, color, emissive = 0) => quad([[x, y0, -d0], [x, y0, -d1], [x, y1, -d1], [x, y1, -d0]], x < MID ? RIGHTWARD : LEFTWARD, color, emissive);
  const backQ = (x0, x1, y0, y1, d, color, emissive = 0) => quad([[x0, y0, -d], [x1, y0, -d], [x1, y1, -d], [x0, y1, -d]], TOWARD, color, emissive);
  // How a face would catch the scene's light in the room; baked into its colour, since projected every face is lit
  // as one facing the camera.
  const LIGHT = (() => { const l = Math.hypot(0.32, 0.76, 0.56); return [0.32 / l, 0.76 / l, 0.56 / l]; })();
  // Depth to z: KZ a metre of depth, KIN a metre in from the nearest side wall or up from the floor; LAYER is each
  // layer's z at the front line (base, inlay, overlay, decor), each layer wholly behind the next.
  const KZ = 0.06, KIN = 0.01, LAYER = [-1.29, -0.89, -0.49, -0.09];
  const project = (parts, zb, kz = KZ, kin = KIN) => {
    const src = merge(...parts), v = src.verts, out = { verts: new Array(v.length), faces: [], lines: [] };
    for (const f of src.faces) {
      const n = newell(v, f.i), lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const k = f.emissive > 0.5 ? 1 : Math.min(1.12, 0.72 + 0.5 * lit);
      out.faces.push({ i: f.i, color: f.color.map((c) => Math.min(255, Math.round(c * k))), emissive: f.emissive });
    }
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2], d = -z / DEPTH;
      out.verts[i] = projectX(x, d);
      out.verts[i + 1] = projectY(y, d);
      out.verts[i + 2] = zb + kz * z + kin * (Math.min(x, ROOM_W - x) + Math.min(y, ROOM_H));
    }
    return flat(out);
  };
  // A piece on the back wall, projected in place with a z about 0 (the barrier); `onBackWall` is one built about
  // x = MID and moved so its foot's middle is the origin (a door, placed at each door's x).
  const wallPiece = (parts) => project(parts, 0.05, 0.01, 0.002);
  const onBackWall = (parts) => {
    const g = wallPiece(parts), v = g.verts, foot = projectY(0, 1);
    for (let i = 0; i < v.length; i += 3) { v[i] -= MID; v[i + 1] -= foot; }
    return g;
  };

  // ---- keeping the targets clear -----------------------------------------------------------------------------------
  // A room's keep-out rectangles in room metres on the back wall: each target's bullet box, and each door.
  const keepOf = (room, door) => {
    const out = [];
    for (const [x, y, name] of room.targets) { const b = boxOf(name); out.push([x + b[0], x + b[1], y + b[2], y + b[3]]); }
    for (const x of room.doors) out.push([x - door[0], x + door[0], 0, door[1]]);
    return out;
  };
  // The x spans of the band y0 to y1 clear of every keep-out (by `m`), between x0 and x1, each wider than `min`.
  const freeSpans = (room, y0, y1, x0 = 0, x1 = ROOM_W, m = 0.08, min = 0.12) => {
    let spans = [[x0, x1]];
    for (const r of room.keep) {
      if (r[2] - m >= y1 || r[3] + m <= y0) continue;
      const a = r[0] - m, b = r[1] + m, next = [];
      for (const [s, e] of spans) {
        if (b <= s || a >= e) { next.push([s, e]); continue; }
        if (a > s) next.push([s, a]);
        if (b < e) next.push([b, e]);
      }
      spans = next;
    }
    return spans.filter(([s, e]) => e - s >= min);
  };
  // The y spans of the column x0 to x1 clear of every keep-out (by `m`), between y0 and y1, each longer than `min`.
  const freeRises = (room, x0, x1, y0, y1, m = 0.08, min = 0.06) => {
    let spans = [[y0, y1]];
    for (const r of room.keep) {
      if (r[0] - m >= x1 || r[1] + m <= x0) continue;
      const a = r[2] - m, b = r[3] + m, next = [];
      for (const [s, e] of spans) {
        if (b <= s || a >= e) { next.push([s, e]); continue; }
        if (a > s) next.push([s, a]);
        if (b < e) next.push([b, e]);
      }
      spans = next;
    }
    return spans.filter(([s, e]) => e - s >= min);
  };
  const isFree = (room, x0, x1, y0, y1, m = 0.08) => !room.keep.some((r) => r[0] - m < x1 && r[1] + m > x0 && r[2] - m < y1 && r[3] + m > y0);
  // Where a run along a side wall at heights y0 to y1 stops: short of the back wall where a door comes to that corner.
  const sideEnd = (room, y0, y1) => room.keep.some((r) => (r[0] < 0.15 || r[1] > ROOM_W - 0.15) && r[2] < y1 && r[3] > y0) ? DEPTH - 0.6 : DEPTH;
  // The twins' yoke and gauge over a room's TWIN_CORE pair: the yoke's bar as low over them, and its dial as low over
  // the bar, as the room's other targets and doors leave clear. Null in a room without twins.
  const gaugeOf = (room) => {
    const twins = room.targets.filter((t) => t[2] === "TWIN_CORE");
    if (!twins.length) return null;
    if (twins.length !== 2 || twins[0][3] !== twins[1][3]) throw new Error(`raid-art-bank: ${room.name} wants one pair of twin cores, has ${twins.length}`);
    const [a, b] = twins[0][0] < twins[1][0] ? twins : [twins[1], twins[0]], top = Math.max(a[1], b[1]) + boxOf("TWIN_CORE")[3];
    const others = { keep: room.keep.filter((r, k) => k >= room.targets.length || room.targets[k][2] !== "TWIN_CORE") };
    let bar = top + 0.45;
    while (!isFree(others, a[0] - 0.18, b[0] + 0.18, bar - 0.05, bar + 0.05)) bar += 0.01;
    const x = (a[0] + b[0]) / 2;
    let y = bar + 0.07;
    while (!isFree(others, x - 0.22, x + 0.22, y - 0.22, y + 0.22)) y += 0.01;
    if (y > 3.25) throw new Error(`raid-art-bank: ${room.name} leaves no room for the twins' gauge under the rock`);
    return { x, y, bar, twins: [a, b] };
  };
  // Room i of a parsed stage read into the art's own record, which the dressing reads: never the stage's objects.
  const readRoom = (stage, i, name, door) => {
    const src = stage.rooms[i], T = src.targets, W = src.waves, X = src.wires;
    const room = { name, boss: src.boss, targets: [], doors: Array.from(src.doors), wires: [], hatches: [] };
    for (let k = 0; k < T.length; k += 4) room.targets.push([T[k], T[k + 1], lookName(T[k + 2]), T[k + 3]]);
    for (let k = 0; k < X.length; k += 6) room.wires.push([X[k], X[k + 1], X[k + 2]]);
    for (let k = 0; k < W.length; k += 3) {
      const x = room.doors[W[k + 2]];
      if (typeName(W[k + 1]) === "DROP_GUARD" && !room.hatches.includes(x)) room.hatches.push(x);
    }
    room.keep = keepOf(room, door);
    room.gauge = gaugeOf(room);
    return room;
  };
  // A door's true extent on the back wall in room metres, from its geometry: half its width, and its height.
  const extentOf = (door) => {
    let half = 0, top = 0;
    for (let i = 0; i < door.verts.length; i += 3) { half = Math.max(half, Math.abs(door.verts[i])); top = Math.max(top, door.verts[i + 1]); }
    return [half / (1 - ROOM.SHRINK), top / (1 - ROOM.SHRINK)];
  };
  // Does the face (screen x, y) overlap the screen rectangle r? Separating axes: the rectangle's, then the face's edges.
  const overlaps = (v, idx, r) => {
    const e = 0.003, rx0 = r[0] + e, rx1 = r[1] - e, ry0 = r[2] + e, ry1 = r[3] - e;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of idx) { const x = v[i * 3], y = v[i * 3 + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 <= rx0 || x0 >= rx1 || y1 <= ry0 || y0 >= ry1) return false;
    const cx = [rx0, rx1, rx1, rx0], cy = [ry0, ry0, ry1, ry1];
    for (let k = 0, m = idx.length; k < m; k++) {
      const a = idx[k] * 3, b = idx[(k + 1) % m] * 3, nx = -(v[b + 1] - v[a + 1]), ny = v[b] - v[a];
      if (Math.abs(nx) + Math.abs(ny) < 1e-9) continue;
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const i of idx) { const p = v[i * 3] * nx + v[i * 3 + 1] * ny; p0 = Math.min(p0, p); p1 = Math.max(p1, p); }
      for (let c = 0; c < 4; c++) { const q = cx[c] * nx + cy[c] * ny; q0 = Math.min(q0, q); q1 = Math.max(q1, q); }
      if (p1 <= q0 || q1 <= p0) return false;
    }
    return true;
  };
  const clashes = (geo, rects) => {
    let n = 0;
    for (const f of geo.faces) if (rects.some((r) => overlaps(geo.verts, f.i, r))) n++;
    return n;
  };

  // ---- palettes ----------------------------------------------------------------------------------------------------
  const C = {
    cliff: ["#a8949a", "#9a868c", "#b39fa3", "#8f7c83", "#a18b92"], cliffDk: "#6e5c62",
    marble: ["#e6dac2", "#ddd0b6", "#e9dfca", "#d8cab0"], marbleDk: "#c4b597", tile: "#b59ea2", mortar: "#5e4f4c",
    brass: "#c9a040", brassLt: "#e0b44a", brassDk: "#8f6f2a", maroon: "#7a2a36", maroonDk: "#561c26", velvet: "#8a1f33",
    ledger: ["#2f6b4a", "#3f8a5e", "#7a2a36", "#5a3a22", "#2f3e66", "#8a6a3a", "#4a5a2a", "#6b2420"],
    copper: "#b8733a", copperDk: "#8a5228", iron: "#2c2e33", ironLt: "#4a4e56", ironMd: "#383b41", gold: "#e0b44a", coin: "#f0c95a",
    lamp: "#3fae5a", bulb: "#fff1b8", wood: "#5c3a1e", woodLt: "#7a5230", paper: "#f2efe6", steam: "#6fe08a", glass: "#43d27a"
  };
  const V = {
    steel: "#6b737c", steel2: "#646c75", steelDk: "#4f565e", steelLt: "#8a939c", base: "#2b2f35", rivet: "#9aa2aa", plate: "#5d646c", plate2: "#555c64",
    gold: "#e0b44a", goldDk: "#b08a2e", ink: "#17181c", ink2: "#26282e", bill: "#5f9e5a", billLt: "#cfe8c0", billDk: "#3f7a40",
    cream: "#fff2c0", red: "#ff4a3a", rock: ["#6f6a72", "#625e66", "#78737b", "#5a5660"], navy: "#1c2433", cage: "#3b3f46", blue: "#2f5d9a"
  };
  const SKIN = "#e2ab82", SKIN_DK = "#c98e66", SHIRT = "#f2efe6", SHOE = "#1d1d20", EYE = "#1d1d20", MOUTH = "#7a2a22";
  const LOOK_YAW = 0.55;
  const facing = (parts, yaw) => turnedY(merge(...parts), yaw);

  // ---- the Legion in the bank --------------------------------------------------------------------------------------
  // A Legion head facing -x from neck height y: face, hair, eyes, brows, nose, mouth and ears.
  const head = (y, hair, extra = []) => [
    B(-0.03, 0.03, y - 0.03, y + 0.01, -0.035, 0.035, SKIN),
    BB(-0.075, 0.07, y, y + 0.165, -0.07, 0.07, SKIN, 0.02),
    B(-0.062, 0.08, y + 0.14, y + 0.19, -0.076, 0.076, hair),
    B(0.035, 0.08, y + 0.04, y + 0.16, -0.076, 0.076, hair),
    B(-0.082, -0.073, y + 0.085, y + 0.11, 0.018, 0.044, EYE), B(-0.082, -0.073, y + 0.085, y + 0.11, -0.044, -0.018, EYE),
    B(-0.083, -0.073, y + 0.118, y + 0.13, 0.014, 0.05, hair), B(-0.083, -0.073, y + 0.118, y + 0.13, -0.05, -0.014, hair),
    B(-0.1, -0.074, y + 0.06, y + 0.09, -0.012, 0.012, SKIN_DK),
    B(-0.079, -0.073, y + 0.028, y + 0.042, -0.026, 0.026, MOUTH),
    B(-0.012, 0.028, y + 0.05, y + 0.1, 0.07, 0.084, SKIN), B(-0.012, 0.028, y + 0.05, y + 0.1, -0.084, -0.07, SKIN),
    ...extra
  ];
  // The coin pistol held level at height y toward -x: a walnut grip, a steel body, a brass drum of coins, the muzzle.
  const pistol = (y) => [
    B(-0.2, -0.155, y - 0.1, y, -0.024, 0.024, "#7a5230"),
    B(-0.3, -0.14, y - 0.005, y + 0.05, -0.03, 0.03, "#3b3f46"),
    disc(0.035, 0.05, -0.2, y + 0.07, 0, C.brass, 0.15, 10),
    rod(-0.3, y + 0.022, 0, -0.33, y + 0.022, 0, 0.028, C.brassLt, 0.2, 8)
  ];
  // A Legion teller on guard: grey trousers, shirt sleeves, a maroon waistcoat with brass buttons and a watch chain,
  // the red tie, a green visor, a moustache, the coin pistol at the hip.
  const guard = () => {
    const PANTS = "#4f535b", TIE = "#c8342a", HAIR = "#3a2a1e", hip = 0.4, parts = [];
    for (const [z, a] of [[0.055, -0.12], [-0.055, 0.1]]) {
      parts.push(hang(0, hip, z, 0.39, 0.09, 0.09, a, PANTS));
      const [ax] = endOf(0, hip, 0.39, a);
      parts.push(B(ax - 0.1, ax + 0.04, 0, 0.05, z - 0.045, z + 0.045, SHOE));
    }
    parts.push(BB(-0.09, 0.09, hip - 0.02, 0.66, -0.105, 0.105, SHIRT, 0.02));
    parts.push(BB(-0.096, 0.094, hip - 0.03, 0.6, -0.108, 0.108, C.maroon, 0.02));
    parts.push(B(-0.1, -0.09, 0.5, 0.6, -0.042, 0.042, SHIRT));
    parts.push(B(-0.106, -0.096, 0.44, 0.645, -0.016, 0.016, TIE), B(-0.108, -0.095, 0.61, 0.645, -0.024, 0.024, TIE));
    for (const y of [0.405, 0.445, 0.485]) parts.push(B(-0.104, -0.095, y, y + 0.018, 0.034, 0.05, C.brassLt));
    parts.push(B(-0.103, -0.097, 0.455, 0.462, -0.09, 0.034, C.gold));
    parts.push(...head(0.69, HAIR, [
      B(-0.077, 0.074, 0.83, 0.86, -0.077, 0.077, "#2a7a46"),
      B(-0.175, -0.07, 0.832, 0.846, -0.088, 0.088, "#3fae5a", 0.35),
      B(-0.086, -0.074, 0.735, 0.748, -0.032, 0.032, HAIR)
    ]));
    // The coin pistol at the hip, its muzzle on the guard's shot start, in a shirt-sleeved arm with a maroon cuff.
    parts.push(...BL.raidModels.holdGun(parts, { type: BL.raidStages.ENEMY.GUARD, yaw: LOOK_YAW, gun: pistol(0.5), muzzle: [-0.33, 0.522, 0], grip: [-0.178, 0.45, 0],
      shoulder: 0.63, upper: 0.16, lower: 0.15, w: 0.066, sleeve: SHIRT, band: C.maroon, skin: SKIN }));
    return BL.raidModels.standTall(facing(parts, LOOK_YAW));
  };
  // A drop guard: grey suit and red tie under a harness of leather straps and brass buckles, a vault-blue cap, knees
  // bent from the drop, one hand on the rope above, the other holding the coin pistol at the hip.
  const dropGuard = () => {
    const SUIT = "#6b6f78", SUIT_DK = "#53575f", PANTS = "#4f535b", TIE = "#c8342a", HAIR = "#2f241c", STRAP = "#3a2a1e", hip = 0.36, parts = [];
    for (const z of [0.06, -0.06]) {
      parts.push(hang(0, hip, z, 0.2, 0.09, 0.09, -0.6, PANTS));
      const [kx, ky] = endOf(0, hip, 0.2, -0.6);
      parts.push(hang(kx, ky, z, 0.2, 0.085, 0.085, 0.42, PANTS));
      const [fx] = endOf(kx, ky, 0.2, 0.42);
      parts.push(B(fx - 0.11, fx + 0.035, 0, 0.05, z - 0.045, z + 0.045, SHOE));
    }
    parts.push(BB(-0.09, 0.09, hip - 0.02, 0.62, -0.105, 0.105, SUIT, 0.02));
    parts.push(B(-0.1, -0.088, 0.47, 0.62, -0.04, 0.04, SHIRT), B(-0.106, -0.095, 0.4, 0.6, -0.016, 0.016, TIE), B(-0.108, -0.094, 0.575, 0.61, -0.024, 0.024, TIE));
    parts.push(B(-0.099, -0.088, 0.47, 0.62, 0.04, 0.07, SUIT_DK), B(-0.099, -0.088, 0.47, 0.62, -0.07, -0.04, SUIT_DK));
    // The harness: a belt, two straps over the shoulders crossing the chest, buckles, the rope ring at the back.
    parts.push(B(-0.098, 0.098, hip + 0.02, hip + 0.06, -0.11, 0.11, STRAP));
    for (const s of [1, -1]) parts.push(moved(turnedX(B(-0.105, -0.093, -0.13, 0.13, -0.017, 0.017, STRAP), s * 0.5), 0, 0.52, 0));
    parts.push(B(-0.11, -0.095, 0.5, 0.54, -0.025, 0.025, C.brass), B(-0.104, -0.094, hip + 0.025, hip + 0.055, -0.03, 0.03, C.brassLt));
    parts.push(B(0.085, 0.105, 0.5, 0.56, -0.02, 0.02, C.brass), B(0.09, 0.1, 0.55, 1.04, -0.008, 0.008, "#c8b48a"));
    parts.push(...head(0.65, HAIR, [
      BB(-0.08, 0.078, 0.8, 0.87, -0.08, 0.08, V.blue, 0.015),
      B(-0.16, -0.06, 0.8, 0.818, -0.075, 0.075, "#22467a"),
      disc(0.018, 0.012, -0.083, 0.838, 0, C.gold, 0.4, 8)
    ]));
    // The far arm up the rope.
    parts.push(rod(0.0, 0.6, -0.12, 0.07, 0.83, -0.06, 0.034, SUIT), rod(0.07, 0.83, -0.06, 0.09, 0.98, -0.01, 0.031, SUIT));
    parts.push(B(0.07, 0.11, 0.97, 1.02, -0.03, 0.02, SKIN));
    // The near arm with the coin pistol at the hip, its muzzle on the drop guard's shot start (the far arm is up the rope).
    parts.push(...BL.raidModels.holdGun(parts, { type: BL.raidStages.ENEMY.DROP_GUARD, yaw: LOOK_YAW, gun: pistol(0.5), muzzle: [-0.33, 0.522, 0], grip: [-0.178, 0.45, 0],
      shoulder: 0.6, upper: 0.15, lower: 0.14, w: 0.066, sleeve: SUIT, skin: SKIN, farArm: false }));
    return BL.raidModels.standTall(facing(parts, LOOK_YAW));
  };
  // A bill-bat: a banknote folded into a bat, its seal for a face with burning eyes and paper fangs, its wings folded
  // notes, fanned up (or down, `flap`). Faces the camera, centred.
  const billBat = (down) => {
    const parts = [
      scaled(turnedZ(B(-0.07, 0.07, -0.07, 0.07, -0.025, 0.025, V.bill), PI / 4), 1, 1.5, 1),
      B(-0.035, 0.035, -0.06, 0.02, 0.026, 0.032, V.billDk), B(-0.005, 0.005, -0.12, 0.08, 0.027, 0.034, V.billLt),
      disc(0.085, 0.03, 0, 0.12, 0.03, V.billDk, 0, 16), disc(0.072, 0.036, 0, 0.12, 0.033, V.billLt, 0.1, 16),
      B(-0.04, -0.012, 0.125, 0.15, 0.05, 0.056, "#ff5a3c", 0.95), B(0.012, 0.04, 0.125, 0.15, 0.05, 0.056, "#ff5a3c", 0.95),
      B(-0.03, -0.016, 0.068, 0.092, 0.05, 0.056, "#ffffff"), B(0.016, 0.03, 0.068, 0.092, 0.05, 0.056, "#ffffff"),
      moved(turnedZ(B(-0.022, 0.022, 0, 0.07, -0.006, 0.006, V.bill), 0.45), -0.05, 0.18, 0.02),
      moved(turnedZ(B(-0.022, 0.022, 0, 0.07, -0.006, 0.006, V.bill), -0.45), 0.05, 0.18, 0.02),
      moved(turnedZ(B(-0.03, 0.03, -0.05, 0, -0.006, 0.006, V.billLt), PI / 4), 0, -0.135, 0.01)
    ];
    const lift = down ? -0.32 : 0.38, LEN = [0.095, 0.09, 0.08], TALL = [0.15, 0.13, 0.1];
    for (const s of [1, -1]) {
      let px = s * 0.055, py = 0.04;
      for (let k = 0; k < 3; k++) {
        const a = lift + k * (down ? -0.12 : 0.1), w = LEN[k], h = TALL[k];
        const panel = merge(B(0, w, -h / 2, h / 2, -0.004, 0.004, k & 1 ? V.billLt : V.bill), B(w * 0.2, w * 0.8, -h * 0.25, h * 0.25, 0.004, 0.007, k & 1 ? V.bill : V.billDk));
        const fold = turnedY(panel, k & 1 ? -0.4 : 0.4);
        parts.push(moved(turnedZ(s > 0 ? fold : mirrored(fold), s * a), px, py, 0.01));
        px += s * w * Math.cos(a); py += w * Math.sin(a) * s * s;
      }
    }
    return merge(...parts);
  };
  // A copper coin keg on its side (its axis along x, so it rolls toward the camera), banded in iron, a coin set in each
  // end and coins at its bung. On its feet: it lies on the floor at y 0.
  const coinBarrel = () => {
    const r = 0.23, l = 0.26, parts = [
      turnedZ(lathe({ profile: [[0, -l], [r - 0.035, -l], [r - 0.012, -l * 0.55], [r, 0], [r - 0.012, l * 0.55], [r - 0.035, l], [0, l]], segments: 14, color: (t) => t < 0.17 || t > 0.83 ? C.copperDk : C.copper }), -PI / 2)
    ];
    for (const x of [-0.19, -0.08, 0.08, 0.19]) {
      const rr = r - (Math.abs(x) > 0.15 ? 0.018 : 0.003) + 0.01;
      parts.push(turnedZ(lathe({ profile: [[rr - 0.02, x - 0.016], [rr, x - 0.016], [rr, x + 0.016], [rr - 0.02, x + 0.016]], segments: 14, color: "#3b3f46" }), -PI / 2));
    }
    for (const s of [1, -1]) parts.push(moved(turnedY(disc(0.11, 0.02, 0, 0, 0, C.coin, 0.4, 14), s * PI / 2), s * (l + 0.002), 0, 0));
    parts.push(disc(0.03, 0.03, 0, r - 0.01, 0, "#2a1c12", 0, 8));
    for (const [x, z] of [[0.02, 0.03], [-0.03, -0.02], [0.05, -0.04]]) parts.push(moved(lathe({ profile: [[0, 0], [0.03, 0], [0.03, 0.01], [0, 0.01]], segments: 8, color: C.coin, emissive: 0.4 }), x, r + 0.005, z));
    return moved(turnedY(merge(...parts), 0.25), 0, r, 0);
  };

  // ---- the back-wall targets ---------------------------------------------------------------------------------------
  // A ledger core: a green glass drum of ticking paper tape between brass caps, on an iron bracket into the rock, its
  // tape running out of a slot at its foot and a little brass hammer on top.
  const ledgerCore = () => {
    const parts = [
      B(-0.31, 0.31, -0.06, 0.06, -0.26, -0.17, C.iron),
      lathe({ profile: [[0, -0.2], [0.2, -0.2], [0.212, -0.1], [0.212, 0.1], [0.2, 0.2], [0, 0.2]], segments: 16, color: C.glass, emissive: 0.6 }),
      lathe({ profile: [[0, -0.28], [0.25, -0.28], [0.25, -0.2], [0, -0.2]], segments: 16, color: C.brass }),
      lathe({ profile: [[0, 0.2], [0.25, 0.2], [0.25, 0.27], [0, 0.27]], segments: 16, color: C.brass }),
      B(-0.04, 0.04, -0.335, -0.27, 0.205, 0.218, C.paper), B(-0.03, 0.03, -0.305, -0.3, 0.218, 0.221, C.maroon), B(-0.03, 0.03, -0.322, -0.317, 0.218, 0.221, C.maroon),
      B(-0.015, 0.015, 0.27, 0.32, -0.015, 0.015, C.brass), B(-0.09, 0.015, 0.305, 0.334, -0.022, 0.022, C.brassDk)
    ];
    for (const y of [-0.12, 0, 0.12]) parts.push(lathe({ profile: [[0.211, y - 0.014], [0.217, y - 0.008], [0.217, y + 0.008], [0.211, y + 0.014]], segments: 16, color: "#1f7a46", emissive: 0.3 }));
    for (const x of [-0.16, 0.16]) for (const y of [-0.24, 0.235]) parts.push(disc(0.018, 0.02, x, y, 0.2, C.brassLt, 0.1, 8));
    return merge(...parts);
  };
  // A wall teller: a brass hatch in a brass frame. Shut, a frosted window and a cash slot; open, the flap swung up
  // flat, the booth lit behind, a coin muzzle out of it and a pair of eyes in there.
  const wallTeller = (open) => {
    const F = 0.32, T = 0.065, parts = [
      B(-F, F, F - T, F, -0.06, 0.06, C.brass), B(-F, F, -F, -F + T, -0.06, 0.06, C.brass),
      B(-F, -F + T, -F + T, F - T, -0.06, 0.06, C.brass), B(F - T, F, -F + T, F - T, -0.06, 0.06, C.brass),
      B(-F + T, F - T, -F + T, F - T, -0.15, -0.13, open ? "#ffcf7a" : "#2a2420", open ? 0.55 : 0)
    ];
    for (const x of [-1, 1]) for (const y of [-1, 1]) parts.push(disc(0.018, 0.02, x * (F - T / 2), y * (F - T / 2), 0.065, C.brassLt, 0.1, 8));
    if (open) {
      parts.push(B(-F + T, F - T, F - T, F - T + 0.035, 0, 0.3, C.brass), B(-0.15, 0.15, F - T - 0.004, F - T, 0.06, 0.25, "#d8e8ec", 0.3));
      parts.push(B(-0.06, -0.025, 0.08, 0.11, -0.13, -0.12, "#fff6c8", 0.9), B(0.025, 0.06, 0.08, 0.11, -0.13, -0.12, "#fff6c8", 0.9));
      parts.push(rod(0, -0.06, -0.12, 0, -0.07, 0.14, 0.06, C.ironLt, 0, 10), rod(0, -0.07, 0.14, 0, -0.072, 0.18, 0.074, C.brassLt, 0.15, 10), disc(0.045, 0.01, 0, -0.072, 0.184, "#0d0e10", 0, 10));
    } else {
      parts.push(BB(-F + T, F - T, -F + T, F - T, -0.05, 0.03, C.brassDk, 0.012));
      parts.push(B(-0.15, 0.15, -0.02, 0.19, 0.03, 0.04, "#d8e8ec", 0.25));
      for (const x of [-0.05, 0.05]) parts.push(B(x - 0.007, x + 0.007, -0.02, 0.19, 0.04, 0.05, C.brassDk));
      parts.push(B(-0.12, 0.12, -0.15, -0.11, 0.03, 0.045, "#141210"));
      for (const x of [-0.18, 0.18]) parts.push(rod(x - 0.04, F - T - 0.01, 0.035, x + 0.04, F - T - 0.01, 0.035, 0.018, C.brassLt, 0, 8));
    }
    return merge(...parts);
  };
  // A shutter core: a smaller green core in a riveted steel housing with a roller box over it. Open, the shutter is
  // rolled up and a lamp burns green; shut, a slatted steel shutter covers it to the sill.
  const shutterCore = (open) => {
    const parts = [
      B(-0.33, -0.26, -0.33, 0.2, -0.1, 0.08, V.steelDk), B(0.26, 0.33, -0.33, 0.2, -0.1, 0.08, V.steelDk),
      B(-0.33, 0.33, -0.33, -0.27, -0.1, 0.1, V.steel), BB(-0.33, 0.33, 0.18, 0.33, -0.12, 0.12, V.steel, 0.02),
      B(-0.26, 0.26, -0.27, 0.18, -0.13, -0.11, "#1a1d22"),
      lathe({ profile: [[0, -0.2], [0.15, -0.2], [0.16, -0.1], [0.16, 0.05], [0.15, 0.11], [0, 0.11]], segments: 14, color: open ? C.glass : "#2a5a3c", emissive: open ? 0.6 : 0.1 }),
      lathe({ profile: [[0, -0.27], [0.19, -0.27], [0.19, -0.2], [0, -0.2]], segments: 14, color: C.brass }),
      lathe({ profile: [[0, 0.11], [0.19, 0.11], [0.19, 0.17], [0, 0.17]], segments: 14, color: C.brass }),
      disc(0.03, 0.02, 0.22, 0.255, 0.125, open ? "#7cff6a" : "#3a2420", open ? 0.95 : 0, 10)
    ];
    for (const x of [-0.28, -0.1, 0.1]) parts.push(disc(0.014, 0.016, x, 0.3, 0.123, V.rivet, 0, 8));
    if (open) parts.push(B(-0.26, 0.26, 0.17, 0.2, 0.06, 0.1, V.steelLt));
    else {
      for (let y = 0.16; y > -0.27; y -= 0.055) parts.push(B(-0.26, 0.26, y - 0.05, y, 0.06, 0.09, (Math.round(y * 100) & 1) ? V.steel : V.steel2), B(-0.26, 0.26, y - 0.052, y - 0.046, 0.09, 0.094, V.steelDk));
      parts.push(B(-0.26, 0.26, -0.29, -0.25, 0.05, 0.1, V.steelDk), B(-0.06, 0.06, -0.285, -0.255, 0.1, 0.12, V.gold));
    }
    return merge(...parts);
  };
  // A twin core: a green drum lying in a brass cradle on a stub of the yoke that pairs it. Open, it glows with ticking
  // tape; shut, two brass shells close over it.
  const twinCore = (open) => {
    const parts = [
      B(-0.03, 0.03, 0.2, 0.34, -0.03, 0.03, C.brass), B(-0.3, 0.3, 0.19, 0.24, -0.05, 0.05, C.brass),
      B(-0.3, -0.25, -0.2, 0.24, -0.05, 0.05, C.brass), B(0.25, 0.3, -0.2, 0.24, -0.05, 0.05, C.brass),
      disc(0.05, 0.12, -0.275, 0, 0, C.brassLt, 0, 10), disc(0.05, 0.12, 0.275, 0, 0, C.brassLt, 0, 10)
    ];
    const drum = turnedZ(lathe({ profile: [[0, -0.22], [0.16, -0.22], [0.17, -0.16], [0.17, 0.16], [0.16, 0.22], [0, 0.22]], segments: 16, color: open ? C.glass : "#24452f", emissive: open ? 0.65 : 0.05 }), PI / 2);
    parts.push(drum);
    if (open) {
      for (const x of [-0.12, 0, 0.12]) parts.push(turnedZ(lathe({ profile: [[0.169, x - 0.012], [0.176, x - 0.006], [0.176, x + 0.006], [0.169, x + 0.012]], segments: 16, color: "#1f7a46", emissive: 0.3 }), PI / 2));
    } else {
      parts.push(turnedZ(lathe({ profile: [[0, -0.235], [0.19, -0.235], [0.2, -0.17], [0.2, 0.17], [0.19, 0.235], [0, 0.235]], segments: 16, color: C.brassDk }), PI / 2));
      parts.push(B(-0.235, 0.235, -0.006, 0.006, 0.19, 0.205, "#5a4318"), disc(0.03, 0.02, 0, 0, 0.205, C.brassLt, 0.1, 10));
    }
    return merge(...parts);
  };
  // A searchlight: a brass lamp on a swivel arm from a wall plate, its lens turned down toward the front line. `dark`
  // is it cooling, its lens unlit.
  const searchlight = (lit) => {
    const dir = [0, -0.55, 0.835], c = [0, -0.04, 0.04], len = 0.24;
    const a = [c[0] - dir[0] * len / 2, c[1] - dir[1] * len / 2, c[2] - dir[2] * len / 2], e = [c[0] + dir[0] * len / 2, c[1] + dir[1] * len / 2, c[2] + dir[2] * len / 2];
    const parts = [
      BB(-0.13, 0.13, 0.17, 0.33, -0.22, -0.16, C.brassDk, 0.015),
      rod(0, 0.25, -0.17, 0, 0.12, -0.05, 0.03, C.brass), B(-0.17, 0.17, 0.09, 0.13, -0.08, 0.0, C.brass),
      B(-0.17, -0.14, -0.06, 0.12, -0.06, 0.02, C.brass), B(0.14, 0.17, -0.06, 0.12, -0.06, 0.02, C.brass),
      rod(a[0], a[1], a[2], e[0], e[1], e[2], 0.13, C.brass, 0, 14),
      rod(e[0], e[1], e[2], e[0] + dir[0] * 0.02, e[1] + dir[1] * 0.02, e[2] + dir[2] * 0.02, 0.145, C.brassLt, 0.1, 14),
      rod(e[0] + dir[0] * 0.02, e[1] + dir[1] * 0.02, e[2] + dir[2] * 0.02, e[0] + dir[0] * 0.025, e[1] + dir[1] * 0.025, e[2] + dir[2] * 0.025, 0.115, lit ? V.cream : "#4a4a44", lit ? 1 : 0, 14)
    ];
    for (const t of [0.25, 0.45, 0.65]) parts.push(rod(a[0] + dir[0] * len * t, a[1] + dir[1] * len * t, a[2] + dir[2] * len * t, a[0] + dir[0] * (len * t + 0.015), a[1] + dir[1] * (len * t + 0.015), a[2] + dir[2] * (len * t + 0.015), 0.142, C.brassDk, 0, 14));
    for (const x of [-0.09, 0.09]) parts.push(disc(0.016, 0.02, x, 0.25, -0.15, C.brassLt, 0.1, 8));
    return merge(...parts);
  };
  // The searchlight's beam, apex at the origin running a metre down -y (the scene turns it toward the pool and scales
  // its length), and its pool on the floor at the front line, LIGHT_HALF either side, cream or locked red. See-through.
  const LIGHT_HALF = 0.6;
  const cone = () => {
    const g = M.geometry(), ink = hexToRgb(V.cream), lit = { emissive: 1 };
    const p = [[-0.07, 0], [0.07, 0], [LIGHT_HALF * 0.9, -1], [-LIGHT_HALF * 0.9, -1]].map(([x, y]) => M.pushVert(g, x, y, 0));
    M.face(g, [p[3], p[2], p[1], p[0]], ink, lit);
    orient(g, TOWARD);
    return Object.assign(flat(g), { glass: 0.2 });
  };
  const pool = (color) => {
    const g = M.geometry(), ink = hexToRgb(color), n = 18, ring = [];
    for (let k = 0; k < n; k++) { const a = k / n * 2 * PI; ring.push(M.pushVert(g, Math.cos(a) * LIGHT_HALF, Math.sin(a) * 0.1, 0)); }
    M.face(g, ring, ink, { emissive: 1 });
    orient(g, TOWARD);
    return Object.assign(flat(g), { glass: 0.55 });
  };
  // A press die: an iron die on two guide columns over an anvil bed, a fiat seal on its face and the screw that drives
  // it. Raised (open) it stands high over a hot gold coin blank; pressed (shut) it sits on the anvil, the blank hidden.
  // Drawn at the press's scale and then fitted into its emplacement's bullet box (DIE_FIT about DIE_MID, ±0.33 m each
  // way inside ±0.344); the press's own screw comes down the wall to the box's top.
  const DIE_FIT = [0.27, 0.31, 0.3], DIE_MID = -0.09;
  const pressDie = (raised) => {
    const IRON = "#24262b", IRON_LT = "#3c4048", parts = [
      B(-1.22, 1.22, -1.15, -0.87, -0.3, 0.25, IRON),
      B(-1.22, 1.22, -0.9, -0.87, 0.25, 0.27, C.gold, 0.2),
      B(-1.0, 1.0, -0.87, -0.8, -0.24, 0.22, IRON_LT)
    ];
    for (const x of [-1.12, 1.12]) {
      parts.push(rod(x, -0.8, 0, x, 0.95, 0, 0.075, IRON_LT, 0, 10));
      for (const y of [-0.75, 0.88]) parts.push(rod(x, y, 0, x, y + 0.06, 0, 0.1, C.brass, 0, 10));
    }
    const y0 = raised ? 0.28 : -0.8, y1 = y0 + 0.62;
    parts.push(BB(-0.92, 0.92, y0, y1, -0.24, 0.2, "#2e3036", 0.04), B(-0.92, 0.92, y0, y0 + 0.06, -0.24, 0.205, IRON));
    for (const x of [-1.07, 1.07]) parts.push(B(x - 0.06, x + 0.06, y0 + 0.1, y1 - 0.1, -0.08, 0.08, C.brassDk));
    parts.push(...seal(0.22, 0, (y0 + y1) / 2 + 0.03, 0.22, C.gold, "#5a4318"));
    for (let k = 0; k < 6; k++) parts.push(disc(0.022, 0.02, -0.8 + k * 0.32, y1 - 0.06, 0.205, "#5a5f68", 0, 8));
    // The screw from the die's top to the box's top, where the press's own screw takes over.
    for (let y = y1; y < 0.955; y += 0.07) parts.push(rod(0, y, 0, 0, Math.min(0.965, y + 0.07), 0, ((y - y1) / 0.07 | 0) & 1 ? 0.1 : 0.115, ((y - y1) / 0.07 | 0) & 1 ? IRON : IRON_LT, 0, 12));
    if (raised) {
      parts.push(lathe({ profile: [[0, -0.8], [0.4, -0.8], [0.4, -0.74], [0, -0.74]], segments: 20, color: C.coin, emissive: 0.7 }));
      parts.push(disc(0.28, 0.02, 0, -0.77, 0.4, "#ffd36a", 0.8, 18));
    } else {
      for (const x of [-0.98, 0.98]) parts.push(ball(0.07, x, -0.72, 0.15, "#d8f0e0", 0.2, 8));
    }
    return scaled(moved(merge(...parts), 0, -DIE_MID, 0), ...DIE_FIT);
  };
  // The mint counter: an iron drum housing with a brass-framed window on its rolling digits (the `digits` drum, spun
  // by the scene) and a crank at its side. Open, the window glows green behind the digits; shut, an iron visor covers
  // it under a red lamp.
  const DIGITS_AT = [0, 0.03, 0.02], DIGIT_R = 0.13, WHEELS = 3, WHEEL_W = 0.15;
  const mintCounter = (open) => {
    const IRON = "#26282d", parts = [
      BB(-0.5, 0.5, -0.46, 0.4, -0.26, 0.14, IRON, 0.05),
      B(-0.4, 0.4, -0.19, 0.25, 0.13, 0.16, C.brass), B(-0.34, 0.34, -0.13, 0.19, 0.13, 0.17, open ? "#1f6b3a" : "#121316", open ? 0.55 : 0),
      B(-0.42, 0.42, -0.36, -0.3, 0.12, 0.16, C.brassDk), B(-0.42, 0.42, 0.31, 0.37, 0.12, 0.16, C.brassDk),
      rod(0.5, 0.03, 0, 0.53, 0.03, 0, 0.05, C.brass, 0, 10), B(0.505, 0.53, 0.03, 0.25, -0.02, 0.02, C.brass),
      ball(0.05, 0, 0.45, -0.05, C.brassLt, 0.2, 10), B(-0.1, 0.1, 0.39, 0.42, -0.12, 0.02, C.brass)
    ];
    for (const x of [-0.32, 0.32]) for (const y of [-0.41, 0.34]) parts.push(disc(0.02, 0.02, x, y, 0.15, "#5a5f68", 0, 8));
    for (let k = 1; k < WHEELS; k++) parts.push(B(-0.24 + k * WHEEL_W - 0.012, -0.24 + k * WHEEL_W + 0.012, -0.13, 0.19, 0.17, 0.2, C.brass));
    parts.push(glyphs("FIAT", 0.03, 0, -0.25, 0.165, C.gold, 0.4));
    if (!open) {
      for (let y = 0.17; y > -0.14; y -= 0.06) parts.push(B(-0.36, 0.36, y - 0.055, y, 0.2, 0.23, "#3a3d44"));
      parts.push(disc(0.035, 0.02, 0.38, 0.33, 0.165, "#ff3a30", 0.9, 10));
    }
    return merge(...parts);
  };
  // The rolling digits: WHEELS wheels on an axis along x, ten faces round each, a digit on each face. About DIGITS_AT
  // in the counter's frame; turn it about x.
  const digits = () => {
    const parts = [], cell = 0.016, n = 10;
    for (let w = 0; w < WHEELS; w++) {
      const x0 = -WHEELS * WHEEL_W / 2 + w * WHEEL_W + 0.01, x1 = x0 + WHEEL_W - 0.02, g = M.geometry(), rgb = hexToRgb("#f4efe0"), ink = hexToRgb("#141414");
      const at = (x, a, r) => M.pushVert(g, x, Math.sin(a) * r, Math.cos(a) * r);
      for (let k = 0; k < n; k++) {
        const a0 = (k - 0.5) / n * 2 * PI, a1 = (k + 0.5) / n * 2 * PI;
        M.face(g, [at(x0, a0, DIGIT_R), at(x1, a0, DIGIT_R), at(x1, a1, DIGIT_R), at(x0, a1, DIGIT_R)], k & 1 ? rgb : rgb.map((c) => c * 0.93));
        // The digit on the face whose middle is at angle k / n turns: rows run against the turn, so it reads upright
        // when that face looks at the camera.
        const rows = SIGN_GLYPHS[String((k + w * 3) % 10)], ac = k / n * 2 * PI, ny = Math.sin(ac), nz = Math.cos(ac), ty = Math.cos(ac), tz = -Math.sin(ac);
        const xc = (x0 + x1) / 2, r = DIGIT_R + 0.002;
        for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
          if (rows[row][col] !== "1") continue;
          const u0 = xc + (col - 1.5) * cell, u1 = u0 + cell, v1 = (2.5 - row) * cell, v0 = v1 - cell;
          const P = (u, v) => M.pushVert(g, u, ny * r + ty * v, nz * r + tz * v);
          M.face(g, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], ink);
        }
      }
      orientOut(g);
      parts.push(g);
    }
    parts.push(rod(-WHEELS * WHEEL_W / 2, 0, 0, WHEELS * WHEEL_W / 2, 0, 0, DIGIT_R * 0.4, "#3a3d44", 0, 10));
    return merge(...parts);
  };
  // Faces of a drum about the x axis turned outward from it.
  function orientOut(g) {
    for (const f of g.faces) {
      let cy = 0, cz = 0;
      for (const i of f.i) { cy += g.verts[i * 3 + 1]; cz += g.verts[i * 3 + 2]; }
      const n = newell(g.verts, f.i);
      if (n[1] * cy + n[2] * cz < 0) f.i.reverse();
    }
    return g;
  }
  // A print head: a rotary drum of bill-green plates in a black enamel housing with gold-leaf trim, paper fed in at the
  // top and a folded banknote out of the slot at its foot.
  const printHead = () => {
    const parts = [
      B(-0.32, -0.25, -0.26, 0.24, -0.14, 0.12, V.ink), B(0.25, 0.32, -0.26, 0.24, -0.14, 0.12, V.ink),
      BB(-0.32, 0.32, 0.17, 0.32, -0.16, 0.13, V.ink2, 0.025), B(-0.32, 0.32, 0.2, 0.225, 0.12, 0.135, V.gold, 0.25),
      B(-0.32, 0.32, -0.3, -0.22, -0.14, 0.12, V.ink2), B(-0.2, 0.2, -0.26, -0.24, 0.12, 0.13, "#0b0b0d"),
      B(-0.25, 0.25, -0.22, 0.17, -0.16, -0.14, "#101114"),
      B(-0.18, 0.18, 0.3, 0.335, -0.1, 0.02, C.paper)
    ];
    const drum = turnedZ(lathe({ profile: [[0, -0.24], [0.15, -0.24], [0.16, -0.2], [0.16, 0.2], [0.15, 0.24], [0, 0.24]], segments: 12, color: (t) => t < 0.2 || t > 0.8 ? V.gold : V.bill, emissive: 0.2 }), PI / 2);
    parts.push(drum);
    for (const x of [-0.12, 0, 0.12]) parts.push(turnedZ(lathe({ profile: [[0.159, x - 0.01], [0.166, x - 0.005], [0.166, x + 0.005], [0.159, x + 0.01]], segments: 12, color: V.billDk }), PI / 2));
    for (const x of [-0.285, 0.285]) for (const y of [-0.2, 0.12]) parts.push(disc(0.016, 0.02, x, y, 0.125, V.gold, 0.2, 8));
    parts.push(moved(turnedZ(merge(B(-0.13, 0.13, -0.05, 0.05, -0.005, 0.005, V.bill), B(-0.05, 0.05, -0.03, 0.03, 0.005, 0.009, V.billLt)), 0.12), 0.0, -0.27, 0.16));
    return merge(...parts);
  };
  // The Printer King: a squat ink well in black enamel banded in gold leaf, glowing ink at its neck, and its eye risen
  // out of the ink. Shut, a domed gold lid closes over the eye.
  const printerKing = (open) => {
    const parts = [
      lathe({ profile: [[0, -0.5], [0.42, -0.5], [0.44, -0.42], [0.43, -0.12], [0.36, 0.0], [0.28, 0.06], [0.28, 0.12], [0.33, 0.14], [0.33, 0.19], [0, 0.19]], segments: 18, color: (t) => t > 0.62 ? V.gold : V.ink }),
      lathe({ profile: [[0.443, -0.4], [0.448, -0.37], [0.448, -0.33], [0.443, -0.3]], segments: 18, color: V.gold, emissive: 0.2 }),
      lathe({ profile: [[0.436, -0.2], [0.44, -0.18], [0.44, -0.15], [0.436, -0.13]], segments: 18, color: V.gold, emissive: 0.2 }),
      disc(0.27, 0.01, 0, 0.19, 0, "#1a3a26", 0.6, 16)
    ];
    for (let k = 0; k < 6; k++) parts.push(moved(turnedY(B(-0.012, 0.012, -0.36, -0.16, 0.42, 0.445, V.gold, 0.15), k * PI / 3 + PI / 6), 0, 0, 0));
    if (open) {
      parts.push(ball(0.21, 0, 0.3, 0.02, "#f4f0e2", 0.25, 14), disc(0.11, 0.03, 0, 0.3, 0.215, V.bill, 0.7, 14), disc(0.05, 0.035, 0, 0.3, 0.228, "#0b0b0d", 0, 12), B(0.025, 0.05, 0.33, 0.355, 0.24, 0.247, "#ffffff", 1));
      parts.push(B(-0.24, 0.24, 0.46, 0.5, -0.04, 0.12, V.gold), B(-0.24, 0.24, 0.17, 0.2, 0.0, 0.16, V.gold));
    } else {
      parts.push(lathe({ profile: [[0, 0.17], [0.25, 0.17], [0.25, 0.22], [0.22, 0.34], [0.14, 0.43], [0, 0.46]], segments: 18, color: V.gold, emissive: 0.15 }));
      parts.push(B(-0.2, 0.2, 0.295, 0.31, 0.2, 0.215, V.goldDk));
    }
    return merge(...parts);
  };

  // ---- shared room pieces (room metres) ----------------------------------------------------------------------------
  // A green-shaded desk lamp on a bracket from the left wall at depth d, its shade glowing over a warm bulb.
  const sconce = (d, y) => [
    R(0, 0.03, y - 0.12, y + 0.07, d - 0.06, d + 0.06, C.brassDk), R(0, 0.2, y - 0.03, y + 0.005, d - 0.02, d + 0.02, C.brass),
    moved(lathe({ profile: [[0.16, -0.03], [0.15, -0.02], [0.07, 0.09], [0.06, 0.1]], segments: 10, color: C.lamp, emissive: 0.6 }), 0.22, y, -d),
    ball(0.045, 0.22, y - 0.02, -d, C.bulb, 1, 8)
  ];
  // A caged bulkhead lamp on the left wall at depth d: a cream glass globe in a steel cage.
  const bulkhead = (d, y) => {
    const parts = [R(0, 0.05, y - 0.16, y + 0.16, d - 0.14, d + 0.14, V.cage), ball(0.1, 0.13, y, -d, V.cream, 1, 10)];
    for (const k of [-1, 0, 1]) parts.push(R(0.05, 0.25, y + k * 0.07 - 0.008, y + k * 0.07 + 0.008, d - 0.12, d + 0.12, V.cage));
    parts.push(R(0.21, 0.24, y - 0.12, y + 0.12, d - 0.015, d + 0.015, V.cage));
    return parts;
  };
  // A brass post for a tripwire at x, its red emitter at height h facing in.
  const wirePost = (x, h, inward) => [
    rod(x, 0, -0.04, x, h + 0.12, -0.04, 0.035, C.brass, 0, 8), ball(0.045, x, h + 0.14, -0.04, C.brassLt, 0.2, 8),
    R(x - 0.05, x + 0.05, 0, 0.025, 0.0, 0.08, C.brassDk),
    R(inward > 0 ? x + 0.02 : x - 0.06, inward > 0 ? x + 0.06 : x - 0.02, h - 0.03, h + 0.03, 0.01, 0.07, "#ff3a30", 0.9)
  ];
  const wireLook = (x0, x1, h) => flat(merge(B(x0, x1, h - 0.028, h + 0.028, -0.012, 0, "#8a1410", 0.6), B(x0, x1, h - 0.01, h + 0.01, 0, 0.012, "#ff4a3a", 1)));
  // A dark mount behind a target, its box and a rim wider, in the overlay layer (where nothing is checked).
  const mount = (x, y, name, color, rim) => {
    const b = boxOf(name), x0 = x + b[0] - 0.05, x1 = x + b[1] + 0.05, y0 = Math.max(0.05, y + b[2] - 0.05), y1 = y + b[3] + 0.05;
    return [backQ(x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, DEPTH - 0.002, rim), backQ(x0, x1, y0, y1, DEPTH - 0.012, color)];
  };

  // ---- The Counting House --------------------------------------------------------------------------------------------
  const COUNTING = ["THE LOBBY", "THE LEDGER HALL", "THE TRIPWIRE GALLERY", "THE COIN CHUTE", "THE COUNTING FLOOR", "THE MINT PRESS"];
  const STONE_TOP = 2.4;
  const countingWalls = (L, room, i) => {
    const boss = !!room.boss;
    L.base.push(floorQ(0, ROOM_W, 0, DEPTH, 0, C.mortar), sideQ(0, 0, DEPTH, 0, ROOM_H, C.mortar), sideQ(ROOM_W, 0, DEPTH, 0, ROOM_H, C.mortar), backQ(0, ROOM_W, 0, ROOM_H, DEPTH, C.mortar));
    for (let a = 0; a < ROOM_W; a++) for (let b = 0; b < DEPTH; b++) {
      const color = boss ? ((a + b) & 1 ? C.ironLt : C.ironMd) : ((a + b) & 1 ? C.tile : C.marble[(a * 3 + b) % 4]);
      L.inlay.push(floorQ(a + 0.03, a + 0.97, b + 0.03, b + 0.97, 0, color));
    }
    for (let c = 0; c < 4; c++) {
      const y0 = c * 0.6 + 0.025, y1 = (c + 1) * 0.6 - 0.025, off = (c & 1) * 0.5;
      for (let x = -off; x < ROOM_W; x += 1) {
        const x0 = Math.max(0, x) + 0.025, x1 = Math.min(ROOM_W, x + 1) - 0.025;
        if (x1 - x0 > 0.1) L.inlay.push(backQ(x0, x1, y0, y1, DEPTH, C.marble[(c + Math.round(x * 2) + 8) & 3]));
      }
      for (let d = -off; d < DEPTH; d += 1) {
        const d0 = Math.max(0, d) + 0.025, d1 = Math.min(DEPTH, d + 1) - 0.025;
        if (d1 - d0 <= 0.1) continue;
        const q = sideQ(0, d0, d1, y0, y1, C.marble[(c + Math.round(d * 2) + 9) & 3]);
        L.inlay.push(q, mirrorRoom(sideQ(0, d0, d1, y0, y1, C.marble[(c + Math.round(d * 2) + 10) & 3])));
      }
    }
    L.inlay.push(sheet({ u0: 0, u1: ROOM_W, v0: STONE_TOP + 0.1, v1: ROOM_H, step: 0.5, map: (u, v, b) => [u, v, -DEPTH + b], want: TOWARD, palette: C.cliff, seed: 11 + i }));
    for (const side of [0, 1]) {
      const s = sheet({ u0: 0, u1: DEPTH, v0: STONE_TOP + 0.1, v1: ROOM_H, step: 0.5, map: (u, v, b) => [b, v, -u], want: RIGHTWARD, palette: C.cliff, seed: 31 + i * 2 + side });
      L.inlay.push(side ? mirrorRoom(s) : s);
    }
    // The cornice where stone gives way to rock, the skirting, the brass rail along the front line.
    for (const [s, e] of freeSpans(room, STONE_TOP - 0.02, STONE_TOP + 0.1)) L.decor.push(R(s, e, STONE_TOP - 0.02, STONE_TOP + 0.1, DEPTH - 0.08, DEPTH, C.marbleDk));
    for (const [s, e] of freeSpans(room, 0, 0.14)) L.decor.push(R(s, e, 0, 0.14, DEPTH - 0.04, DEPTH, C.maroonDk));
    both(L.decor, [R(0, 0.08, STONE_TOP - 0.02, STONE_TOP + 0.1, 0, sideEnd(room, STONE_TOP - 0.02, STONE_TOP + 0.1), C.marbleDk), R(0, 0.04, 0, 0.14, 0, sideEnd(room, 0, 0.14), C.maroonDk)]);
    L.decor.push(R(0, ROOM_W, -0.03, 0.025, -0.02, 0.07, C.brass));
  };
  // Parts on the left side and their mirror on the right.
  const both = (list, parts) => { for (const p of parts) list.push(p, mirrorRoom(p)); };
  // A brass stanchion at (x, d) and the velvet rope slung from it to the next.
  const stanchion = (x, d) => [
    rod(x, 0.02, -d, x, 0.86, -d, 0.028, C.brass, 0, 8), moved(lathe({ profile: [[0, 0], [0.1, 0], [0.1, 0.025], [0.04, 0.04], [0, 0.04]], segments: 10, color: C.brassDk }), x, 0, -d),
    ball(0.045, x, 0.89, -d, C.brassLt, 0.15, 8)
  ];
  const rope = (x, d0, d1, y, sag, color) => {
    const parts = [], n = 4;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, s0 = 4 * sag * t0 * (1 - t0), s1 = 4 * sag * t1 * (1 - t1);
      parts.push(beam(x, y - s0, -(d0 + (d1 - d0) * t0), x, y - s1, -(d0 + (d1 - d0) * t1), 0.045, color));
    }
    return parts;
  };
  const lobby = (L, room) => {
    const left = [
      R(0, 0.55, 0, 0.9, 0.7, 4.3, C.marble[1]), R(0, 0.68, 0.9, 0.98, 0.62, 4.38, C.marble[2]),
      R(0.55, 0.57, 0, 0.08, 0.7, 4.3, C.brass), R(0.55, 0.57, 0.82, 0.86, 0.7, 4.3, C.brass),
      R(0.04, 0.08, 1.48, 1.53, 0.78, 4.27, C.brass),
      R(0.25, 0.27, 0.98, 1.25, 2.18, 2.22, C.brass), moved(lathe({ profile: [[0.12, -0.02], [0.11, -0.01], [0.05, 0.08], [0.04, 0.09]], segments: 10, color: C.lamp, emissive: 0.6 }), 0.26, 1.25, -2.2),
      R(0.2, 0.45, 0.98, 1.03, 3.0, 3.35, C.ledger[0]), R(0.21, 0.44, 1.03, 1.035, 3.01, 3.34, C.paper)
    ];
    for (const a of [0.9, 2.0, 3.1]) left.push(sideQ(0.552, a, a + 1.0, 0.2, 0.72, C.maroon), sideQ(0.556, a + 0.06, a + 0.94, 0.26, 0.66, C.maroonDk));
    for (const d of [0.8, 1.66, 2.52, 3.38, 4.24]) left.push(R(0.04, 0.08, 0.98, 1.5, d - 0.02, d + 0.02, C.brass));
    for (let d = 0.95; d < 4.2; d += 0.2) left.push(R(0.055, 0.065, 0.98, 1.48, d - 0.006, d + 0.006, C.brassDk));
    const posts = [1.0, 2.0, 3.0, 4.0];
    for (const d of posts) left.push(...stanchion(0.95, d));
    for (let k = 0; k < posts.length - 1; k++) left.push(...rope(0.95, posts[k], posts[k + 1], 0.8, 0.13, C.velvet));
    both(L.decor, left);
    // Marble pilasters framing the back wall's openings, and the bank's clock over the cornice.
    for (const [x0, x1] of [[0.25, 0.7], [3.15, 3.52], [4.48, 4.85], [7.3, 7.75]]) if (isFree(room, x0, x1, 0, STONE_TOP)) {
      L.decor.push(R(x0, x1, 0, STONE_TOP - 0.02, DEPTH - 0.14, DEPTH, C.marble[2]), R(x0 - 0.04, x1 + 0.04, STONE_TOP - 0.2, STONE_TOP - 0.02, DEPTH - 0.17, DEPTH, C.marbleDk), R(x0 - 0.04, x1 + 0.04, 0, 0.16, DEPTH - 0.17, DEPTH, C.marbleDk));
    }
    const cy = 3.02, cz = -DEPTH + 0.06;
    L.decor.push(disc(0.4, 0.06, MID, cy, cz, C.brass, 0, 24), disc(0.33, 0.07, MID, cy, cz + 0.005, "#f4ecd8", 0, 24));
    for (let k = 0; k < 12; k++) L.decor.push(moved(turnedZ(B(-0.012, 0.012, 0.26, 0.31, 0.035, 0.045, C.iron), k * PI / 6), MID, cy, cz));
    L.decor.push(moved(turnedZ(B(-0.015, 0.015, 0, 0.24, 0.045, 0.055, C.iron), -0.5), MID, cy, cz), moved(turnedZ(B(-0.018, 0.018, 0, 0.16, 0.05, 0.06, C.iron), 1.9), MID, cy, cz), disc(0.03, 0.08, MID, cy, cz + 0.01, C.brassLt, 0.2, 10));
    // A maroon carpet from wall to wall, gold-bordered.
    L.over.push(floorQ(1.5, 6.5, 0.6, 4.4, 0, C.gold), floorQ(1.58, 6.42, 0.68, 4.32, 0, C.maroon));
  };
  // A wall of ledger shelves on the left wall, its spines by `rand`, darker up into the dark.
  const ledgerShelves = (rand) => {
    const parts = [], D0 = 0.4, D1 = 4.6, X1 = 0.5, UPRIGHTS = [D0, 1.45, 2.5, 3.55, D1], LEVELS = [0.12, 0.66, 1.2, 1.74, 2.28, 2.82, 3.36, 3.9, 4.44];
    parts.push(sideQ(0.01, D0, D1, 0, ROOM_H, "#24170e"));
    for (const d of UPRIGHTS) parts.push(R(0, X1, 0, ROOM_H, d - 0.05, d + 0.05, C.wood));
    LEVELS.forEach((y, k) => {
      parts.push(R(0, X1, y - 0.05, y, D0, D1, C.woodLt));
      if (k === LEVELS.length - 1) return;
      const top = LEVELS[k + 1] - 0.07, dark = 1 - k * 0.085;
      for (let u = 0; u < UPRIGHTS.length - 1; u++) {
        for (let d = UPRIGHTS[u] + 0.07; ;) {
          const w = 0.07 + rand() * 0.08, h = (top - y) * (0.62 + rand() * 0.36);
          if (d + w > UPRIGHTS[u + 1] - 0.06) break;
          parts.push(sideQ(X1 - 0.04, d, d + w, y, y + h, dim(C.ledger[(rand() * C.ledger.length) | 0], dark)));
          if (rand() < 0.4) parts.push(sideQ(X1 - 0.03, d + 0.01, d + w - 0.01, y + h * 0.72, y + h * 0.8, dim(C.gold, dark)));
          d += w + 0.01;
        }
      }
    });
    return parts;
  };
  const ledgerHall = (L, room, i) => {
    // Shelves on both walls, other books on each, and a rolling ladder against the left ones.
    L.decor.push(...ledgerShelves(mulberry32(201 + i)), ...ledgerShelves(mulberry32(301 + i)).map(mirrorRoom));
    L.decor.push(rod(0.62, 0, -1.9, 0.53, 3.6, -2.0, 0.025, C.woodLt, 0, 6), rod(0.62, 0, -2.35, 0.53, 3.6, -2.45, 0.025, C.woodLt, 0, 6));
    for (let y = 0.35; y < 3.5; y += 0.4) { const x = 0.62 - 0.09 * y / 3.6; L.decor.push(rod(x, y, -1.9 - 0.1 * y / 3.6, x, y, -2.35 - 0.1 * y / 3.6, 0.018, C.wood, 0, 6)); }
    // Shelves along the back wall over the targets, up into the dark.
    const BY = [2.78, 3.33, 3.88, 4.43], br = mulberry32(401 + i);
    BY.forEach((y, k) => {
      for (const [s, e] of freeSpans(room, y - 0.05, ROOM_H)) {
        L.decor.push(R(s, e, y - 0.05, y, DEPTH - 0.4, DEPTH, C.woodLt));
        if (k === BY.length - 1) continue;
        const top = BY[k + 1] - 0.07, dark = 0.8 - k * 0.12;
        for (let x = s + 0.05; ;) {
          const w = 0.07 + br() * 0.08, h = (top - y) * (0.62 + br() * 0.36);
          if (x + w > e - 0.05) break;
          L.decor.push(backQ(x, x + w, y, y + h, DEPTH - 0.36, dim(C.ledger[(br() * C.ledger.length) | 0], dark)));
          x += w + 0.01;
        }
      }
    });
    // Green lamps hung down the middle of the hall.
    for (const [d, y] of [[1.4, 3.7], [3.3, 3.85]]) {
      L.decor.push(rod(MID, y + 0.1, -d, MID, ROOM_H, -d, 0.012, C.brassDk, 0, 6));
      L.decor.push(moved(lathe({ profile: [[0.24, -0.03], [0.22, -0.01], [0.1, 0.1], [0.08, 0.11]], segments: 12, color: C.lamp, emissive: 0.6 }), MID, y, -d), ball(0.06, MID, y - 0.02, -d, C.bulb, 1, 8));
    }
  };
  const tripwireGallery = (L, room) => {
    // A maroon runner from the door to the front line, banners on the walls, urns either side of the door.
    L.over.push(floorQ(3.42, 4.58, 0, 4.98, 0, C.gold), floorQ(3.5, 4.5, 0, 4.98, 0, C.maroon));
    const left = [];
    for (const [d0, d1] of [[0.9, 1.8], [3.0, 3.9]]) {
      left.push(R(0, 0.12, 3.62, 3.68, d0 - 0.12, d1 + 0.12, C.brass), sideQ(0.03, d0, d1, 1.25, 3.62, C.maroon), sideQ(0.034, d0, d1, 1.25, 1.36, C.gold));
      left.push(moved(turnedY(disc(0.22, 0.02, 0, 0, 0, C.gold, 0.3, 16), PI / 2), 0.05, 2.75, -(d0 + d1) / 2), moved(turnedY(disc(0.15, 0.025, 0, 0, 0, C.maroonDk, 0.1, 14), PI / 2), 0.056, 2.75, -(d0 + d1) / 2));
    }
    left.push(...sconce(2.45, 1.95));
    both(L.decor, left);
    for (const x of [2.65, 5.35]) if (isFree(room, x - 0.3, x + 0.3, 0, 1.75)) {
      L.decor.push(R(x - 0.26, x + 0.26, 0, 0.85, DEPTH - 0.45, DEPTH - 0.02, C.marble[2]), R(x - 0.3, x + 0.3, 0.85, 0.92, DEPTH - 0.48, DEPTH, C.marbleDk));
      L.decor.push(moved(lathe({ profile: [[0, 0], [0.14, 0], [0.12, 0.08], [0.2, 0.3], [0.17, 0.52], [0.1, 0.6], [0.14, 0.7], [0, 0.7]], segments: 14, color: C.brass }), x, 0.92, -DEPTH + 0.25));
    }
    for (const [x, y] of [[2.65, 2.95], [5.35, 2.95]]) L.decor.push(...seal(0.3, x, y, -DEPTH + 0.06, C.brass, C.maroonDk));
    for (const [x0, x1, h] of room.wires) L.decor.push(...wirePost(x0, h, 1), ...wirePost(x1, h, -1));
  };
  const coinChute = (L, room) => {
    // Two copper chutes out of holes in the rock down to the doors, coins in them, coin piles at the doors' sides.
    const chute = [], from = [1.12, 3.62], to = [2.5, 1.62];
    chute.push(backQ(from[0] - 0.24, from[0] + 0.24, from[1] - 0.12, from[1] + 0.2, DEPTH - 0.01, "#2a2024"));
    chute.push(beam(from[0], from[1], -DEPTH + 0.1, to[0], to[1], -DEPTH + 0.1, 0.16, C.copper), beam(from[0], from[1] + 0.04, -DEPTH + 0.17, to[0], to[1] + 0.04, -DEPTH + 0.17, 0.05, C.copperDk));
    for (let k = 1; k < 8; k++) {
      const t = k / 8, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t + 0.07;
      chute.push(moved(turnedZ(disc(0.05, 0.015, 0, 0, 0, C.coin, 0.35, 10), t * 3), x, y, -DEPTH + 0.19));
    }
    chute.push(moved(lathe({ profile: [[0, 0], [0.34, 0], [0.24, 0.12], [0.1, 0.24], [0, 0.27]], segments: 14, color: C.coin, emissive: 0.15 }), 2.05, 0, -DEPTH + 0.4));
    for (const [x, z, n] of [[1.75, 0.55, 5], [2.3, 0.35, 3], [1.62, 0.32, 2]]) for (let k = 0; k < n; k++) chute.push(moved(lathe({ profile: [[0, 0], [0.06, 0], [0.06, 0.022], [0, 0.022]], segments: 10, color: k & 1 ? C.gold : C.coin, emissive: 0.3 }), x, k * 0.024, -DEPTH + z));
    both(L.decor, chute);
    // Coin sacks along the side walls and the green lamps.
    const left = [...sconce(1.3, 1.95), ...sconce(3.6, 1.95)];
    for (const [d, s] of [[1.2, 1], [1.75, 0.85], [3.2, 1.1], [3.8, 0.9]]) {
      left.push(moved(lathe({ profile: [[0, 0], [0.22 * s, 0], [0.26 * s, 0.15 * s], [0.2 * s, 0.32 * s], [0.07, 0.4 * s], [0.06, 0.48 * s], [0.1, 0.52 * s], [0, 0.54 * s]], segments: 10, color: "#b49a6a" }), 0.32, 0, -d));
      left.push(moved(lathe({ profile: [[0.065, 0.4 * s], [0.08, 0.41 * s], [0.08, 0.45 * s], [0.065, 0.46 * s]], segments: 10, color: C.maroon }), 0.32, 0, -d));
    }
    both(L.decor, left);
  };
  const countingFloor = (L, room) => {
    // Abacus frames the height of the wall, beads counted along their rods.
    const left = [R(0, 0.26, 0.2, 0.3, 0.8, 4.2, C.wood), R(0, 0.26, 4.15, 4.25, 0.8, 4.2, C.wood)], rand = mulberry32(55), BEAD = ["#c8342a", "#f2e6c8", "#2f6b4a"];
    for (const d of [0.8, 4.2]) left.push(R(0, 0.26, 0.2, 4.25, d - 0.06, d + 0.06, C.woodLt));
    for (let r = 0; r < 8; r++) {
      const y = 0.62 + r * 0.46, n = 10, split = 2 + ((rand() * 7) | 0);
      left.push(R(0.11, 0.15, y - 0.015, y + 0.015, 0.86, 4.14, C.brass));
      for (let k = 0; k < n; k++) {
        const d = k < split ? 0.95 + k * 0.17 : 4.05 - (n - 1 - k) * 0.17;
        left.push(R(0.03, 0.23, y - 0.1, y + 0.1, d - 0.075, d + 0.075, BEAD[r % 3]));
      }
    }
    both(L.decor, left);
    // The gallery above the back wall: a balcony on brackets, brass rail and posts, lamps hung under it.
    for (const [s, e] of freeSpans(room, 2.6, 3.5)) {
      L.decor.push(R(s, e, 2.6, 2.75, DEPTH - 0.55, DEPTH, C.wood), R(s, e, 2.72, 2.76, DEPTH - 0.57, DEPTH - 0.5, C.brass));
      for (let x = Math.ceil(s / 0.8) * 0.8; x <= e - 0.04; x += 0.8) L.decor.push(R(x - 0.03, x + 0.03, 2.76, 3.42, DEPTH - 0.54, DEPTH - 0.48, C.woodLt));
      L.decor.push(R(s, e, 3.42, 3.48, DEPTH - 0.56, DEPTH - 0.46, C.brass), R(s, e, 3.0, 3.03, DEPTH - 0.53, DEPTH - 0.5, C.brassDk));
    }
    for (const x of [1.0, 7.0]) if (isFree(room, x - 0.2, x + 0.2, 2.25, 2.6)) {
      L.decor.push(rod(x, 2.45, -DEPTH + 0.3, x, 2.6, -DEPTH + 0.3, 0.01, C.brassDk, 0, 6), moved(lathe({ profile: [[0.16, -0.02], [0.15, -0.01], [0.07, 0.08], [0.05, 0.09]], segments: 10, color: C.lamp, emissive: 0.6 }), x, 2.36, -DEPTH + 0.3));
    }
    for (const [x0, x1, h] of room.wires) L.decor.push(...wirePost(x0, h, 1), ...wirePost(x1, h, -1));
  };
  // The Mint Press: a black iron press as tall as the room, its crown beam with the fiat seal and gears, the screws
  // down to the dies, cheeks over the doors, green steam vents at its feet, iron pipes on the walls.
  const mintPress = (L, room) => {
    const IRON = "#202227", IRON_LT = "#34373e";
    L.decor.push(R(0.1, 7.9, 2.75, 3.62, DEPTH - 0.45, DEPTH, IRON), R(0.1, 7.9, 2.75, 2.82, DEPTH - 0.48, DEPTH - 0.44, C.gold, 0.2), R(0.1, 7.9, 3.52, 3.58, DEPTH - 0.48, DEPTH - 0.44, C.gold, 0.2));
    L.decor.push(...seal(0.32, MID, 3.19, -DEPTH + 0.5, C.gold, "#3a2a0a"));
    for (const x of [1.25, 6.75]) L.decor.push(...gear(0.28, 10, x, 3.19, -DEPTH + 0.5, IRON_LT, C.brass));
    for (let x = 0.4; x < 7.7; x += 0.45) if (Math.abs(x - MID) > 0.45 && Math.abs(x - 1.25) > 0.42 && Math.abs(x - 6.75) > 0.42) L.decor.push(disc(0.025, 0.02, x, 2.92, -DEPTH + 0.47, "#5a5f68", 0, 8), disc(0.025, 0.02, x, 3.44, -DEPTH + 0.47, "#5a5f68", 0, 8));
    // The screws from the crown beam down to each die's box top (the die's look keeps inside its box).
    for (const [x, y, name] of room.targets) {
      if (name !== "PRESS_DIE") continue;
      const top = boxOf(name)[3] + y + 0.14;   // clear of the box once projected: the screw stands up to 0.17 m off the wall
      for (let yy = top, k = 0; yy < 2.75; yy += 0.09, k++) L.decor.push(rod(x, yy, -DEPTH + 0.06, x, Math.min(2.75, yy + 0.09), -DEPTH + 0.06, k & 1 ? 0.09 : 0.105, k & 1 ? IRON : IRON_LT, 0, 12));
    }
    for (const [x0, x1] of [[0.05, 0.6], [7.4, 7.95]]) if (isFree(room, x0, x1, 1.55, 2.75, 0.04)) {
      L.decor.push(R(x0, x1, 1.55, 2.75, DEPTH - 0.15, DEPTH, IRON_LT));
      for (const y of [1.8, 2.3]) L.decor.push(R(x0, x1, y, y + 0.06, DEPTH - 0.17, DEPTH - 0.14, C.gold, 0.2));
    }
    if (isFree(room, 3.55, 4.45, 0.06, 0.6, 0.04)) {
      L.decor.push(R(3.55, 4.45, 0.06, 0.6, DEPTH - 0.1, DEPTH, IRON_LT));
      for (let y = 0.14; y < 0.56; y += 0.1) L.decor.push(R(3.62, 4.38, y, y + 0.05, DEPTH - 0.12, DEPTH - 0.09, C.steam, 0.8));
    }
    const left = [];
    for (const d of [1.1, 2.6, 4.0]) {
      left.push(rod(0.12, 0, -d, 0.12, ROOM_H, -d, 0.09, IRON_LT, 0, 10));
      left.push(moved(turnedZ(lathe({ profile: [[0, -0.02], [0.13, -0.02], [0.13, 0.02], [0, 0.02]], segments: 10, color: C.lamp, emissive: 0.5 }), -PI / 2), 0.25, 1.4, -d), rod(0.12, 1.4, -d, 0.24, 1.4, -d, 0.025, C.brass, 0, 6));
      left.push(R(0, 0.5, 0, 0.06, d - 0.3, d + 0.3, IRON), R(0.05, 0.45, 0.06, 0.07, d - 0.25, d + 0.25, C.steam, 0.7));
    }
    left.push(...sconce(1.85, 2.0), ...sconce(3.3, 2.0));
    both(L.decor, left);
    for (const [x, y, name] of room.targets) L.over.push(...mount(x, y, name, "#121316", C.brassDk));
  };
  const COUNTING_ROOMS = [lobby, ledgerHall, tripwireGallery, coinChute, countingFloor, mintPress];
  // The counting house's door: an arched doorway in dressed stone with a brass keystone, maroon curtains tied back,
  // 0.96 m wide in all.
  const countingDoor = cached(() => {
    const W = 0.34, RIM = 0.12, CY = 0.9, parts = [], stone = C.marble;
    const opening = [[-W, 0]];
    for (let k = 0; k <= 12; k++) { const a = PI - k / 12 * PI; opening.push([Math.cos(a) * W, CY + Math.sin(a) * W]); }
    opening.push([W, 0]);
    parts.push(quad(opening.map(([x, y]) => [MID + x, y, -DEPTH + 0.01]), TOWARD, "#120d0c"));
    for (let k = 0; k < 9; k++) {
      const a0 = PI - k / 9 * PI, a1 = PI - (k + 1) / 9 * PI, ri = W, ro = W + RIM;
      parts.push(quad([[MID + Math.cos(a0) * ri, CY + Math.sin(a0) * ri, -DEPTH + 0.03], [MID + Math.cos(a1) * ri, CY + Math.sin(a1) * ri, -DEPTH + 0.03], [MID + Math.cos(a1) * ro, CY + Math.sin(a1) * ro, -DEPTH + 0.03], [MID + Math.cos(a0) * ro, CY + Math.sin(a0) * ro, -DEPTH + 0.03]], TOWARD, k === 4 ? C.brass : stone[k & 3], k === 4 ? 0.2 : 0));
    }
    for (const s of [-1, 1]) {
      parts.push(R(MID + s * W - (s > 0 ? 0 : RIM), MID + s * W + (s > 0 ? RIM : 0), 0, CY, DEPTH - 0.04, DEPTH - 0.02, stone[1]));
      parts.push(quad([[MID + s * W, CY, -DEPTH + 0.05], [MID + s * (W - 0.09), 1.1, -DEPTH + 0.05], [MID + s * (W - 0.14), 0.25, -DEPTH + 0.05], [MID + s * W, 0.05, -DEPTH + 0.05]], TOWARD, C.velvet));
      parts.push(R(MID + s * (W - 0.12) - 0.035, MID + s * (W - 0.12) + 0.035, 0.5, 0.56, DEPTH - 0.07, DEPTH - 0.05, C.gold));
    }
    parts.push(R(MID - W - RIM, MID + W + RIM, 0, 0.05, DEPTH - 0.06, DEPTH - 0.02, C.marbleDk));
    return onBackWall(parts);
  });
  // A room's barrier is dressing: its bars and rails stop short of every target's box and door (BAR_GAP clear), so a
  // bright bar never crosses what plays behind it.
  const BAR_GAP = 0.06;
  const countingBarrier = (room) => {
    const parts = [], top = 2.75;
    for (let k = 0; k <= 18; k++) {
      const x = 0.4 + (ROOM_W - 0.8) * k / 18;
      for (const [y0, y1] of freeRises(room, x - 0.035, x + 0.035, 0.05, top, BAR_GAP)) parts.push(R(x - 0.035, x + 0.035, y0, y1, DEPTH - 0.05, DEPTH - 0.02, "#ffcf3a", 0.85));
      if (isFree(room, x - 0.07, x + 0.07, top, top + 0.16, BAR_GAP)) parts.push(quad([[x - 0.07, top, -DEPTH + 0.04], [x + 0.07, top, -DEPTH + 0.04], [x, top + 0.16, -DEPTH + 0.04]], TOWARD, "#ffe680", 0.9));
    }
    for (const y of [0.18, 1.4, top - 0.12]) for (const [x0, x1] of freeSpans(room, y - 0.045, y + 0.045, 0.3, ROOM_W - 0.3, BAR_GAP, 0.06)) parts.push(R(x0, x1, y - 0.045, y + 0.045, DEPTH - 0.07, DEPTH - 0.04, "#ffe680", 0.9));
    return wallPiece(parts);
  };
  const countingFront = (room) => {
    const parts = [B(-0.4, 8.4, ROOM_H, 7.8, -0.04, 0, C.cliffDk)];
    parts.push(sheet({ u0: -0.4, u1: 8.4, v0: ROOM_H + 0.4, v1: 7.8, step: 0.45, map: (u, v, b) => [u, v, b * 0.3], want: TOWARD, palette: C.cliff, seed: 77 }));
    parts.push(B(-0.4, 8.4, ROOM_H, ROOM_H + 0.4, 0.02, 0.07, C.marble[0]), B(-0.4, 8.4, ROOM_H - 0.03, ROOM_H + 0.05, 0.04, 0.09, C.marbleDk));
    const w = room.name.length * 4 * 0.045;
    parts.push(B(MID - w / 2 - 0.12, MID + w / 2 + 0.12, ROOM_H + 0.46, ROOM_H + 0.86, 0.05, 0.08, C.brassDk), B(MID - w / 2 - 0.08, MID + w / 2 + 0.08, ROOM_H + 0.5, ROOM_H + 0.82, 0.08, 0.09, C.maroonDk));
    parts.push(glyphs(room.name, 0.045, MID, ROOM_H + 0.66, 0.095, C.brassLt, 0.35));
    parts.push(B(-0.4, 0.15, 0, ROOM_H, 0.02, 0.07, C.marble[2]), B(7.85, 8.4, 0, ROOM_H, 0.02, 0.07, C.marble[2]));
    parts.push(B(-0.4, 8.4, -0.1, -0.02, 0.0, 0.06, C.brass));
    return flat(merge(...parts));
  };

  // ---- The Treasury Vaults -----------------------------------------------------------------------------------------
  const TREASURY = ["THE ANTECHAMBER", "THE TWIN HALL", "THE SEARCHLIGHT GALLERY", "THE SHUTTER BANK", "THE DROP ROOM", "THE TWIN SEARCHLIGHTS", "THE BULLION STORE", "THE PRINTER KING"];
  const PLATE_TOP = 3.3;
  const vaultWalls = (L, room, i) => {
    L.base.push(floorQ(0, ROOM_W, 0, DEPTH, 0, V.base), sideQ(0, 0, DEPTH, 0, ROOM_H, V.base), sideQ(ROOM_W, 0, DEPTH, 0, ROOM_H, V.base), backQ(0, ROOM_W, 0, ROOM_H, DEPTH, V.base));
    for (let a = 0; a < ROOM_W; a++) for (let b = 0; b < DEPTH; b++) L.inlay.push(floorQ(a + 0.04, a + 0.96, b + 0.04, b + 0.96, 0, (a + b) & 1 ? V.plate : V.plate2));
    for (let r = 0; r < 3; r++) {
      const y0 = r * 1.1 + 0.03, y1 = (r + 1) * 1.1 - 0.03;
      for (let a = 0; a < ROOM_W; a++) {
        L.inlay.push(backQ(a + 0.03, a + 0.97, y0, y1, DEPTH, (a + r) & 1 ? V.steel : V.steel2));
        for (const x of [a + 0.15, a + 0.5, a + 0.85]) L.over.push(backQ(x - 0.025, x + 0.025, y1 - 0.08, y1 - 0.03, DEPTH - 0.004, V.rivet), backQ(x - 0.025, x + 0.025, y0 + 0.03, y0 + 0.08, DEPTH - 0.004, V.rivet));
      }
      for (let b = 0; b < DEPTH; b++) for (const side of [0, 1]) {
        const parts = [sideQ(0, b + 0.03, b + 0.97, y0, y1, (b + r + side) & 1 ? V.steel : V.steel2)];
        const rivets = [];
        for (const d of [b + 0.15, b + 0.5, b + 0.85]) rivets.push(sideQ(0.004, d - 0.025, d + 0.025, y1 - 0.08, y1 - 0.03, V.rivet), sideQ(0.004, d - 0.025, d + 0.025, y0 + 0.03, y0 + 0.08, V.rivet));
        for (const p of parts) L.inlay.push(side ? mirrorRoom(p) : p);
        for (const p of rivets) L.over.push(side ? mirrorRoom(p) : p);
      }
    }
    L.inlay.push(sheet({ u0: 0, u1: ROOM_W, v0: PLATE_TOP + 0.05, v1: ROOM_H, step: 0.5, map: (u, v, b) => [u, v, -DEPTH + b], want: TOWARD, palette: V.rock, seed: 61 + i }));
    for (const side of [0, 1]) {
      const s = sheet({ u0: 0, u1: DEPTH, v0: PLATE_TOP + 0.05, v1: ROOM_H, step: 0.5, map: (u, v, b) => [b, v, -u], want: RIGHTWARD, palette: V.rock, seed: 81 + i * 2 + side });
      L.inlay.push(side ? mirrorRoom(s) : s);
    }
    for (const [s, e] of freeSpans(room, 3.22, 3.4)) L.decor.push(R(s, e, 3.22, 3.4, DEPTH - 0.12, DEPTH, V.steelDk), R(s, e, 3.22, 3.26, DEPTH - 0.14, DEPTH - 0.1, V.gold, 0.2));
    for (const [s, e] of freeSpans(room, 1.13, 1.19)) L.decor.push(R(s, e, 1.13, 1.19, DEPTH - 0.03, DEPTH, V.gold, 0.25));
    for (const [s, e] of freeSpans(room, 0, 0.12)) L.decor.push(R(s, e, 0, 0.12, DEPTH - 0.04, DEPTH, V.steelDk));
    both(L.decor, [R(0, 0.1, 3.22, 3.4, 0, sideEnd(room, 3.22, 3.4), V.steelDk), R(0, 0.12, 3.22, 3.26, 0, sideEnd(room, 3.22, 3.26), V.gold, 0.2), R(0, 0.025, 1.13, 1.19, 0, sideEnd(room, 1.13, 1.19), V.gold, 0.25), R(0, 0.04, 0, 0.12, 0, sideEnd(room, 0, 0.12), V.steelDk)]);
    L.decor.push(R(0, ROOM_W, -0.03, 0.025, -0.02, 0.07, V.gold, 0.15));
  };
  const antechamber = (L, room) => {
    // A gate of bars folded back against each wall, and an arch of steel over the back wall.
    const left = [R(0.12, 0.18, 0.05, 0.11, 0.35, 2.4, V.steelDk), R(0.12, 0.18, 2.75, 2.81, 0.35, 2.4, V.steelDk), R(0.12, 0.18, 1.4, 1.45, 0.35, 2.4, V.steelDk)];
    for (let d = 0.4; d < 2.42; d += 0.2) left.push(R(0.13, 0.17, 0.05, 2.95, d - 0.018, d + 0.018, V.steelLt), quad([[0.15, 2.95, -(d - 0.04)], [0.15, 2.95, -(d + 0.04)], [0.15, 3.07, -d]], RIGHTWARD, V.gold, 0.2));
    left.push(R(0, 0.14, 0.4, 0.6, 0.3, 0.42, V.steelDk), R(0, 0.14, 2.2, 2.4, 0.3, 0.42, V.steelDk));
    left.push(...bulkhead(3.6, 2.5));
    both(L.decor, left);
    for (const [s, e] of freeSpans(room, 2.45, 3.0)) L.decor.push(R(s, e, 2.75, 2.95, DEPTH - 0.18, DEPTH, V.steelDk), R(s, e, 2.72, 2.76, DEPTH - 0.2, DEPTH - 0.16, V.gold, 0.2));
    for (const [x0, x1] of [[0.04, 0.2], [7.8, 7.96]]) if (isFree(room, x0, x1, 0, 2.95, 0.02)) L.decor.push(R(x0, x1, 0, 2.95, DEPTH - 0.2, DEPTH, V.steelDk), R(x0 - 0.02, x1 + 0.02, 2.6, 2.75, DEPTH - 0.22, DEPTH, V.gold, 0.15));
    L.decor.push(...seal(0.22, MID, 2.6, -DEPTH + 0.2, V.gold, V.ink));
  };
  // The twin rooms: the brass yoke over both twins with its gauge (the needle the scene swings), and in the hall a long
  // balance scale overhead.
  const yoke = (L, room) => {
    const g = room.gauge, [a, b] = g.twins;
    L.decor.push(R(a[0] - 0.18, b[0] + 0.18, g.bar - 0.05, g.bar + 0.05, DEPTH - 0.07, DEPTH - 0.01, C.brass));
    for (const [x, y] of g.twins) L.decor.push(R(x - 0.04, x + 0.04, y + 0.4, g.bar, DEPTH - 0.06, DEPTH - 0.01, C.brass), ball(0.06, x, g.bar, -DEPTH + 0.06, C.brassLt, 0.2, 8));
    L.decor.push(R(g.x - 0.04, g.x + 0.04, g.bar, g.y, DEPTH - 0.06, DEPTH - 0.02, C.brass));
    L.decor.push(disc(0.2, 0.05, g.x, g.y, -DEPTH + 0.06, C.brass, 0, 20), disc(0.165, 0.06, g.x, g.y, -DEPTH + 0.065, "#f4ecd8", 0, 20));
    L.decor.push(moved(turnedZ(B(-0.13, -0.02, 0.11, 0.13, 0.03, 0.04, "#2f9a4a", 0.4), 0), g.x, g.y, -DEPTH + 0.06), moved(turnedZ(B(0.02, 0.13, 0.11, 0.13, 0.03, 0.04, "#2f9a4a", 0.4), 0), g.x, g.y, -DEPTH + 0.06));
    for (let k = -3; k <= 3; k++) L.decor.push(moved(turnedZ(B(-0.008, 0.008, 0.12, 0.15, 0.035, 0.045, V.ink), k * 0.32), g.x, g.y, -DEPTH + 0.06));
  };
  const twinHall = (L, room) => {
    yoke(L, room);
    L.decor.push(R(2.0, 6.0, 3.33, 3.41, DEPTH - 0.14, DEPTH - 0.06, V.ink2), R(3.95, 4.05, 3.05, 3.42, DEPTH - 0.12, DEPTH - 0.04, V.ink2), quad([[3.85, 3.41, -DEPTH + 0.14], [4.15, 3.41, -DEPTH + 0.14], [4.0, 3.52, -DEPTH + 0.14]], TOWARD, V.gold, 0.25));
    for (const x of [2.25, 5.75]) {
      for (const s of [-1, 1]) L.decor.push(beam(x, 3.33, -DEPTH + 0.1, x + s * 0.18, 3.02, -DEPTH + 0.1, 0.015, V.ink2));
      L.decor.push(moved(lathe({ profile: [[0, -0.03], [0.1, -0.03], [0.21, 0.02], [0.2, 0.03], [0, 0.03]], segments: 14, color: V.gold }), x, 2.99, -DEPTH + 0.1));
      for (let k = 0; k < 3; k++) L.decor.push(moved(lathe({ profile: [[0, 0], [0.05, 0], [0.05, 0.015], [0, 0.015]], segments: 8, color: C.coin, emissive: 0.3 }), x - 0.06 + k * 0.06, 3.02 + (k & 1) * 0.015, -DEPTH + 0.1));
    }
    both(L.decor, [...bulkhead(1.2, 2.5), ...bulkhead(3.7, 2.5)]);
  };
  const searchlightGallery = (L) => {
    // Barred windows on the walls, the night beyond them.
    const left = [];
    for (const [d0, d1] of [[1.1, 2.1], [2.9, 3.9]]) {
      left.push(R(0, 0.06, 1.35, 3.05, d0 - 0.08, d1 + 0.08, V.steelDk), sideQ(0.065, d0, d1, 1.43, 2.97, V.navy, 0.35));
      for (let d = d0 + 0.2; d < d1; d += 0.2) left.push(R(0.065, 0.1, 1.43, 2.97, d - 0.015, d + 0.015, V.steelLt));
      left.push(R(0.065, 0.1, 2.15, 2.2, d0, d1, V.steelLt));
      left.push(sideQ(0.068, d0 + 0.15, d0 + 0.3, 2.65, 2.75, "#f4f6ff", 0.9));
    }
    both(L.decor, left);
  };
  const shutterBank = (L, room) => {
    // Rows of safe-deposit boxes up the walls and across the back wall over the targets.
    const box1 = (d0, d1, y0, y1, k) => [sideQ(0.004, d0 + 0.015, d1 - 0.015, y0 + 0.015, y1 - 0.015, k & 1 ? V.steelLt : "#7d868f"), sideQ(0.008, (d0 + d1) / 2 - 0.02, (d0 + d1) / 2 + 0.02, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, V.gold, 0.3)];
    const left = [R(0, 0.12, 0.25, 3.2, 0.5, 4.6, V.steelDk)];
    for (let y = 0.3, r = 0; y < 3.1; y += 0.32, r++) for (let d = 0.55, k = r; d < 4.5; d += 0.4, k++) left.push(...box1(d, d + 0.4, y, y + 0.32, k).map((q) => moved(q, 0.12, 0, 0)));
    both(L.decor, left);
    for (const [s, e] of freeSpans(room, 2.2, 3.2)) {
      L.decor.push(R(s, e, 2.2, 3.18, DEPTH - 0.1, DEPTH, V.steelDk));
      for (let y = 2.24, r = 0; y < 3.1; y += 0.3, r++) for (let x = s + 0.04, k = r; x + 0.38 <= e - 0.03; x += 0.4, k++) {
        L.decor.push(backQ(x + 0.015, x + 0.385, y + 0.015, y + 0.285, DEPTH - 0.104, k & 1 ? V.steelLt : "#7d868f"), backQ(x + 0.18, x + 0.22, y + 0.13, y + 0.17, DEPTH - 0.108, V.gold, 0.3));
      }
    }
  };
  const dropRoom = (L, room) => {
    // Catwalks across the ceiling: along both walls and over the back wall, gratings on rails.
    const walk = (s, e) => {
      const parts = [R(s, e, 2.82, 2.9, DEPTH - 0.7, DEPTH, V.steelDk)];
      for (let x = s + 0.1; x < e; x += 0.16) parts.push(R(x, x + 0.06, 2.9, 2.91, DEPTH - 0.68, DEPTH - 0.02, V.steelLt));
      for (let x = s + 0.2; x < e - 0.1; x += 0.7) parts.push(R(x - 0.025, x + 0.025, 2.9, 3.45, DEPTH - 0.7, DEPTH - 0.64, V.steel));
      parts.push(R(s, e, 3.42, 3.47, DEPTH - 0.72, DEPTH - 0.62, V.gold, 0.15), R(s, e, 3.15, 3.18, DEPTH - 0.7, DEPTH - 0.66, V.steel));
      return parts;
    };
    for (const [s, e] of freeSpans(room, 2.82, 3.5)) L.decor.push(...walk(s, e));
    const left = [R(0, 0.9, 3.25, 3.33, 0, DEPTH - 0.7, V.steelDk), R(0.86, 0.92, 3.33, 3.9, 0, DEPTH - 0.7, V.steel), R(0.84, 0.94, 3.86, 3.92, 0, DEPTH - 0.7, V.gold, 0.15)];
    for (let d = 0.1; d < DEPTH - 0.7; d += 0.16) left.push(R(0.05, 0.85, 3.33, 3.34, d, d + 0.06, V.steelLt));
    for (let d = 0.6; d < DEPTH - 0.7; d += 1.0) left.push(R(0, 0.9, 3.0, 3.25, d - 0.03, d + 0.03, V.steelDk));
    left.push(...bulkhead(1.4, 2.2), ...bulkhead(3.5, 2.2));
    both(L.decor, left);
  };
  const twinSearchlights = (L, room) => {
    yoke(L, room);
    both(L.decor, [...bulkhead(1.4, 2.5), ...bulkhead(3.6, 2.5)]);
    const left = [];
    for (const d of [2.0, 2.9]) left.push(rod(0.14, 0, -d, 0.14, PLATE_TOP, -d, 0.08, V.steelDk, 0, 10), rod(0.14, 1.2, -d, 0.14, 1.32, -d, 0.1, V.gold, 0.2, 10));
    both(L.decor, left);
  };
  // A stack of gold bars at (x, d) in rows `n` long, laid like bricks, each row a bar shorter.
  const bullion = (x, d, n, rows) => {
    const parts = [], W = 0.26, H = 0.1, Dp = 0.14;
    for (let r = 0; r < rows; r++) for (let k = 0; k < n - r; k++) {
      const cx = x + (k - (n - r - 1) / 2) * (W + 0.02);
      parts.push(RB(cx - W / 2, cx + W / 2, r * H, (r + 1) * H - 0.008, d - Dp / 2, d + Dp / 2, (k + r) & 1 ? V.gold : "#d9a63a", 0.02));
    }
    return parts;
  };
  const bullionStore = (L, room) => {
    const left = [];
    for (const [d, n, rows] of [[1.0, 2, 2], [1.6, 2, 2], [2.6, 2, 2], [3.4, 2, 1]]) left.push(...bullion(0.36, d, n, rows));
    left.push(R(0, 0.72, 0, 0.03, 0.8, 3.7, V.steelDk), ...bulkhead(2.1, 2.4));
    both(L.decor, left);
    for (const [s, e] of freeSpans(room, 0, 0.6, 0.2, ROOM_W - 0.2, 0.1, 0.6)) {
      const n = Math.min(5, Math.floor((e - s) / 0.28));
      if (n >= 2) L.decor.push(...bullion((s + e) / 2, DEPTH - 0.25, n, Math.min(3, n)));
    }
    for (const [x0, x1, h] of room.wires) L.decor.push(...wirePost(x0, h, 1), ...wirePost(x1, h, -1));
  };
  // The Printer King's press: black enamel columns either side of the King, a crown beam crowned in printed paper, arms
  // out to the outer heads with paper running along them, gold-leaf rosettes, pallets of fresh bills on the walls.
  const printerPress = (L, room) => {
    const INK = V.ink, INK2 = V.ink2;
    for (const [x0, x1] of [[2.65, 3.3], [4.7, 5.35]]) if (isFree(room, x0, x1, 0, 2.3, 0.04)) {
      L.decor.push(R(x0, x1, 0, 2.3, DEPTH - 0.3, DEPTH, INK));
      for (const f of [0.25, 0.5, 0.75]) L.decor.push(R(x0 + (x1 - x0) * f - 0.012, x0 + (x1 - x0) * f + 0.012, 0.15, 2.15, DEPTH - 0.31, DEPTH - 0.29, V.gold, 0.25));
      L.decor.push(R(x0 - 0.04, x1 + 0.04, 0, 0.14, DEPTH - 0.34, DEPTH, INK2));
    }
    if (isFree(room, 2.4, 5.6, 2.3, 2.6, 0.04)) L.decor.push(R(2.4, 5.6, 2.3, 2.6, DEPTH - 0.3, DEPTH, INK), R(2.4, 5.6, 2.32, 2.36, DEPTH - 0.33, DEPTH - 0.29, V.gold, 0.25), R(2.4, 5.6, 2.54, 2.58, DEPTH - 0.33, DEPTH - 0.29, V.gold, 0.25));
    // The crown: a band of printed paper with five points, gold-edged, a green seal at its middle.
    L.decor.push(R(2.6, 5.4, 2.6, 2.86, DEPTH - 0.22, DEPTH - 0.12, C.paper), R(2.6, 5.4, 2.6, 2.64, DEPTH - 0.24, DEPTH - 0.11, V.gold, 0.3));
    for (let k = 0; k < 5; k++) {
      const x = 2.88 + k * 0.56, h = k === 2 ? 0.66 : k & 1 ? 0.42 : 0.52;
      L.decor.push(quad([[x - 0.26, 2.86, -DEPTH + 0.17], [x + 0.26, 2.86, -DEPTH + 0.17], [x, 2.86 + h, -DEPTH + 0.17]], TOWARD, C.paper));
      L.decor.push(quad([[x - 0.12, 2.9, -DEPTH + 0.18], [x + 0.12, 2.9, -DEPTH + 0.18], [x, 2.9 + h * 0.5, -DEPTH + 0.18]], TOWARD, V.bill));
      L.decor.push(ball(0.05, x, 2.86 + h, -DEPTH + 0.17, V.gold, 0.4, 8));
    }
    for (let x = 2.75; x < 5.3; x += 0.2) L.decor.push(backQ(x, x + 0.1, 2.68, 2.78, DEPTH - 0.225, V.billDk));
    L.decor.push(...seal(0.14, MID, 2.73, -DEPTH + 0.24, V.bill, V.billDk));
    for (const [x0, x1] of [[1.1, 2.65], [5.35, 6.9]]) if (isFree(room, x0, x1, 1.3, 1.5, 0.04)) {
      L.decor.push(R(x0, x1, 1.3, 1.5, DEPTH - 0.2, DEPTH, INK), R(x0, x1, 1.5, 1.53, DEPTH - 0.18, DEPTH - 0.04, C.paper));
      for (let x = x0 + 0.1; x < x1 - 0.1; x += 0.25) L.decor.push(R(x, x + 0.12, 1.53, 1.535, DEPTH - 0.16, DEPTH - 0.06, V.billDk));
      L.decor.push(R(x0, x1, 1.32, 1.35, DEPTH - 0.22, DEPTH - 0.19, V.gold, 0.25));
    }
    for (const x of [1.5, 6.5]) if (isFree(room, x - 0.06, x + 0.06, 1.2, 1.3, 0.04)) L.decor.push(R(x - 0.05, x + 0.05, 1.2, 1.3, DEPTH - 0.12, DEPTH - 0.04, V.gold));
    for (const [x, y] of [[2.97, 1.85], [5.03, 1.85], [2.97, 0.95], [5.03, 0.95]]) L.decor.push(disc(0.09, 0.03, x, y, -DEPTH + 0.32, V.gold, 0.3, 12), disc(0.05, 0.035, x, y, -DEPTH + 0.33, V.ink2, 0, 10));
    for (const [x, y, name] of room.targets) L.over.push(...mount(x, y, name, "#0d0e10", V.goldDk));
    // Pallets of fresh-printed bills along the walls.
    const left = [];
    for (const d of [1.2, 2.6, 3.8]) {
      left.push(R(0.08, 0.7, 0, 0.1, d - 0.42, d + 0.42, C.woodLt));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) for (let s = 0; s < 3; s++) {
        const y = 0.1 + r * 0.12, x = 0.12 + c * 0.28, dd = d - 0.38 + s * 0.26;
        left.push(R(x, x + 0.26, y, y + 0.11, dd, dd + 0.24, V.bill), R(x + 0.1, x + 0.16, y, y + 0.112, dd - 0.002, dd + 0.242, C.paper));
      }
    }
    left.push(...bulkhead(2.0, 2.6));
    both(L.decor, left);
  };
  const TREASURY_ROOMS = [antechamber, twinHall, searchlightGallery, shutterBank, dropRoom, twinSearchlights, bullionStore, printerPress];
  // The treasury's door: a round vault doorway in a riveted steel ring, 0.96 m across, its great door swung in on its
  // hinge, so only its edge shows inside the opening, bolted down its face.
  const treasuryDoor = cached(() => {
    const parts = [], cy = 0.5, r = 0.4, R1 = 0.48, z = -DEPTH;
    const at = (a, rr, dx = 0) => [MID + dx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    const ring = (r0, r1, dz, color, n = 20) => {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a0 = k / n * 2 * PI, a1 = (k + 1) / n * 2 * PI, p = [at(a0, r0), at(a1, r0), at(a1, r1), at(a0, r1)];
        out.push(quad(p.map(([x, y]) => [x, y, z + dz]), TOWARD, color));
      }
      return out;
    };
    const hole = [];
    for (let k = 0; k < 20; k++) { const [x, y] = at(k / 20 * 2 * PI, r); hole.push([x, y, z + 0.01]); }
    parts.push(quad(hole, TOWARD, "#0d0f12"));
    parts.push(...ring(r, R1, 0.03, V.steelDk), ...ring(r + 0.008, r + 0.032, 0.04, V.gold));
    for (let k = 0; k < 12; k++) { const [x, y] = at(k / 12 * 2 * PI, 0.455); parts.push(disc(0.016, 0.02, x, y, z + 0.05, V.rivet, 0, 8)); }
    // The swung door's edge: a steel crescent down the hinge side of the opening, its outer arc on the rim and its inner
    // arc bowed in, with gold bolts down it.
    const n = 8, A = 1.2, rr = r - 0.012, inner = (a) => [MID + rr * (Math.cos(A) + 0.42 * (Math.cos(a) - Math.cos(A))), cy + Math.sin(a) * rr];
    for (let k = 0; k < n; k++) {
      const a0 = -A + 2 * A * k / n, a1 = -A + 2 * A * (k + 1) / n, p = [at(a0, rr), at(a1, rr), inner(a1), inner(a0)];
      parts.push(quad(p.map(([x, y]) => [x, y, z + 0.02]), TOWARD, k & 1 ? V.steel : V.steelLt));
    }
    for (let k = 1; k < 4; k++) { const [x, y] = inner(-A + 2 * A * k / 4); parts.push(disc(0.022, 0.02, x + 0.05, y, z + 0.03, V.gold, 0.2, 8)); }
    parts.push(R(MID - R1, MID + R1, 0, 0.04, DEPTH - 0.06, DEPTH - 0.02, V.steelDk));
    return onBackWall(parts);
  });
  const treasuryBarrier = (room) => {
    const parts = [], top = 2.8;
    for (let k = 0; k <= 14; k++) {
      const x = 0.4 + (ROOM_W - 0.8) * k / 14;
      for (const [y0, y1] of freeRises(room, x - 0.055, x + 0.055, 0.05, top, BAR_GAP)) parts.push(R(x - 0.055, x + 0.055, y0, y1, DEPTH - 0.06, DEPTH - 0.02, "#c9a83a", 0.7));
      for (const y of [0.6, 2.2]) if (isFree(room, x - 0.07, x + 0.07, y, y + 0.08, BAR_GAP)) parts.push(R(x - 0.07, x + 0.07, y, y + 0.08, DEPTH - 0.07, DEPTH - 0.01, "#ffe680", 0.9));
    }
    for (const y of [0.12, 1.4, top - 0.1]) for (const [x0, x1] of freeSpans(room, y - 0.06, y + 0.06, 0.3, ROOM_W - 0.3, BAR_GAP, 0.06)) parts.push(R(x0, x1, y - 0.06, y + 0.06, DEPTH - 0.08, DEPTH - 0.04, "#ffcf3a", 0.85));
    return wallPiece(parts);
  };
  const HATCH_Y = ROOM_H;
  const treasuryFront = (room) => {
    const parts = [B(-0.4, 8.4, ROOM_H, 7.8, -0.04, 0, V.steelDk)];
    for (let y = ROOM_H + 0.45; y < 7.8; y += 0.9) parts.push(B(-0.4, 8.4, y, y + 0.86, 0.0, 0.03, (Math.round(y * 10) & 1) ? V.steel : V.steel2));
    for (let y = ROOM_H + 0.52; y < 7.8; y += 0.9) for (let x = 0.1; x < 8; x += 0.5) parts.push(quad([[x - 0.022, y - 0.022, 0.032], [x + 0.022, y - 0.022, 0.032], [x + 0.022, y + 0.022, 0.032], [x - 0.022, y + 0.022, 0.032]], TOWARD, V.rivet));
    parts.push(B(-0.4, 8.4, ROOM_H, ROOM_H + 0.42, 0.02, 0.07, V.steelDk), B(-0.4, 8.4, ROOM_H + 0.06, ROOM_H + 0.1, 0.07, 0.08, V.gold, 0.25), B(-0.4, 8.4, ROOM_H + 0.34, ROOM_H + 0.38, 0.07, 0.08, V.gold, 0.25));
    const w = room.name.length * 4 * 0.045;
    parts.push(B(MID - w / 2 - 0.12, MID + w / 2 + 0.12, ROOM_H + 0.48, ROOM_H + 0.88, 0.05, 0.08, V.goldDk), B(MID - w / 2 - 0.08, MID + w / 2 + 0.08, ROOM_H + 0.52, ROOM_H + 0.84, 0.08, 0.09, V.ink));
    parts.push(glyphs(room.name, 0.045, MID, ROOM_H + 0.68, 0.095, V.gold, 0.4));
    parts.push(B(-0.4, 0.15, 0, ROOM_H, 0.02, 0.07, V.steelDk), B(7.85, 8.4, 0, ROOM_H, 0.02, 0.07, V.steelDk), B(0.13, 0.15, 0, ROOM_H, 0.07, 0.075, V.gold, 0.2), B(7.85, 7.87, 0, ROOM_H, 0.07, 0.075, V.gold, 0.2));
    parts.push(B(-0.4, 8.4, -0.1, -0.02, 0.0, 0.06, V.gold, 0.15));
    for (const x of room.hatches) {
      parts.push(B(x - 0.46, x + 0.46, HATCH_Y - 0.02, HATCH_Y + 0.08, 0.06, 0.1, C.brass), B(x - 0.38, x + 0.38, HATCH_Y - 0.3, HATCH_Y - 0.02, 0.07, 0.095, C.brassDk));
      for (const s of [-1, 1]) parts.push(B(x + s * 0.3 - 0.03, x + s * 0.3 + 0.03, HATCH_Y - 0.06, HATCH_Y + 0.0, 0.095, 0.11, C.brassLt));
      parts.push(B(x - 0.26, x + 0.26, HATCH_Y - 0.2, HATCH_Y - 0.17, 0.095, 0.1, "#5a4318"));
      parts.push(B(x + 0.48, x + 0.62, HATCH_Y + 0.12, HATCH_Y + 0.3, 0.06, 0.1, V.cage), disc(0.05, 0.03, x + 0.55, HATCH_Y + 0.21, 0.1, "#5a1a16", 0, 10));
    }
    return flat(merge(...parts));
  };
  const hatchLamp = (x) => flat(disc(0.055, 0.04, x + 0.55, HATCH_Y + 0.21, 0.115, "#ff3a30", 1, 12));

  // ---- the stages --------------------------------------------------------------------------------------------------
  const makeStage = ({ id, name, names, walls, rooms, door, barrier, front, rim }) => {
    const shells = new WeakMap(), size = cached(() => extentOf(door()));
    const lookRooms = (stage) => {
      if (!stage || stage.kind !== "rooms") throw new TypeError(`raid-art-bank: ${id} dresses a parsed rooms stage`);
      if (stage.rooms.length !== names.length) throw new Error(`raid-art-bank: ${id} dresses ${names.length} rooms; stage ${stage.id} has ${stage.rooms.length}`);
    };
    const roomShell = (stage, i) => {
      lookRooms(stage);
      if (!(Number.isInteger(i) && i >= 0 && i < names.length)) throw new RangeError(`raid-art-bank: ${id} has no room ${i}; its rooms are 0 to ${names.length - 1}`);
      let list = shells.get(stage);
      if (!list) shells.set(stage, (list = []));
      if (list[i]) return list[i];
      checkSpec();
      const room = readRoom(stage, i, names[i], size()), L = { base: [], inlay: [], over: [], decor: [] };
      walls(L, room, i);
      rooms[i](L, room, i);
      if (!room.boss) for (const [x, y, type] of room.targets) {
        if (type === "SENSOR") L.over.push(R(x - 0.3, x + 0.3, y - 0.06, y, DEPTH - 0.25, DEPTH, C.brassDk));
        else L.over.push(...mount(x, y, type, "#1b1712", rim));
      }
      const decor = project(L.decor, LAYER[3]);
      const shell = flat(merge(project(L.base, LAYER[0]), project(L.inlay, LAYER[1]), project(L.over, LAYER[2]), decor));
      const keep = room.keep.map((r) => [projectX(r[0], 1), projectX(r[1], 1), projectY(r[2], 1), projectY(r[3], 1)]);
      const clash = clashes(decor, keep), bars = barrier(room), barClash = clashes(bars, keep);
      if (clash) throw new Error(`raid-art-bank: ${id} room ${i} (${room.name}): ${clash} decor faces overlap a target's box or a door`);
      if (barClash) throw new Error(`raid-art-bank: ${id} room ${i} (${room.name}): ${barClash} barrier faces overlap a target's box or a door`);
      // Every door on the wall; the targets the stage stands in front of a door, listed.
      const [half] = size(), doorOverTargets = [];
      for (const x of room.doors) {
        if (x - half < -1e-6 || x + half > ROOM_W + 1e-6) throw new Error(`raid-art-bank: ${id} room ${i}: the door at x ${x} reaches past the back wall (half width ${half.toFixed(3)} m)`);
        const d = keep[room.targets.length + room.doors.indexOf(x)];
        room.targets.forEach(([tx, ty, type], k) => {
          const r = keep[k];
          if (r[0] < d[1] && r[1] > d[0] && r[2] < d[3] && r[3] > d[2]) doorOverTargets.push({ type, x: tx, y: ty, door: x });
        });
      }
      const g = room.gauge;
      return (list[i] = Object.freeze({
        shell, front: front(room), barrier: bars, door: door(),
        wires: room.wires.map(([x0, x1, h]) => ({ geometry: wireLook(x0, x1, h), x0, x1, h })),
        lamps: room.hatches.map((x) => ({ geometry: hatchLamp(x), door: x, x: x + 0.55, y: HATCH_Y + 0.21 })),
        needle: g ? { geometry: needle(), x: projectX(g.x, 1), y: projectY(g.y, 1) } : null,
        keep, clash, barClash, doorOverTargets, faces: shell.faces.length
      }));
    };
    const boss = (stage) => {
      lookRooms(stage);
      const t = stage.rooms[stage.rooms.length - 1].targets, parts = [];
      for (let k = 0; k < t.length; k += 4) parts.push({ type: lookName(t[k + 2]), x: t[k], y: t[k + 1], attr: t[k + 3] });
      return parts;
    };
    return put("stages", id, { id, name, rooms: names.length, names, roomShell, boss });
  };
  // The twin gauge's needle, about its pivot, pointing up, in the flat room frame (already at the back wall's scale).
  const needle = cached(() => flat(merge(B(-0.012, 0.012, -0.02, 0.12, 0.005, 0.015, "#c8342a", 0.3), disc(0.022, 0.02, 0, 0, 0.012, C.brassLt, 0.2, 10))));
  makeStage({ id: "counting", name: "The Counting House", names: COUNTING, walls: countingWalls, rooms: COUNTING_ROOMS, door: countingDoor, barrier: countingBarrier, front: countingFront, rim: C.brassDk });
  makeStage({ id: "treasury", name: "The Treasury Vaults", names: TREASURY, walls: vaultWalls, rooms: TREASURY_ROOMS, door: treasuryDoor, barrier: treasuryBarrier, front: treasuryFront, rim: V.steelDk });

  // ---- the types ---------------------------------------------------------------------------------------------------
  // Each raw builder wrapped once in a cache that builds it fresh and marks it shadowless: in a room the flat shell
  // stands metres behind what casts, so a shadow lands nowhere true. A turned look mirrors its type's cached build.
  const type = (name, raw) => {
    const [tier, origin] = SPEC[name], looks = { tier, origin, box: Object.freeze(boxOf(name)) };
    for (const key of Object.keys(raw)) {
      const build = raw[key];
      looks[key] = cached(() => { const g = build(); flat(g.geometry || g); return g; });
    }
    put("types", name, looks);
  };
  // Each attacking type's wind-up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): its look with a flare at its
  // muzzle in its tell's colour, for the variant it winds up in (a guard's gun at its shot start, a teller's shut hatch,
  // a die raised and slamming, the counter's and the King's open faces).
  const windOf = (look, x, y, r) => BL.raidModels.windOf(look, x, y, BL.raidModels.FAMILY_OF.GUARD, undefined, r);
  type("GUARD", { build: guard, turned: () => mirrored(ART.types.GUARD.build()),
    wind: () => windOf(ART.types.GUARD.build(), 0, SPEC.GUARD[1]), turnedWind: () => mirrored(ART.types.GUARD.wind()) });
  type("DROP_GUARD", { build: dropGuard, turned: () => mirrored(ART.types.DROP_GUARD.build()),
    wind: () => windOf(ART.types.DROP_GUARD.build(), 0, SPEC.DROP_GUARD[1]), turnedWind: () => mirrored(ART.types.DROP_GUARD.wind()) });
  type("COIN_BARREL", { build: coinBarrel });
  type("BILL_BAT", { build: () => billBat(false), flap: () => billBat(true) });
  type("LEDGER_CORE", { build: ledgerCore });
  type("WALL_TELLER", { build: () => wallTeller(true), shut: () => wallTeller(false), shutWind: () => windOf(ART.types.WALL_TELLER.shut(), 0, 0, 0.1) });
  type("SHUTTER_CORE", { build: () => shutterCore(true), shut: () => shutterCore(false) });
  type("TWIN_CORE", { build: () => twinCore(true), shut: () => twinCore(false) });
  type("SEARCHLIGHT", { build: () => searchlight(true), dark: () => searchlight(false), cone, pool: () => pool(V.cream), poolLocked: () => pool("#ff4a3a") });
  type("PRESS_DIE", { build: () => pressDie(true), shut: () => pressDie(false),
    wind: () => windOf(ART.types.PRESS_DIE.build(), 0, 0, 0.1), shutWind: () => windOf(ART.types.PRESS_DIE.shut(), 0, 0, 0.1) });
  type("MINT_COUNTER", { build: () => mintCounter(true), shut: () => mintCounter(false), digits: () => ({ geometry: digits(), x: DIGITS_AT[0], y: DIGITS_AT[1], z: DIGITS_AT[2] }),
    wind: () => windOf(ART.types.MINT_COUNTER.build(), 0, 0, 0.16) });
  type("PRINT_HEAD", { build: printHead });
  type("PRINTER_KING", { build: () => printerKing(true), shut: () => printerKing(false), wind: () => windOf(ART.types.PRINTER_KING.build(), 0, 0, 0.16) });

  // For the checks: the specs' tiers and origins, and the light pool's half width (the sim's LIGHT_HALF).
  ART.bank = { SPEC, LIGHT_HALF, boxOf, types: Object.keys(SPEC).filter((n) => n !== "SENSOR") };
})();
