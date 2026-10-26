// Ooga Arcade's geometry: the hall behind the 3 o'clock mouth, twelve cabinets, the carnival machines (skee-ball
// lanes, hoop shots and a coconut shy), the snack bar, and the pixel screens and stone scoreboards they all show.
//
// The hall follows the cartoon pass's interior recipe on the Lightning Factory's bar: a dark coarse-block cave, its
// rock painted by the Oogas, round a busy, lit floor (earth, flagstones, reed mats and hides), furnished as a jungle
// arcade the Oogas built from what the island gives: chunky timber, bamboo lashed with rope, logs, dry frond roofs,
// bone and tusk trim, and a coconut wherever a ball or a knob was, with lianas and leaves grown into each builder's
// own mesh (`hubModels.withJungle`). Timber, stone, hide and firelight are the mass; the game screens and a few
// glowing mushrooms and crystals are the only cool accents.
//
// Screens are pixel art: a grid of cells baked into one emissive geometry with every lit run of a row merged into
// one quad. A game's attract loop is `FRAMES` such geometries the scene swaps between. A scoreboard is a sandstone
// slab with its title brushed on, plus digit nodes that swap between the ten cached brushed `digit` geometries, so a
// changing score allocates nothing. Every builder is cached; the scene places copies.
(() => {
  "use strict";

  const BL = window.BL = window.BL || {};
  const { cached, variants, box, bevelBox, lathe, merge, geometry, pushVert, face, moved, turnedX, turnedY, turnedZ, prism, ring } = BL.models;
  const { beam, turn, shaded, torus, along, noShadow: unshadowed } = BL.models;
  const { hexToRgb, mulberry32 } = BL.math;
  const { glyphOf, GLYPH_W, GLYPH_H, TRACKING } = BL.jumbotron.text;

  // The hall, in the cave's frame: the mouth at +z (`front`). A timber mezzanine (`MEZZ`) runs along the back wall
  // with a stair up each side wall; a round stage (`STAGE`, two steps up) holds the live games in the middle.
  const HALL = { halfW: 18, back: -24, front: 6, h: 11, door: 2.5, doorH: 3.6 };
  const STAGE = { x: 0, z: -7.5, r: 4.6, inner: 4.2, low: 0.18, high: 0.36 };
  // The mezzanine's deck (its top at `y`, from `z0` at the back wall to its front edge `z1`) and its two stairs up
  // the side walls, [x, z] at the foot and the head, `w` wide.
  const MEZZ = { z0: HALL.back, z1: -18, y: 3.2, stairs: [[-16.2, -12.5, -16.2, -18], [16.2, -12.5, 16.2, -18]], stairW: 2.6 };
  // The games with cabinets, as the island names them: scene id, name, the marquee's words and badge, and the
  // colour of its screen's light.
  const GAMES = [
    { id: "race", name: "Ooga Rally", title: "RALLY", icon: "flag", light: [1, 0.85, 0.3] },
    { id: "drop", name: "Ooga Drop", title: "DROP", icon: "chute", light: [0.4, 0.8, 1] },
    { id: "orbit", name: "Ooga Orbit", title: "ORBIT", icon: "rocket", light: [0.7, 0.55, 1] },
    { id: "mine", name: "Ooga Mine", title: "MINE", icon: "pick", light: [1, 0.6, 0.25] }
  ];
  // The Ooga retro games (`retro-games.js`), one on each cabinet along the mezzanine, in the cabinets' order from the
  // fifth: scene id, name, and the marquee's words and badge. Each cabinet's trim is its screen's colour.
  const RETRO = [
    { id: "invaders", name: "Coconut Invaders", title: "INVADERS", icon: null },
    { id: "stampede", name: "Mammoth Stampede", title: "STAMPEDE", icon: null },
    { id: "pong", name: "Ooga Pong", title: "PONG", icon: null },
    { id: "snake", name: "Banana Snake", title: "SNAKE", icon: "banana" },
    { id: "flap", name: "Ptero Flap", title: "FLAP", icon: null },
    { id: "breaker", name: "Rock Breaker", title: "BREAKER", icon: null },
    { id: "dash", name: "Dino Dash", title: "DASH", icon: null },
    { id: "stacker", name: "Stone Stacker", title: "STACKER", icon: null }
  ];
  // Twelve cabinets, each carved from its own timber or stone (`body`, `stone` for the slabs), with the game's colour
  // (`trim`: its screen's light, and earthed, its cave paint and its hide), a second paint colour and a side-art
  // style (0 handprints, 1 zigzags, 2 spirals). The four with games stand on the stage on an arc facing the doorway
  // (`ARC`), the heart of the room; the other eight line the mezzanine under the big sign, each playing its retro
  // game (`retro`, its index in RETRO).
  const PAINT = [
    ["#8a5a32", "#ffd23a", "#b8402e", 0, 0], ["#7a4e2c", "#5ec8ff", "#e8dcc0", 2, 0], ["#94643a", "#b98cff", "#e8dcc0", 1, 0], ["#6e655c", "#ff9a3c", "#e8dcc0", 0, 1],
    ["#86582f", "#46ffd2", "#e8dcc0", 1, 0], ["#6a625a", "#e0452b", "#c8862c", 2, 1], ["#7c5230", "#c8ff5a", "#b8402e", 2, 0], ["#726758", "#ffd23a", "#b8402e", 0, 1],
    ["#8e5e34", "#7fe0ff", "#e8dcc0", 1, 0], ["#655c54", "#ffb02e", "#e8dcc0", 0, 1], ["#805430", "#2fd0c0", "#c8862c", 2, 0], ["#6c6258", "#ff5fa2", "#e8dcc0", 1, 1]
  ];
  const CAB = { w: 1.24, d: 0.96, pitch: 1.5 };
  const ARC = { x: 0, z: -0.2, r: 8, step: 0.265 };
  const CABINETS = PAINT.map(([body, trim, second, art, stone], i) => {
    const live = i < 4;
    const a = (i - 1.5) * ARC.step, x = live ? ARC.x + ARC.r * Math.sin(a) : (i - 4 - 3.5) * CAB.pitch;
    const z = live ? ARC.z - ARC.r * Math.cos(a) : MEZZ.z0 + 0.85, turn = live ? -a : 0, y = live ? STAGE.high : MEZZ.y;
    const play = { x: x + Math.sin(turn) * 1.25, z: z + Math.cos(turn) * 1.25, facing: turn + Math.PI };
    return { index: i, x, y, z, turn, game: live ? i : -1, retro: live ? -1 : i - 4, body, trim, second, art, stone: !!stone, play };
  });
  // Everything else, each built in its own frame facing +z; `turn` stands the frame in the hall. For the carnival
  // machines the player stands at the frame's origin (`play`); the counters are built with their customers on +z.
  // Laid out in districts round the stage, with the main aisles at least 3 m wide, every other walkway at least
  // 2.3 m, every gap narrower than a walker closed off rather than a squeeze, and at least 1.8 m of floor behind
  // every play spot: the throwing range on the right (the skee lanes facing the balcony, the Oogas' air hockey table
  // on the right wall in their firing line, and the hoop shots in the front corner facing the wall); the coconut shy
  // on the left wall, the food court before it and the snack bar on the front wall; the back room between the stage
  // and the deck, two pool tables either side of a plaza, the jackpot wheel on its own footing behind the stump and
  // an air hockey table on each flank by the stairs; and under the deck, against the back wall behind a 3 m street,
  // the claw machines and the pinball pair in the post bays, a dart board in each outer bay and the locked back
  // door. The token totem and the ticket muncher flank the doorway with the prize counter beside the muncher (munch,
  // then trade), and the kiddie rides stand side-on in a row right of the entry avenue, facing it.
  const standAt = (x, z, turn) => ({ x, z, turn, play: { x, z, facing: turn + Math.PI } });
  const LAYOUT = {
    cabinets: CABINETS,
    skee: [standAt(10, -3, 0), standAt(11.8, -3, 0)],
    hoops: [standAt(13.76, 2.7, -Math.PI / 2), standAt(13.76, 4.9, -Math.PI / 2)],
    shy: standAt(-13.21, -6.8, Math.PI / 2),
    // The playable claw machine is the middle one; its player stands `CLAW.back` in front of it.
    claw: standAt(0, -22.3, 0),
    snack: { x: -14.9, z: 4.3, turn: Math.PI },
    prizes: { x: -7.2, z: 4.6, turn: Math.PI },
    tables: [[-13.4, -1.9], [-9.2, -1.9]],
    claws: [[-3.227, -23.3], [0, -23.3], [3.227, -23.3]],
    pinball: [[5.53, -23.1], [7.18, -23.1]],
    // Air hockey: the Oogas' table on the right wall in the throwing range and one on each flank of the back room by
    // the stairs, each the table's middle and its `turn`, played from 1.75 m out along it (0: from its +z end).
    // Pool: two tables either side of the back room's plaza, played from +z. Darts: a board on the back wall under the
    // deck in each outer post bay, [x], thrown from `DART.oche` out from it.
    hockeys: [{ x: 16.3, z: -4.75, turn: 0 }, { x: -13.3, z: -14.15, turn: 0 }, { x: 13.55, z: -14.15, turn: 0 }],
    pools: [{ x: -7.8, z: -14.65 }, { x: 7.8, z: -14.65 }],
    darts: [-12.909, 12.909],
    changers: [{ x: 3.4, z: 5.5, turn: Math.PI }, { x: -3.4, z: 5.5, turn: Math.PI }],
    // The rides in the order of `ride`'s bodies: the silverback, the monkey cart, the dino and the baby mammoth, side-on
    // in a row right of the entry avenue, each facing it and played from the avenue's side.
    rides: [{ x: 5.5, z: 4.4, turn: -Math.PI / 2 }, { x: 5.5, z: 2.6, turn: -Math.PI / 2 }, { x: 5.5, z: 0.8, turn: -Math.PI / 2 }, { x: 5.5, z: -1, turn: -Math.PI / 2 }],
    ropes: [[-5.8, 2.5, -5.8, 3.6], [-8.6, 2.5, -8.6, 3.6]],
    // Jungle planters, [x, z, plant (even a palm, odd a bush), y, turn]: on the floor unless `y` stands one on the
    // mezzanine's deck.
    planters: [[-11.08, 5, 1], [-17, -4.1, 2], [-14.6, -23.2, 0, MEZZ.y, Math.PI], [14.6, -23.2, 4, MEZZ.y]],
    // The jackpot wheel on its own footing on the floor behind the stump, clear of its roots, high enough that its face
    // shows over the live cabinets' crowns from the doorway and the stage; it is spun from `play` on the stage's front,
    // square to its face, where the whole wheel shows over the cabinets and no cabinet's play spot is in reach.
    wheel: { x: 0, y: 5, z: -13.4, r: 1.5, play: { x: 0, z: -4.6, facing: Math.PI } },
    // The posters and the side walls' zone signs hang in the bays between the hall's posts, the posters' art clear of
    // the hall's vine curtains; the zone signs clear the paintings under them. The zones go by the Oogas' own words,
    // each with its earth paint for the handprints.
    posters: [
      [-9.5, 7.4, HALL.back + 0.1, 0, 2], [9.5, 7.4, HALL.back + 0.1, 0, 0], [HALL.halfW - 0.1, 3.8, -2.8, -Math.PI / 2, 1],
      [-HALL.halfW + 0.1, 4.6, -9.6, Math.PI / 2, 3], [HALL.halfW - 0.1, 6.2, 0.6, -Math.PI / 2, 2], [-HALL.halfW + 0.1, 6.4, -5.9, Math.PI / 2, 0]
    ],
    zones: [
      ["THRO-BALL", "#d9953a", HALL.halfW - 0.15, 7.3, -6.2, -Math.PI / 2], ["BONK COCONUT", "#c0402a", -HALL.halfW + 0.15, 7, -3.1, Math.PI / 2],
      ["OOGA PLAY", "#e0a83a", 4.4, 4.6, HALL.front - 0.12, Math.PI], ["BEST OOGA", "#c8583a", -4.4, 4.6, HALL.front - 0.12, Math.PI]
    ],
    // Carved gourd lanterns hung on lianas from the rock overhead, in rows down the hall: [x, z, how far each hangs
    // from `LANTERN_Y`]. The back pair hangs low by the deck's front, under the back wall's paintings as the hall sees
    // them, and none hangs over the stage's front, so dark frames the mammoth's skull.
    lanterns: [...[-12.5, 12.5].flatMap((x) => [[-17.4, -2.4], [-11.3, -0.45], [-7.9, 0.35], [-4.5, 0], [-1.1, -0.45], [2.3, 0.35]].map(([z, dy]) => [x, z, dy])),
      ...[-3.6, 3.6].flatMap((x) => [[-1.1, -0.45], [2.3, 0.35]].map(([z, dy]) => [x, z, dy]))],
    arc: ARC,
    // The hall of fame hung high off the stage's left, turned to face the doorway, clear of the mammoth over the stage;
    // the spirit rattle over the stage's middle, the prize shelf by the counter and the directory by the doorway.
    fame: { x: -6.4, y: 6.2, z: -7.4, turn: 0.62 }, disco: { x: 0, y: 7.7, z: -7.5 }, shelf: { x: -7.2, y: 5, z: HALL.front - 0.2, turn: Math.PI },
    directory: { x: 8, y: 2.4, z: HALL.front - 0.12, turn: Math.PI },
    // The locked back room's door under the mezzanine, between two of its columns.
    backDoor: { x: -6.455, z: HALL.back + 0.06 },
    bins: [[-4.4, 4.75], [17.1, 1.35], [-17.1, -3.3]], buckets: [[14.2, 3.8]],
    // The hall's stores, [x, y, z, turn, kind, how far each reaches from its middle]: firewood piled on the deck behind
    // its rail and under the right stair by a barrel, and a basket of coconuts by the left wall near the snack bar.
    stores: [[9.9, MEZZ.y, -18.9, 0, "wood", 0.375], [15.8, 0, -17.2, Math.PI / 2, "wood", 0.375], [-17.1, 0, 1.3, 0.4, "nuts", 0.31]],
    sign: { x: 0, y: 9, z: HALL.back + 0.62 }
  };
  const TIMBER_DK = "#5c3a1e";
  const TIMBER_LT = "#a8703e";
  const BONE = "#efe6d2";
  const BANANA = "#ffd23a";
  const RED = "#e0452b";
  const GLASS_DK = "#0b0d10";

  // ---- small builders -------------------------------------------------------------------------------------
  // A flat bar from a to b in the (z, y) plane at x: its length along the line, `t` across it and `w` thick in x.
  const strip = (x, a, b, color, w = 0.1, t = 0.035, emissive = 0) => {
    const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
    return moved(turnedX(box({ w, h: t, d: len + t * 0.5, color, emissive }), -Math.atan2(dy, dz)), x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  };
  // A convex outline in the (z, y) plane stood on edge at x, `w` thick.
  const sideShape = (points, x, w, color, emissive = 0) => moved(turnedY(prism(points, w, color, emissive), -Math.PI / 2), x, 0, 0);
  // An outline as prism and a face take it: counter-clockwise from the front (its signed area not negative), whatever
  // order its corners came in.
  const ccw = (pts) => {
    let area = 0;
    for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    return area < 0 ? pts.slice().reverse() : pts;
  };
  // An oval's outline, `n` corners `rx` by `ry` round the origin, counter-clockwise from +x; `oval(1, 1, n)` is the
  // unit round the paint's dots and blots are cut from.
  const oval = (rx, ry, n = 14) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * rx, Math.sin(k / n * Math.PI * 2) * ry]);
  // A hex colour scaled by k, each channel held to 255.
  const tint = (hex, k) => `#${hexToRgb(hex).map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0")).join("")}`;
  // A copy of a built geometry scaled about the origin, and one marked for the renderer's glass pass.
  const scaled = (geo, k) => { const g = merge(geo); for (let i = 0; i < g.verts.length; i++) g.verts[i] *= k; return g; };

  // ---- pixel art ----------------------------------------------------------------------------------------
  // A grid of palette indices, text in the 5x7 font, lines and rectangles; `bake` turns it into quads.
  const grid = (w, h) => ({ w, h, pix: new Uint8Array(w * h) });
  const at = (g, x, y, c) => { if (x >= 0 && x < g.w && y >= 0 && y < g.h) g.pix[y * g.w + x] = c; };
  const rect = (g, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) at(g, x, y, c); };
  const textWidth = (s) => s.length * (GLYPH_W + TRACKING) - TRACKING;
  const text = (g, s, x, y, c) => {
    for (const ch of s) {
      const rows = glyphOf(ch);
      for (let r = 0; r < GLYPH_H; r++) for (let col = 0; col < GLYPH_W; col++) if (rows[r] >> (GLYPH_W - 1 - col) & 1) at(g, x + col, y + r, c);
      x += GLYPH_W + TRACKING;
    }
  };
  const centred = (g, s, y, c) => text(g, s, Math.floor((g.w - textWidth(s)) / 2), y, c);
  const line = (g, x0, y0, x1, y1, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) at(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
  };
  // Every lit run of one colour on a row is one quad, `cell` metres a pixel, centred on the origin facing +z. Index 0
  // is the dark glass: drawn as one quad behind the pixels with that glow when `back` is set, never as pixels.
  const bake = (g, palette, cell, back = 0) => {
    const geo = geometry(), rgb = palette.map(hexToRgb), x0 = -g.w * cell / 2, y0 = g.h * cell / 2;
    const quad = (ax, ay, bx, by, z, color, emissive) => {
      const a = pushVert(geo, ax, ay, z), b = pushVert(geo, bx, ay, z), c = pushVert(geo, bx, by, z), d = pushVert(geo, ax, by, z);
      face(geo, [a, b, c, d], color, { emissive });
    };
    if (back) quad(x0, -y0, -x0, y0, 0, rgb[0], back);
    for (let y = 0; y < g.h; y++) {
      let x = 0;
      while (x < g.w) {
        const c = g.pix[y * g.w + x];
        if (!c) { x++; continue; }
        let end = x + 1;
        while (end < g.w && g.pix[y * g.w + end] === c) end++;
        quad(x0 + x * cell, y0 - (y + 1) * cell, x0 + end * cell, y0 - y * cell, 0.004, rgb[c], 1);
        x = end;
      }
    }
    return unshadowed(geo);
  };
  const MAT_Y = 0.009;
  // A face's corners in the order that faces it along n (Newell's normal against n).
  const facing = (geo, ids, n) => {
    const v = geo.verts;
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < ids.length; k++) {
      const a = ids[k] * 3, b = ids[(k + 1) % ids.length] * 3;
      x += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
      y += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
      z += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
    }
    return x * n[0] + y * n[1] + z * n[2] < 0 ? ids.reverse() : ids;
  };

  // ---- the Oogas' cave paint ------------------------------------------------------------------------------
  // The Oogas paint their cave and their machines alike, in ochre, red earth, charcoal and chalk (and `EMBER_GLOW`,
  // the fires' own glow). Each painter writes flat shapes into `g` on its xy plane at depth `z` facing +z, glowing
  // `e`: `daubPoly` a convex patch in either winding, `daubDot` a dab (an oval `rx` by `ry` turned `rot`), `daubTaper`
  // a brush line through [x, y] points swelling and thinning by `w(t)` along it and `daubStroke` one `w` wide with
  // round ends, `daubHand` a handprint `s` tall turned `rot`, `daubZigzag` a band of teeth, `daubSpiral` a sun spiral
  // with its rays and `daubOoga` a stick-figure Ooga `s` tall throwing a coconut toward +x (the `MARK.ooga` figures
  // below have a wider head, a tuft of hair and a pose each). Stand the result on a face with `moved` and the
  // `turned*` helpers a hair proud of it; `mirroredX` flips a drawn piece left to right, still facing +z, for a face
  // that runs the other way. Then the marks they draw, each `s` tall or long at (x, y): a banana, a coconut, a
  // footprint, a flame and a fire, an Ooga with a spear, dancing or carrying something over its head (`f` -1 turns
  // it to face left), a mammoth, and the four games as pictographs: a kart, a parachute, a rocket and a pick.
  const EARTH_OCHRE = "#d9953a";
  const EARTH_RED = "#b8472c";
  const EARTH_BLACK = "#2b221d";
  const EARTH_CHALK = "#eadfc6";
  const EMBER_GLOW = "#ff8a2a";
  const daubPoly = (g, pts, color, e = 0, z = 0) => {
    face(g, ccw(pts).map(([x, y]) => pushVert(g, x, y, z)), hexToRgb(color), { emissive: e });
    return g;
  };
  const daubDot = (g, x, y, rx, ry, color, e = 0, rot = 0, z = 0, sides = 10) => {
    const c = Math.cos(rot), s = Math.sin(rot), ids = [];
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * ry;
      ids.push(pushVert(g, x + u * c - v * s, y + u * s + v * c, z));
    }
    face(g, ids, hexToRgb(color), { emissive: e });
    return g;
  };
  const daubTaper = (g, pts, w, color, e = 0, z = 0) => {
    const rgb = hexToRgb(color), n = pts.length;
    let l0 = -1, r0 = -1;
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, h = w(k / (n - 1)) / 2;
      const nx = (a[1] - b[1]) / len * h, ny = (b[0] - a[0]) / len * h;
      const l1 = pushVert(g, pts[k][0] + nx, pts[k][1] + ny, z), r1 = pushVert(g, pts[k][0] - nx, pts[k][1] - ny, z);
      if (k) face(g, [r0, r1, l1, l0], rgb, { emissive: e });
      l0 = l1; r0 = r1;
    }
    return g;
  };
  const daubStroke = (g, pts, w, color, e = 0, z = 0) => {
    daubTaper(g, pts, () => w, color, e, z);
    for (const p of [pts[0], pts[pts.length - 1]]) daubDot(g, p[0], p[1], w / 2, w / 2, color, e, 0, z, 6);
    return g;
  };
  // The fingers as [across, lean, length] from the palm's top, in handprint heights.
  const FINGERS = [[-0.19, -0.32, 0.3], [-0.07, -0.1, 0.38], [0.06, 0.08, 0.4], [0.18, 0.28, 0.32]];
  const daubHand = (g, x, y, s, rot, color, e = 0, z = 0) => {
    const c = Math.cos(rot), sn = Math.sin(rot), at = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
    const [px, py] = at(0, 0.3);
    daubDot(g, px, py, 0.25 * s, 0.28 * s, color, e, rot, z);
    for (const [u, lean, len] of FINGERS) daubStroke(g, [at(u, 0.48), at(u + Math.sin(lean) * len, 0.48 + Math.cos(lean) * len)], 0.1 * s, color, e, z);
    return daubStroke(g, [at(0.2, 0.22), at(0.46, 0.46)], 0.11 * s, color, e, z);
  };
  const daubZigzag = (g, x0, x1, y, amp, teeth, w, color, e = 0, z = 0) =>
    daubStroke(g, Array.from({ length: teeth * 2 + 1 }, (_, k) => [x0 + (x1 - x0) * k / (teeth * 2), y + (k % 2 ? amp : -amp)]), w, color, e, z);
  // An Ooga's legs, then arms, as [x, y] runs in its heights from the hip and the shoulder, per pose.
  const OOGA_POSES = {
    spear: [[[-0.04, 0.44], [-0.14, 0.22], [-0.24, 0]], [[0.04, 0.44], [0.15, 0.24], [0.2, 0]], [[-0.05, 0.68], [-0.15, 0.52], [-0.2, 0.4]], [[0.05, 0.68], [0.2, 0.76], [0.3, 0.88]]],
    dance: [[[-0.04, 0.44], [-0.2, 0.26], [-0.14, 0]], [[0.04, 0.44], [0.2, 0.26], [0.14, 0]], [[-0.05, 0.68], [-0.2, 0.82], [-0.3, 1]], [[0.05, 0.68], [0.2, 0.82], [0.3, 1]]],
    carry: [[[-0.04, 0.44], [-0.1, 0.22], [-0.12, 0]], [[0.04, 0.44], [0.1, 0.22], [0.12, 0]], [[-0.05, 0.68], [-0.19, 0.86], [-0.1, 1.04]], [[0.05, 0.68], [0.19, 0.86], [0.1, 1.04]]],
    dunk: [[[-0.04, 0.44], [0.1, 0.3], [-0.08, 0.16]], [[0.04, 0.44], [0.18, 0.26], [0.02, 0.08]], [[-0.05, 0.68], [-0.2, 0.64], [-0.32, 0.76]], [[0.05, 0.68], [0.16, 0.88], [0.26, 1.06]]]
  };
  const MARK = {
    banana: (g, x, y, s, rot, color, e, z = 0) => {
      const c = Math.cos(rot), sn = Math.sin(rot), at = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s], pts = [];
      for (let k = 0; k <= 8; k++) { const t = (k / 8 - 0.5) * 1.9; pts.push(at(Math.sin(t) * 0.5, 0.3 - Math.cos(t) * 0.5)); }
      daubTaper(g, pts, (t) => s * 0.25 * Math.sin(Math.PI * (0.06 + 0.88 * t)), color, e, z);
      return daubStroke(g, [pts[8], at(0.5, 0.14)], s * 0.05, color, e, z);
    },
    coconut: (g, x, y, s, color, e, z = 0) => {
      daubDot(g, x, y, s * 0.36, s * 0.33, color, e, 0, z, 12);
      for (const [u, v] of [[-0.1, 0.07], [0.1, 0.07], [0, -0.1]]) daubDot(g, x + u * s, y + v * s, s * 0.055, s * 0.055, EARTH_BLACK, 0, 0, z + 0.004, 6);
      return g;
    },
    foot: (g, x, y, s, rot, color, e, z = 0) => {
      const c = Math.cos(rot), sn = Math.sin(rot), at = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
      daubDot(g, x, y, s * 0.2, s * 0.38, color, e, rot, z, 9);
      for (const [u, v, r] of [[-0.12, 0.5, 0.075], [-0.02, 0.55, 0.06], [0.07, 0.52, 0.052], [0.14, 0.46, 0.046], [0.19, 0.38, 0.04]]) daubDot(g, ...at(u, v), r * s, r * s, color, e, 0, z, 6);
      return g;
    },
    flame: (g, x, y, s, color, e, z = 0, lean = 0) => {
      const w = s * 0.34;
      return daubPoly(g, [[x + lean * s, y + s], [x - w * 0.72, y + w * 1.25], [x - w, y + w * 0.55], [x - w * 0.66, y + w * 0.08], [x, y], [x + w * 0.66, y + w * 0.08], [x + w, y + w * 0.55], [x + w * 0.72, y + w * 1.25]], color, e, z);
    },
    fire: (g, x, y, s, e, z = 0) => {
      daubStroke(g, [[x - s * 0.42, y - s * 0.02], [x + s * 0.42, y + s * 0.1]], s * 0.08, EARTH_OCHRE, e, z);
      daubStroke(g, [[x - s * 0.4, y + s * 0.1], [x + s * 0.42, y - s * 0.03]], s * 0.08, EARTH_OCHRE, e, z + 0.004);
      MARK.flame(g, x, y + s * 0.04, s, EARTH_RED, e, z + 0.008, 0.06);
      MARK.flame(g, x, y + s * 0.06, s * 0.66, EARTH_OCHRE, e, z + 0.012, -0.05);
      return MARK.flame(g, x, y + s * 0.08, s * 0.34, EARTH_CHALK, e, z + 0.016, 0.03);
    },
    ooga: (g, x, y, s, pose, color, e, z = 0, f = 1) => {
      const at = ([u, v]) => [x + u * s * f, y + v * s];
      daubDot(g, ...at([0.02, 0.88]), 0.11 * s, 0.1 * s, color, e, 0, z);
      daubDot(g, ...at([0, 0.56]), 0.13 * s, 0.17 * s, color, e, 0, z);
      daubStroke(g, [[-0.09, 0.94], [-0.05, 1.02], [0, 0.96], [0.05, 1.03], [0.1, 0.95]].map(at), 0.035 * s, color, e, z);
      for (const limb of OOGA_POSES[pose]) daubStroke(g, limb.map(at), 0.065 * s, color, e, z);
      if (pose !== "spear") return g;
      daubStroke(g, [at([-0.3, 0.56]), at([0.72, 1.06])], 0.03 * s, color, e, z);
      return daubPoly(g, [at([0.66, 1.08]), at([0.9, 1.14]), at([0.74, 0.98])], EARTH_CHALK, e, z + 0.004);
    },
    mammoth: (g, x, y, s, color, e, z = 0, f = 1) => {
      const at = (u, v) => [x + u * s * f, y + v * s];
      daubDot(g, ...at(0, 0.56), s * 0.5, s * 0.3, color, e, 0, z, 16);
      daubDot(g, ...at(0.18, 0.72), s * 0.32, s * 0.2, color, e, 0, z, 12);
      daubDot(g, ...at(0.47, 0.64), s * 0.19, s * 0.21, color, e, 0, z);
      daubDot(g, ...at(0.4, 0.84), s * 0.13, s * 0.13, color, e, 0, z, 9);
      for (const [u, d] of [[-0.36, -0.03], [-0.2, 0.02], [0.17, -0.02], [0.32, 0.03]]) daubStroke(g, [at(u, 0.5), at(u + d, 0.04)], s * 0.13, color, e, z);
      daubTaper(g, [at(0.6, 0.62), at(0.7, 0.42), at(0.71, 0.2), at(0.63, 0.08)], (t) => s * (0.13 - 0.08 * t), color, e, z);
      daubStroke(g, [at(-0.48, 0.66), at(-0.58, 0.44)], s * 0.035, color, e, z);
      daubTaper(g, [at(0.57, 0.5), at(0.74, 0.35), at(0.89, 0.39), at(0.95, 0.53)], (t) => s * (0.07 - 0.055 * t), EARTH_CHALK, e, z + 0.004);
      daubDot(g, ...at(0.51, 0.72), s * 0.03, s * 0.03, EARTH_BLACK, 0, 0, z + 0.004, 6);
      return daubStroke(g, Array.from({ length: 13 }, (_, k) => at(-0.42 + k * 0.07, k % 2 ? 0.3 : 0.37)), s * 0.028, EARTH_BLACK, 0, z + 0.004);
    },
    kart: (g, x, y, s, color, e, z = 0) => {
      const at = (u, v) => [x + u * s, y + v * s];
      daubPoly(g, [at(-0.5, 0.2), at(0.44, 0.2), at(0.56, 0.34), at(0.22, 0.44), at(-0.46, 0.42)], color, e, z);
      for (const u of [-0.3, 0.32]) { daubDot(g, ...at(u, 0.15), s * 0.15, s * 0.15, color, e, 0, z, 12); daubDot(g, ...at(u, 0.15), s * 0.06, s * 0.06, EARTH_CHALK, e, 0, z + 0.004, 8); }
      daubDot(g, ...at(-0.04, 0.66), s * 0.13, s * 0.13, color, e, 0, z);
      daubStroke(g, [at(-0.05, 0.42), at(-0.04, 0.56)], s * 0.13, color, e, z);
      daubStroke(g, [at(0, 0.52), at(0.2, 0.48)], s * 0.055, color, e, z);
      daubStroke(g, [at(-0.42, 0.42), at(-0.5, 1)], s * 0.035, color, e, z);
      daubPoly(g, [at(-0.5, 1), at(-0.5, 0.78), at(-0.2, 0.89)], EARTH_RED, e, z);
      for (const v of [0.22, 0.32, 0.42]) daubStroke(g, [at(-0.64, v), at(-0.86, v)], s * 0.035, color, e, z);
      return g;
    },
    chute: (g, x, y, s, color, e, z = 0) => {
      const at = (u, v) => [x + u * s, y + v * s];
      daubPoly(g, Array.from({ length: 11 }, (_, k) => at(Math.cos(k / 10 * Math.PI) * 0.5, 0.72 + Math.sin(k / 10 * Math.PI) * 0.3)), color, e, z);
      for (let k = 0; k < 4; k++) daubDot(g, ...at(-0.375 + k * 0.25, 0.72), s * 0.125, s * 0.05, color, e, 0, z, 8);
      for (const u of [-0.46, -0.16, 0.16, 0.46]) daubStroke(g, [at(u, 0.7), at(u * 0.12, 0.38)], s * 0.018, color, e, z);
      return MARK.ooga(g, x, y - s * 0.04, s * 0.42, "carry", color, e, z);
    },
    rocket: (g, x, y, s, color, e, z = 0) => {
      const at = (u, v) => [x + u * s, y + v * s];
      MARK.flame(g, ...at(0, 0.2), -s * 0.32, EARTH_RED, e, z);
      MARK.flame(g, ...at(0, 0.2), -s * 0.19, EARTH_OCHRE, e, z + 0.004);
      daubPoly(g, [at(-0.12, 0.2), at(0.12, 0.2), at(0.12, 0.7), at(0, 0.96), at(-0.12, 0.7)], color, e, z + 0.008);
      for (const sx of [-1, 1]) daubPoly(g, [at(sx * 0.12, 0.2), at(sx * 0.12, 0.44), at(sx * 0.28, 0.12)], color, e, z + 0.008);
      daubDot(g, ...at(0, 0.62), s * 0.06, s * 0.06, EARTH_CHALK, e, 0, z + 0.012, 8);
      for (const [u, v] of [[-0.4, 0.82], [0.36, 0.64], [0.42, 0.96], [-0.32, 0.42]]) daubDot(g, ...at(u, v), s * 0.03, s * 0.03, color, e, 0, z, 5);
      return g;
    },
    pick: (g, x, y, s, color, e, z = 0) => {
      const at = (u, v) => [x + u * s, y + v * s], R = 0.5, cu = 0.22 - 0.6 * R, cv = 0.72 - 0.8 * R;
      daubStroke(g, [at(-0.3, 0.02), at(0.22, 0.72)], s * 0.075, color, e, z);
      daubTaper(g, Array.from({ length: 9 }, (_, k) => { const t = 0.93 + (k / 8 - 0.5) * 1.9; return at(cu + Math.cos(t) * R, cv + Math.sin(t) * R); }), (t) => s * 0.13 * Math.sin(Math.PI * (0.05 + 0.9 * t)), EARTH_CHALK, e, z + 0.004);
      for (const [u, v, r] of [[0.42, 0.08, 0.07], [0.56, 0.16, 0.05], [0.52, 0.02, 0.045]]) daubDot(g, ...at(u, v), s * r, s * r, color, e, 0, z, 6);
      return g;
    },
    // The hoop shot's: an Ooga leaping to dunk a coconut into a hoop before him, its net hanging under it.
    dunk: (g, x, y, s, color, e, z = 0) => {
      const at = (u, v) => [x + u * s, y + v * s];
      MARK.ooga(g, x, y, s, "dunk", color, e, z);
      daubStroke(g, Array.from({ length: 13 }, (_, k) => at(0.5 + Math.cos(k / 12 * Math.PI * 2) * 0.17, 0.92 + Math.sin(k / 12 * Math.PI * 2) * 0.045)), s * 0.035, EARTH_CHALK, e, z + 0.004);
      daubZigzag(g, ...[0.36, 0.64].map((u) => x + u * s), y + 0.82 * s, s * 0.05, 3, s * 0.022, EARTH_CHALK, e, z + 0.004);
      for (const u of [0.36, 0.64]) daubStroke(g, [at(u, 0.91), at(0.5 + (u - 0.5) * 0.6, 0.72)], s * 0.022, EARTH_CHALK, e, z + 0.004);
      return MARK.coconut(g, ...at(0.36, 1.12), s * 0.3, EARTH_RED, e, z + 0.008);
    }
  };
  // A block of rock written into `geo`: its face `w` along `r` by `h` along `u` round the point `at`, facing out along
  // `n`, bulging `bulge` at its middle and rounded over a chamfer `c` into sides a shade darker running `d` back; its
  // back is left open, since nothing sees it. Its corners are shared, so a `smooth` geometry shades it as one soft
  // stone. Each face is wound to face out, whichever hand r, u and n make.
  const stone = (geo, at, r, u, n, w, h, d, c, bulge, color) => {
    const rgb = hexToRgb(color), chamfer = rgb.map((v) => Math.round(v * 0.9)), side = rgb.map((v) => Math.round(v * 0.72)), x = w / 2, y = h / 2;
    const dir = (a, b, o) => [0, 1, 2].map((k) => r[k] * a + u[k] * b + n[k] * o), P = (a, b, o) => { const p = dir(a, b, o); return pushVert(geo, at[0] + p[0], at[1] + p[1], at[2] + p[2]); };
    const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]], mid = P(0, 0, bulge);
    const inner = S.map(([a, b]) => P(a * (x - c), b * (y - c), 0)), outer = S.map(([a, b]) => P(a * x, b * y, -c)), back = S.map(([a, b]) => P(a * x, b * y, -d));
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4, ea = (S[k][0] + S[j][0]) / 2, eb = (S[k][1] + S[j][1]) / 2;
      face(geo, facing(geo, [mid, inner[k], inner[j]], n), rgb);
      face(geo, facing(geo, [inner[k], outer[k], outer[j], inner[j]], dir(ea, eb, 1)), chamfer);
      face(geo, facing(geo, [outer[k], back[k], back[j], outer[j]], dir(ea, eb, 0)), side);
    }
  };
  // A fire's flame (`blaze`), half a metre tall at size 1: a fat teardrop licking up to a point with three smaller
  // tongues leaning out round its foot, the whole twisted a little as it rises, white-gold at the root through yellow
  // and orange to red at the tips, glowing. Smooth and unshadowed, its tips sway; the scene stands one on each fire
  // (`lanterns().flames`) and flickers each on its own clock. The big sign's torches burn the flat, still `flame`
  // (below) instead, baked into its mesh.
  const blaze = BL.blaze.smooth;
  // Overhead, the cave the Oogas moved into (`ceiling`): big clusters of stalactites dripping off the bare rock in
  // loose rows, some grown through by roots that wind down round them with moss where they come out, and a few
  // clusters of glowing teal crystal up by the side walls, all clear of the spots, the gourds' vines, the bunting and
  // the hall of fame. And the hero over the stage: a mammoth's skeleton walking on air, hung side-on to the doorway
  // between the spots' rows, its head toward +x, so the way in and the stage see its profile as the cave painting
  // shows one.
  // `MAMMOTH_AT` is the middle of its back, right over the spirit rattle; in its own frame +z runs from its tail to
  // its head, along the hall's x. The high domed skull with a trunk socket ringed in bone in its face, a dark eye
  // socket under a brow each side and its jaw hanging a little open; two great tusks leaving the face down and
  // forward, spreading out as they sweep forward and curling up and in at their tips; the spine climbing from a short
  // hanging tail and the hips up the sloping back to a high shoulder hump, tall spines standing up along it, then down
  // the neck to the skull; the ribs curving down and in, open under the belly where the spirit rattle hangs through;
  // shoulder blades, hip bones and four legs hanging a little bent. It hangs from the rock on thick lianas, a pair to
  // its skull, its shoulders and its hips, with leaves where each leaves the rock and where it ties on. Bone white
  // and smooth, unshadowed; the ceiling and the mammoth are one geometry.
  const MAMMOTH_AT = { x: -0.7, y: 9, z: LAYOUT.disco.z };
  // Fire and seed pods, the lights the Oogas hang where bulbs were: a cartoon flame `h` tall on the origin, three lit
  // tongues licking up +y and fanned out across x, white-gold at the root to red at the tips in five inks; and a seed
  // pod glowing `color`, hanging point down from a dark stalk at the origin. The flame is not the hall's `blaze`
  // (smooth, twisted round and swaying on a node of its own): flat-faced and still, it bakes into the big sign's lit
  // mesh, which the scene flickers as one.
  const FLAME_INKS = ["#fff2b0", "#ffd048", "#ffa030", "#ff7020", "#e8501a"];
  const tongue = (h, r) => lathe({ profile: [[0, 0], [r * 0.85, h * 0.1], [r, h * 0.28], [r * 0.7, h * 0.55], [r * 0.3, h * 0.82], [0, h]], segments: 8, color: (t) => FLAME_INKS[Math.min(4, Math.floor(t * 5))], emissive: 1 });
  const flame = (h) => unshadowed(merge(tongue(h, h * 0.3), moved(turnedZ(tongue(h * 0.62, h * 0.2), 0.45), -h * 0.13, h * 0.03, 0.02), moved(turnedZ(tongue(h * 0.5, h * 0.17), -0.5), h * 0.13, h * 0.02, -0.02)));
  // An ember a celebration throws, as a fire does: a small tongue of flame round its middle glowing one of
  // `SPARK_INKS`, for the scenes' `fx.burst`, which tumbles it as it flies.
  const SPARK_INKS = ["#ffb13b", "#ff7a2a", "#fff2b8"];
  const spark = variants((i) => unshadowed(lathe({ profile: [[0, -0.025], [0.016, -0.018], [0.02, -0.005], [0.013, 0.015], [0.005, 0.03], [0, 0.04]], segments: 6, color: SPARK_INKS[i], emissive: 1 })));
  // The fire baskets over the stage, [x, z] in the hall, each hung at `SPOT_Y` where its vine ends. `spotCan` is one
  // in its frame, the pivot at the origin: a cane basket hung mouth up on a bail of three ropes, open work of ribs
  // bound round three hoops and a slanting cane across each gap, a woven dish for its floor and the fire glowing
  // through every gap from the embers heaped inside; the scene stands a `blaze` in it `SPOT_FIRE` under the pivot.
  // `spotRods` the lianas the pivots hang from, a lashing where each ties on and leaves where each comes out of the
  // rock.
  const SPOT_Y = HALL.h - 1.1;
  const SPOT_FIRE = 0.86;
  const SPOTS = [[-4.6, -3], [4.6, -3], [-3.2, -12.5], [3.2, -12.5]];
  // The jackpot wheel on its totem behind the stage, facing the doorway: `face` is the spinning millstone, a
  // thick disc of stone with twenty wedges daubed on it by hand in charcoal, ochre, umber and red earth (the
  // jackpot gold), their edges wobbling short of a carved groove between each two and the stone showing through each
  // in specks, each with its ticket value brushed on in charcoal or bone and a banana, a hand or a coconut beside the
  // value on four (`WHEEL_ART`); bone pegs round its edge and a stone boss ringed in bone with a banana; its back, seen
  // from the deck, daubed with a sun and handprints. `frame` is the turned timber hoop round it bound in rope and
  // lashed in four places, a bone tusk hanging from a timber bracket for the clapper, BIG SPIN brushed in gold round
  // the hoop's top either side of it, leaves bunched behind the side lashings, and the pedestal, a log totem carved
  // with a tiki face between two bone bands on a stone plinth that stands on the floor, ferns at its foot; nothing
  // stands over the hoop into the big sign behind it. `bulbs` the two clusters of seed pods hanging on vines from the
  // side lashings, as three geometries (the first, second and third pod of each), so the scene can chase them.
  // Where the mezzanine's log posts stand, [x, z] in the hall, on the interior kit's deck grid (`deckPosts`).
  const MEZZ_POSTS = BL.models.deckPosts(HALL.halfW * 2 - 0.1, MEZZ.z1 - MEZZ.z0).map(([x, z]) => [x, z + (MEZZ.z0 + MEZZ.z1) / 2]);
  // The wheel's game: a spin costs `WHEEL_COST` tickets and pays the value of the wedge the clapper stops on. One
  // jackpot at ten spins' cost (gold) opposite the 1, the three at or near the cost spread round it, and the small ones
  // between, so small and big alternate round the face: 340 tickets in all, a spin pays back 17 of its 20 on average
  // (85%), and the house wins slowly.
  const WHEEL_VALUES = [200, 2, 10, 5, 20, 2, 10, 2, 25, 2, 1, 2, 15, 5, 10, 2, 10, 5, 10, 2];
  const WHEEL_COST = 20;

  // The frame round the big sign on the back wall, the Oogas' own: three rough stone slabs laid behind it, a log post
  // up each side and a log lintel across the top lashed to them, a mammoth's tusks set in stone lumps at the posts'
  // feet curving up either side, a big bone
  // on the lintel's middle, a leafy garland slung along it in scallops and a spray of leaves at each corner, rope
  // bound round each end of the carved sign over its corner plates; and a tiki torch leaning out from the wall each
  // side, a bamboo pole pegged and lashed to the wall under a woven head. `bulbs` is their fire, the only lit faces
  // (the scene flickers it). The scene hangs the carved sign, `name` under its `icon`, `w` - 0.9 wide and 0.08 in
  // front of it.
  const SIGN_FRAME = { w: 7.4, h: 2.3, name: "Ooga Arcade", icon: "banana" };
  // Rope bound round each end of a carved sign over its iron corner plates (the island's `caveSign`, shared, keeps
  // its iron), for the sign `text` with `icon` as the scene hangs it, scaled to `width` across and centred on
  // (x, y, z): three turns wrapped up the planks' face just outside the post, over the top and under the foot, the
  // middle one a shade darker, covering both plates and their rivets. Flat parts, built once per sign in its own
  // units (`bindings`).
  const bindings = BL.models.scopedMap();
  const signBinding = (text, icon, width, x, y, z) => {
    const sign = BL.hubModels.caveSign(text, icon), b = BL.scene.boundsOf(sign), k = width / (b.max[0] - b.min[0]), key = `${text}|${icon}`;
    let turns = bindings.get(key);
    if (!turns) {
      const half = sign.signHeight / 2 + 0.015, front = b.max[2] + 0.01, back = b.min[2] - 0.015;
      turns = [];
      for (const sx of [-1, 1]) for (let t = 0; t < 3; t++) {
        const cx = sx * (sign.signWidth / 2 - 0.17) + (t - 1) * 0.085, color = t === 1 ? "#a8844e" : ROPE;
        turns.push(bevelBox({ w: 0.08, h: half * 2 + 0.03, d: 0.03, color, bevel: 0.008, offset: { x: cx, z: front - 0.015 } }));
        for (const sy of [-1, 1]) turns.push(box({ w: 0.08, h: 0.03, d: front - back, color, offset: { x: cx, y: sy * half, z: (front + back) / 2 } }));
      }
      bindings.set(key, turns);
    }
    return turns.map((p) => moved(scaled(p, k), x, y, z));
  };

  // ---- the Oogas' trim ------------------------------------------------------------------------------------
  // What the island gives, for the cabinets, the signs and the boards: a curved bone tusk and a small bone (round
  // parts for `shaded`), and a long two-tone leaf and a broad arching banana leaf written into a
  // `hubModels.withJungle` geometry.
  // A tusk `len` long, `r` thick at its root on the origin and tapering to a point: it rises up +y and curls toward
  // +z, near straight at the root and hooking over at the tip (`curl` radians in all). In another `color` and ending
  // blunt, `end` times its root's thickness, it is a trunk.
  const boneTusk = (len, r, curl, color = BONE, end = 0) => {
    const n = 8, rows = [[0, 0]], ay = [0], az = [0], ang = [0];
    for (let k = 1; k <= n; k++) {
      const m = curl * ((k - 0.5) / n) ** 3;
      ay.push(ay[k - 1] + Math.cos(m) * len / n); az.push(az[k - 1] + Math.sin(m) * len / n); ang.push(curl * (k / n) ** 3);
    }
    for (let k = 0; k <= n; k++) rows.push([r * (end + (1 - end) * (1 - k / n) ** 0.7), k / n * len]);
    if (end) rows.push([0, len]);
    // Each ring of the straight lathe stands on the curled spine, turned with it.
    const geo = turn(rows, 8, color), v = geo.verts;
    for (let i = 0; i < v.length; i += 3) {
      const k = Math.round(v[i + 1] / len * n), z = v[i + 2];
      v[i + 1] = ay[k] - z * Math.sin(ang[k]); v[i + 2] = az[k] + z * Math.cos(ang[k]);
    }
    return geo;
  };
  // A leaf from (x, y, z) along (ax, ay, az), its face turned toward (nx, ny, nz), `len` long and `broad` times the
  // kit leaf's width: `tone` is [light, dark] rgb for its two halves.
  const leafBlade = (g, x, y, z, ax, ay, az, nx, ny, nz, len, broad, tone) => {
    let l = Math.hypot(ax, ay, az);
    ax /= l; ay /= l; az /= l;
    const d = nx * ax + ny * ay + nz * az;
    nx -= d * ax; ny -= d * ay; nz -= d * az;
    l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    BL.hubModels.pointedLeaf(g, x, y, z, ax, ay, az, (ay * nz - az * ny) * broad, (az * nx - ax * nz) * broad, (ax * ny - ay * nx) * broad, nx, ny, nz, len, tone[0], tone[1]);
  };
  const IVY_TONES = [["#6fae3a", "#3f7a2b"], ["#86c24a", "#4f8f36"]].map((p) => p.map(hexToRgb));
  // A broad banana leaf, about 60 triangles: from a short stalk at (x, y, z) its midrib heads `yaw` round from -z
  // toward +x, rising at `up` radians and bending evenly over to `down` at its tip, `len` long, so it arches over and
  // droops. The blade is `broad` wide each side of the midrib at its widest, its halves folded down off the rib and
  // lit by the fold; `face` rolls it about the rib so its top turns toward +z (the front) the more it heads sideways,
  // and a tear notches its +x-side edge at rung `tear` (the other edge when negative, none at 0). Two-tone down the
  // midrib, deep green at the stalk and lighter to the tip: `tone` is [light, dark, tip light, tip dark] rgb.
  const LEAF_RUNGS = [[0, 0.1], [0.14, 0.14], [0.26, 0.7], [0.4, 0.98], [0.55, 1], [0.69, 0.88], [0.81, 0.66], [0.92, 0.38], [1, 0]];
  const BANANA_LEAF_TONES = [["#4a8f36", "#2f6a26", "#8ccb52", "#66a63c"], ["#549a3c", "#38752c", "#9ad35e", "#72b046"], ["#428535", "#2a6024", "#80c04c", "#5c9c38"]].map((p) => p.map(hexToRgb));
  const bananaLeaf = (g, x, y, z, { yaw, up, down, len, broad, face = 0, tone, tear = 0 }) => {
    const hx = Math.sin(yaw), hz = -Math.cos(yaw), roll = -hx * face, cr = Math.cos(roll), sr = Math.sin(roll), rows = [];
    const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
    const vert = (px, py, pz, nx, ny, nz) => { g.verts.push(px, py, pz); g.normals.push(nx, ny, nz); return g.verts.length / 3 - 1; };
    let s0 = 0;
    for (let k = 0; k < LEAF_RUNGS.length; k++) {
      // Walk the midrib to this rung at the pitch halfway there, then frame the rung: out of the leaf's top and
      // across it, rolled about the rib.
      const [s, width] = LEAF_RUNGS[k], mid = up + (down - up) * (s0 + s) / 2, step = (s - s0) * len, p = up + (down - up) * s;
      x += Math.cos(mid) * hx * step; y += Math.sin(mid) * step; z += Math.cos(mid) * hz * step; s0 = s;
      const n0 = [-hx * Math.sin(p), Math.cos(p), -hz * Math.sin(p)], a0 = [-hz, 0, hx];
      const n = n0.map((v, j) => v * cr - a0[j] * sr), a = a0.map((v, j) => v * cr + n0[j] * sr);
      rows.push((width ? [1, 0, -1] : [0]).map((side) => {
        const w = broad * width * (tear && tear === side * k ? 0.45 : 1) * side, fold = Math.abs(w) * 0.3, m = side * 0.5;
        const l = Math.hypot(n[0] + a[0] * m, n[1] + a[1] * m, n[2] + a[2] * m);
        return vert(x + a[0] * w - n[0] * fold, y + a[1] * w - n[1] * fold, z + a[2] * w - n[2] * fold, (n[0] + a[0] * m) / l, (n[1] + a[1] * m) / l, (n[2] + a[2] * m) / l);
      }));
    }
    const both = (ids, color) => g.faces.push({ i: ids, color, emissive: 0 }, { i: ids.slice().reverse(), color, emissive: 0 });
    for (let k = 1; k < rows.length; k++) {
      const t = (LEAF_RUNGS[k - 1][0] + LEAF_RUNGS[k][0]) / 2, lo = rows[k - 1], hi = rows[k];
      const light = mix(tone[0], tone[2], t), dark = mix(tone[1], tone[3], t);
      if (hi.length === 1) { both([lo[0], lo[1], hi[0]], light); both([lo[1], lo[2], hi[0]], dark); }
      else { both([lo[0], lo[1], hi[1], hi[0]], light); both([lo[1], lo[2], hi[2], hi[1]], dark); }
    }
  };
  // A round part written into a `withJungle` geometry with its normals unset, so the renderer shades it smooth.
  const tuck = (g, part) => {
    const base = g.verts.length / 3;
    for (const v of part.verts) g.verts.push(v);
    for (const f of part.faces) g.faces.push({ ...f, i: f.i.map((k) => base + k) });
    BL.hubModels.padNormals(g);
  };

  // ---- a cabinet ----------------------------------------------------------------------------------------
  // The classic upright as the Oogas carve it, facing +z on y 0. Each side is the profile (base and control shelf,
  // the screen's slope, the marquee's overhang) cut from rough timber planks laid edge to edge, or from three stone
  // slabs on the stone cabinets, with a bark edge (a chipped darker stone one on the slabs) and a rope run down its
  // front edge, lashed round it by the screen and the marquee. The game's colour goes on only as cave paint: a
  // pictograph of its game on each side (a mammoth, an Ooga, a banana, a spiral or a coconut on the dark ones) over a
  // row of bone dots, a handprint or a spiral by the screen and dots or a zigzag along the marquee; and as two
  // handprints glowing where a player slaps to play, on a natural hide stretched over the front (`HIDE_TONES`: a
  // leopard's tan, a tiger's brown or a spotted beast's near-black, only a touch of the game's colour in it) and
  // stitched round in rope. It stands on two bark logs with a bamboo post lashed up each front corner of the base; a
  // timber kick board, and a tiki mouth carved in the hide (`tikiMouth`) that takes the coin, an ember in its throat;
  // a timber control shelf with a hide top, a coconut on a bone lever and three big husk-brown coconut-shell buttons
  // in an arc, each with a dot of paint on top, and a scrap of hide for the rules; the screen in a rough stone bezel
  // with painted corners; a marquee of warm hide catching the screen's and the fires' light behind the carved sign
  // (`MARQUEE`, rope bound over its corner plates) between two timber rails, a bone tusk hooking up each side of it,
  // and on the plank lid a log crest
  // carved into a tiki's brow and eyes, the fire in their pupils, so each cabinet stands as a totem. Tucked
  // in behind the crest a few broad banana leaves arch back and out, drooping at their tips, with a flower or a hand
  // of bananas on some; a liana climbs one
  // back corner (the +x one on even slots, -x on odd) with ivy leaves on it and over the top to the leaves.
  // `collisionGeometry` is the carved body without the paint, the
  // rope, the leaves and the vine, a closed shell for the island's solids.
  const SIDE = [
    [[0.45, 0], [0.45, 0.98], [0.15, 1.08], [-0.45, 1.08], [-0.45, 0]],
    [[0.15, 1.08], [-0.45, 1.08], [-0.45, 1.8], [0, 1.8]],
    [[0.32, 1.8], [-0.45, 1.8], [-0.45, 2.14], [0.32, 2.14]]
  ];
  const EDGE = [[0.45, 0.02], [0.45, 0.98], [0.15, 1.08], [0, 1.8], [0.32, 1.8], [0.32, 2.14], [-0.45, 2.14], [-0.45, 0.02]];
  const SCREEN = { y: 1.44, z: 0.09, lean: -0.21, w: 0.88, h: 0.66 };
  // Where each side's planks meet, bottom to top; a stone cabinet's three slabs meet only where its profile turns.
  const PLANKS = [0, 0.29, 0.56, 0.82, 1.08, 1.45, 1.8, 2.14];
  const SLABS = [0, 1.08, 1.8, 2.14];
  const PLANK_TONES = [1, 1.1, 0.92, 1.05, 0.96, 1.12, 0.94];
  const BARK = "#46301e";
  const ROPE = "#c9a36a";
  const STONE_LT = "#6b6259";
  // A colour mixed t of the way to another, and a game's bright colour as cave paint (earthed toward sienna) and as a
  // leather hide, nearly all the natural hide `base` with a touch of the colour in it.
  const blend = (a, b, t) => { const q = hexToRgb(b); return `#${hexToRgb(a).map((v, k) => Math.round(v + (q[k] - v) * t).toString(16).padStart(2, "0")).join("")}`; };
  const earth = (hex) => blend(hex, "#a0643a", 0.35);
  const leather = (hex, base = "#6b4528") => blend(hex, base, 0.88);
  // The fronts' hides by their markings (leopard, tiger, spotted): tan, brown and near-black, duller than the `hide`
  // kit's furs (`HIDES`) so a touch of the game's colour shows in them.
  const HIDE_TONES = ["#b08a56", "#8e5a30", "#4e3a2c"];
  // Where the scene hangs each cabinet's carved sign on its marquee: its middle and its width.
  const MARQUEE = { y: 1.97, z: 0.335, w: 0.82 };
  // A convex outline in the (z, y) plane cut to the band lo <= y <= hi.
  const band = (pts, lo, hi) => {
    let out = pts;
    for (const [edge, keep] of [[lo, 1], [hi, -1]]) {
      const src = out;
      out = [];
      for (let k = 0; k < src.length; k++) {
        const a = src[k], b = src[(k + 1) % src.length], da = (a[1] - edge) * keep, db = (b[1] - edge) * keep;
        if (da >= 0) out.push(a);
        if (da * db < 0) out.push([a[0] + (b[0] - a[0]) * da / (da - db), edge]);
      }
    }
    return out;
  };
  // Cave paint: pictographs in a unit box, u toward the front and v up, as strokes [kind, ink, ...]: "L" a bar from
  // (u0, v0) to (u1, v1) `w` wide, "P" a convex patch, "D" a dot at (u, v) of radius r. Ink 0 is the paint, 1 the
  // second colour, 2 bone. `arc` strokes a curve of radius r(t) round (cu, cv), swelling from w0 to w1 at its middle;
  // `dots` is a row of dots, `zigzag` a band of separate bars (where `daubZigzag` brushes one round-ended stroke), and
  // `mirror` flips the strokes left to right before they are drawn (where `mirroredX` flips a drawn geometry).
  const arc = (ink, cu, cv, r, a0, a1, n, w0, w1) => Array.from({ length: n }, (_, k) => {
    const p = (t) => [cu + Math.cos(a0 + (a1 - a0) * t) * r(t), cv + Math.sin(a0 + (a1 - a0) * t) * r(t)];
    const [u0, v0] = p(k / n), [u1, v1] = p((k + 1) / n);
    return ["L", ink, u0, v0, u1, v1, w0 + (w1 - w0) * Math.sin((k + 0.5) / n * Math.PI)];
  });
  const dots = (n, ink, gap, r) => Array.from({ length: n }, (_, k) => ["D", ink, (k - (n - 1) / 2) * gap, 0, r]);
  const zigzag = (n, ink) => Array.from({ length: n }, (_, k) => ["L", ink, (k - n / 2) * 0.9, k % 2 ? 0.45 : -0.45, (k + 1 - n / 2) * 0.9, k % 2 ? -0.45 : 0.45, 0.32]);
  const mirror = (ops) => ops.map(([kind, ink, ...a]) => kind === "L" ? [kind, ink, -a[0], a[1], -a[2], a[3], a[4]] : kind === "D" ? [kind, ink, -a[0], a[1], a[2]] : [kind, ink, a[0].map(([u, v]) => [-u, v])]);
  const PICTOS = {
    // Each game: the rally's kart with its Ooga and flag, the drop's chute, the orbit's rocket among stars, the
    // mine's pick over nuggets.
    race: [["P", 0, [[-0.8, -0.3], [0.85, -0.3], [0.7, 0.1], [-0.6, 0.1]]], ["D", 1, -0.5, -0.45, 0.22], ["D", 1, 0.55, -0.45, 0.22], ["D", 2, 0.1, 0.62, 0.17],
      ["L", 2, 0.1, 0.45, 0, 0.08, 0.12], ["L", 2, 0.05, 0.35, 0.55, 0.3, 0.09], ["L", 2, -0.7, 0.1, -0.7, 0.9, 0.06], ["P", 0, [[-0.68, 0.9], [-0.68, 0.58], [-0.25, 0.76]]]],
    drop: [["P", 0, [[-0.85, 0.3], [0.85, 0.3], [0.6, 0.7], [0, 0.88], [-0.6, 0.7]]], ["L", 2, -0.8, 0.3, -0.06, -0.2, 0.05], ["L", 2, 0.8, 0.3, 0.06, -0.2, 0.05],
      ["D", 2, 0, -0.12, 0.14], ["L", 2, 0, -0.25, 0, -0.6, 0.1], ["L", 2, 0, -0.6, -0.22, -0.9, 0.08], ["L", 2, 0, -0.6, 0.22, -0.9, 0.08], ["L", 2, 0, -0.32, -0.3, -0.18, 0.07], ["L", 2, 0, -0.32, 0.3, -0.18, 0.07]],
    orbit: [["P", 0, [[-0.22, -0.5], [0.22, -0.5], [0.22, 0.4], [0, 0.85], [-0.22, 0.4]]], ["P", 1, [[-0.22, -0.5], [-0.22, -0.05], [-0.5, -0.62]]], ["P", 1, [[0.22, -0.5], [0.5, -0.62], [0.22, -0.05]]],
      ["D", 2, 0, 0.22, 0.1], ["P", 1, [[-0.15, -0.56], [0.15, -0.56], [0, -0.95]]], ["D", 2, -0.7, 0.6, 0.06], ["D", 2, 0.66, 0.2, 0.05], ["D", 2, 0.55, 0.78, 0.06], ["D", 2, -0.6, -0.2, 0.05]],
    mine: [["L", 2, -0.6, -0.75, 0.3, 0.45, 0.1], ["L", 0, 0.3, 0.45, -0.1, 0.78, 0.11], ["L", 0, 0.3, 0.45, 0.72, 0.18, 0.11], ["D", 1, 0.45, -0.55, 0.13], ["D", 1, 0.74, -0.32, 0.09], ["D", 1, 0.16, -0.74, 0.08]],
    // The dark cabinets' own: a mammoth, a dancing Ooga with a club, a banana, a coconut, and the hands and spirals.
    mammoth: [["P", 0, [[-0.7, -0.2], [0.5, -0.25], [0.66, 0.05], [0.5, 0.45], [0, 0.6], [-0.55, 0.42]]], ["D", 0, 0.62, 0.22, 0.28], ["L", 0, 0.82, 0.12, 0.88, -0.45, 0.1], ["L", 0, 0.88, -0.45, 0.72, -0.6, 0.08],
      ["L", 2, 0.72, -0.02, 1, -0.22, 0.07], ["L", 0, -0.5, -0.15, -0.52, -0.8, 0.15], ["L", 0, -0.22, -0.2, -0.22, -0.8, 0.14], ["L", 0, 0.18, -0.2, 0.2, -0.8, 0.14], ["L", 0, 0.42, -0.2, 0.44, -0.8, 0.14],
      ["L", 0, -0.68, 0.1, -0.85, -0.2, 0.05], ["D", 2, 0.68, 0.32, 0.045]],
    ooga: [["D", 0, 0, 0.62, 0.2], ["L", 0, 0, 0.42, 0, -0.2, 0.13], ["L", 0, 0, 0.28, -0.5, 0.62, 0.1], ["L", 0, 0, 0.28, 0.45, 0.55, 0.1], ["L", 0, 0, -0.2, -0.35, -0.85, 0.11], ["L", 0, 0, -0.2, 0.35, -0.85, 0.11], ["L", 1, 0.45, 0.55, 0.65, 0.95, 0.15]],
    banana: [...arc(0, 0, 0.75, () => 1, -2.6, -0.55, 6, 0.12, 0.34), ["L", 1, 0.85, 0.27, 0.98, 0.46, 0.1]],
    coconut: [["D", 1, 0, -0.1, 0.62], ["D", 2, -0.2, 0.1, 0.1], ["D", 2, 0.2, 0.1, 0.1], ["D", 2, 0, -0.18, 0.1], ["L", 0, 0, 0.5, -0.5, 0.95, 0.12], ["L", 0, 0, 0.5, 0.5, 0.95, 0.12], ["L", 0, 0, 0.5, 0, 1, 0.12]],
    hand: [["P", 0, [[-0.32, -0.42], [0.32, -0.42], [0.38, 0.06], [0.22, 0.28], [-0.22, 0.28], [-0.38, 0.06]]], ["L", 0, -0.28, 0.18, -0.38, 0.7, 0.15], ["L", 0, -0.1, 0.24, -0.12, 0.86, 0.15],
      ["L", 0, 0.1, 0.24, 0.13, 0.9, 0.15], ["L", 0, 0.27, 0.18, 0.36, 0.72, 0.14], ["L", 0, 0.32, -0.12, 0.72, 0.18, 0.15]],
    spiral: arc(0, 0, 0, (t) => 0.1 + 0.85 * t, 0, Math.PI * 4.2, 22, 0.13, 0.13)
  };
  const TEASER_ART = ["mammoth", "ooga", "banana", "spiral", "coconut", "mammoth", "ooga", "banana"];
  const DOT = oval(1, 1, 6);
  // A pictograph in cave paint, flat in the (x, y) plane about the origin facing +z, `s` metres a unit, in `inks`
  // [paint, second, bone] with a faint `emissive`, as paint catches the light. Paint has no thickness: each stroke is
  // one `daubPoly` face, laid a hair over the one before so crossing strokes never flicker. Unlike the `daub*` brush
  // strokes, an "L" bar is square-ended and a "D" dot a hexagon, so a pictograph stays a few faces at any size: the
  // subjects `MARK` brushes big on the rock (a banana, a coconut, a mammoth, an Ooga, the games), cut down for trim.
  const pictograph = (ops, s, inks, emissive) => {
    const geo = geometry();
    ops.forEach(([kind, ink, ...a], k) => {
      let pts;
      if (kind === "L") {
        const x0 = a[0] * s, y0 = a[1] * s, x1 = a[2] * s, y1 = a[3] * s, l = Math.hypot(x1 - x0, y1 - y0) || 1, w = a[4] * s / 2;
        const ux = (x1 - x0) / l * w * 0.6, uy = (y1 - y0) / l * w * 0.6, nx = -(y1 - y0) / l * w, ny = (x1 - x0) / l * w;
        pts = [[x0 - ux - nx, y0 - uy - ny], [x1 + ux - nx, y1 + uy - ny], [x1 + ux + nx, y1 + uy + ny], [x0 - ux + nx, y0 - uy + ny]];
      } else pts = kind === "D" ? DOT.map(([u, v]) => [(a[0] + u * a[2]) * s, (a[1] + v * a[2]) * s]) : a[0].map(([u, v]) => [u * s, v * s]);
      daubPoly(geo, pts, inks[ink], emissive, k * 0.0003);
    });
    return geo;
  };
  // One side's cave paint, on its face at x (facing out from the cabinet): the cabinet's pictograph on the base over a
  // row of bone dots, then by its art style a handprint by the screen and bone dots along the marquee (0), a handprint
  // in the second colour and a zigzag (1), or a bone spiral and dots in the paint (2).
  const sideArt = (x, c, inks, emissive) => {
    const at = (ops, z, y, s, ink = inks) => moved(turnedY(pictograph(x > 0 ? mirror(ops) : ops, s, ink, emissive), x > 0 ? Math.PI / 2 : -Math.PI / 2), x, y, z);
    const second = [inks[1], inks[1], inks[2]], bone = [inks[2], inks[2], inks[2]];
    return [
      at(PICTOS[c.game >= 0 ? GAMES[c.game].id : TEASER_ART[c.index - 4]], 0, 0.58, 0.27),
      at(dots(7, 2, 0.95, 0.2), -0.02, 0.24, 0.11),
      c.art === 2 ? at(PICTOS.spiral, -0.2, 1.42, 0.15, bone) : at(PICTOS.hand, -0.2, 1.4, 0.17, c.art ? second : inks),
      c.art === 1 ? at(zigzag(7, 0), -0.05, 1.97, 0.1) : at(dots(6, c.art ? 0 : 2, 1.1, 0.26), -0.05, 1.97, 0.1)
    ];
  };
  // Markings on a hide stretched over x0..x1, y0..y1 facing +z at z, clear of `holes` ([x, y, r]): leopard rosettes
  // (0), tiger stripes in from its edges (1) or plain dark spots (2). Each blot is a lumpy nine-sided round.
  const BLOT = oval(1, 1, 9);
  const hideMarks = (kind, x0, x1, y0, y1, z, hide, holes, rand) => {
    const out = geometry(), dark = tint(hide, 0.42), clear = (x, y, r) => holes.every(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) > r + hr);
    const blot = (x, y, r, color, lift) => daubPoly(out, BLOT.map(([u, v]) => [x + u * r * (1 + (rand() - 0.5) * 0.2), y + v * r * (0.85 + (rand() - 0.5) * 0.2)]), color, 0, z + lift);
    if (kind === 1) {
      for (let k = 0; k < 10; k++) {
        const side = k % 2 ? 1 : -1, y = y0 + (Math.floor(k / 2) + 0.5 + (rand() - 0.5) * 0.4) * (y1 - y0) / 5, x = side < 0 ? x0 : x1, reach = 0.16 + rand() * 0.14, w = 0.025 + rand() * 0.015;
        daubPoly(out, [[x, y - w], [x - side * reach, y - w * 0.4 - reach * 0.25], [x, y + w]], dark, 0, z);
      }
      return out;
    }
    for (let n = 0, tries = 0; n < (kind ? 14 : 9) && tries < 80; tries++) {
      const r = kind ? 0.02 + rand() * 0.025 : 0.035 + rand() * 0.015, x = x0 + r + rand() * (x1 - x0 - 2 * r), y = y0 + r + rand() * (y1 - y0 - 2 * r);
      if (!clear(x, y, r)) continue;
      blot(x, y, r, dark, 0);
      if (!kind) blot(x, y, r * 0.55, tint(hide, 0.8), 0.001);
      n++;
    }
    return out;
  };
  // A coconut-shell button: a half shell in husk brown, its rim darker, with a small dot painted `color` on its crown,
  // the dot lit `emissive`.
  const shellButton = (r, color, emissive = 0.35) => {
    const geo = lathe({ profile: [[r, 0], [r * 1.05, 0.013], [r * 0.9, 0.03], [r * 0.55, 0.043], [r * 0.32, 0.047], [0, 0.049]], segments: 8, color: (t) => t < 0.3 ? "#5a3c20" : t < 0.7 ? "#7a5530" : color });
    geo.faces.forEach((f, k) => { f.emissive = k >= 32 ? emissive : 0; });
    return geo;
  };
  const BUTTON_INKS = ["#e0a83a", "#c0482a", "#4aa89a"];
  // Where an Ooga machine takes its coin: a tiki mouth carved into its front, `rx` by `ry`, facing +z about the origin
  // and 0.035 proud at most: thick dark timber lips round the black throat, bone teeth pointing in from its top and
  // foot, and an ember glowing `e` low in the throat. Flat parts.
  const tikiMouth = (rx, ry, e) => {
    const ix = rx * 0.78, iy = ry * 0.7, t = rx * 0.2, parts = [
      moved(prism(oval(rx, ry), 0.024, TIMBER_DK), 0, 0, 0.012),
      moved(prism(oval(ix, iy), 0.006, "#140c08"), 0, 0, 0.026),
      moved(prism(oval(rx * 0.3, ry * 0.2, 10), 0.004, EMBER_GLOW, e), 0, -iy * 0.3, 0.029)
    ];
    for (const [sy, n] of [[1, 4], [-1, 3]]) for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * ix * 0.44, y = sy * (iy * Math.sqrt(1 - (x / ix) ** 2) - 0.004);
      parts.push(moved(prism(ccw([[x - t * 0.5, y], [x + t * 0.5, y], [x, y - sy * t * 0.9]]), 0.01, BONE), 0, 0, 0.03));
    }
    return parts;
  };
  // One per cabinet slot, by its index in CABINETS.
  const cabinet = variants((i) => {
    // `on` is a stage cabinet; every cabinet is lit and carries its game's `named` sign, the mezzanine's a retro game's.
    const c = CABINETS[i], on = c.game >= 0, named = on ? GAMES[c.game] : RETRO[c.retro], parts = [], round = [], J = BL.hubModels;
    const hide = leather(c.trim, HIDE_TONES[i % 3]), inks = [earth(c.trim), earth(c.second), BONE], cuts = c.stone ? SLABS : PLANKS, edge = c.stone ? tint(c.body, 0.68) : BARK;
    for (const s of [-1, 1]) {
      // The side: planks (or slabs) a shade apart with a hair of dark between them, and the bark edge round all but
      // the base's front corner, where the bamboo post stands.
      for (let k = 0; k + 1 < cuts.length; k++) {
        const lo = cuts[k] + (k ? 0.006 : 0), hi = cuts[k + 1] - (k + 2 < cuts.length ? 0.006 : 0);
        parts.push(sideShape(band(SIDE[cuts[k] < 1.08 ? 0 : cuts[k] < 1.8 ? 1 : 2], lo, hi), s * 0.56, 0.08, tint(c.body, PLANK_TONES[(k + i) % PLANK_TONES.length])));
      }
      for (let k = 1; k < EDGE.length - 1; k++) parts.push(strip(s * 0.56, EDGE[k], EDGE[k + 1], edge, 0.11, 0.045));
      round.push(J.bamboo(s * 0.575, 0.1, 0.45, s * 0.575, 1.02, 0.45, 0.03), J.lashing(s * 0.575, 0.84, 0.45, 0, 1, 0, 0.03));
      round.push(moved(turnedY(boneTusk(0.8, 0.042, 1.7), -s * 1.3), s * 0.58, 1.8, 0.37));
    }
    for (const z of [0.39, -0.39]) round.push(J.log(-0.62, 0.078, z, 0.62, 0.078, z, 0.075));
    // The back, planks up and down (two slabs on stone), the hide over the front and the lid.
    const back = c.stone ? [-1, 1].map((k) => bevelBox({ w: 1.04, h: 1.04, d: 0.06, color: tint(c.body, 1 + k * 0.05), bevel: 0.025, offset: { y: 1.09 + k * 0.53, z: -0.42 } }))
      : [0, 1, 2, 3].map((k) => bevelBox({ w: 0.255, h: 2.1, d: 0.06, color: tint(c.body, PLANK_TONES[k + 1]), bevel: 0.02, offset: { x: -0.39 + k * 0.26, y: 1.09, z: -0.42 } }));
    parts.push(
      ...back,
      bevelBox({ w: 1.04, h: 0.86, d: 0.06, color: hide, bevel: 0.02, offset: { y: 0.55, z: 0.42 } }),
      bevelBox({ w: 1.06, h: 0.045, d: 0.8, color: tint(c.body, 0.9), bevel: 0.015, offset: { y: 2.118, z: -0.06 } }),
      box({ w: 1.04, h: 0.1, d: 0.02, color: TIMBER_DK, offset: { y: 0.18, z: 0.455 } }),
      ...tikiMouth(0.17, 0.1, 0.55).map((p) => moved(p, 0, 0.46, 0.45)),
      box({ w: 1.04, h: 0.04, d: 0.28, color: TIMBER_DK, offset: { y: 1.78, z: 0.18 } })
    );
    // The crest: a log laid along the lid, carved into a tiki's heavy brow and two bone eyes with the fire in their
    // pupils, striped in red earth under them, a nose between them down to the marquee's rail; its front stops behind
    // the marquee's face.
    round.push(J.log(-0.54, 2.295, 0.135, 0.54, 2.295, 0.135, 0.155, c.stone ? BARK : tint(c.body, 0.8)));
    for (const sx of [-1, 1]) {
      round.push(moved(turnedX(turn([[0.07, 0], [0.07, 0.016], [0, 0.026]], 12, BONE), Math.PI / 2), sx * 0.17, 2.3, 0.27));
      round.push(moved(turnedX(turn([[0.032, 0], [0.032, 0.01], [0, 0.016]], 10, "#1c1410"), Math.PI / 2), sx * 0.17, 2.3, 0.296));
      parts.push(moved(prism(oval(0.013, 0.013, 8), 0.004, EMBER_GLOW, 0.8), sx * 0.17, 2.3, 0.314));
      parts.push(box({ w: 0.1, h: 0.016, d: 0.03, color: "#b8402e", offset: { x: sx * 0.17, y: 2.215, z: 0.276 } }));
    }
    parts.push(bevelBox({ w: 0.54, h: 0.07, d: 0.1, color: "#4a2e18", bevel: 0.02, offset: { y: 2.395, z: 0.27 } }));
    parts.push(moved(prism(ccw([[0, 0.05], [0.038, -0.04], [-0.038, -0.04]]), 0.05, tint(c.body, 0.62)), 0, 2.22, 0.29));
    // The control panel, leaning back toward the screen, and what stands on it: the bone lever with its coconut knob
    // and three big coconut-shell buttons in an arc.
    const deck = [bevelBox({ w: 1.1, h: 0.08, d: 0.36, color: TIMBER_LT, bevel: 0.02 }), box({ w: 1.02, h: 0.006, d: 0.3, color: leather(c.second), offset: { y: 0.042 } })];
    deck.push(box({ w: 0.2, h: 0.004, d: 0.08, color: "#d8c09a", offset: { x: -0.02, y: 0.046, z: -0.1 } }));
    deck.push(moved(lathe({ profile: [[0.05, 0], [0.05, 0.012], [0.018, 0.02], [0.018, 0.13], [0, 0.13]], segments: 10, color: BONE }), -0.3, 0.04, 0.03));
    BUTTON_INKS.forEach((color, k) => deck.push(moved(shellButton(0.052, color), 0.03 + k * 0.15, 0.04, k === 1 ? -0.03 : 0.05)));
    parts.push(moved(turnedX(merge(...deck), 0.32), 0, 1.03, 0.3));
    // The joystick's knob, a coconut, round so it shades smooth.
    round.push(moved(turnedX(moved(nut("husk", 0.05, false, false), -0.3, 0.2, 0.03), 0.32), 0, 1.03, 0.3));
    // The bezel: rough stone bars round the glass, their inner edges on the screen's, painted corners.
    const W = SCREEN.w / 2 + 0.05, H = SCREEN.h / 2 + 0.05, stone = c.stone ? tint(c.body, 1.15) : STONE_LT, bezel = [
      bevelBox({ w: W * 2 + 0.14, h: 0.12, d: 0.08, color: stone, bevel: 0.025, offset: { y: H + 0.01 } }),
      bevelBox({ w: W * 2 + 0.14, h: 0.12, d: 0.08, color: tint(stone, 0.9), bevel: 0.025, offset: { y: -H - 0.01 } }),
      bevelBox({ w: 0.12, h: H * 2, d: 0.08, color: tint(stone, 0.95), bevel: 0.025, offset: { x: -W - 0.01 } }),
      bevelBox({ w: 0.12, h: H * 2, d: 0.08, color: tint(stone, 1.05), bevel: 0.025, offset: { x: W + 0.01 } }),
      box({ w: W * 2, h: H * 2, d: 0.02, color: GLASS_DK, offset: { z: -0.03 } })
    ];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bezel.push(moved(prism(ccw([[0, 0], [-sx * 0.14, 0], [0, -sy * 0.1]]), 0.012, inks[1]), sx * (W + 0.02), sy * (H + 0.02), 0.045));
    parts.push(moved(turnedX(merge(...bezel), SCREEN.lean), 0, SCREEN.y, SCREEN.z - 0.01));
    // The marquee: warm hide behind the carved sign, between two timber rails.
    parts.push(
      box({ w: 1.04, h: 0.3, d: 0.03, color: "#c9884a", emissive: 0.28, offset: { y: 1.97, z: 0.305 } }),
      bevelBox({ w: 1.14, h: 0.05, d: 0.07, color: TIMBER_DK, bevel: 0.015, offset: { y: 2.125, z: 0.31 } }),
      bevelBox({ w: 1.14, h: 0.05, d: 0.07, color: TIMBER_DK, bevel: 0.015, offset: { y: 1.815, z: 0.31 } })
    );
    const body = shaded(round, parts), rand = mulberry32(900 + i), v = i % 2 ? -1 : 1;
    const geo = J.withJungle(body, (g) => {
      // The paint: both sides, the hide's markings clear of the tiki mouth and the two handprints slapped on it.
      const ink = mulberry32(1900 + i), paint = 0.16, slap = [c.trim, c.trim, c.trim];
      J.flatInto(g, ...sideArt(0.602, c, inks, paint), ...sideArt(-0.602, c, inks, paint),
        hideMarks(i % 3, -0.49, 0.49, 0.26, 0.94, 0.4515, hide, [[-0.3, 0.8, 0.1], [0.3, 0.8, 0.1], [0, 0.46, 0.26]], ink),
        moved(pictograph(PICTOS.hand, 0.085, slap, 0.7), 0.3, 0.8, 0.456), moved(pictograph(mirror(PICTOS.hand), 0.085, slap, 0.7), -0.3, 0.8, 0.456));
      // A live cabinet's back, seen from the back room: its game's pictograph over two handprints, daubed on the planks.
      if (on) {
        const art = geometry();
        [MARK.kart, MARK.chute, MARK.rocket, MARK.pick][c.game](art, 0, 1.25, 0.55, inks[0], paint);
        daubHand(art, -0.2, 0.82, 0.3, 0.2, EARTH_RED, paint);
        daubHand(art, 0.2, 0.78, 0.3, -0.2, EARTH_CHALK, paint, 0.004);
        J.flatInto(g, moved(turnedY(art, Math.PI), 0, 0, -0.456));
      }
      // The rope: stitched round the hide, down each side's front edge and lashed round it by the screen and the
      // marquee.
      J.liana(g, [[-0.49, 0.25, 0.458], [0.49, 0.25, 0.458], [0.49, 0.95, 0.458], [-0.49, 0.95, 0.458], [-0.49, 0.25, 0.458]], 0.011, 0.011, ROPE);
      for (const s of [-1, 1]) {
        J.liana(g, EDGE.slice(1, 6).map(([z, y]) => [s * 0.618, y, z]), 0.014, 0.014, ROPE);
        tuck(g, J.lashing(s * 0.56, 1.44, 0.075, 0, 0.72, -0.15, 0.06));
        tuck(g, J.lashing(s * 0.56, 1.97, 0.32, 0, 1, 0, 0.06));
      }
      // Rope bound over the carved sign's iron corner plates.
      J.flatInto(g, ...signBinding(named.title, named.icon, MARQUEE.w, 0, MARQUEE.y, MARQUEE.z));
      J.liana(g, [[v * 0.612, 0.1, -0.466], [v * 0.619, 0.45, -0.472], [v * 0.61, 0.8, -0.464], [v * 0.619, 1.15, -0.474], [v * 0.611, 1.5, -0.466],
        [v * 0.619, 1.85, -0.472], [v * 0.612, 2.12, -0.466], [v * 0.5, 2.2, -0.4], [v * 0.25, 2.2, -0.26], [v * 0.05, 2.18, -0.17]], 0.024, 0.016);
      for (let k = 0; k < 6; k++) {
        const y = 0.4 + k * 0.3, len = 0.12 + rand() * 0.05;
        if (k % 2) leafBlade(g, v * 0.614, y, -0.482, -v * 0.7, 0.7, -0.02, v * 0.1, 0.2, -1, len, 0.9, IVY_TONES[1]);
        else leafBlade(g, v * 0.624, y, -0.464, v * 0.02, 0.6, 0.8, v, 0.25, -0.05, len, 0.9, IVY_TONES[0]);
      }
      // The crown: banana leaves tucked in behind the marquee, fanned back and out, arching over and drooping, the
      // middle ones reaching back and the outer ones out to the sides and drooping further, all clear of the marquee's
      // face. Each leaf is as long as its slot has room for: `run` is how far it travels a metre of midrib, so no tip
      // reaches past the neighbours' slots or, on the mezzanine, into the back wall 0.4 m behind (so the mezzanine's
      // fan wider). Each slot has its own count, spread, lean and tints; slots 0, 3, 6 and 9 tuck a flower on the crest, and 1, 4, 7 and 10 a
      // hand of bananas on a stalk in the corner across from the liana.
      const n = [4, 3, 5, 3][i % 4], spread = (on ? 0.9 : 1.1) + rand() * 0.25, skew = (rand() - 0.5) * 0.4, back = on ? 1.1 : 0.68;
      for (let k = 0; k < n; k++) {
        const yaw = Math.max(-1.3, Math.min(1.3, skew + spread * (2 * k / (n - 1) - 1) + (rand() - 0.5) * 0.15)), f = Math.abs(yaw) / 1.3;
        const up = 1.25 - 0.3 * f + rand() * 0.1, down = -1 - 0.5 * f - rand() * 0.2, run = (Math.sin(up) - Math.sin(down)) / (up - down);
        bananaLeaf(g, Math.sin(yaw) * 0.08, 2.12, -0.1 - Math.cos(yaw) * 0.04, {
          yaw, up, down, len: Math.min((1.4 - 0.3 * f) * (0.92 + rand() * 0.16), 0.64 / run / (Math.abs(Math.sin(yaw)) + 0.01), back / run / Math.cos(yaw)),
          broad: 0.21 - 0.03 * f + rand() * 0.03, face: 0.5, tone: BANANA_LEAF_TONES[(i + k) % 3], tear: [0, 3, -5][(i + k) % 3]
        });
      }
      if (i % 3 === 0) {
        const ink = J.FLOWER_INKS[i % J.FLOWER_INKS.length];
        J.flower(g, -v * 0.34, 2.46, 0.12, 0, 0.85, 0.53, ink[0], ink[1], 0.12, rand);
      } else if (i % 3 === 1) {
        // Each finger stands on its stem end, curving up and out, turned round the stalk toward the front.
        J.liana(g, [[-v * 0.04, 2.12, -0.12], [-v * 0.2, 2.36, -0.14], [-v * 0.3, 2.42, -0.16]], 0.022, 0.018);
        for (let k = 0; k < 3; k++) tuck(g, moved(turnedY(moved(turnedZ(scaled(BL.models.bananaGeometry(), 0.42), 1.2), 0.209, 0.129, 0), (v > 0 ? Math.PI : 0) + v * (k * 0.7 - 0.1)), -v * 0.3, 2.4, -0.16));
      }
    });
    geo.collisionGeometry = body;
    return geo;
  });
  // ---- the attract loops --------------------------------------------------------------------------------
  const GRID_W = 40;
  const GRID_H = 30;
  const PIXEL = SCREEN.w / GRID_W;
  const FRAMES = 16;
  const FPS = 8;
  const ANIM_Y0 = 9;
  const ANIM_Y1 = 21;
  const PALETTES = {
    race: ["#0d1a0d", BANANA, "#4a4a52", "#f2efe8", RED, "#8a5a34", "#3a8f2a", "#1b1b1e", "#2e6b20"],
    drop: ["#123a66", "#5ec8ff", "#f2efe8", "#c7dcef", RED, "#c68642", BANANA, "#1b1b1e", "#ff9c86"],
    orbit: ["#0a0820", "#b98cff", "#f2efe8", "#8a86c9", RED, "#7fe0ff", "#ffb02e", BANANA, "#5a5670"],
    mine: ["#1a120a", "#ff9a3c", "#6b6b73", "#8e8e96", BANANA, "#a8703e", "#c9ced6", "#fff3a0", "#4a4a52"]
  };
  // Each game's loop, drawn into the anim box a frame at a time: `f` runs 0 to FRAMES - 1 and the loop is seamless.
  const DRAW = {
    // The rally: the road rolls toward you, dashes and roadside palms streaming down, and the kart weaves.
    race: (g, f) => {
      rect(g, 0, ANIM_Y0, GRID_W, ANIM_Y1 - ANIM_Y0 + 1, 6);
      rect(g, 11, ANIM_Y0, 18, ANIM_Y1 - ANIM_Y0 + 1, 2);
      for (let y = ANIM_Y0; y <= ANIM_Y1; y++) {
        if (((y - f) % 4 + 4) % 4 < 2) at(g, 19, y, 3), at(g, 20, y, 3);
        at(g, 11, y, ((y - f) % 2 + 2) % 2 ? 4 : 3);
        at(g, 28, y, ((y - f) % 2 + 2) % 2 ? 4 : 3);
      }
      for (const [x, phase] of [[4, 0], [34, 7], [6, 9], [32, 2]]) {
        const y = ANIM_Y0 + (phase + f) % 13;
        rect(g, x - 1, y - 1, 3, 2, 8); at(g, x, y + 1, 5);
      }
      const kx = 17 + Math.round(3 * Math.sin(f / FRAMES * Math.PI * 2));
      rect(g, kx, 16, 6, 3, 4); rect(g, kx + 2, 14, 2, 2, 5);
      for (const [dx, dy] of [[-1, 16], [6, 16], [-1, 18], [6, 18]]) at(g, kx + dx, dy, 7);
    },
    // The drop: clouds rush up past the diver, arms and legs spread, rocking in the wind.
    drop: (g, f) => {
      for (const [x, phase, w] of [[5, 0, 6], [27, 5, 8], [14, 9, 5], [33, 12, 4]]) {
        const y = ANIM_Y1 - (phase + f) % 14;
        rect(g, x, y, w, 1, 2); rect(g, x + 1, y - 1, w - 2, 1, 3);
      }
      const dx = 19 + Math.round(2 * Math.sin(f / FRAMES * Math.PI * 2)), up = f % 4 < 2;
      rect(g, dx, 13, 2, 2, 5); rect(g, dx, 15, 2, 3, 4);
      line(g, dx - 1, 15, dx - 3, up ? 13 : 14, 5); line(g, dx + 2, 15, dx + 4, up ? 13 : 14, 5);
      line(g, dx, 18, dx - 2, 20, 1); line(g, dx + 1, 18, dx + 3, 20, 1);
    },
    // The orbit: a star field streams past a climbing rocket whose flame flickers.
    orbit: (g, f) => {
      const rand = mulberry32(77);
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand() * GRID_W), y0 = Math.floor(rand() * 13), speed = 1 + (i % 2);
        at(g, x, ANIM_Y0 + (y0 + f * speed) % 13, i % 3 ? 3 : 2);
      }
      rect(g, 18, 12, 4, 6, 2); rect(g, 19, 10, 2, 2, 4); at(g, 19, 9, 4); at(g, 20, 9, 4);
      rect(g, 19, 13, 2, 2, 5);
      rect(g, 16, 16, 2, 2, 4); rect(g, 22, 16, 2, 2, 4);
      const flame = 2 + (f % 3);
      rect(g, 19, 18, 2, flame, 6); at(g, 19 + (f & 1), 18 + flame, 7);
    },
    // The mine: a pick swings into an ore face and knocks sparks and nuggets loose.
    mine: (g, f) => {
      rect(g, 26, ANIM_Y0, 14, ANIM_Y1 - ANIM_Y0 + 1, 2);
      for (let y = ANIM_Y0; y <= ANIM_Y1; y += 3) for (let x = 26 + (y % 2) * 2; x < GRID_W; x += 4) at(g, x, y, 3);
      for (const [x, y] of [[29, 12], [34, 17], [37, 11], [31, 20]]) rect(g, x, y, 2, 2, 4);
      const swing = f < 6 ? f / 6 : f < 9 ? 1 - (f - 6) / 3 : 0, angle = -0.3 - swing * 1.6;
      const px = 14, py = 19, hx = px + Math.round(Math.cos(angle) * 9), hy = py + Math.round(Math.sin(angle) * 9);
      line(g, px, py, hx, hy, 5);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      line(g, hx - Math.round(nx * 3), hy - Math.round(ny * 3), hx + Math.round(nx * 3), hy + Math.round(ny * 3), 6);
      if (f >= 9 && f < 14) {
        const t = f - 9;
        for (const [vx, vy] of [[-1, -1], [-2, 0], [-1, 1], [0, -2]]) at(g, 25 + vx * t, 15 + vy * t, t < 2 ? 7 : 4);
      }
    }
  };
  // A little bone lying on three rows of a pixel grid from (x, y), in palette colour `c`; `titleBones` lays one either
  // side of a screen's title, each game's in its palette's cream.
  const pixelBone = (g, x, y, c) => { at(g, x, y, c); at(g, x + 3, y, c); rect(g, x, y + 1, 4, 1, c); at(g, x, y + 2, c); at(g, x + 3, y + 2, c); };
  const titleBones = (g, c) => { pixelBone(g, 0, 3, c); pixelBone(g, GRID_W - 4, 3, c); };
  const BONE_INK = { race: 3, drop: 2, orbit: 2, mine: 7 };
  // A game's loop, by its index in GAMES: the title across the top in the game's colour between two bones, then the
  // anim box.
  const attractFrames = variants((i) => {
    const game = GAMES[i], palette = PALETTES[game.id], frames = [];
    for (let f = 0; f < FRAMES; f++) {
      const g = grid(GRID_W, GRID_H);
      centred(g, game.title, 1, 1);
      DRAW[game.id](g, f);
      titleBones(g, BONE_INK[game.id]);
      frames.push(bake(g, palette, PIXEL, 0.45));
    }
    return frames;
  });
  // Between loops the screen blinks for a player, as attract modes do: the title between its bones, PRESS START over a
  // banana coin, and the same with the words dark. Two frames a game, by its index in GAMES.
  const START_FRAMES = 4;

  // ---- skee-ball ----------------------------------------------------------------------------------------
  // A lane in its frame, the player at the origin facing -z, built the Ooga way: a plank alley between two bark logs
  // rising from the foul line to a log laid across its end, the hump that throws the coconut onto the target, a big
  // flagstone leaning back at `SKEE.tilt` with its rings daubed on in red earth, chalk and ochre, a crack of embers
  // glowing between each, a ring of chalk dots round them and a handprint in each lower corner; the hole in their
  // middle, the 50 cup above them and the 100 cups in its top corners, each cup half a coconut shell round its hole
  // with an ember glowing round its lip. Bamboo guards keep the coconut in, three canes a side lashed to posts at the
  // foul line, halfway and the hump; a woven basket at the front holds the coconuts still to roll over the ticket
  // slot. The lane's timber tells the game in earth paint: along each side an Ooga throwing, coconuts in flight, a
  // target and handprints under a zigzag, a sun spiral and a handprint on the wedge under the stone, and handprints
  // and a zigzag across its front. Over the stone two bamboo posts and a crossbar lashed at the corners carry a net of
  // lianas across the top and down the sides to the backboard, three big planks with a bone across them under a crown
  // of broad leaves, the scoreboards hung between. `SKEE.at(u, v, out)` places a point on the target: `u` across, `v`
  // up it from the rings' centre.
  const SKEE = {
    w: 0.8, foul: -0.5, hump: -4.6, board: { z: -4.85, y: 1.2 }, tilt: 0.62, centre: 0.75,
    rings: [0.18, 0.3, 0.45, 0.62], values: [40, 30, 20, 10], fifty: { v: 0.52, r: 0.09 }, hundred: { u: 0.3, v: 0.62, r: 0.075 }, top: 0.72,
    // The tray at the front: where the coconuts still to roll wait, two rows of four.
    tray: [-0.24, -0.08, 0.08, 0.24].flatMap((x) => [[x, -0.2], [x, -0.36]]), trayY: 0.9,
    alleyY: (z) => 0.78 + Math.min(1, Math.max(0, (z - -0.5) / (-4.6 - -0.5))) * 0.32,
    at: (u, v, out) => {
      const d = SKEE.centre + v;
      out.x = u; out.y = SKEE.board.y + d * Math.sin(SKEE.tilt) + 0.03; out.z = SKEE.board.z - d * Math.cos(SKEE.tilt);
      return out;
    }
  };

  // ---- hoop shot ----------------------------------------------------------------------------------------
  // In its frame, the player at the origin facing -z: a cage of four bamboo posts lashed to branch poles sloping up
  // its sides from the short front posts, kept below the scoreboards, the lane's own and its neighbour's, in the
  // player's view, and a log beam resting on the back posts with a torch burning on a stake over its middle, above
  // the scoreboards; lianas slung down each side with leaves along the upper one, over a ramp of split
  // bamboo, dry and dull, edged in rope that rolls the coconuts back; the backboard of timber planks at the far end, a
  // chalk sun spiral daubed over the hoop between two handprints under a zigzag, over a row of dots, tied back to the
  // beam the scoreboards stand on; and a log deck at the front, the coconuts waiting on its plank top behind a timber lip, half
  // a coconut shell with an ember glowing round its foot for the SHOOT button and the ticket slot under the plank's
  // front edge. The hoop and its net are their own geometry (`hoop`) so the machine can slide it; `HOOP` is where it
  // hangs.
  const HOOP = { y: 2.55, z: -3.05, r: 0.2, slide: 0.32, from: { x: 0, y: 1.25, z: -0.5 }, rack: [[-0.4, 0.95, -0.3], [0, 0.95, -0.3], [0.4, 0.95, -0.3]] };

  // ---- coconuts ------------------------------------------------------------------------------------------
  // Every ball in the arcade is a coconut. `coconutBall(style, r, spot)` is one centred on the origin, radius `r`:
  // round, so it rolls and spins true where a ball did (its eyes stand 0.03 r proud), painted in fibre streaks
  // running pole to pole into three dark eyes on its upper front. Styles: "husk" brown, "young" green (the thrown
  // ones), "golden" (it glows), "cue" peeled cream, "charred" black, or any "#rrggbb" for a painted one; anything else
  // throws. `spot` adds a cream number spot facing +z. Cached by style, radius and spot; `nut` builds a fresh one to
  // move, a touch taller than wide above its middle unless `egg` is false, for the coconuts that sit still.
  const NUTS = {
    husk: ["#6b4a26", "#54391d", "#86613a", "#221408"], young: ["#6f9a3a", "#56792c", "#8db850", "#2e3a14"],
    golden: ["#ffc83a", "#e0a228", "#ffe38a", "#8a5210"], cue: ["#efe2c4", "#dccba6", "#fbf3e0", "#6b4a26"],
    charred: ["#221c18", "#161210", "#3a3029", "#6a5648"]
  };
  const nut = (style, r, spot = false, egg = true) => {
    if (!NUTS[style] && !/^#[0-9a-f]{6}$/i.test(style)) throw new Error(`No coconut style "${style}"`);
    const [base, streak, fleck] = NUTS[style] ? NUTS[style].slice(0, 3).map(hexToRgb) : [1, 0.8, 1.15].map((k) => hexToRgb(style).map((v) => Math.min(255, Math.round(v * k))));
    const eye = NUTS[style] ? NUTS[style][3] : "#1c140c", segs = r >= 0.1 ? 14 : r >= 0.07 ? 12 : 10, L = 6, q = egg ? 1.21 : 1;
    // Round below the middle; an egg's top above it, drawn up a tenth and narrowed a little toward the eyes.
    const shape = (c) => { const u = egg ? Math.max(0, c) : 0; return [r * (1 - 0.08 * u), c * r * (1 + 0.1 * u)]; };
    const husk = lathe({ profile: Array.from({ length: L + 1 }, (_, k) => { const [w, y] = shape(-Math.cos(k / L * Math.PI)); return [Math.sin(k / L * Math.PI) * w, y]; }), segments: segs, color: "#000000", emissive: style === "golden" ? 0.35 : 0 });
    husk.faces.forEach((f, k) => { const p = Math.floor(k / segs), s = k % segs; f.color = s % 3 === 0 && s + 1 < segs && p > 0 && p < L - 1 ? streak : (s * 5 + p) % 7 === 0 ? fleck : base; });
    // Two eyes over the front and the third under them, each a dark bump set into the husk along its normal.
    const round = [husk], e = r * 0.15;
    for (const [tilt, yaw] of [[0.5, 0.45], [0.5, -0.45], [0.82, 0]]) {
      const [w, y] = shape(Math.cos(tilt)), x = Math.sin(yaw) * Math.sin(tilt) * w, z = Math.cos(yaw) * Math.sin(tilt) * w;
      const l = Math.hypot(x, y / q, z), nx = x / l, ny = y / q / l, nz = z / l, sink = e * 0.3;
      round.push(along(lathe({ profile: [[e, 0], [0, e * 0.5]], segments: 6, color: eye }), x - nx * sink, y - ny * sink, z - nz * sink, nx, ny, nz));
    }
    if (spot) round.push(moved(turnedX(lathe({ profile: [[r * 0.42, 0], [r * 0.3, r * 0.07], [0, r * 0.11]], segments: 10, color: "#f6ecd2" }), Math.PI / 2), 0, 0, r * 0.9));
    return shaded(round);
  };

  // ---- the coconut shy ------------------------------------------------------------------------------------
  // In its frame, the player at the origin facing -z: a timber counter on a reed front over a log, a leopard skin
  // pegged across the front, with a woven basket of young coconuts; a roof of two courses of big dry fronds over a dark
  // reed mat on four bamboo poles lashed at the joints, a torch burning on each front pole's top; a tall reed screen
  // at the back for the misses to thud into, dimly painted with the hunt in earth paint (a big chalk Ooga throwing a coconut
  // in a dashed arc at a red mammoth, handprints and a sun spiral over them, a zigzag and a row of dots under them),
  // the middle kept bare behind the targets; and five bamboo posts, each topped with a half coconut shell for a cup
  // the coconuts sit in (`SHY`). Over the eave a chunky plank sign between two tusks under a leaf garland; the prizes
  // (bananas, and a bone hung with feathers) on vines from the front poles' lashings, high and just inside the poles
  // so they stay out of the player's view, the scoreboards on vine cords from the roof, hung inside the booth over the
  // coconuts' flight where the player sees them whole, and carved coconut-shell lanterns on a liana; the fire (`glow`)
  // is the lanterns' and the torches'.
  // `swing` is where the bonus coconut's vine ties on under the roof's mat, in front of the posts, and how long it hangs.
  const SHY = { posts: [-1.2, -0.6, 0, 0.6, 1.2], z: -3.4, cup: 1.32, back: -4.2, from: { x: 0, y: 1.35, z: -0.6 }, swing: { y: 4.1, z: -3.05, len: 2.19 } };
  // A carnival game's meter: a dark timber stick with its window painted leaf green where the bead should stop
  // (`METER_WINDOW`, as a fraction of the track), the bead the scene slides along it, a little bone standing up; and
  // the aim marker, a knapped arrowhead of glowing bone pointing down, its shaft's stub bound on with sinew.
  const METER_LEN = 0.9;
  const METER_WINDOW = [0.63, 0.77];

  // ---- hides and cave paint -------------------------------------------------------------------------------
  // An animal hide stretched `w` by `h` in the (x, y) plane, its fur facing +z: its four legs pulled out to the
  // corners and its sides drawn in between them. `sag` billows its middle back along -z (negative sags it toward the
  // fur side) and `wrap` bends it round an axis along y that far behind it, for a blanket over a back (0 lies flat).
  // A coarse sheet in the fur's ground colour with suede on its back, and the markings laid a few millimetres proud of
  // the fur: "leopard" broken rosettes round a darker heart, "tiger" stripes tapering in from its top and bottom
  // edges, "buck" a few soft darker patches. A round part for `shaded`; `seed` lays the markings. `HIDES` holds each
  // kind's [fur, markings, heart]; the cabinets' fronts keep their own `HIDE_TONES`, a game's colour mixed in.
  const HIDES = { leopard: ["#d9a352", "#33200f", "#b8782e"], tiger: ["#dc8a34", "#23160c", "#f2cf98"], buck: ["#c49a64", "#94703f", "#dcb680"] };
  const hide = (w, h, kind, seed, { sag = 0, wrap = 0 } = {}) => {
    const [fur, ink, heart] = HIDES[kind].map(hexToRgb), suede = hexToRgb("#9c7648"), rand = mulberry32(seed), geo = geometry();
    const NX = Math.max(wrap ? 6 : 4, Math.min(10, Math.round(w / 0.25))), NY = Math.max(3, Math.min(8, Math.round(h / 0.25)));
    // The sheet's point at (u, v), each 0 to 1 across it, lifted `lift` off it toward the fur.
    const point = (u, v, lift) => {
      const x = (u - 0.5) * w * (1 - 0.12 * Math.sin(Math.PI * v)), y = (v - 0.5) * h * (1 - 0.12 * Math.sin(Math.PI * u));
      const z = lift - sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      if (!wrap) return pushVert(geo, x, y, z);
      const a = x / wrap;
      return pushVert(geo, Math.sin(a) * (wrap + z), y, Math.cos(a) * (wrap + z) - wrap);
    };
    for (const side of [1, -1]) {
      const rows = [];
      for (let j = 0; j <= NY; j++) rows.push(Array.from({ length: NX + 1 }, (_, i) => point(i / NX, j / NY, side < 0 ? -0.003 : 0)));
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]];
        face(geo, side > 0 ? q : q.reverse(), side > 0 ? fur : suede);
      }
    }
    // A marking: a convex outline in metres from the hide's middle, kept on the hide.
    const mark = (pts, color) => {
      const uv = pts.map(([x, y]) => [Math.min(0.97, Math.max(0.03, x / w + 0.5)), Math.min(0.97, Math.max(0.03, y / h + 0.5))]);
      face(geo, ccw(uv).map(([u, v]) => point(u, v, 0.004)), color);
    };
    if (kind === "leopard") {
      const s = Math.min(0.3, Math.max(0.12, Math.min(w, h) / 5)), nx = Math.max(1, Math.round(w / s)), ny = Math.max(1, Math.round(h / s));
      for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
        const cx = ((a + 0.5 + (b % 2 ? 0.2 : -0.2) + (rand() - 0.5) * 0.4) / nx - 0.5) * w * 0.9, cy = ((b + 0.5 + (rand() - 0.5) * 0.4) / ny - 0.5) * h * 0.9;
        const q = s * (0.26 + rand() * 0.08), turn0 = rand() * 6.3, at = (t, r) => [cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.85];
        mark([0, 1, 2, 3, 4, 5].map((k) => at(turn0 + k / 6 * Math.PI * 2, q * 0.55)), heart);
        for (let k = 0; k < 3; k++) {
          const a0 = turn0 + k * 2.1, a1 = a0 + 0.75, a2 = a0 + 1.5;
          mark([at(a0, q * 0.6), at(a0, q), at(a1, q), at(a1, q * 0.6)], ink);
          mark([at(a1, q * 0.6), at(a1, q), at(a2, q), at(a2, q * 0.6)], ink);
        }
      }
    } else if (kind === "tiger") {
      const n = Math.max(3, Math.round(w / 0.13));
      for (let k = 0; k < n; k++) for (const edge of [-1, 1]) {
        if (rand() < 0.2) continue;
        const reach = h * (0.28 + rand() * 0.2), wide = w / n * (0.3 + rand() * 0.15), lean = (rand() - 0.5) * 0.3;
        // Four tapering steps in from the edge, the last one to a point.
        let px = ((k + 0.5 + (edge > 0 ? 0.5 : 0)) / n - 0.5) * w, py = edge * h / 2, pw = wide;
        for (let j = 0; j < 4; j++) {
          const nx = px + lean * reach / 4 + Math.sin(k * 1.7 + j) * wide * 0.4, ny = py - edge * reach / 4, nw = j < 3 ? wide * (1 - (j + 1) / 4) : 0;
          mark(nw ? [[px - pw / 2, py], [px + pw / 2, py], [nx + nw / 2, ny], [nx - nw / 2, ny]] : [[px - pw / 2, py], [px + pw / 2, py], [nx, ny]], ink);
          px = nx; py = ny; pw = nw;
        }
      }
    } else for (let k = 0; k < 4; k++) {
      const cx = (rand() - 0.5) * w * 0.6, cy = (rand() - 0.5) * h * 0.6, q = Math.min(w, h) * (0.12 + rand() * 0.08), t0 = rand() * 3;
      mark(Array.from({ length: 7 }, (_, j) => { const t = j / 7 * Math.PI * 2; return [cx + Math.cos(t + t0) * q, cy + Math.sin(t + t0) * q * 0.7]; }), ink);
    }
    return geo;
  };
  // A poster frame for a game's art, the Oogas' way: a dark leather hide stretched inside four bamboo poles crossed
  // and lashed at the corners, laced to them with rope, a small bone tied along the top pole and a leaf sprig at each
  // corner. The hide is `POSTER_SCALE` times a cabinet screen; the scene hangs the game's `posterArt` on it.
  const POSTER_SCALE = 1.8;
  // ---- the prize counter ----------------------------------------------------------------------------------
  // What the tickets buy, cheapest first; `game.js` keeps the same ids. Each prize is a small cartoon model.
  const PRIZES = [
    { id: "banana-plush", name: "Banana plush", cost: 30 }, { id: "coconut-cup", name: "Coconut cup", cost: 60 },
    { id: "bone-kazoo", name: "Bone kazoo", cost: 100 }, { id: "gold-sticker", name: "Shell charm", cost: 150 },
    { id: "gorilla-plush", name: "Gorilla idol", cost: 250 }, { id: "crown", name: "Feather crown", cost: 500 }
  ];
  // ---- the machines under the mezzanine --------------------------------------------------------------------
  // A claw machine in its frame facing +z, as the Oogas build one, each in its own hide: a case of dark carved timber
  // on a plinth with a zigzag of teeth carved across its front, a hide pegged over the front's left under a small
  // tiki mouth for the coin (leopard, tiger or shaggy mammoth fur), the prize chute a half coconut shell's dark mouth
  // ringed in embers between two bones, a zigzag and a handprint daubed on each side; the control shelf of dark timber with a bark log
  // along its front and the same hide over its top, its bone joystick (a coconut for a knob) and an ember button in a
  // bone ring standing on the hide; the glass case on bamboo corner posts, framed in bamboo
  // round its foot and along the tops of its sides, heaped on banana leaves over sand with coconuts (husk, young and
  // earth-painted), plush, bananas, bones, seashells and a few feathers under a bamboo gantry; and over it a carved
  // sign board, CLAW brushed in ochre on its pale timber face, a bark log along its top and a tusk curling out of each end,
  // crowned with broad leaves where a liana climbs up from the back corner. The claw hangs apart (`claw`) so the scene
  // can drive it; `CLAW` is its box inside the case.
  const CLAW = { y: 1.9, floor: 1.02, x: 0.34, z: 0.28 };
  // The claw game's machine: the middle claw machine's own geometry, which the scenes stand `dz` in front of the
  // player's spot (`CLAW.back`, -z), for the carnival scene and the hall's station alike. `CLAW.chute` is the drop
  // hole in the case's front-right corner and `CLAW.prizes` the grabbable prizes on top of the heap, [x, z, kind]
  // in the machine's frame (kind 0 a gorilla idol, 1 a banana, 2 a coconut, 3 the golden coconut, the jackpot, in the
  // back corner furthest from the chute).
  CLAW.back = 1;
  CLAW.chute = { x: 0.3, z: 0.26 };
  CLAW.prizes = [[-0.3, -0.22, 3], [-0.08, 0.02, 2], [0.14, -0.2, 1], [-0.3, 0.18, 1], [0.05, 0.24, 2], [0.28, -0.05, 0], [-0.12, -0.28, 2], [0.2, 0.1, 0]];
  CLAW.values = [30, 15, 10, 50];
  // A pinball table in its frame, the player at +z, as the Oogas build one: a timber cabinet with a hide stretched
  // down each side (leopard on the first, tiger on the second) on four log legs, tilted up toward its backbox; bark
  // log rails down both sides bound with rope and a log lockdown bar across the front; the playfield a slab of dark
  // bark brushed in softly glowing cave paint (the title, ochre dots down the lanes barely lit, a red-earth sun round each
  // bumper, an ochre banana, a bone down each slope to the flippers, a red handprint either side) under a thin skin
  // of clear resin; three bumpers of half a coconut shell turned over, an ember glowing in each one's crown; a
  // coconut for the plunger's knob and bone knobs for the flipper buttons; and the timber backbox, its title brushed
  // in ochre and bone on a charcoal panel over a carved timber Ooga mask with the fire glowing in its eyes, a liana
  // down each front edge and two more climbing dry bamboo stakes behind the scoreboard the game hangs over it, into a
  // crown of big leaves over the board. `PIN` places a point on the playfield for the scene's ball; `flip` is a
  // flipper's reach, which the game's physics shares.
  const PIN = { w: 0.64, l: 1.26, y: 0.98, tilt: 0.12, flip: 0.08 };
  // The pinball's mammoth ramp: a wireform the Oogas bent from two long bone rails, rising from its mouth on the right
  // of the playfield, over the top and down past the teeth to the left inlane, on dry bamboo stilts, a bone tie across
  // its rails at each stilt and a tusk curling up either side of its mouth. `PIN.ramp` is the middle of its channel,
  // [u, v, lift] from the mouth to where it lets the coconut out, straight between points, as the game rides it;
  // `PIN.rampHalf` is half its width. Built in the playfield's frame, as `pinAt` places things.
  PIN.ramp = [[0.18, -0.02, 0], [0.183, 0.12, 0.03], [0.195, 0.28, 0.06], [0.17, 0.4, 0.085], [0.09, 0.455, 0.1], [-0.03, 0.465, 0.1], [-0.15, 0.44, 0.095],
    [-0.245, 0.36, 0.085], [-0.285, 0.22, 0.07], [-0.29, 0, 0.055], [-0.285, -0.2, 0.04], [-0.265, -0.31, 0.02], [-0.24, -0.37, 0.004]];
  PIN.rampHalf = 0.028;
  // Air hockey as the Ice Age plays it, in its frame, long along x with a player at each end: a thick slab of ice
  // chipped round, deep blue with pale sides, on a rough stone slab that stands on two boulders like a dolmen, a
  // fringe of shaggy mammoth fur hanging from
  // the stone's long edges; frost streaks and cracks in the ice and its lines painted in red earth and charcoal, a
  // spiral at centre ice; bark log rails round the ice lashed with rope at the corners, the end
  // rails cut open at the goal slots; the far goal (+x, the Ooga's end in the game) hung under with a leafy liana,
  // below the ice where it never crosses the player's view, and leaves sprouting up from its corners' lashings,
  // framing the Ooga above the far rail. `lit` is the paint, which flares on a goal. The puck, a slice of coconut,
  // and a stone mallet with a bone grip are apart (`hockeyPieces`) for the scene to play with.
  const HOCKEY = { w: 2.2, d: 1.1, y: 0.82 };

  // ---- the kiddie rides ------------------------------------------------------------------------------------
  // The coin rides of the ride corral by the doorway, each built facing +z: `base` is the round plinth, `RIDE_R` round
  // (a mottled stone drum under the gorilla, a sawn log slice streaked with bark under the others), in a rope band, a
  // bamboo stub lashed at its top for the rocker's spring, a coin post of thick bamboo at its side (lashed, a coconut in
  // its cut top and a timber plate on its front with a tiki's brow, sockets and nose carved in it and the slot for its
  // mouth), and leaves sprouting on the plinth's front under the rider, where the ride hides them from its own camera
  // behind; `body` what rides on it, apart so the scene can rock it about the spring's top at `RIDE_Y`: 0 a silverback
  // gorilla on its knuckles, 1 a cheeky monkey pulling a coconut-shell cart with a banana steering wheel, 2 a friendly
  // triceratops, 3 a shaggy baby mammoth; all but the monkey carry a hide saddle under a leather seat and a bone
  // handlebar.
  const RIDE_Y = 0.55;
  // Where a rider sits on each `body`, in its frame: the hip at `y` and `z` on the leather seat (the monkey's rider down
  // on the cushion in the shell), the body leaning back by `lean` with its hands off the grips (holding on, it leans as
  // far as its arms reach them), each hand on its `grip` ([x] out to either side, y, z: the bone handlebar's ends, the
  // dino's reins at its bar, the banana wheel's rim), each leg's hang, `splay` out down the flank and `reach` forward
  // (radians, the body at `lean`; the monkey's rider has its feet up on the shell's rim), and the rider's `scale`: a
  // kiddie ride, so a grown Ooga is still big on it.
  const RIDE_SEATS = [
    { y: 0.84, z: -0.16, lean: -0.12, grip: [0.2, 0.93, 0.25], splay: 0.6, reach: 0.35, scale: 0.9 },
    { y: 0.31, z: -0.38, lean: -0.4, grip: [0.12, 0.6, -0.12], splay: 0.2, reach: 1.9, scale: 0.8 },
    { y: 0.84, z: -0.12, lean: -0.1, grip: [0.3, 0.7, 0.3], splay: 0.62, reach: 0.35, scale: 0.82 },
    { y: 0.85, z: -0.14, lean: -0.12, grip: [0.21, 0.94, 0.22], splay: 0.6, reach: 0.35, scale: 0.85 }
  ];
  // A ride game's beat pole, hung in front of the ride while it runs: a bamboo pole on two lianas running up out of
  // sight and `RIDE_BEAT.cups` coconut-shell cups along it, `RIDE_BEAT.step` apart about its middle, their rims at
  // the origin. It casts no shadow: it hangs in the air, a draw saved.
  const RIDE_BEAT = { step: 0.13, cups: 8 };
  // The hall of fame hung off the stage: each game's best brushed in earth paint on a slate, BIG OOGAS in chalk over
  // a red-earth zigzag, then a row a game: its name in ochre, the Ooga's initials in chalk and the score in ember
  // ochre, gold where the visitor holds it. `rows` are [game, initials, score, mine], laid out on the old board's grid
  // of `FAME_W` columns 4.5 cm apart and `FAME_ROW` a row. Kept while its rows read the same, so a visit bakes it
  // only when a best changed.
  const FAME_W = 82;
  const FAME_ROW = 9;
  const FAME = { w: FAME_W * 0.045, h: (11 + 4 * FAME_ROW) * 0.045 };
  // The prize shelf by the counter: a timber shelf with a bark log along its front on timber brackets, a board of dark
  // timber behind it with each prize drawn on it in chalk at its slot, lit a little, so the shelf reads as a trophy
  // wall to fill; MY PRIZES brushed in chalk high over it on a timber plank with a bone knob at each end, over the
  // prize counter's lanterns from every side, a liana along the shelf's back and leaves at its ends. The scene stands
  // each prize won on it before its drawing, `PRIZE_SHELF` metres apart.
  const PRIZE_SHELF = 0.55;

  // ---- pool, darts and the horse -------------------------------------------------------------------------
  // A pool table in its frame, long along x, played from +z: `POOL` is its bed (top at `y`, `L` by `W`, the six
  // pockets). A slab of warm carved stone with a zigzag painted in ochre down each long side, on two turned stone
  // pedestals with ferns at their feet and teal mushrooms under its corners; a bed of moss in big soft patches, its
  // cushions moss too; bark log rails broken at the pockets with
  // bone diamonds along their tops; and dark pocket cups in half coconut shells (a husk rim round a lip of pale meat).
  // Its `glow` holds the lamp's flames, and `lamp` the lamp (`poolLamp`), a geometry of its own so the body, the
  // hall's pick target, stays round the table. `felt` picks the moss.
  const POOL = { L: 2.24, W: 1.12, y: 0.8, r: 0.03, pocket: 0.066 };
  POOL.pockets = [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]].map(([u, v]) => [u * (POOL.L / 2 + (u ? 0.012 : 0)), v * (POOL.W / 2 + 0.018)]);
  // Pool balls, painted coconuts with a number spot: 0 the peeled cue coconut, 1-7 the colours, 8 the charred one.
  // `poolCue` is the cue, butt at the origin along +z: a stout dry cane and a slimmer green one lashed where they
  // join, and a bone tip. `poolDot` is a bead of the aim guide, a small smooth cream dot.
  const POOL_COLORS = ["#f6ecd2", "#e8b82a", "#2f5ab8", "#c8302a", "#6a3a8a", "#e8762a", "#2f7a44", "#8a2a1c", "#141418"];
  // A dart board on a stretched hide, facing +z with its bull at the origin: `DART` holds its rings (metres from the
  // bull) and the sectors' order; 20 at the top. The face of a sawn log: its beds painted in umber and ochre in turn
  // over its growth rings, which show through the paint, the doubles and trebles chains of red-earth and bone dots,
  // a red-earth ring round a bone bull, every ring a little out of round; the log checked with splits and pocked
  // with old spear holes, a pale ring of sapwood round the beds, then a broad rim of bark running out of round with
  // the numbers chalked small on it; behind it
  // a buckskin laced into a frame of four bark poles lashed at the corners, brushed in cave paint (DARTS over a red
  // handprint on the left, OOGA over a charcoal Ooga with a spear on the right, a zigzag under each); two tusks
  // cradling the log's upper rim, a liana laid along the frame's top and leaves spilling off its outer corners: all
  // of it above the board's middle (clear of the view below), off the log's face, and under and beside the
  // scoreboards the game hangs over the frame.
  const DART = { y: 1.73, oche: 2.37, bull: 0.0064, outer: 0.016, tIn: 0.099, tOut: 0.107, dIn: 0.162, dOut: 0.17, r: 0.225, order: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] };
  // Painted by hand, every ring runs out of round, the same way at the same radius: where the ring `r` (board units)
  // is painted at angle `a` (clockwise from the 20), in metres from the bull at the board's scale. The game scores
  // by it, so a dart counts in the bed it is seen in.
  DART.hand = (a, r) => r * 1.4 * (1 + Math.sin(a * 3 + r * 40) * 0.03 + Math.sin(a * 7 - r * 25) * 0.018);
  // Where each machine of the newer games is played from, one frame per machine (the player at its origin facing
  // -z, `play` for the hall's station), shared by the hall and the game scenes: the claws from in front, the air
  // hockey tables from the end their `turn` faces, pool from the table's +z side, darts from the oche before the back
  // wall, pinball from its foot and the rides from 1.4 m in front of their faces.
  LAYOUT.frames = {
    claw: LAYOUT.claws.map(([x, z]) => standAt(x, z + CLAW.back, 0)),
    hockey: LAYOUT.hockeys.map((h) => standAt(h.x + Math.sin(h.turn) * 1.75, h.z + Math.cos(h.turn) * 1.75, h.turn)),
    pool: LAYOUT.pools.map((p) => standAt(p.x, p.z + 1.35, 0)),
    darts: LAYOUT.darts.map((x) => standAt(x, HALL.back + 0.38 + DART.oche, 0)),
    pinball: LAYOUT.pinball.map(([x, z]) => standAt(x, z + 1.05, 0)),
    ride: LAYOUT.rides.map((r) => ({ ...r, play: { x: r.x + Math.sin(r.turn) * 1.4, z: r.z + Math.cos(r.turn) * 1.4, facing: r.turn + Math.PI } }))
  };
  BL.arcadeModels = {
    HALL, STAGE, MEZZ, MEZZ_POSTS, GAMES, CABINETS, LAYOUT, CAB, SCREEN, FRAMES, FPS, START_FRAMES, SKEE, HOOP, SHY, METER_LEN, METER_WINDOW, SIGN_FRAME, POSTER_SCALE, MARQUEE, PRIZES, SPOTS, SPOT_Y, SPOT_FIRE, spark, CLAW, PIN, HOCKEY, WHEEL_VALUES, WHEEL_COST, blaze, MAMMOTH_AT, RETRO, RIDE_Y, RIDE_SEATS, RIDE_BEAT, POOL, POOL_COLORS, DART, FAME, PRIZE_SHELF, MAT_Y, cabinet, attractFrames
  };
  // Private lexical bindings used by the scene-only extension; read once when that group evaluates.
  BL.arcadeModelsSceneKit = { BANANA, BANANA_LEAF_TONES, BARK, BL, BONE, BONE_INK, CABINETS, CLAW, DART, DOT, EARTH_BLACK, EARTH_CHALK, EARTH_OCHRE, EARTH_RED, EMBER_GLOW, FAME, FAME_ROW, FAME_W, FRAMES, GAMES, GLASS_DK, GLYPH_H, GLYPH_W, GRID_H, GRID_W, HALL, HOCKEY, HOOP, LAYOUT, MAMMOTH_AT, MARK, MAT_Y, METER_LEN, METER_WINDOW, MEZZ, MEZZ_POSTS, NUTS, PALETTES, PICTOS, PIN, PIXEL, POOL, POOL_COLORS, POSTER_SCALE, PRIZES, PRIZE_SHELF, RETRO, RIDE_BEAT, RIDE_Y, ROPE, SCREEN, SHY, SIGN_FRAME, SKEE, SPOTS, SPOT_Y, STAGE, TIMBER_DK, TIMBER_LT, TRACKING, WHEEL_COST, WHEEL_VALUES, along, at, bake, bananaLeaf, band, beam, bevelBox, blaze, boneTusk, box, cached, ccw, centred, daubDot, daubHand, daubPoly, daubStroke, daubTaper, daubZigzag, dots, earth, face, facing, flame, geometry, grid, hexToRgb, hide, lathe, leafBlade, line, merge, mirror, moved, mulberry32, nut, oval, pictograph, prism, pushVert, rect, ring, scaled, shaded, sideShape, signBinding, stone, strip, text, textWidth, tikiMouth, tint, titleBones, torus, tuck, turn, turnedX, turnedY, turnedZ, unshadowed, variants, zigzag };
})();
