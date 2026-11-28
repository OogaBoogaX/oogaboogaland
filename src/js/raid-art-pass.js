// Ooga Raid's art for stage 7, Bifrost Pass: the high pass up to the ₿IFRÖST gate, its frosted granite shelves, violet
// crystal growths and crystal arches, the crystal plank bridges slung on rope over blue-black chasms, the aurora behind
// the peaks and the snow the gale streams. Geometry only: no nodes, no state, nothing per frame (the exceptions are
// `weather(stage).auroraAt` and `.snowAt`, which write a node's fields and allocate nothing, and each `pick`, which reads the
// sim's state and returns a constant name). Every builder is cached once a page. It registers into the shared art
// registry, `BL.raidArt.stages.bifrost` (the stage's spec id, no alias) and `BL.raidArt.types[NAME]`.
//
// `sector(stage, screen)` is one 8 by 7 screen of a side stage in stage metres, cached by the stage object and screen:
//   1. the solid cells cut from the grid four voxels deep: granite with a frost top, rime under it and darker granite
//      deeper; a solid with an open cell anywhere under it in its column (the crystal arches) is violet crystal, glowing;
//   2. the ledges as crystal planks, one a cell, in the back voxel behind the play plane (z -1 to -0.5) like stage 1's,
//      each lashed to two ropes; a run of ledge over a chasm between two solid shelves on its row is a bridge, its ropes
//      running on from post to post across the missing planks, with a hand rope behind; any other run is a perch on a
//      timber trestle down to the ground under it;
//   3. the chasms (columns empty at the bottom row): a blue-black void behind the back voxel, its top notched down to
//      the middle so it never reads as ground;
//   4. the dressing: snow caps, strata and small crystal clusters on the solids' front faces below their top edge,
//      facets on the arches' fronts, boulders, drifts and blunt columnar crystals behind the play band, the ridge road's
//      cut stone and raised Legion barrier on the screen of each REPO_TRUCK record and the one before it, and on the lock
//      screen the bailout banner on the cliff and two landing beacons. Dressing never enters the play band
//      (|z| < PLAY_BAND), nothing behind has a flat lit top, nothing behind over a ledge reaches within LEDGE_CLEAR of
//      its underside, and nothing in the scenery is shaped like an icicle (only the ICICLE enemy is) or like a pickup.
// Gusts are read from the stage's own `gusts` (F9), nested or flat; a stage without them has none, and a record of the
// wrong length throws. Nothing else is read but the grid, the placed records and `lockScreen`.
//
// `backdrop(stage)` (cached by stage) is shaped like `BL.raidModels.backdrop()`: `layers` (far snowy peaks with the
// ₿IFRÖST arch glowing at the end of the pass, rate 0.2; near crags, rate 0.5) slide at their rate (node x
// `camX * (1 - rate)`), `sky` rides with the camera (node x the camera's middle, y camY), and `aurora` is one more layer
// (rate, y, z) whose node the scene keeps to pass to `weather(stage).auroraAt` each frame.
//
// `weather(stage)` (cached by stage) is the moving set: `zones` ({ x0, x1, dir } in metres from `stage.gusts`), `snow`
// (a sheet of dim grey snow streaks behind the play band, two SNOW_PERIOD tiles wide, laid from x 0 and y 0 of the
// screen), `auroraAt(node, time, camX)` (the aurora flares, geometry `aurora.flare` and a pulsing `glow` up to
// `FLARE_GLOW_MAX`, through each
// gust's warning while the view holds a zone; calm otherwise) and `snowAt(node, time, camX, camY)` (the snow sheet shown
// and streaming the zone's way while it blows over the view; hidden otherwise). Both read the phase from
// `BL.raidSim.gustPhase` and the way from `gustDir`.
//
// Types (`BL.raidArt.types`), each with its `tier`, `origin` and `box` (the bullet box about its anchor), checked against
// `BL.raidSim.TIER_OF` and `ORIGIN_OF` at load (a type the sim lacks, or a differing tier or origin, throws):
//   SHARD_THROWER  a Legion trooper in a white parka and snow goggles whirling a sling of ice; `build()` faces -x,
//                  `turned()` +x.
//   ICICLE         a spike of clear crystal hung from its anchor 0.3 m under the arch it grows from: `build()` hanging,
//                  `shiver()` cracked, tilted and glaring, `fall()` broken off; `pick` by `LOOK.ICICLE.shiver`, `.fall`.
//   DROP_CRATE     a bailout-blue supply crate: `build()` rising with its paper chute packed, `chute()` under its
//                  parachute printed RELIEF; `pick` by `LOOK.DROP_CRATE.chute`.
//   MECH           the Bailout Mech, a boxy two-legged walker in bailout blue with a gold seal, its hull filling its
//                  bullet box edge to edge: `build()` with its glass
//                  cockpit open on the Legion official, `shut()` with armoured shutters over it, `step()` and
//                  `shutStep()` mid-stride; `pick` reads SHUT from the slot's flags and strides while its routine is
//                  `LOOK.MECH.walk`. Its hull is its bullet box (the balloon ruling); its legs stand under the hull
//                  inside the armour tier's narrowest touch box less an Ooga's half width at a wall (`touch`,
//                  `LEG_HALF`), so any Ooga touching a leg, in any pose, is inside the touch box; its feet stand on the
//                  floor, below the standing touch box's foot (feet + 0.1), which no Ooga's hit point (0.5 m over its
//                  feet) can reach from that floor. Its chin gun's muzzle stands on the pass legion's
//                  `TUNE.MECH_MUZZLE` and its crate hatch on `TUNE.MECH_HATCH` ([dx, dy] from its x and feet), and
//                  a shoulder clamp behind the play band (z under -PLAY_BAND) under each MECH_POD mount, read from the
//                  pod's def (`BL.raidEnemies.TYPES[ENEMY.MECH_POD].mounts`), where the pods the sim seats on its hull sit.
//   MECH_POD       a crate rack on its own clamp, bailout blue, its lamp lit.
// Stage-7 re-skins of the shared types live in `skins`, not `types`: CLERK in a fur-hooded greatcoat (`turned`), CARRIER
// a crystal kite (`turned`), SENSOR a frosted signal lantern (`shut`, `turned`, `turnedShut`). The routine indices `pick`
// compares against come from `BL.raidLegionPass.LOOK` by type and README state name, read at load; a missing one throws.
// A turned look is mirrored in x with its faces rewound (never a turn about y, so the camera still sees its face). Words
// (RELIEF, BAILOUT) are carved in the island's 3x5 `SIGN_GLYPHS`: a space is a gap, any other missing glyph throws.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, along, forwardLathe, noShadow, beam } = BL.models;
  const { SIGN_GLYPHS } = BL.hubModels;
  const { KIND, CELL, SCREEN_W, SCREEN_H, cellAt } = BL.raidStages;
  const { RULES, POSE, TUNE, GUST, gustPhase, gustDir } = BL.raidSim;
  const { FLAG } = BL.raidEnemies;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-pass: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI;
  const SCREEN_X = SCREEN_W * CELL, VIEW_Y = SCREEN_H * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge fills only the back one, its front at LEDGE_Z. The solids' front
  // dressing lies just proud of their front face, FRONT_Z.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3, LEDGE_CLEAR = 0.3;
  const FRONT_Z = Z1 + 0.004;

  // ---- what the sim says ---------------------------------------------------------------------------------------------
  // Each type's tier and origin (the README's table for the pass's own types, RULES for the shared ones).
  const SPEC = Object.freeze({
    SHARD_THROWER: [0, 0.5], ICICLE: [0, 0], DROP_CRATE: [0, 0.25], MECH: [2, 1.6], MECH_POD: [1, 0],
    CLERK: [0, 0.5], CARRIER: [0, 0], SENSOR: [0, 0.25]
  });
  const boxOf = (name, b = RULES.SHOT_BOX[SPEC[name][0]]) => { const o = SPEC[name][1]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  const specOf = (name) => ({ tier: SPEC[name][0], origin: SPEC[name][1], box: boxOf(name) });
  const checkSpec = () => {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-pass: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-pass: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  };
  checkSpec();
  // The routines a look depends on, by README state name from the pass's legion file.
  const routine = (type, state) => {
    const P = BL.raidLegionPass, v = P && P.LOOK && P.LOOK[type] && P.LOOK[type][state];
    if (!Number.isInteger(v)) throw new Error(`raid-art-pass: BL.raidLegionPass.LOOK.${type}.${state} is not a routine index`);
    return v;
  };
  const ICICLE_SHIVER = routine("ICICLE", "shiver"), ICICLE_FALL = routine("ICICLE", "fall");
  const CRATE_CHUTE = routine("DROP_CRATE", "chute"), MECH_WALK = routine("MECH", "walk");
  // Where the pods ride over the Mech, [dx, dy] from its x and feet by attr: the pod's own def.
  const POD_MOUNTS = (() => {
    const def = BL.raidEnemies.TYPES[BL.raidStages.ENEMY.MECH_POD], m = def && def.mounts;
    if (!m || m.length !== 2 || m.some((a) => !a || a.length !== 2)) throw new Error("raid-art-pass: MECH_POD's def has no two mounts [dx, dy] in raid-enemies");
    return Object.freeze(m.map((a) => Object.freeze([a[0], a[1]])));
  })();
  // Where the Mech's chin gun fires from and its crate hatch opens, [dx, dy] from its x and feet: the pass legion's TUNE.
  const offsetOf = (key) => {
    const T = BL.raidLegionPass && BL.raidLegionPass.TUNE, at = T && T[key];
    if (!at || at.length !== 2 || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) throw new Error(`raid-art-pass: BL.raidLegionPass.TUNE.${key} is not an [dx, dy] offset`);
    return at;
  };
  const [MUZZLE_X, MUZZLE_Y] = offsetOf("MECH_MUZZLE"), [HATCH_X] = offsetOf("MECH_HATCH");
  // The Mech strides a pose every MECH_STRIDE metres it walks; its legs keep LEG_HALF of its middle: the armour touch
  // box's narrowest half width (its standing one; its prone one is wider still) less an Ooga's half width at a wall
  // (RULES.BOX, which walls meet in every pose), so an Ooga's body on a leg puts its hit point in the touch box.
  const MECH_STRIDE = 0.35;
  const MECH_TOUCH = boxOf("MECH", RULES.BOXES[RULES.TIER.ARMOUR][POSE.STAND]);
  const LEG_HALF = MECH_TOUCH[1] - RULES.BOX[POSE.STAND][0];

  // ---- palette -------------------------------------------------------------------------------------------------------
  const FROST = "#eef4fa", FROST_DK = "#d3dee9", SNOW_SH = "#c3cfde";
  const GRANITE = "#8c919b", GRANITE_DK = "#757a85", GRANITE_DEEP = "#5f6571", GRANITE_LT = "#a3a8b1", CRACK = "#4c515c";
  const CRYSTAL = "#9a78e4", CRYSTAL_LT = "#c6b0ff", CRYSTAL_DK = "#6a4db6", CRYSTAL_GLOW = "#ece3ff", CLEAR = "#dcf2ff";
  const ROPE = "#a8875a", ROPE_DK = "#7b6142", TIMBER = "#6e5638", TIMBER_DK = "#4f3d28";
  const CHASM = ["#060914", "#0b1428", "#132040", "#1d2c4f"];
  const STONE = "#a7a49d", STONE_DK = "#8d8a83", JOINT = "#5d5a55";
  const BAIL = "#2f6fd1", BAIL_DK = "#1d4a96", BAIL_LT = "#5b93ea", GOLD = "#e2b13c", GOLD_LT = "#f7d36a";
  const STEEL = "#8d969e", STEEL_DK = "#2b3346", STEEL_LT = "#b9c1c8", RED = "#c0352b", PAPER = "#f4f1e8";
  const SKIN = "#e0a982", SKIN_DK = "#c48c64", EYE = "#1d1d20", SHOE = "#1c1c1f", FUR = "#d6c6a6", FUR_DK = "#b29f7c";

  // ---- small builders ------------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel, emissive = 0) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z: one face.
  const fpoly = (points, z, color, emissive = 0) => {
    const g = { verts: [], faces: [], lines: [] }, ids = [];
    for (let k = 0; k < points.length; k++) { g.verts.push(points[k][0], points[k][1], z); ids.push(k); }
    g.faces.push({ i: ids, color: hexToRgb(color), emissive });
    return g;
  };
  const rect = (x0, x1, y0, y1, z, color, emissive = 0) => fpoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z, color, emissive);
  const ngon = (cx, cy, rx, ry, z, color, emissive = 0, n = 10, rot = 0) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = rot + k / n * PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return fpoly(pts, z, color, emissive);
  };
  // A flat strip `w` wide from a to b, facing the camera.
  const strip = (ax, ay, bx, by, w, z, color, emissive = 0) => {
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * w / 2, ny = (bx - ax) / l * w / 2;
    return fpoly([[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]], z, color, emissive);
  };
  // A round bar from a to b, radius r.
  const rod = (ax, ay, az, bx, by, bz, r, color, emissive = 0, segments = 8) => {
    const l = Math.hypot(bx - ax, by - ay, bz - az);
    return along(lathe({ profile: [[0, 0], [r, 0], [r, l], [0, l]], segments, color, emissive }), ax, ay, az, bx - ax, by - ay, bz - az);
  };
  // A disc of radius r and thickness t facing the camera, centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  // A faceted crystal: a hexagonal prism `r` across with a short pointed cap, `h` tall from its foot at (0, 0, 0).
  const shard = (r, h, color, emissive, cap = 0.3) => lathe({ profile: [[0, 0], [r, 0], [r, h * (1 - cap)], [r * 0.35, h * 0.97], [0, h]], segments: 6, color, emissive });
  // Turns parts about z round a pivot: a positive angle leans their top toward -x.
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
  const scaled = (geo, sx, sy, sz) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] *= sx; v[i + 1] *= sy; v[i + 2] *= sz; }
    return geo;
  };
  // The pass's figures turn PASS_YAW toward the camera (a positive yaw swings a -x front toward +z).
  const toCamera = (parts, yaw) => turnedY(merge(...parts), yaw);
  // The same look facing the other way: mirrored in x with every face rewound, so it still shows the camera its face.
  const mirrored = (geo) => {
    const out = { verts: Array.from(geo.verts), faces: geo.faces.map((f) => ({ ...f, i: f.i.slice().reverse() })), lines: geo.lines.map((l) => ({ ...l, i: l.i.slice() })) };
    for (let i = 0; i < out.verts.length; i += 3) out.verts[i] = -out.verts[i];
    if (geo.castShadow === false) out.castShadow = false;
    return out;
  };
  // A pixel picture (rows of "#" and ".", top row first) as runs of flat quads `cell` square, its middle at (x, y).
  const pix = (rows, cell, x, y, z, color, emissive = 0) => {
    const parts = [], w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w;) {
        if (rows[r][c] !== "#") { c++; continue; }
        let e = c;
        while (e < w && rows[r][e] === "#") e++;
        const x0 = x + (c - w / 2) * cell, y1 = y + (h / 2 - r) * cell;
        parts.push(rect(x0, x0 + (e - c) * cell, y1 - cell, y1, z, color, emissive));
        c = e;
      }
    }
    return parts;
  };
  // A word in the island's carved 3x5 alphabet, centred at (x, y): a space is a gap, any other missing glyph throws.
  const word = (text, cell, x, y, z, color, emissive = 0) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = text[i] === " " ? ["000", "000", "000", "000", "000"] : SIGN_GLYPHS[text[i]];
      if (!glyph) throw new Error(`raid-art-pass: the sign alphabet has no "${text[i]}"`);
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + glyph[r].replace(/1/g, "#").replace(/0/g, ".");
    }
    return pix(rows, cell, x, y, z, color, emissive);
  };
  // A Legion seal: a gold ring round a blue field and a gold star.
  const seal = (cx, cy, r, z, emissive = 0.2) => {
    const star = [];
    for (let k = 0; k < 10; k++) { const a = PI / 2 + k * PI / 5, rr = k & 1 ? r * 0.26 : r * 0.62; star.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    const parts = [ngon(cx, cy, r, r, z, GOLD, emissive, 16), ngon(cx, cy, r * 0.8, r * 0.8, z + 0.002, BAIL_DK, 0, 16)];
    for (let k = 0; k < 5; k++) parts.push(fpoly([[cx, cy], star[(2 * k + 9) % 10], star[2 * k], star[2 * k + 1]], z + 0.004, GOLD_LT, emissive + 0.2));
    return parts;
  };

  // ---- reading the stage ---------------------------------------------------------------------------------------------
  // Records from the stage, nested or flat; a missing field means none, a record of the wrong length throws.
  const records = (stage, key, stride) => {
    const src = stage[key], out = [];
    if (src === undefined) return out;
    if (src.length && typeof src[0] === "number") {
      if (src.length % stride) throw new Error(`raid-art-pass: ${stage.id}.${key} is not records of ${stride}`);
      for (let i = 0; i < src.length; i += stride) out.push(Array.from(src.subarray ? src.subarray(i, i + stride) : src.slice(i, i + stride)));
    } else for (const r of src) {
      if (r.length !== stride) throw new Error(`raid-art-pass: ${stage.id}.${key} has a record of ${r.length}, not ${stride}`);
      out.push(Array.from(r));
    }
    return out;
  };
  // What the art reads off a side stage once: each column's grounded height (solid cells from row 0, in rows), the
  // chasms, the bridges and perches, the gust zones, the road and the cliff.
  const plans = new WeakMap();
  const planOf = (stage) => {
    let plan = plans.get(stage);
    if (plan) return plan;
    if (stage.kind !== "side") throw new Error(`raid-art-pass: ${stage.id} is not a side stage`);
    const cols = stage.cols, rows = stage.rows, ground = new Int16Array(cols);
    for (let c = 0; c < cols; c++) { let r = 0; while (r < rows && cellAt(stage, c, r) === KIND.SOLID) r++; ground[c] = r; }
    const pit = (c) => c >= 0 && c < cols && cellAt(stage, c, 0) === KIND.EMPTY;
    // Chasms: runs of pit columns with the grounded height of the shelf either side.
    const pits = [];
    for (let c = 0; c < cols;) {
      if (!pit(c)) { c++; continue; }
      let e = c;
      while (pit(e + 1)) e++;
      pits.push({ c0: c, c1: e, hl: c > 0 ? ground[c - 1] * CELL : 0, hr: e + 1 < cols ? ground[e + 1] * CELL : 0 });
      c = e + 1;
    }
    // Bridges: a row's run of ledge and empty cells over pit columns held between two solid cells on that row.
    const spans = [], inSpan = new Set();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cellAt(stage, c, r) !== KIND.LEDGE || !pit(c) || inSpan.has(r * cols + c)) continue;
      const open = (k) => (cellAt(stage, k, r) === KIND.LEDGE || cellAt(stage, k, r) === KIND.EMPTY) && pit(k);
      let a = c, b = c;
      while (a - 1 >= 0 && open(a - 1)) a--;
      while (b + 1 < cols && open(b + 1)) b++;
      if (cellAt(stage, a - 1, r) !== KIND.SOLID || cellAt(stage, b + 1, r) !== KIND.SOLID || a - 1 < 0 || b + 1 >= cols) continue;
      const top = (k) => { let rr = r; while (rr + 1 < rows && cellAt(stage, k, rr + 1) === KIND.SOLID) rr++; return (rr + 1) * CELL; };
      spans.push({ row: r, c0: a, c1: b, topL: top(a - 1), topR: top(b + 1) });
      for (let k = a; k <= b; k++) inSpan.add(r * cols + k);
    }
    // Perches: every other run of ledge, with the ground under each end for its trestle (null over a pit).
    const perches = [];
    const under = (c, r) => { for (let rr = r - 1; rr >= 0; rr--) if (cellAt(stage, c, rr) !== KIND.EMPTY) return (rr + 1) * CELL; return null; };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols;) {
      if (cellAt(stage, c, r) !== KIND.LEDGE || inSpan.has(r * cols + c)) { c++; continue; }
      let e = c;
      while (e + 1 < cols && cellAt(stage, e + 1, r) === KIND.LEDGE && !inSpan.has(r * cols + e + 1)) e++;
      perches.push({ row: r, c0: c, c1: e, groundL: under(c, r), groundR: under(e, r) });
      c = e + 1;
    }
    // Gust zones in metres; the road: the screen of each REPO_TRUCK record and the one before it; the truck columns.
    const zones = records(stage, "gusts", 3).map(([from, to, dir]) => Object.freeze({ x0: from * CELL, x1: (to + 1) * CELL, dir }));
    const truck = BL.raidStages.ENEMY.REPO_TRUCK, road = new Uint8Array(stage.screens), trucks = [];
    for (let i = 0; i < stage.placed.length; i += 4) {
      if (stage.placed[i + 2] !== truck) continue;
      const s = Math.floor(stage.placed[i] / SCREEN_W);
      road[s] = 1; if (s > 0) road[s - 1] = 1;
      trucks.push(stage.placed[i]);
    }
    plan = { ground, pit, pits, spans, perches, zones, road, trucks, inSpan };
    plans.set(stage, plan);
    return plan;
  };

  // ---- the solid cells -----------------------------------------------------------------------------------------------
  const V = { FROST: 1, RIME: 2, GRANITE: 3, GRANITE_DK: 4, DEEP: 5, CRYSTAL_TOP: 6, CRYSTAL: 7, CRYSTAL_DK: 8, STONE: 9, STONE_DK: 10 };
  const PALETTE = [null, FROST, "#c4ced9", GRANITE, GRANITE_DK, GRANITE_DEEP, CRYSTAL_LT, CRYSTAL, CRYSTAL_DK, STONE, STONE_DK].map((c) => c && hexToRgb(c));
  const GLOWS = new Map([[PALETTE[V.CRYSTAL_TOP], 0.4], [PALETTE[V.CRYSTAL], 0.28], [PALETTE[V.CRYSTAL_DK], 0.16]]);
  // How deep a solid lies under the open air over it, in cells (0 its top cell), to 3.
  const depthOf = (stage, c, r) => { let d = 0; while (d < 3 && cellAt(stage, c, r + d + 1) === KIND.SOLID) d++; return d; };
  const solidGeometry = (stage, plan, screen) => {
    const grid = terrain.makeGrid(SCREEN_W, stage.rows, DEPTH);
    let any = false;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c;
      for (let r = 0; r < stage.rows; r++) {
        if (cellAt(stage, col, r) !== KIND.SOLID) continue;
        any = true;
        const d = depthOf(stage, col, r), odd = (col * 7 + r * 3) % 5 === 0;
        let v;
        if (r >= plan.ground[col]) v = d === 0 ? V.CRYSTAL_TOP : odd ? V.CRYSTAL_DK : V.CRYSTAL;
        else if (plan.road[screen]) v = d === 0 ? V.STONE : d === 1 ? V.STONE_DK : odd ? V.DEEP : V.GRANITE_DK;
        else v = d === 0 ? V.FROST : d === 1 ? V.RIME : odd ? V.DEEP : d === 2 ? V.GRANITE : V.GRANITE_DK;
        for (let z = 0; z < DEPTH; z++) grid.set(c, r, z, v);
      }
    }
    if (!any) return null;
    const geo = terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: screen * SCREEN_X, y: 0, z: Z0 } });
    geo.voxel[1] = 0;   // block joints line up across the sectors
    for (const f of geo.faces) { const g = GLOWS.get(f.color); if (g) f.emissive = g; }
    return geo;
  };
  // The solids' fronts, all on FRONT_Z and below each top edge: snow caps scalloped over the frost, strata, cracks and
  // small crystal clusters on the granite, facets on the arches, the road's cut-stone joints.
  const solidFronts = (stage, plan, screen, flats, rand) => {
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, x0 = col * CELL, x1 = x0 + CELL, xm = x0 + CELL * (0.35 + rand() * 0.3);
      for (let r = 0; r < stage.rows; r++) {
        if (cellAt(stage, col, r) !== KIND.SOLID) continue;
        const d = depthOf(stage, col, r), y0 = r * CELL, top = y0 + CELL, arch = r >= plan.ground[col];
        if (arch) {
          // A crystal block's facets: a lit rhombus and two dark seams.
          flats.push(fpoly([[x0 + 0.25, y0 + 0.06], [x1 - 0.06, y0 + 0.25], [x0 + 0.25, top - 0.06], [x0 + 0.06, y0 + 0.25]], FRONT_Z, (col + r) & 1 ? CRYSTAL_GLOW : CRYSTAL_LT, 0.45));
          flats.push(strip(x0 + 0.02, top - 0.12, x0 + 0.18, y0 + 0.04, 0.012, FRONT_Z + 0.002, CRYSTAL_DK), strip(x1 - 0.02, top - 0.2, x1 - 0.2, top - 0.02, 0.012, FRONT_Z + 0.002, CRYSTAL_DK));
          if (d === 0) flats.push(fpoly([[x0, top - 0.05], [xm, top - 0.08], [x1, top - 0.05], [x1, top], [x0, top]], FRONT_Z + 0.004, FROST));
          continue;
        }
        if (d === 0) {
          if (plan.road[screen]) {
            flats.push(rect(x0, x1, top - 0.03, top, FRONT_Z, STONE_DK), rect(x0, x0 + 0.012, y0, top, FRONT_Z + 0.002, JOINT));
          } else {
            flats.push(fpoly([[x0, top - 0.06], [xm, top - 0.11], [x1, top - 0.07], [x1, top], [x0, top]], FRONT_Z, FROST));
            flats.push(fpoly([[x0, top - 0.06], [xm, top - 0.11], [xm, top - 0.09], [x0, top - 0.045]], FRONT_Z + 0.002, SNOW_SH));
          }
          continue;
        }
        if (plan.road[screen] && d === 1) {
          const off = (r & 1) ? 0.25 : 0;
          flats.push(rect(x0, x1, top - 0.012, top, FRONT_Z, JOINT), rect(x0 + off, x0 + off + 0.012, y0, top, FRONT_Z + 0.002, JOINT));
          continue;
        }
        // Granite: a stratum now and then, a crack, a crystal cluster (only a metre or more under the top edge).
        if (rand() < 0.35) flats.push(rect(x0, x1, y0 + 0.18 + rand() * 0.14, y0 + 0.2 + rand() * 0.14 + 0.012, FRONT_Z, (r & 1) ? GRANITE_LT : GRANITE_DEEP));
        if (rand() < 0.22) { const cx = x0 + 0.1 + rand() * 0.3, cy = y0 + 0.1 + rand() * 0.3; flats.push(strip(cx, cy, cx + 0.08, cy - 0.09, 0.014, FRONT_Z + 0.002, CRACK), strip(cx + 0.08, cy - 0.09, cx + 0.05, cy - 0.17, 0.012, FRONT_Z + 0.002, CRACK)); }
        if (d >= 2 && rand() < 0.12) {
          const cx = x0 + 0.15 + rand() * 0.2, cy = y0 + 0.12;
          for (const [dx, h, a] of [[-0.05, 0.13, 0.35], [0, 0.2, 0], [0.05, 0.11, -0.4]]) flats.push(about(fpoly([[cx + dx - 0.025, cy], [cx + dx + 0.025, cy], [cx + dx + 0.025, cy + h * 0.75], [cx + dx, cy + h], [cx + dx - 0.025, cy + h * 0.75]], FRONT_Z + 0.003, a ? CRYSTAL : CRYSTAL_LT, 0.45), cx + dx, cy, a));
        }
      }
    }
  };

  // ---- the ledges: crystal planks, bridges and perches -----------------------------------------------------------------
  // One plank a ledge cell, in the back voxel, its glowing walk edge flush with the cell's top, lashed at both ends.
  const plank = (flats, col, row) => {
    const x0 = col * CELL, x1 = x0 + CELL, top = (row + 1) * CELL;
    flats.push(BB(x0 + 0.025, x1 - 0.025, top - 0.075, top, Z0 + 0.02, LEDGE_Z, (col & 1) ? "#b39cf8" : "#a68cf2", 0.012, 0.32));
    flats.push(rect(x0 + 0.03, x1 - 0.03, top - 0.022, top - 0.002, LEDGE_Z + 0.002, CRYSTAL_GLOW, 0.8));
    flats.push(fpoly([[x0 + 0.12, top - 0.07], [x0 + 0.2, top - 0.07], [x0 + 0.14, top - 0.03]], LEDGE_Z + 0.003, CRYSTAL_DK, 0.2));
    for (const x of [x0 + 0.07, x1 - 0.07]) flats.push(B(x - 0.014, x + 0.014, top - 0.095, top + 0.002, Z0 + 0.01, LEDGE_Z + 0.008, ROPE));
  };
  // A rope from a to b as short square segments, keeping the ones whose middle lies in [sx0, sx1).
  const rope = (flats, pts, w, z, color, sx0, sx1) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], mx = (ax + bx) / 2;
      if (mx < sx0 || mx >= sx1) continue;
      flats.push(beam(ax, ay, z, bx, by, z, w, color));
    }
  };
  const sag = (ax, ay, bx, by, s, n) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * PI) * s]; });
  const ledgeGeometry = (stage, plan, screen) => {
    const flats = [], sx0 = screen * SCREEN_X, sx1 = sx0 + SCREEN_X;
    for (let r = 0; r < stage.rows; r++) for (let c = screen * SCREEN_W; c < (screen + 1) * SCREEN_W; c++) if (cellAt(stage, c, r) === KIND.LEDGE) plank(flats, c, r);
    // Bridges: two under-ropes and a hand rope from post to post, suspenders down to the deck, the posts on the shelves.
    for (const s of plan.spans) {
      const top = (s.row + 1) * CELL, xa = s.c0 * CELL - 0.25, xb = (s.c1 + 1) * CELL + 0.25;
      if (xb < sx0 - 1 || xa > sx1 + 1) continue;
      const n = Math.max(2, Math.ceil((xb - xa) / 0.25));
      for (const z of [-0.88, -0.6]) rope(flats, sag(xa, top - 0.09, xb, top - 0.09, 0, n), 0.026, z, ROPE_DK, sx0, sx1);
      const hand = sag(xa, s.topL + 0.72, xb, s.topR + 0.72, Math.min(0.32, (xb - xa) * 0.04), n);
      rope(flats, hand, 0.024, -0.96, ROPE, sx0, sx1);
      for (let k = 2; k < hand.length - 2; k += 2) if (hand[k][0] >= sx0 && hand[k][0] < sx1) flats.push(beam(hand[k][0], hand[k][1], -0.95, hand[k][0], top - 0.07, -0.95, 0.012, ROPE));
      for (const [x, base] of [[xa, s.topL], [xb, s.topR]]) {
        if (x < sx0 || x >= sx1) continue;
        flats.push(BB(x - 0.06, x + 0.06, base, base + 0.74, -1.02, -0.9, GRANITE_DK, 0.015), B(x - 0.07, x + 0.07, base + 0.6, base + 0.66, -1.04, -0.88, ROPE));
        flats.push(moved(lathe({ profile: [[0, 0], [0.055, 0.04], [0.04, 0.09], [0, 0.11]], segments: 6, color: CRYSTAL_LT, emissive: 0.5 }), x, base + 0.74, -0.96));
      }
    }
    // Perches: a timber trestle at each end down to the ground (none over a pit), lashed under the planks.
    for (const p of plan.perches) {
      const top = (p.row + 1) * CELL, under = top - 0.075, ends = [[p.c0 * CELL + 0.14, p.groundL, -1], [(p.c1 + 1) * CELL - 0.14, p.groundR, 1]];
      for (const [x, ground, side] of ends) {
        if (ground === null || x < sx0 || x >= sx1) continue;
        const foot = x + side * Math.min(0.14, (under - ground) * 0.08);
        flats.push(beam(x, under, -0.86, foot, ground, -0.86, 0.06, TIMBER), beam(x, under, -0.64, foot, ground, -0.64, 0.06, TIMBER_DK));
        flats.push(B(x - 0.04, x + 0.04, under - 0.08, under - 0.02, -0.9, -0.6, ROPE));
      }
      const xa = p.c0 * CELL + 0.02, xb = (p.c1 + 1) * CELL - 0.02;
      for (const z of [-0.88, -0.6]) rope(flats, sag(xa, top - 0.09, xb, top - 0.09, 0, Math.ceil((xb - xa) / 0.25)), 0.026, z, ROPE_DK, sx0, sx1);
    }
    return flats.length ? merge(...flats) : null;
  };

  // ---- the chasms ------------------------------------------------------------------------------------------------------
  // A blue-black void behind the back voxel in each pit column: four bands, lighter toward its top, which dips from 0.6
  // under either shelf's top to 1.5 under the lower one at the middle, so it never reads as ground; faint glints far down.
  // It never dips below VOID_FLOOR (the backdrop's highest ground, the crags' ridge top CRAG_TOP, plus VOID_MARGIN) nor
  // past VOID_UNDER under the lower shelf, whichever is lower, so no crag or mist reads as a floor under a fatal gap.
  // The crags' ridge is RIDGE_BASE plus three waves of RIDGE_AMP.
  const CHASM_Z = Z0 - 0.06, RIDGE_BASE = 1.1, RIDGE_AMP = Object.freeze([0.45, 0.3, 0.15]);
  const CRAG_TOP = RIDGE_BASE + RIDGE_AMP[0] + RIDGE_AMP[1] + RIDGE_AMP[2], VOID_MARGIN = 0.15, VOID_UNDER = 0.15, VOID_FLOOR = CRAG_TOP + VOID_MARGIN;
  const chasmGeometry = (stage, plan, screen, rand) => {
    const flats = [], sx0 = screen * SCREEN_X, sx1 = sx0 + SCREEN_X;
    for (const p of plan.pits) {
      const xa = p.c0 * CELL, xb = (p.c1 + 1) * CELL, mid = (xa + xb) / 2, low = Math.min(p.hl, p.hr) - 1.5;
      const floor = Math.min(Math.min(p.hl, p.hr) - VOID_UNDER, VOID_FLOOR);
      const topAt = (x) => Math.max(floor, x <= mid ? p.hl - 0.6 + (low - p.hl + 0.6) * (x - xa) / (mid - xa || 1) : low + (p.hr - 0.6 - low) * (x - mid) / (xb - mid || 1));
      for (let x = Math.max(xa, sx0); x < Math.min(xb, sx1) - 1e-6; x += CELL / 2) {
        const xe = x + CELL / 2, ta = topAt(x), tb = topAt(xe), bot = -1;
        for (let k = 0; k < 4; k++) {
          const fa = bot + (ta - bot) * k / 4, fb = bot + (ta - bot) * (k + 1) / 4, ga = bot + (tb - bot) * k / 4, gb = bot + (tb - bot) * (k + 1) / 4;
          flats.push(fpoly([[x, fa], [xe, ga], [xe, gb], [x, fb]], CHASM_Z, CHASM[k]));
        }
        if (rand() < 0.3) { const gx = x + rand() * 0.25, gy = bot + 0.3 + rand() * Math.max(0.2, (Math.min(ta, tb) - bot) * 0.45); flats.push(fpoly([[gx - 0.02, gy], [gx, gy - 0.03], [gx + 0.02, gy], [gx, gy + 0.03]], CHASM_Z + 0.002, CRYSTAL_DK, 0.6)); }
      }
    }
    return flats.length ? noShadow(merge(...flats)) : null;
  };

  // ---- the dressing behind -------------------------------------------------------------------------------------------
  // The grounded surface under x (in metres), or null over a pit; and how tall a piece standing there may reach before it
  // comes within LEDGE_CLEAR of a ledge or an arch over it.
  const surface = (stage, plan, x) => { const c = Math.floor(x / CELL); return c < 0 || c >= stage.cols || plan.pit(c) ? null : plan.ground[c] * CELL; };
  const headroom = (stage, plan, x, base) => {
    const c = Math.floor(x / CELL);
    for (let r = plan.ground[c]; r < stage.rows; r++) if (cellAt(stage, c, r) !== KIND.EMPTY) return r * CELL - LEDGE_CLEAR - base;
    return Infinity;
  };
  const boulder = (flats, x, y, z, r, rand) => {
    flats.push(ngon(x, y + r * 0.45, r, r * 0.7, z, rand() < 0.5 ? GRANITE_DK : GRANITE, 0, 7, rand()));
    flats.push(ngon(x - r * 0.2, y + r * 0.75, r * 0.55, r * 0.3, z + 0.004, FROST_DK, 0, 7));
    flats.push(ngon(x + r * 0.15, y + r * 0.08, r * 1.15, r * 0.2, z + 0.006, FROST, 0, 9));
  };
  // A cluster of blunt columnar crystals rising out of a drift, leaning apart, dim and set well back so they read as
  // scenery, never as spikes on the walk line.
  const crystals = (flats, x, y, z, h, rand) => {
    const n = 3 + (rand() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const hk = h * (0.45 + rand() * 0.55), lean = (k - (n - 1) / 2) * 0.22 + (rand() - 0.5) * 0.1, r = 0.06 + rand() * 0.05;
      const tone = rand() < 0.3 ? "#9c8ccf" : rand() < 0.5 ? "#5e4f93" : "#7a67b8";
      flats.push(moved(turnedZ(shard(r, hk, tone, 0.12, 0.12), lean), x + (k - n / 2) * 0.07, y - 0.03, z + (rand() - 0.5) * 0.2));
    }
    flats.push(ngon(x, y + 0.02, 0.22 + h * 0.1, 0.06, z + 0.16, FROST, 0, 9));
  };
  // The barrier's post and raised boom reach BOOM_REACH over the road, the boom's tip BOOM_BACK behind the post; a beacon
  // BEACON_REACH. Each must stand clear of LEDGE_CLEAR under any ledge or arch over it, or the build throws.
  const BARRIER_IN = 1.5, BOOM_REACH = 0.78 + Math.sin(1.2) * 2.0, BOOM_BACK = Math.cos(1.2) * 2.0, BEACON_REACH = 1.49;
  const fits = (stage, plan, x, base, reach, what) => {
    if (headroom(stage, plan, x, base) < reach) throw new Error(`raid-art-pass: ${stage.id}'s ${what} at x ${x.toFixed(2)} reaches within LEDGE_CLEAR of a ledge or arch over it`);
  };
  const dressingGeometry = (stage, plan, screen, rand) => {
    const flats = [], sx0 = screen * SCREEN_X;
    solidFronts(stage, plan, screen, flats, rand);
    // Boulders and drifts near the play band, crystals further back.
    for (let x = sx0 + 0.2 + rand() * 0.5; x < sx0 + SCREEN_X - 0.2; x += 0.7 + rand() * 0.9) {
      const y = surface(stage, plan, x), y2 = surface(stage, plan, x + 0.25), y1 = surface(stage, plan, x - 0.25);
      if (y === null || y1 === null || y2 === null) continue;
      const base = Math.min(y, y1, y2), room = Math.min(headroom(stage, plan, x, base), headroom(stage, plan, x - 0.25, base), headroom(stage, plan, x + 0.25, base));
      if (rand() < 0.55) {
        const h = Math.min(0.35 + rand() * 0.6, room);
        if (h >= 0.3) crystals(flats, x, base, -2.2 - rand() * 1.0, h, rand);
      } else {
        const r = Math.min(0.14 + rand() * 0.18, room / 1.2);
        if (r >= 0.1) boulder(flats, x, base, -1.25 - rand() * 0.6, r, rand);
      }
    }
    // The ridge road: a raised Legion boom barrier, set back, BARRIER_IN short of each truck's column.
    for (const col of plan.trucks) {
      const x = col * CELL - BARRIER_IN;
      if (x < sx0 + 0.2 || x >= sx0 + SCREEN_X - 0.2) continue;
      const y = surface(stage, plan, x);
      if (y === null) continue;
      fits(stage, plan, x, y, BOOM_REACH, "barrier"); fits(stage, plan, x - BOOM_BACK, y, BOOM_REACH, "barrier's boom");
      flats.push(BB(x - 0.09, x + 0.09, y, y + 0.82, -1.62, -1.44, STEEL_DK, 0.02), fpoly([[x - 0.1, y + 0.82], [x + 0.1, y + 0.82], [x, y + 0.92]], -1.43, STEEL_DK));
      flats.push(...seal(x, y + 0.55, 0.07, -1.435, 0.25));
      for (let k = 0; k < 6; k++) { const a = 1.2, t0 = 0.08 + k * 0.32, t1 = t0 + 0.32; flats.push(strip(x - Math.cos(a) * t0, y + 0.78 + Math.sin(a) * t0, x - Math.cos(a) * t1, y + 0.78 + Math.sin(a) * t1, 0.07, -1.5, k & 1 ? PAPER : RED)); }
    }
    // The lock screen: the bailout banner on the cliff and two landing beacons on the floor before it.
    if (screen === stage.lockScreen) {
      let c0 = -1, c1 = -1;
      for (let c = screen * SCREEN_W; c < (screen + 1) * SCREEN_W; c++) if (cellAt(stage, c, stage.rows - 1) === KIND.SOLID) { if (c0 < 0) c0 = c; c1 = c; }
      if (c0 >= 0) {
        const x0 = c0 * CELL + 0.06, x1 = (c1 + 1) * CELL - 0.06, xm = (x0 + x1) / 2, bTop = VIEW_Y - 0.9, bBot = bTop - 2.2, z = FRONT_Z + 0.003;
        flats.push(rect(x0 - 0.04, x1 + 0.04, bTop, bTop + 0.06, z, STEEL_DK), fpoly([[x0, bBot + 0.25], [xm, bBot], [x1, bBot + 0.25], [x1, bTop], [x0, bTop]], z + 0.002, BAIL));
        flats.push(rect(x0 + 0.05, x1 - 0.05, bTop - 0.12, bTop - 0.08, z + 0.004, GOLD, 0.2), ...seal(xm, bTop - 0.75, Math.min(0.32, (x1 - x0) * 0.36), z + 0.004));
        flats.push(...word("AID", 0.05, xm, bTop - 1.45, z + 0.004, GOLD_LT, 0.3));
        for (const dx of [-1.4, -3.2]) {
          const x = x0 + dx, y = surface(stage, plan, x);
          if (y === null) continue;
          fits(stage, plan, x, y, BEACON_REACH, "landing beacon");
          flats.push(B(x - 0.03, x + 0.03, y, y + 1.25, -1.62, -1.56, STEEL_DK), BB(x - 0.07, x + 0.07, y + 1.25, y + 1.38, -1.66, -1.52, STEEL, 0.02));
          flats.push(moved(lathe({ profile: [[0, 0], [0.06, 0], [0.04, 0.08], [0, 0.11]], segments: 8, color: RED, emissive: 1 }), x, y + 1.38, -1.59));
        }
      }
    }
    return flats.length ? noShadow(merge(...flats)) : null;
  };

  // One screen's geometries, cached by stage object and screen.
  const sectorCache = new WeakMap();
  const sector = (stage, screen) => {
    let byScreen = sectorCache.get(stage);
    if (!byScreen) sectorCache.set(stage, byScreen = new Map());
    let list = byScreen.get(screen);
    if (list) return list;
    if (!(screen >= 0 && screen < stage.screens)) throw new RangeError(`raid-art-pass: ${stage.id} has no screen ${screen}; its screens are 0 to ${stage.screens - 1}`);
    const plan = planOf(stage), rand = mulberry32(fnv1a(`pass:${stage.id}:${screen}`));
    list = [solidGeometry(stage, plan, screen), ledgeGeometry(stage, plan, screen), chasmGeometry(stage, plan, screen, rand), dressingGeometry(stage, plan, screen, rand)].filter(Boolean);
    byScreen.set(screen, list);
    return list;
  };
  const byStage = (build) => {
    const cache = new WeakMap();
    return (stage) => { let v = cache.get(stage); if (!v) cache.set(stage, v = build(stage)); return v; };
  };

  // ---- the backdrop --------------------------------------------------------------------------------------------------
  // Flat painted cut-outs laid over the stage's scroll to its lock screen times each layer's rate, with margins. Nearer
  // than stage 1's, so the scene's pale fog (from 12 m off the eye) leaves the night sky and the aurora their colour.
  const FLARE_EMISSIVE = 0.85, FLARE_PULSE = 0.15;
  const SKY_Z = -16, AURORA_Z = -15.4, PEAKS_Z = -14, CRAGS_Z = -9, AURORA_RATE = 0.08, PEAKS_RATE = 0.2, CRAGS_RATE = 0.5;
  const mix = (a, b, t) => { const p = hexToRgb(a), q = hexToRgb(b); return "#" + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  // An aurora: wavy curtains, green at their foot to magenta at their top, the calm one's top fading toward the night
  // sky, deep enough that a pale ice or violet shard lob stands out against them in lightness and hue; the flare taller
  // and brighter, saturated green and magenta at FLARE_EMISSIVE. A curtain's height runs smoothly along it, so its top
  // edge never steps from one strip to the next.
  const aurora = (run, flare) => {
    const parts = [], from = -12, to = run * AURORA_RATE + SCREEN_X + 12;
    const tones = flare ? ["#0c7e44", "#0a7040", "#94186f", "#a01a74"] : ["#1a6e5a", "#165e52", "#6a2c60", "#56305e"];
    for (const [base, height, phase] of [[5.0, 0.8, 0], [5.6, 0.6, 2.1], [4.6, 0.5, 4.2]]) {
      const h = flare ? height * 1.7 : height;
      const wave = (t) => base + 0.35 * Math.sin(t * 0.55 + phase) + 0.18 * Math.sin(t * 1.7 + phase * 2);
      const lift = (t) => 0.6 + 0.28 * Math.sin(t * 0.9 + phase) + 0.12 * Math.sin(t * 2.3 + phase * 1.7);
      for (let x = from; x < to; x += 0.35) {
        const ya = wave(x), yb = wave(x + 0.35), la = lift(x), lb = lift(x + 0.35);
        for (let k = 0; k < 4; k++) {
          const a0 = ya + h * la * k / 4, a1 = ya + h * la * (k + 1) / 4, b0 = yb + h * lb * k / 4, b1 = yb + h * lb * (k + 1) / 4;
          parts.push(fpoly([[x, a0], [x + 0.35, b0], [x + 0.35, b1], [x, a1]], phase * 0.01, tones[k], flare ? FLARE_EMISSIVE : 0.6 - k * 0.06));
        }
      }
    }
    return noShadow(merge(...parts));
  };
  const backdrop = byStage((stage) => {
    const run = stage.lockScreen * SCREEN_X;
    // The night sky: indigo to a lavender horizon, with stars.
    const sky = [], STOPS = [[-4, "#8a8fc0"], [2, "#6b72ae"], [3.6, "#4a5390"], [5.2, "#30386f"], [7.5, "#1d2252"], [12, "#121539"]];
    const at = (y) => { for (let k = 1; k < STOPS.length; k++) if (y <= STOPS[k][0]) return mix(STOPS[k - 1][1], STOPS[k][1], (y - STOPS[k - 1][0]) / (STOPS[k][0] - STOPS[k - 1][0])); return STOPS[STOPS.length - 1][1]; };
    for (let y = -4; y < 14; y += 0.4) sky.push(rect(-120, 120, y, y + 0.42, 0, at(y + 0.2), 0.85));
    const sRand = mulberry32(41);
    for (let k = 0; k < 120; k++) { const x = -14 + sRand() * 28, y = 4.6 + sRand() * 8, r = 0.012 + sRand() * 0.022; sky.push(fpoly([[x - r, y], [x, y - r], [x + r, y], [x, y + r]], 0.01, "#f2f4ff", 0.7)); }
    // The far peaks: lit and shaded faces, snow down from their tips, mist at their feet, and far along the pass the
    // ₿IFRÖST arch: two crystal pillars and a glowing span, where the view stands at the lock screen.
    const far = [], pRand = mulberry32(59), pTo = run * PEAKS_RATE + SCREEN_X + 16;
    for (let x = -16; x < pTo; x += 2.6 + pRand() * 3) {
      const w = 3.4 + pRand() * 4, h = 2.2 + pRand() * 1.8, tip = x + w * (0.35 + pRand() * 0.3), z = -pRand() * 0.6, sn = 0.5 + pRand() * 0.5;
      far.push(fpoly([[x, -2], [tip, -2], [tip, h], [tip - w * 0.09, h - 0.28]], z, "#9096b8"), fpoly([[tip, -2], [x + w, -2], [tip + w * 0.11, h - 0.42], [tip, h]], z, "#6c7196"));
      far.push(fpoly([[tip - (tip - x) * sn / h, h - sn], [tip, h - sn * 0.7], [tip, h]], z + 0.01, "#f0f3fb"), fpoly([[tip, h - sn * 0.7], [tip + (x + w - tip) * sn * 0.6 / h, h - sn * 0.9], [tip, h]], z + 0.01, "#c9cfe6"));
    }
    for (let x = -16; x < pTo; x += 1) { const m = (t) => 1.0 + 0.15 * Math.sin(t * 0.8) + 0.08 * Math.sin(t * 2.2); far.push(fpoly([[x, -2], [x + 1, -2], [x + 1, m(x + 1)], [x, m(x)]], 0.5, "#a6aed0")); }
    const gx = run * PEAKS_RATE + 1.6, gy = 2.4;
    for (const dx of [-0.75, 0.75]) far.push(fpoly([[gx + dx - 0.14, gy], [gx + dx + 0.14, gy], [gx + dx + 0.1, gy + 1.5], [gx + dx - 0.1, gy + 1.5]], 0.55, "#b9a4f2", 0.7));
    for (let k = 0; k < 10; k++) {
      const a0 = PI * k / 10, a1 = PI * (k + 1) / 10, R = 0.85, r = 0.68;
      far.push(fpoly([[gx + Math.cos(a1) * r, gy + 1.5 + Math.sin(a1) * r], [gx + Math.cos(a0) * r, gy + 1.5 + Math.sin(a0) * r], [gx + Math.cos(a0) * R, gy + 1.5 + Math.sin(a0) * R], [gx + Math.cos(a1) * R, gy + 1.5 + Math.sin(a1) * R]], 0.56, k & 1 ? "#d9ccff" : "#9fe8ff", 0.9));
    }
    // The near crags: dark granite ridges with frost on their shoulders and violet glints, mist along their feet.
    const near = [], nRand = mulberry32(73), nTo = run * CRAGS_RATE + SCREEN_X + 12;
    const ridge = (t) => RIDGE_BASE + RIDGE_AMP[0] * Math.sin(t * 0.37 + 1) + RIDGE_AMP[1] * Math.sin(t * 1.05) + RIDGE_AMP[2] * Math.abs(Math.sin(t * 2.6));
    for (let x = -12; x < nTo; x += 0.5) {
      near.push(fpoly([[x, -2], [x + 0.5, -2], [x + 0.5, ridge(x + 0.5)], [x, ridge(x)]], 0, "#4b5272"));
      if (ridge(x + 0.5) > ridge(x) + 0.05) near.push(fpoly([[x, ridge(x) - 0.12], [x + 0.5, ridge(x + 0.5) - 0.18], [x + 0.5, ridge(x + 0.5)], [x, ridge(x)]], 0.01, "#c8d0e8"));
      if (nRand() < 0.12) { const y = ridge(x) - 0.4 - nRand() * 0.6; near.push(fpoly([[x + 0.2, y], [x + 0.26, y + 0.1], [x + 0.2, y + 0.24], [x + 0.14, y + 0.1]], 0.02, "#a98cf0", 0.6)); }
    }
    for (let x = -12; x < nTo; x += 3 + nRand() * 3) near.push(ngon(x, 0.4 + nRand() * 0.4, 1 + nRand() * 0.8, 0.1 + nRand() * 0.05, 0.05, "#8f98ba", 0.45, 12));
    return Object.freeze({
      layers: [
        { geometry: noShadow(merge(...far)), rate: PEAKS_RATE, y: 0, z: PEAKS_Z },
        { geometry: noShadow(merge(...near)), rate: CRAGS_RATE, y: 0, z: CRAGS_Z }
      ],
      sky: [{ geometry: noShadow(merge(...sky)), y: 0, z: SKY_Z }],
      aurora: Object.freeze({ geometry: aurora(run, false), flare: aurora(run, true), rate: AURORA_RATE, y: 0, z: AURORA_Z })
    });
  });

  // ---- the weather ---------------------------------------------------------------------------------------------------
  // The snow sheet: thin, dim cool-grey streaks behind the play band (z -2.4 to -0.5), a SNOW_PERIOD tile laid twice so
  // a node shifted by any part of a tile still covers the screen; it streams at SNOW_V. It stays far darker and greyer
  // than the shard lob, which flies through it. The flare's glow swells by FLARE_PULSE at the middle of the warning,
  // its emissive (FLARE_EMISSIVE times the glow) never over 1.
  const SNOW_PERIOD = SCREEN_X, SNOW_V = 7, SNOW = "#6c7380", SNOW_GLOW = 0.15;
  const snowSheet = cached(() => {
    const parts = [], rand = mulberry32(83), tile = [];
    for (let k = 0; k < 60; k++) {
      const x = rand() * SNOW_PERIOD, y = -0.3 + rand() * (VIEW_Y + 0.6), l = 0.18 + rand() * 0.4, w = 0.01 + rand() * 0.006, z = -0.5 - rand() * 1.9;
      tile.push([x, y, l, w, z]);
    }
    for (const shift of [0, SNOW_PERIOD]) for (const [x, y, l, w, z] of tile) parts.push(strip(x + shift, y, x + shift + l, y + l * 0.12, w, z, SNOW, SNOW_GLOW));
    return noShadow(merge(...parts));
  });
  const weather = byStage((stage) => {
    const zones = planOf(stage).zones, n = zones.length, Z = new Float64Array(n * 3);
    zones.forEach((zn, i) => Z.set([zn.x0, zn.x1, zn.dir], i * 3));
    const back = backdrop(stage), PERIOD = TUNE.GUST_CALM + TUNE.GUST_WARN + TUNE.GUST_BLOW;
    // The first zone the view [camX, camX + SCREEN_X] overlaps, or -1.
    const zoneIn = (camX) => { for (let i = 0; i < n; i++) if (Z[i * 3 + 1] > camX && Z[i * 3] < camX + SCREEN_X) return i; return -1; };
    const auroraAt = (node, time, camX) => {
      if (gustPhase(time) === GUST.WARN && zoneIn(camX) >= 0) {
        node.geometry = back.aurora.flare;
        node.glow = 1 + FLARE_PULSE * Math.sin(PI * ((time % PERIOD) - TUNE.GUST_CALM) / TUNE.GUST_WARN);
      } else {
        node.geometry = back.aurora.geometry;
        node.glow = 1;
      }
    };
    const snowAt = (node, time, camX, camY) => {
      const i = gustPhase(time) === GUST.BLOW ? zoneIn(camX) : -1;
      if (i < 0) { node.visible = false; return; }
      const shift = (time * SNOW_V) % SNOW_PERIOD;
      node.position.x = gustDir(Z[i * 3 + 2], time) < 0 ? camX - shift : camX - SNOW_PERIOD + shift;
      node.position.y = camY;
      node.visible = true;
    };
    return Object.freeze({ zones: Object.freeze(zones), snow: snowSheet(), SNOW_PERIOD, FLARE_GLOW_MAX: 1 + FLARE_PULSE, aurora: back.aurora, auroraAt, snowAt });
  });

  // ---- the Legion of the pass --------------------------------------------------------------------------------------------
  const PASS_YAW = 0.5, LANTERN_YAW = -0.15;
  // A face looking toward -x under a hood: skin, eyes, nose, its middle at (x, y), height 0.13 * s.
  const face = (x, y, s, goggles) => {
    const p = [BB(x - 0.07 * s, x + 0.05 * s, y - 0.065 * s, y + 0.065 * s, -0.06 * s, 0.06 * s, SKIN, 0.015 * s), B(x - 0.09 * s, x - 0.068 * s, y - 0.02 * s, y + 0.01 * s, -0.01 * s, 0.01 * s, SKIN_DK)];
    if (goggles) p.push(B(x - 0.078 * s, x - 0.064 * s, y + 0.01 * s, y + 0.042 * s, -0.058 * s, 0.058 * s, "#2a2d33"), B(x - 0.082 * s, x - 0.076 * s, y + 0.014 * s, y + 0.038 * s, -0.048 * s, 0.048 * s, "#ffb84a", 0.7));
    else p.push(B(x - 0.077 * s, x - 0.068 * s, y + 0.012 * s, y + 0.034 * s, 0.016 * s, 0.04 * s, EYE), B(x - 0.077 * s, x - 0.068 * s, y + 0.012 * s, y + 0.034 * s, -0.04 * s, -0.016 * s, EYE));
    return p;
  };
  // A fur hood about a face: the shell, the fur ring round the opening.
  const hood = (y0, y1, shell, fur) => [
    BB(-0.095, 0.085, y0, y1, -0.098, 0.098, shell, 0.03),
    B(-0.106, -0.092, y0 + 0.01, y1 - 0.01, -0.09, -0.06, fur), B(-0.106, -0.092, y0 + 0.01, y1 - 0.01, 0.06, 0.09, fur),
    B(-0.106, -0.092, y1 - 0.04, y1 - 0.005, -0.09, 0.09, fur), B(-0.106, -0.092, y0 + 0.005, y0 + 0.03, -0.09, 0.09, fur)
  ];
  // A limb from a to b, square w thick.
  const limb = (ax, ay, bx, by, z, w, color) => beam(ax, ay, z, bx, by, z, w, color);

  // SHARD_THROWER: a Legion trooper in a white parka with a fur hood and amber snow goggles, a red Legion armband, a bag of
  // shards at the hip, whirling a leather sling over his head with a shard of ice in its pouch. Faces -x. Fodder box about
  // origin 0.5: x ±0.344, y -0.06 to 1.06.
  const PARKA = "#eef1f4", PARKA_DK = "#cfd6dd", PANTS = "#5a5f68";
  const shardThrower = () => {
    const p = [];
    for (const [z, a] of [[0.05, -0.12], [-0.05, 0.14]]) {
      p.push(limb(0, 0.36, -Math.sin(a) * 0.32, 0.05, z, 0.085, PANTS));
      p.push(BB(-Math.sin(a) * 0.32 - 0.08, -Math.sin(a) * 0.32 + 0.04, 0, 0.065, z - 0.045, z + 0.045, SHOE, 0.01));
    }
    p.push(BB(-0.125, 0.12, 0.32, 0.72, -0.12, 0.12, PARKA, 0.035), B(-0.13, 0.125, 0.32, 0.36, -0.125, 0.125, FUR), B(-0.132, -0.12, 0.38, 0.7, -0.012, 0.012, PARKA_DK));
    p.push(B(-0.13, 0.125, 0.46, 0.49, -0.125, 0.125, "#3a3f46"), BB(0.04, 0.16, 0.36, 0.5, 0.08, 0.17, "#7a5a3a", 0.015));
    for (const dx of [0.07, 0.11]) p.push(moved(shard(0.016, 0.07, CLEAR, 0.4), dx, 0.5, 0.125));
    p.push(...hood(0.7, 0.93, PARKA, FUR), ...face(-0.04, 0.8, 1, true));
    // The near arm up over the head with the sling's cords; the far arm forward to steady the throw.
    p.push(limb(0.0, 0.68, 0.06, 0.86, 0.13, 0.07, PARKA), B(-0.01, 0.07, 0.6, 0.66, 0.1, 0.17, RED), limb(0.06, 0.86, 0.02, 0.98, 0.13, 0.065, PARKA));
    p.push(BB(-0.005, 0.045, 0.97, 1.02, 0.1, 0.16, FUR_DK, 0.008));
    p.push(beam(0.02, 1.0, 0.13, -0.16, 1.01, 0.13, 0.01, "#6b4a2a"), beam(0.02, 1.0, 0.13, -0.15, 0.95, 0.13, 0.01, "#6b4a2a"));
    p.push(BB(-0.2, -0.13, 0.95, 1.02, 0.1, 0.16, "#7a5a3a", 0.01), moved(turnedZ(shard(0.025, 0.08, CLEAR, 0.5, 0.4), 0.9), -0.18, 1.0, 0.13));
    p.push(limb(0.0, 0.66, -0.12, 0.58, -0.13, 0.07, PARKA), limb(-0.12, 0.58, -0.24, 0.6, -0.13, 0.065, PARKA), BB(-0.27, -0.22, 0.57, 0.63, -0.16, -0.1, FUR_DK, 0.008));
    return noShadow(BL.raidModels.standTall(toCamera(p, PASS_YAW)));
  };

  // ICICLE: a spike of clear crystal with a violet core, hanging from its root crust, which meets the arch's underside
  // 0.3 m over its anchor. Fodder box about origin 0: ±0.344 by ±0.563. `shiver` cracks, tilts and glares; `fall` is the
  // spike broken from its root.
  const spike = (glare) => {
    const p = [lathe({ profile: [[0, -0.46], [0.03, -0.34], [0.065, -0.12], [0.09, 0.08], [0.105, 0.2], [0, 0.22]], segments: 6, color: CLEAR, emissive: glare ? 0.75 : 0.35 })];
    p.push(fpoly([[-0.012, -0.3], [0.012, -0.3], [0.03, 0.15], [-0.03, 0.15]], 0.11, CRYSTAL_LT, glare ? 0.95 : 0.55));
    for (const [dx, tip, r] of [[-0.08, -0.16, 0.035], [0.075, -0.1, 0.03]]) p.push(moved(lathe({ profile: [[0, tip], [r, tip * 0.4], [r, 0.18], [0, 0.2]], segments: 6, color: CLEAR, emissive: glare ? 0.7 : 0.3 }), dx, 0, -0.02));
    return p;
  };
  const root = () => lathe({ profile: [[0, 0.2], [0.16, 0.2], [0.17, 0.26], [0.13, 0.3], [0, 0.3]], segments: 6, color: CRYSTAL_LT, emissive: 0.35 });
  const icicleHang = () => noShadow(merge(root(), ...spike(false)));
  const icicleShiver = () => {
    const cracks = [strip(-0.02, 0.12, 0.03, -0.02, 0.008, 0.13, "#3a3560"), strip(0.03, -0.02, -0.01, -0.18, 0.007, 0.13, "#3a3560"), strip(0.0, 0.18, 0.05, 0.1, 0.006, 0.13, "#3a3560")];
    const flecks = [];
    for (const [x, y] of [[-0.12, -0.32], [0.1, -0.4], [-0.05, -0.5], [0.14, -0.22]]) flecks.push(fpoly([[x - 0.015, y], [x, y - 0.022], [x + 0.015, y], [x, y + 0.022]], 0.12, CRYSTAL_GLOW, 0.9));
    return noShadow(merge(root(), about(merge(...spike(true), ...cracks), 0, 0.3, 0.07), ...flecks));
  };
  const icicleFall = () => {
    const jag = [];
    for (let k = 0; k < 5; k++) { const a = -0.1 + k * 0.05; jag.push(fpoly([[a, 0.2], [a + 0.05, 0.2], [a + 0.025, 0.26 + (k & 1) * 0.03]], 0.06, CLEAR, 0.5)); }
    return noShadow(merge(...spike(false), ...jag));
  };

  // DROP_CRATE: a bailout-blue supply crate in steel bands with the Legion seal (steel corners, never a pickup's wooden
  // crate). Rising, its paper chute is bundled on its lid; under the chute, a paper canopy printed RELIEF on four cords.
  // Fodder box about origin 0.25: x ±0.344, y -0.31 to 0.81 over its foot.
  const crate = () => {
    const p = [BB(-0.16, 0.16, 0, 0.26, -0.13, 0.13, BAIL, 0.015)];
    for (const y of [0.06, 0.2]) p.push(B(-0.165, 0.165, y - 0.012, y + 0.012, -0.135, 0.135, STEEL));
    for (const x of [-0.15, 0.15]) for (const y of [0.015, 0.245]) p.push(B(x - 0.018, x + 0.018, y - 0.018, y + 0.018, 0.13, 0.138, STEEL_DK));
    p.push(...seal(0, 0.13, 0.05, 0.136));
    return p;
  };
  const crateRise = () => noShadow(merge(...crate(), BB(-0.1, 0.1, 0.26, 0.33, -0.08, 0.08, PAPER, 0.02), B(-0.105, 0.105, 0.285, 0.305, -0.085, 0.085, RED)));
  const crateChute = () => {
    const canopy = scaled(lathe({ profile: [[0.3, 0.58], [0.285, 0.66], [0.24, 0.73], [0.16, 0.78], [0.07, 0.8], [0, 0.805]], segments: 12, color: (t) => t < 0.2 ? "#9fc0ec" : PAPER }), 1, 1, 0.75);
    const p = [...crate(), canopy, ...word("RELIEF", 0.0115, 0, 0.68, 0.22, RED, 0.15)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(beam(sx * 0.29, 0.58, sz * 0.12, sx * 0.14, 0.26, sz * 0.1, 0.008, "#d8d2c0"));
    return noShadow(merge(...p));
  };

  // MECH: the Bailout Mech, facing -x. The hull (inside the armour box, y 0.444 to 2.569 and x ±1.344 over its feet): a
  // stubby bailout-blue body with a gold seal and BAILOUT carved under it, a glass cockpit up front (open: the Legion
  // official at his controls behind the glass's glints; shut: armoured shutters with a red visor slit), the chin gun on
  // its brow (its muzzle on MECH_MUZZLE, at the hull's edge), the crate hatch on the cradle plate under MECH_HATCH
  // (where its crates launch, just over the box's top), shoulder clamps under the pods and a headlamp. The legs (under
  // 0.444, inside LEG_HALF): near and far, thigh, knee, shin, piston and a wide foot on the floor; mid-stride the near
  // foot lifts forward.
  // The hull fills its bullet box edge to edge (HULL_X either side, from HULL_Y0 to HULL_TOP): a skirt, the lower hull,
  // the upper hull with the cockpit, and on top the armoured cradle plate the gun turret and the pods' clamps stand on.
  const HULL_X = 1.33, HULL_Y0 = 0.45, HULL_TOP = 2.555;
  const mechBody = (open) => {
    const X = HULL_X, p = [
      B(-X, X, HULL_Y0, 0.66, -0.36, 0.36, BAIL_DK), BB(-X, X, 0.6, 1.62, -0.44, 0.44, BAIL, 0.02),
      BB(-X, X, 1.55, 2.4, -0.4, 0.4, BAIL, 0.02), B(-X, X, 2.38, HULL_TOP, -0.34, 0.34, BAIL_DK),
      B(-1.3, 1.3, 1.52, 1.58, 0.44, 0.45, BAIL_LT), B(-1.3, 1.3, 2.48, 2.505, 0.34, 0.35, GOLD, 0.2)
    ];
    for (const x of [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2]) p.push(disc(0.02, 0.012, x, 0.55, 0.366, GOLD, 0.15, 8), disc(0.018, 0.012, x, 2.44, 0.346, GOLD, 0.15, 8));
    p.push(...seal(0.5, 1.08, 0.22, 0.446), ...word("BAILOUT", 0.026, -0.45, 0.9, 0.446, GOLD_LT, 0.25));
    // The exhaust housing at the back, its pipes out to the hull's edge, and the headlamp at the front edge.
    p.push(B(0.78, 1.3, 1.68, 2.3, 0.401, 0.43, BAIL_DK));
    for (const y of [1.82, 2.02, 2.2]) p.push(rod(0.92, y, 0.44, X, y, 0.44, 0.04, STEEL_DK, 0, 8));
    p.push(disc(0.09, 0.03, -1.22, 1.32, 0.452, STEEL_DK, 0, 10), disc(0.07, 0.04, -1.22, 1.32, 0.462, "#ffd27a", 1, 10));
    // The cockpit: a dark well forward to the hull's nose, the official and the glass, or the shutters.
    p.push(B(-1.26, 0.1, 1.62, 2.26, 0.401, 0.406, "#11203c"));
    if (open) {
      p.push(BB(-0.82, -0.48, 1.66, 1.92, 0.406, 0.42, "#2c3346", 0.02), B(-0.67, -0.63, 1.7, 1.9, 0.42, 0.424, RED), B(-0.8, -0.5, 1.86, 1.89, 0.42, 0.425, GOLD, 0.2));
      p.push(BB(-0.75, -0.55, 1.92, 2.13, 0.406, 0.42, SKIN, 0.02), B(-0.75, -0.55, 2.1, 2.15, 0.408, 0.422, "#3a2e26"), B(-0.73, -0.69, 2.02, 2.05, 0.42, 0.424, EYE), B(-0.64, -0.6, 2.02, 2.05, 0.42, 0.424, EYE));
      p.push(B(-1.18, -0.92, 1.66, 1.78, 0.406, 0.43, "#3a4458"), disc(0.03, 0.02, -1.05, 1.74, 0.432, "#6fe04a", 0.9, 8));
      for (const [a, b] of [[-1.2, -0.95], [-0.3, -0.1]]) p.push(fpoly([[a, 1.66], [a + 0.08, 1.66], [b + 0.08, 2.22], [b, 2.22]], 0.44, "#bfe8ff", 0.55));
      for (const x of [-1.25, -0.44, 0.1]) p.push(B(x - 0.025, x + 0.025, 1.6, 2.28, 0.4, 0.445, STEEL_LT));
      p.push(B(-1.27, 0.12, 2.24, 2.29, 0.4, 0.445, STEEL_LT));
    } else {
      for (let k = 0; k < 5; k++) p.push(BB(-1.27, 0.12, 1.62 + k * 0.13, 1.74 + k * 0.13, 0.4, 0.45, k & 1 ? BAIL_DK : BAIL, 0.012));
      p.push(B(-1.1, -0.1, 2.0, 2.04, 0.45, 0.455, RED, 1));
      for (const x of [-1.18, 0.03]) for (let k = 0; k < 5; k++) p.push(disc(0.016, 0.01, x, 1.68 + k * 0.13, 0.456, GOLD, 0.2, 6));
    }
    // The chin gun on the cradle plate's nose, its barrel to the muzzle and its collar out to the hull's edge; the crate
    // hatch's lid on the plate's face with its hinge bolts and lamp; and the shoulder clamps the pods sit on.
    const MX = MUZZLE_X, MY = MUZZLE_Y;
    p.push(B(MX + 0.3, MX + 0.68, MY - 0.06, Math.min(HULL_TOP, MY + 0.08), 0.25, 0.42, BAIL_DK), rod(MX + 0.5, MY, 0.44, MX + 0.04, MY, 0.44, 0.05, STEEL_DK, 0, 10), rod(MX + 0.04, MY, 0.44, Math.max(-X, MX - 0.03), MY, 0.44, 0.075, STEEL, 0, 10));
    p.push(B(HATCH_X - 0.22, HATCH_X + 0.22, 2.4, 2.545, 0.35, 0.36, STEEL_DK), B(HATCH_X - 0.2, HATCH_X + 0.2, 2.455, 2.47, 0.36, 0.365, BAIL_LT));
    for (const dx of [-0.17, 0.17]) p.push(disc(0.016, 0.01, HATCH_X + dx, 2.52, 0.366, GOLD, 0.15, 8));
    p.push(disc(0.022, 0.01, HATCH_X, 2.425, 0.366, RED, 1, 8));
    for (const [dx] of POD_MOUNTS) p.push(B(dx - 0.16, dx + 0.16, 2.4, HULL_TOP, -0.62, -0.34, BAIL_DK), B(dx - 0.05, dx + 0.05, 2.45, HULL_TOP, -0.7, -0.6, STEEL_DK));
    return merge(...p);
  };
  const mechLegs = (step) => {
    const p = [];
    for (const [x, z, near] of [[-0.52, 0.27, true], [0.52, -0.27, false]]) {
      const lift = step && near ? 0.12 : 0, fwd = step ? (near ? -0.12 : 0.06) : 0, tone = near ? BAIL_DK : "#173a78";
      const hip = [x, 0.6], ankle = [x + fwd, 0.12 + lift], knee = [x + fwd * 0.5 - 0.14, 0.36 + lift * 0.6];
      p.push(disc(0.13, 0.16, hip[0], hip[1], z, STEEL_DK, 0, 12));
      p.push(beam(hip[0], hip[1], z, knee[0], knee[1], z, 0.2, tone), beam(knee[0], knee[1], z, ankle[0], ankle[1], z, 0.17, tone));
      p.push(disc(0.09, 0.2, knee[0], knee[1], z, STEEL, 0, 10), rod(hip[0] + 0.12, hip[1] - 0.04, z + 0.12, ankle[0] + 0.1, ankle[1] + 0.06, z + 0.12, 0.025, STEEL_LT, 0, 6));
      p.push(BB(ankle[0] - 0.3, ankle[0] + 0.26, lift, lift + 0.12, z - 0.17, z + 0.17, tone, 0.03), B(ankle[0] - 0.31, ankle[0] - 0.24, lift, lift + 0.06, z - 0.15, z + 0.15, GOLD));
    }
    return merge(...p);
  };
  const mechParts = (open, step) => ({ body: mechBody(open), legs: mechLegs(step) });
  const mech = (open, step) => { const m = mechParts(open, step); return noShadow(merge(m.body, m.legs)); };

  // MECH_POD: a crate rack on the Mech's shoulder: a steel frame on a clamp (its foot at the box's bottom, on the hull's
  // shoulder clamp), two supply crates, a launch tray and its red lamp. Emplacement box about origin 0: ±0.344.
  const mechPod = () => {
    const p = [BB(-0.335, 0.335, -0.3, -0.24, -0.2, 0.2, BAIL_DK, 0.015), B(-0.06, 0.06, -0.343, -0.3, -0.06, 0.06, STEEL_DK)];
    for (const x of [-0.31, 0.31]) p.push(B(x - 0.025, x + 0.025, -0.24, 0.24, -0.18, 0.18, STEEL_DK));
    for (const y of [-0.24, 0.0]) {
      p.push(BB(-0.23, 0.23, y + 0.01, y + 0.22, -0.15, 0.15, BAIL, 0.015), B(-0.235, 0.235, y + 0.1, y + 0.125, -0.155, 0.155, STEEL));
      p.push(...seal(0, y + 0.115, 0.045, 0.152));
    }
    p.push(fpoly([[-0.335, 0.24], [0.335, 0.24], [0.335, 0.3], [-0.335, 0.27]], 0.19, STEEL_DK), B(-0.335, 0.335, 0.24, 0.26, -0.19, 0.19, STEEL));
    p.push(moved(lathe({ profile: [[0, 0], [0.04, 0], [0.03, 0.05], [0, 0.065]], segments: 8, color: RED, emissive: 1 }), 0.22, 0.26, 0.1));
    return noShadow(merge(...p));
  };

  // ---- stage-7 re-skins of the shared types ------------------------------------------------------------------------------
  // CLERK: a desk clerk in a long fur-hooded greatcoat of Legion navy with brass buttons and fur cuffs, his green eyeshade
  // poking from under the hood, levelling his stamp gun at chest height (its ink face at y 0.5, his shot's origin). Faces -x.
  const COAT = "#3b4660", COAT_DK = "#2c3549";
  const skinClerk = () => {
    const p = [];
    for (const z of [0.05, -0.05]) p.push(B(-0.04, 0.04, 0.05, 0.2, z - 0.04, z + 0.04, "#232c45"), BB(-0.1, 0.04, 0, 0.06, z - 0.045, z + 0.045, SHOE, 0.01));
    p.push(BB(-0.135, 0.125, 0.17, 0.7, -0.125, 0.125, COAT, 0.035), B(-0.14, 0.13, 0.17, 0.21, -0.13, 0.13, COAT_DK));
    for (const y of [0.3, 0.42, 0.54, 0.64]) for (const z of [-0.05, 0.05]) p.push(disc(0.012, 0.01, -0.138, y, z, GOLD, 0.25, 6));
    p.push(B(-0.14, 0.13, 0.42, 0.45, -0.13, 0.13, "#1e2433"), B(-0.142, -0.13, 0.62, 0.7, -0.02, 0.02, RED));
    p.push(...hood(0.69, 0.92, COAT_DK, FUR), ...face(-0.04, 0.8, 1, false), B(-0.15, -0.09, 0.855, 0.866, -0.08, 0.08, "#3fae5a", 0.25));
    p.push(B(-0.09, -0.078, 0.81, 0.83, -0.05, 0.05, "#cfd6dc", 0.15));
    // The stamp gun at the hip, its inked face (the muzzle) on the clerk's shot start, in a coat sleeve with a fur cuff.
    const gun = [
      B(-0.2, -0.16, 0.42, 0.5, -0.025, 0.025, "#7a5230"), B(-0.28, -0.14, 0.49, 0.56, -0.035, 0.035, "#3b3f46"),
      B(-0.305, -0.275, 0.45, 0.6, -0.06, 0.06, "#7a5230"), B(-0.318, -0.305, 0.46, 0.59, -0.052, 0.052, RED)
    ];
    p.push(...BL.raidModels.holdGun(p, { type: BL.raidStages.ENEMY.CLERK, yaw: PASS_YAW, gun, muzzle: [-0.318, 0.525, 0], grip: [-0.18, 0.46, 0],
      shoulder: 0.64, upper: 0.16, lower: 0.15, w: 0.07, sleeve: COAT, band: FUR, skin: SKIN, round: true }));
    return noShadow(BL.raidModels.standTall(toCamera(p, PASS_YAW)));
  };
  // CARRIER: a crystal kite flying +x: four violet panes in a timber frame, a tail of red and gold bows trailing back and a
  // Legion satchel tied under it. Centred, fodder box ±0.344 by ±0.563.
  const skinCarrier = () => {
    const T = [0.02, 0.28], R = [0.22, 0.03], Bm = [0.0, -0.24], L = [-0.17, 0.0], C = [0.02, 0.03], p = [];
    for (const [a, b, tone] of [[T, R, CRYSTAL_LT], [R, Bm, CRYSTAL], [Bm, L, CRYSTAL_DK], [L, T, CRYSTAL]]) p.push(fpoly([C, b, a], 0.012, tone, 0.45), fpoly([C, a, b], -0.012, tone, 0.2));
    for (const [a, b] of [[T, R], [R, Bm], [Bm, L], [L, T], [T, Bm], [L, R]]) p.push(beam(a[0], a[1], 0, b[0], b[1], 0, 0.018, TIMBER));
    const tail = [[0.0, -0.24], [-0.07, -0.3], [-0.14, -0.28], [-0.21, -0.34], [-0.28, -0.32]];
    for (let k = 0; k + 1 < tail.length; k++) p.push(beam(tail[k][0], tail[k][1], 0, tail[k + 1][0], tail[k + 1][1], 0, 0.01, ROPE));
    for (let k = 1; k < tail.length; k++) { const [x, y] = tail[k]; p.push(fpoly([[x - 0.03, y + 0.02], [x - 0.03, y - 0.02], [x, y]], 0.01, k & 1 ? RED : GOLD), fpoly([[x, y], [x + 0.03, y - 0.02], [x + 0.03, y + 0.02]], 0.01, k & 1 ? RED : GOLD)); }
    p.push(beam(0.04, 0.03, 0, 0.08, -0.28, 0, 0.008, ROPE), BB(0.03, 0.15, -0.4, -0.28, -0.05, 0.05, "#7a5a3a", 0.015), ...seal(0.09, -0.34, 0.035, 0.052));
    return noShadow(turnedY(merge(...p), -0.35));
  };
  // SENSOR: a frosted signal lantern on a granite block: an iron post, a glazed lantern under a pointed iron roof. Open,
  // its beacon burns behind frost-rimmed panes; shut, iron shutters close over them under a crust of snow. Feet at y 0.
  const skinSensor = (open) => {
    const p = [BB(-0.16, 0.16, 0, 0.1, -0.14, 0.14, GRANITE_DK, 0.015), B(-0.17, 0.17, 0.09, 0.11, -0.15, 0.15, FROST), B(-0.03, 0.03, 0.11, 0.3, -0.03, 0.03, STEEL_DK)];
    p.push(BB(-0.14, 0.14, 0.3, 0.34, -0.12, 0.12, STEEL_DK, 0.01), BB(-0.14, 0.14, 0.6, 0.63, -0.12, 0.12, STEEL_DK, 0.01));
    for (const x of [-0.125, 0.125]) for (const z of [-0.105, 0.105]) p.push(B(x - 0.015, x + 0.015, 0.34, 0.6, z - 0.015, z + 0.015, STEEL_DK));
    p.push(lathe({ profile: [[0.16, 0.63], [0.13, 0.66], [0, 0.76]], segments: 4, color: STEEL_DK }), disc(0.025, 0.015, 0, 0.775, 0, STEEL, 0, 8));
    if (open) {
      p.push(B(-0.11, 0.11, 0.34, 0.6, -0.09, 0.09, "#ffd27a", 0.9), B(-0.112, 0.112, 0.36, 0.58, 0.095, 0.1, "#cfe8f6", 0.5));
      p.push(moved(lathe({ profile: [[0, 0], [0.045, 0.03], [0.03, 0.1], [0, 0.15]], segments: 6, color: "#fff2c8", emissive: 1 }), 0, 0.39, 0.12));
      for (const y of [0.36, 0.57]) p.push(B(-0.112, 0.112, y, y + 0.02, 0.1, 0.106, FROST));
    } else {
      p.push(B(-0.112, 0.112, 0.34, 0.6, -0.1, 0.1, "#4a525c"));
      for (let k = 0; k < 5; k++) p.push(B(-0.115, 0.115, 0.36 + k * 0.048, 0.366 + k * 0.048, 0.1, 0.106, STEEL_DK));
      p.push(fpoly([[-0.16, 0.64], [0.16, 0.64], [0.1, 0.69], [-0.1, 0.69]], 0.125, FROST));
    }
    return noShadow(toCamera(p, LANTERN_YAW));
  };

  // ---- the registry --------------------------------------------------------------------------------------------------
  const pair = (build) => { const look = cached(build); return { build: look, turned: cached(() => mirrored(look())) }; };
  const type = (name, looks) => put("types", name, Object.assign(specOf(name), looks));
  // A look winding up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): `look` with a flare at its muzzle (x, y) in its
  // type's tell colour; `wound` adds a pair's `wind` and its mirrored `turnedWind`. The icicle's shiver is its own.
  const windUp = (name, look, x, y, r) => cached(() => BL.raidModels.windOf(look(), x, y, BL.raidModels.FAMILY_OF[name], undefined, r));
  const wound = (name, look, x, y, r) => { const wind = windUp(name, look.build, x, y, r); return Object.assign(look, { wind, turnedWind: cached(() => mirrored(wind())) }); };
  type("SHARD_THROWER", wound("SHARD_THROWER", pair(shardThrower), 0, SPEC.SHARD_THROWER[1]));
  type("ICICLE", {
    build: cached(icicleHang), shiver: cached(icicleShiver), fall: cached(icicleFall),
    pick: (s, slot) => { const r = s.eRoutine[slot]; return r === ICICLE_SHIVER ? "shiver" : r === ICICLE_FALL ? "fall" : "build"; }
  });
  type("DROP_CRATE", { build: cached(crateRise), chute: cached(crateChute), pick: (s, slot) => s.eRoutine[slot] === CRATE_CHUTE ? "chute" : "build" });
  // The Mech winding up (its gun, a crate or a stomp) flares at its chin gun's muzzle in every stance, drawn MUZZLE_IN
  // inside it so the flare keeps inside the armour's box at its brow.
  const mechLooks = { build: cached(() => mech(true, false)), shut: cached(() => mech(false, false)), step: cached(() => mech(true, true)), shutStep: cached(() => mech(false, true)) };
  const MUZZLE = BL.raidLegionPass.TUNE.MECH_MUZZLE, MUZZLE_IN = 0.08, mechWind = (look) => windUp("MECH", look, MUZZLE[0] + MUZZLE_IN, MUZZLE[1] - MUZZLE_IN / 2, 0.09);
  type("MECH", {
    ...mechLooks, wind: mechWind(mechLooks.build), shutWind: mechWind(mechLooks.shut), stepWind: mechWind(mechLooks.step), shutStepWind: mechWind(mechLooks.shutStep),
    pick: (s, slot) => {
      const shut = (s.eFlags[slot] & FLAG.SHUT) !== 0, stride = s.eRoutine[slot] === MECH_WALK && (Math.floor(s.ex[slot] / MECH_STRIDE) & 1) === 1;
      return shut ? (stride ? "shutStep" : "shut") : stride ? "step" : "build";
    },
    touch: MECH_TOUCH, LEG_HALF
  });
  const podLook = cached(mechPod);
  type("MECH_POD", { build: podLook, wind: windUp("MECH_POD", podLook, 0, 0, 0.09) });
  const sensorOpen = cached(() => skinSensor(true)), sensorShut = cached(() => skinSensor(false));
  put("stages", "bifrost", {
    id: "bifrost", PLAY_BAND, DEPTH, LEDGE_CLEAR,
    // The scene's fog and clear colour on this stage: the night sky's middle indigo, so the aurora keeps its colour.
    fog: "#30386f",
    sector, backdrop, weather,
    skins: Object.freeze({
      CLERK: Object.freeze(Object.assign(specOf("CLERK"), wound("CLERK", pair(skinClerk), 0, SPEC.CLERK[1]))),
      CARRIER: Object.freeze(Object.assign(specOf("CARRIER"), pair(skinCarrier))),
      SENSOR: Object.freeze(Object.assign(specOf("SENSOR"), { build: sensorOpen, shut: sensorShut, turned: cached(() => mirrored(sensorOpen())), turnedShut: cached(() => mirrored(sensorShut())) }))
    })
  });
  // For checks: the spec, the boxes, the Mech's parts apart, and what the art reads off a stage.
  ART.pass = Object.freeze({ SPEC, boxOf, mechParts, planOf, POD_MOUNTS });
})();
