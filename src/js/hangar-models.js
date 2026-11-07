// The Lightning Jet Hangar's geometry: the long rock hall behind the Lightning Factory's door at the end of its left
// walkway, as its concept draws it. A steel landing inside the door with steps down to the runway, which runs down the
// middle of the floor between hazard-striped edges and blue marker lamps, and on through the launch tunnel's octagonal
// frames, each lined with blue neon, to the launch shield at its far end, sealed until Jet v2 flies, space beyond.
// A crane runs under the roof's ribs, and steel catwalks run along both side walls on
// brackets, a stair up to each from the back. On the right, in the
// hall's wider half, the Jet stands docked beside the runway, nose to the tunnel, inside its striped bay: a steel
// gangway runs along its left flank at the cockpit's sill, bridging the wing, with a long steel stair down from
// behind the wing toward the runway; trestles stand under its wings. On the left the crew's workstations stand in rows, their
// screens glowing blue, and on the wall above them the two boards, the repository's stats right after the door and
// its timeline farther in. Crates, blue floor lamps and terminals on stands line the runway. The Jet
// itself is `jet-models.js`'s; the boards' faces and the crew are the scene's.
//
// `LAYOUT` is the one table of where everything stands, read by the scene too. The hangar's frame: +z runs back out
// through the door to the hall, x to the right looking in, y 0 the floor. `supportAt`, `clearAt` and `walkable` are the
// floor an Ooga walks, layered as the Factory's is; they allocate nothing.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const FM = BL.factoryModels, JM = BL.jetModels;
  const { cached, box, bevelBox, merge, noShadow, moved, turnedX, turnedY, turnedZ, beam, lathe, torus, prism, tube, lanternParts, turn, shaded, forwardLathe } = models;
  const { mulberry32 } = math;
  const TAU = Math.PI * 2;

  const STONE = ["#5b4a3e", "#524238", "#66544a", "#4a3d34"], STONE_DK = "#3a2f28", IRON = "#4a4d52", IRON_DK = "#2c2e33";
  const TIMBER = "#8a5a32";
  const RUNWAY = "#2a2e36", SEAM = "#3b404a", PAINT = "#ffd23a", INK = "#141414", MARKER = "#6fc8ff", NEON = "#4fb4ff";
  const SCREEN = "#2f7fd8", FLOOR_LAMP = "#4aa8ff";

  // The hall is wider on the right, where the Jet docks, than on the left, where the crew works.
  const HALL = { x0: -22, x1: 27, back: -34, front: 30, h: 18 };
  // The crew's rooms on the right wall at the catwalks' level (`sideRooms`), one in the bay between the ribs round each
  // middle in `bays`, from the door's end in, short of the Jet's wing and the catwalk's stair: `half` along the wall
  // either side of its middle, the solid stretch with its door at its door's end `door` long, and its console's middle
  // `consoles` along the wall from the room's middle toward the launch tunnel; and the bays whose upper wall has a small
  // lit window of the crew's lofts (`lofts`).
  const SIDE_ROOMS = { bays: [18, 10, 2], half: 3.4, door: 1.5, consoles: [0.6, -0.4, 0.9], lofts: [18, 2, -6] };
  const LAYOUT = {
    HALL,
    // The door back to the hall in the front wall, its sill on the landing: its shield's opening and plane, as the
    // Factory's side of it has them.
    door: { x: 0, y: 1.5, z: 30, turn: Math.PI, half: FM.HANGAR_DOOR.half, top: FM.HANGAR_DOOR.top, plane: FM.HANGAR_DOOR.plane },
    // The landing inside the door, a deck (centre, top, width and depth), and its steps down to the runway, [x, y, z] at
    // the foot and at the head and the width.
    landing: { x: 0, y: 1.5, z: 27.5, w: 9, d: 5 },
    steps: [0, 0, 21.2, 0, 1.5, 25, 6],
    // The runway's paint from the steps' foot to the hold-short line before the launch shield, and its half-width.
    runway: { halfW: 5, z0: 21, z1: -82.8 },
    // The launch tunnel: octagonal frames of radius `r` round a centre `y` up, every `step` metres from the back wall to
    // the shield; walkers stop at `holdShort`, the hazard bar's line.
    tunnel: { y: 5, r: 7, z0: -34, z1: -84, step: 5, holdShort: -82.8 },
    // The catwalks along both side walls at the gantries' feet, decks [x0, x1, z0, z1], and the stairs up to their back
    // ends, their feet far enough from the back wall to walk up to them straight; the lines across the hall the walls'
    // ribs and the roof's stand on, by z (`gantries`); and the underside of the roof's ribs (`roofY`, `VAULT.rib` under
    // the roof), which whatever hangs from the roof hangs from.
    catwalkY: 7.5, catwalks: [[HALL.x0 + 3, HALL.x0 + 5.4, -15, 24], [HALL.x1 - 5.4, HALL.x1 - 3, -15, 24]],
    catwalkStairs: [[HALL.x0 + 4.2, 0, -26.5, HALL.x0 + 4.2, 7.5, -15, 2], [HALL.x1 - 4.2, 0, -26.5, HALL.x1 - 4.2, 7.5, -15, 2]],
    gantries: [22, 14, 6, -2, -10, -18, -26], roofY: HALL.h - 1,
    // The shell's walls: how far in from the hall's bounds their panels' faces stand, the ribs out of the side walls on
    // the gantries' lines, how far they stand out of the panels and how wide they are, and how high the surround round
    // the door back to the Factory stands.
    shell: { face: 1.3, rib: 1, ribW: 1.2, doorTop: 10 },
    // The Jet's dock right of the runway, nose to the tunnel: where `jet-models.js`'s jet stands on the floor, and the
    // striped bay round it, [x0, x1, z0, z1]. Its gangway along the left flank at the cockpit's sill, `w` wide at `x`
    // and `y` up, in three decks [z0, z1, posts]: one in front of the wing on braced posts, one bridging the wing, and
    // one behind it; and the stair down from its back end toward the tail, [x, y, z] at the foot and at the head and the
    // width.
    jet: { x: 15, z: -10 },
    bay: [5.6, 25.2, -29.6, 6.6],
    gangway: { x: 10.875, y: 5, w: 3.05, decks: [[-21, -13.6, true], [-13.6, -6.2, false], [-6.2, -4.6, true]] },
    jetStairs: [10.4, 0, 3.4, 10.4, 5, -4.6, 2],
    // Trestles under the wings, [x, z].
    trestles: [[8, -8.9], [22, -8.9]],
    // The engine static fire test's booth beside the runway behind the Jet's left engine, clear of its exhaust: where it
    // stands and the way its front faces, toward the runway with its back to the Jet, so the presser walks up to it
    // from the runway and looks over it at the engines, and where its cables plug in under the Jet's tail end, [x, z],
    // under each pod forward of its nozzle and under the belly between them, all clear of the plumes; and where the
    // test is watched from across the runway, its eye and where it looks, framing the booth, both plumes and where
    // the presser lands.
    fireTest: { x: 8, z: 11, turn: -Math.PI / 2, cables: [[12.6, -0.4], [15, 2], [17.4, -0.4]], view: { eye: [-6, 6.5, 18], look: [5, 0.8, 10] } },
    // Kortik's Sis: where she starts, by the Jet's nose off the runway, facing the runway and the door; the floor she
    // roams, [x0, x1, z0, z1], the Jet's side of the hall clear of the runway, its stair and its gangway; and her spots
    // all round the Jet, each [name, x, z, what she does there, the point she looks at, x, y, z, and, up the stair,
    // the height she stands at].
    sis: {
      x: 9.8, z: 16.6, turn: -Math.PI / 4, floor: [5.9, 26.4, -30, 24.4],
      spots: [
        ["nose gear", 15, -24.7, "fix", 15, 0.9, -23.3], ["nose", 12.2, -26.6, "admire", 15, 3.4, -23], ["left engine", 12.3, 6.6, "inspect", 13, 4, 4.7],
        ["right engine", 17.3, 5.7, "fix", 17, 3, 4.75], ["tail", 15, 8.4, "admire", 15, 6.5, 2], ["wingtip", 20.7, -0.8, "fix", 19.6, 1.4, -0.8],
        ["right wing", 21.6, -5.6, "inspect", 18.8, 1.4, -2.5], ["right flank", 20.6, -14, "admire", 16.6, 4.2, -14], ["gear", 18.6, -19.5, "fix", 17.45, 0.9, -19.5],
        ["crates", 19.3, 7.3, "inspect", 19.6, 0.8, 5.2], ["booth", 11.8, 14.4, "glare", 8, 1.6, 11], ["door", 9.6, 22.4, "glare", 0, 3, 27],
        ["floor", 13.6, 15.6, "pace", 13.6, 1.6, 12], ["hall", 22.4, 15, "pace", 22.4, 1.6, 11],
        ["left wing", 7, -6.6, "inspect", 8, 3.1, -8.9], ["left trestle", 6.4, -11.4, "fix", 7.2, 3, -10.4], ["left flank", 7.2, -17, "admire", 13, 5.6, -17],
        ["cockpit", 11.3, -17.6, "fix", 12.6, 6, -17.6, 5], ["canopy", 11, -14.6, "admire", 15, 6.6, -14.2, 5], ["gangway", 11, -9.6, "pace", 13, 5.6, -9.6, 5],
        ["wing root", 11.1, -11.8, "inspect", 13, 4.8, -11.8, 5]
      ]
    },
    // The forklift (`forklift-models.js`), parked on the runway's right half beside the static fire booth, its right side
    // just inside the runway's edge, its back level with the booth's front corner and its forks down the hall toward the
    // launch tunnel, angled a little in toward the runway's middle, out of the view from the door and of the way up to
    // the booth's button: where its middle stands and the way its forks point (0 down the hall).
    forklift: { x: 3.35, z: 7.9, turn: 0.1 },
    // The crew's workstations on the left, [x, z, turn] each, their screens facing `turn` (0 toward the door); the
    // terminals on stands by the runway, [x, z, turn], the dock's showing the Jet; and the tool chests, [x, z, turn].
    stations: [[-9.5, 17, 0], [-9.5, 9.5, 0.3], [-9.5, 2, 0], [-9.5, -5.5, 0.3], [-9.5, -13, 0], [-9.5, -20.5, 0.3], [-14.5, 6.5, Math.PI / 2], [-14.5, -11, Math.PI / 2], [-14.5, -18.5, Math.PI / 2]],
    kiosks: [[-6.9, 12.5, 0.7], [-6.9, -9, 0.7], [7.3, -3.2, -0.8, "jet"]],
    // The film show the terminals start (`hangar-terminals.js`): the old projector's cradle hung from the second roof rib
    // in over the runway, as a cinema's over its seats, [x, y, z] of its deck, between the lanterns there; and the
    // roll-down screen hung from a roof rib far down the runway facing the door,
    // its roller's middle [x, y, z] let down for the show, under the lantern over the runway there and high enough that
    // the cloth's foot clears the walkers, the height it is wound back up to between shows (`stow`, just under that
    // lantern, out of the hangar's sign's way from anywhere on the floor), its cloth's width (no lantern hangs over it)
    // and how far it unrolls.
    show: { projector: [2.75, 10.9, 14], screen: { x: 0, y: 11.2, z: -18, stow: 12.45, w: 12, drop: 6.9 } },
    toolChests: [[8.3, 0.4, -Math.PI / 2], [-16.2, 20.8, 0.4]],
    // Crates about the floor, [x, z, turn, stacked], and the blue floor lamps, [x, z].
    crates: [[-7.6, 12, 0.2, 2], [-8.5, 11.2, -0.3, 1], [-7.7, 3.4, 0.1, 1], [-7.8, -15.4, -0.2, 2], [-8.7, -16, 0.4, 1], [-7.6, -24, 0.3, 1],
      [-16.4, 1.2, 0.5, 1], [-15.6, -15, -0.2, 2], [-12, -29, 0.2, 2], [-13, -28.4, -0.3, 1],
      [7.4, 18, 0.3, 2], [8.3, 18.7, -0.4, 1], [20.6, 9.8, -0.2, 1], [6.6, -28.4, 0.3, 1], [12.9, -27.6, 0.2, 2], [19.6, 5.2, -0.2, 2], [20.5, 4.3, 0.4, 1], [25, -12, 0, 1], [16.5, -30.4, -0.3, 1]],
    floorLamps: [[-6.3, 20], [-6.3, 8], [-6.3, -4], [-6.3, -16], [-6.3, -28], [6.3, 20], [6.3, -28], [-11.8, 21.2], [-17.4, -3.2], [-11.6, -24],
      [5.9, 6.3], [5.9, -29.3], [24.9, 6.3], [24.9, -29.3], [6.3, 13.5]],
    // The two boards on the left wall under the catwalk, both square to it and held off it on their mounts: the
    // repository's stats right after the door, and its timeline farther in; centre, the width and height their faces
    // are laid out in, the way each faces, and how much bigger than that it hangs.
    boards: {
      stats: { x: HALL.x0 + 3.2, y: 4.3, z: 16, w: 9, h: 4, turn: Math.PI / 2, scale: 1.15 },
      timeline: { x: HALL.x0 + 3.2, y: 4.3, z: -2, w: 11, h: 4, turn: Math.PI / 2, scale: 1.15 }
    },
    // The hangar's sign over the runway, from the last roof rib.
    signs: { hangar: [0, 11.6, -26] },
    // The crew, gorillas in hard hats, each pacing its post: [x, y, z, radius, heading], heading 0 facing +z. At the
    // workstations (stood back from the desk, since a gorilla leans in over what it faces, and clear of the crates by
    // the second), at the stats board, on the Jet's gangway, at its stair (far enough off the tool chest beside it that
    // its pacing stays clear of the chest) and its engine, on both catwalks, one in each of the crew's rooms on the right
    // wall and, last, one in the control room, each behind its console, facing out over the hall, standing where it is
    // (no floor of its own to pace).
    crew: [[-9.5, 0, 18.35, 0.35, Math.PI], [-9.75, 0, 10.85, 0.35, Math.PI + 0.3], [-9.5, 0, -11.75, 0.35, Math.PI], [-13.15, 0, -11, 0.35, -Math.PI / 2],
      [HALL.x0 + 5.6, 0, 16.4, 0.8, -Math.PI / 2], [11, 5, -17.5, 0.9, Math.PI / 2], [6.8, 0, 0.4, 0.5, Math.PI / 2], [14.8, 0, 6.2, 0.4, Math.PI],
      [HALL.x1 - 4.2, 7.5, 6, 2.2, -Math.PI / 2], [HALL.x0 + 4.2, 7.5, 0, 2.2, Math.PI / 2],
      ...SIDE_ROOMS.bays.map((z, i) => [HALL.x1 - 0.45, 7.5, z - SIDE_ROOMS.consoles[i], 0.3, -Math.PI / 2]),
      [HALL.x0 + 0.45, 7.5, 9.3, 0.3, Math.PI / 2]]
  };

  // A painted line on the floor from (ax, az) to (bx, bz), `w` wide and `h` thick, its top at `y`: yellow and black dashes.
  const hazard = (out, ax, az, bx, bz, y, w = 0.3, dash = 0.6, h = 0.02) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / dash)), a = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push(moved(turnedY(box({ w, h, d: len / n - 0.02, color: i % 2 ? INK : PAINT }), a), ax + (bx - ax) * t, y - h / 2, az + (bz - az) * t));
    }
  };
  // A part built facing +z at the origin, turned to face `turn` and set down at (x, y, z).
  const placed = (out, parts, x, y, z, turn = 0) => { for (const g of parts) out.push(moved(turnedY(g, turn), x, y, z)); };
  // A crate's top, and a stacked pair's (the smaller crate on top), where things stand on them.
  const CRATE_TOPS = [0.8, 1.44];

  // ---- the hall -------------------------------------------------------------------------------------------------

  // The hangar's own kit for its shell: graphite panels on a dark seam with a darker skirting along the floor, ribs
  // standing out of the side walls, and surrounds framing the openings. `panels` lays a wall's run of them with their
  // faces on the plane `face` across `axis` ("x" or "z"), the hall toward `dir` (1 or -1), from `u0` to `u1` along the
  // wall and `y0` to `y1` up it, in columns `PANEL.w` wide on the grid from `grid` and rows `PANEL.h` high over a
  // skirting `PANEL.skirt` high where the run starts at the floor; `rib` stands one out of a side wall at `z`, `h`
  // high; `surround` frames an opening from `u0` to `u1` and `top` high, its reveal running back `deep` behind the face.
  const PANEL = { w: 4, h: 3, skirt: 1.2, gap: 0.08, d: 0.12, tones: ["#3e444e", "#393f48", "#434a54"], dark: "#2a2f37", seam: "#16191e" };
  const RIB = { color: "#4b525d", edge: "#6b7480" }, FLOOR_TONES = ["#3a3f47", "#363b43", "#3e434b"];
  // The roof: its deck's darker panels; the ribs across it, how deep they hang under it; the purlins down the hall on
  // the deck's seams, how deep and wide, with a flange under each `flange` wide in a warmer steel; the cross members
  // between the ribs, shallower; and the light strips in pairs under the purlins at `lit` across the hall, `strip` wide,
  // `pair` either side of the purlin's middle, stopping `end` short of what they meet, lit cool blue.
  const VAULT = {
    deck: ["#262a31", "#23272d", "#292d35"], rib: 1, purlin: 0.55, purlinW: 0.24, flange: 0.44, cross: 0.36, crossW: 0.2,
    steel: "#3b4351", edge: "#5f5a53", lit: [-14, -6, 2, 10, 18], strip: 0.07, pair: 0.12, end: 0.45, color: "#6cc0ff"
  };
  // The columns' knees under the crane's runway: how far each juts out along its 45° slope, the straight lip under its
  // top, how far its two blue strips stand either side of its middle, and their colour.
  const KNEE = { reach: 1, lip: 0.35, strips: 0.3, color: "#5fb8ff" };
  // One box in a wall's frame: from `u` `w` along it, from `y` `h` up it, from `back` to `front` toward the hall.
  const wallBox = (axis, face, dir, u, w, y, h, back, front, color) => {
    const t = front - back, c = face + dir * (back + front) / 2, uc = u + w / 2, yc = y + h / 2;
    return box(axis === "x" ? { w: t, h, d: w, color, offset: { x: c, y: yc, z: uc } } : { w, h, d: t, color, offset: { x: uc, y: yc, z: c } });
  };
  const panels = (parts, rand, axis, face, dir, grid, u0, u1, y0, y1) => {
    const P = PANEL;
    parts.push(wallBox(axis, face, dir, u0, u1 - u0, y0, y1 - y0, -P.d - 0.1, -P.d, P.seam));
    for (let g = grid + Math.floor((u0 - grid) / P.w) * P.w; g < u1; g += P.w) {
      const a = Math.max(g, u0), w = Math.min(g + P.w, u1) - a;
      if (w < 0.05) continue;
      let y = y0;
      if (y0 === 0) {
        parts.push(wallBox(axis, face, dir, a + P.gap / 2, w - P.gap, 0, P.skirt - P.gap / 2, -P.d, 0.08, P.dark));
        y = P.skirt;
      }
      for (; y < y1 - 0.05; y += P.h) {
        const h = Math.min(P.h, y1 - y);
        parts.push(wallBox(axis, face, dir, a + P.gap / 2, w - P.gap, y + P.gap / 2, h - P.gap, -P.d, 0, P.tones[Math.floor(rand() * P.tones.length)]));
      }
    }
  };
  // A column's knee, after the concept's angled columns: where it meets the crane's runway (`CRANE.railY`, the knee's top
  // under the runway beam's foot), the column juts toward the hall in a 45° slope `KNEE.reach` out with a `lip` straight
  // under the top, carrying the beam; two blue strips run up the slope (`KNEE.strips` either side of its middle), into
  // `glow`. Above it the column runs on straight to the roof, clear of the crane's bridge as it passes.
  // The height a knee runs over, its foot to its top.
  const kneeSpan = () => {
    const top = CRANE.railY - 0.7;
    return { top, foot: top - KNEE.lip - KNEE.reach };
  };
  const knee = (parts, glow, face, dir, z) => {
    const K = KNEE, S = LAYOUT.shell, x0 = face + dir * S.rib, back = face - dir * PANEL.d, { top, foot } = kneeSpan();
    const pts = [[back, foot], [x0, foot], [x0 + dir * K.reach, foot + K.reach], [x0 + dir * K.reach, top], [back, top]];
    parts.push(moved(prism(dir > 0 ? pts : pts.slice().reverse(), S.ribW, RIB.color), 0, 0, z));
    parts.push(moved(prism((dir > 0 ? [[x0, top - 0.06], [x0 + dir * K.reach, top - 0.06], [x0 + dir * K.reach, top], [x0, top]] : [[x0, top], [x0 + dir * K.reach, top], [x0 + dir * K.reach, top - 0.06], [x0, top - 0.06]]), S.ribW + 0.04, RIB.edge), 0, 0, z));
    const n = 0.035 / Math.SQRT2, inset = 0.12;
    for (const s of [-1, 1]) {
      glow.push(beam(x0 + dir * (inset + n), foot + inset - n, z + s * K.strips, x0 + dir * (K.reach - inset + n), foot + K.reach - inset - n, z + s * K.strips, 0.05, K.color, 1));
    }
  };
  // A rib, from the floor to `h`, but for its knee's stretch (`gap`, [from, to]), which the knee fills; in lengths, so
  // the Canvas 2D sort never paints one tall face over the knee.
  const rib = (parts, face, dir, z, h, gap) => {
    const S = LAYOUT.shell, w = S.ribW;
    for (const [y0, y1] of [[0, gap[0]], [gap[1], h]]) {
      parts.push(wallBox("x", face, dir, z - w / 2, w, y0, y1 - y0, -PANEL.d, S.rib, RIB.color));
      parts.push(wallBox("x", face, dir, z - w * 0.2, w * 0.4, y0, y1 - y0, S.rib, S.rib + 0.04, RIB.edge));
    }
    parts.push(wallBox("x", face, dir, z - w / 2 - 0.2, w + 0.4, 0, 0.6, -PANEL.d, S.rib + 0.2, PANEL.dark));
  };
  const surround = (parts, axis, face, dir, u0, u1, top, deep) => {
    for (const [a, w] of [[u0 - 1, 1], [u1, 1]]) parts.push(wallBox(axis, face, dir, a, w, 0, top + 1, -deep, 0.3, RIB.color));
    parts.push(wallBox(axis, face, dir, u0 - 1, u1 - u0 + 2, top, 1, -deep, 0.3, RIB.color));
    for (const u of [u0 - 0.02, u1 - 0.02]) parts.push(wallBox(axis, face, dir, u, 0.04, 0, top, 0.3, 0.34, RIB.edge));
  };

  // The hangar's own steel for what stands in the hall: grated decks on a dark frame, columns and braces in a burnt
  // orange, safety-orange rails, and stairs of grated treads with a yellow nosing on open risers. It lays everything out
  // exactly as the timber kit does (`deckRailSpans`, `deckPosts`, `stairTreads`), so the floor that stands walkers on
  // it and off its rails holds unchanged. `steelRail` runs from one point to another on a deck whose top is at y 0,
  // a post every metre and a half (`ends` as `railParts`); `steelColumn` stands from y0 up to y1 at (x, z); `steelDeck`
  // is `deckParts` in steel, its top at y 0, its grating a bar and a recessed slot side by side so no face lies over
  // another; `steelStair` is a stepped `stairParts` flight.
  const STEEL = { grate: "#4a515b", slot: "#1b1e24", frame: "#2e333b", paint: "#a5552b", rail: "#e57a2e", plate: "#5a616b", nosing: "#e0b13a" };
  const steelRail = (x0, z0, x1, z1, ends = [true, true]) => {
    const S = STEEL, geos = [], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.5)), a = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (let i = 0; i <= n; i++) {
      if (i === 0 && !ends[0] || i === n && !ends[1]) continue;
      geos.push(box({ w: 0.08, h: 1.02, d: 0.08, color: S.rail, offset: { x: x0 + (x1 - x0) * i / n, y: 0.51, z: z0 + (z1 - z0) * i / n } }));
    }
    geos.push(moved(turnedY(box({ w: len + 0.08, h: 0.08, d: 0.1, color: S.rail }), a), mx, 1.06, mz));
    geos.push(beam(x0, 0.55, z0, x1, 0.55, z1, 0.06, S.rail));
    geos.push(moved(turnedY(box({ w: len, h: 0.14, d: 0.03, color: S.frame }), a), mx, 0.07, mz));
    return geos;
  };
  const steelColumn = (x, z, y0, y1, w = 0.26) => [
    box({ w: w + 0.2, h: 0.05, d: w + 0.2, color: STEEL.plate, offset: { x, y: y0 + 0.025, z } }),
    box({ w, h: y1 - y0 - 0.09, d: w, color: STEEL.paint, offset: { x, y: (y0 + 0.05 + y1 - 0.04) / 2, z } }),
    box({ w: w + 0.12, h: 0.04, d: w + 0.12, color: STEEL.plate, offset: { x, y: y1 - 0.02, z } })
  ];
  const steelDeck = (w, d, drop, rails = "", cuts = []) => {
    const S = STEEL, geos = [], along = d > w, span = along ? w : d, n = Math.max(3, Math.round(span / 0.3)), pitch = span / n;
    const bar = pitch * 0.62, gap = pitch - bar;
    for (let i = 0; i < n; i++) {
      const b = (i - n / 2) * pitch + bar / 2, s = b + bar / 2 + gap / 2;
      geos.push(along ? box({ w: bar, h: 0.2, d: d - 0.04, color: S.grate, offset: { x: b, y: -0.1 } }) : box({ w: w - 0.04, h: 0.2, d: bar, color: S.grate, offset: { y: -0.1, z: b } }));
      geos.push(along ? box({ w: gap, h: 0.04, d: d - 0.04, color: S.slot, offset: { x: s, y: -0.08 } }) : box({ w: w - 0.04, h: 0.04, d: gap, color: S.slot, offset: { y: -0.08, z: s } }));
    }
    for (const s of [-1, 1]) {
      geos.push(box({ w, h: 0.3, d: 0.16, color: S.frame, offset: { y: -0.35, z: s * (d / 2 - 0.08) } }));
      geos.push(box({ w: 0.16, h: 0.3, d: d - 0.32, color: S.frame, offset: { x: s * (w / 2 - 0.08), y: -0.35 } }));
    }
    const reach = typeof drop === "function" ? drop : () => drop;
    const { cols, rows, at } = models.deckGrid(w, d);
    for (const [x, z] of models.deckPosts(w, d)) {
      const down = reach(x, z);
      if (down < 0.4) continue;
      geos.push(...steelColumn(x, z, -down, -0.5));
      if (down > 1.6) {
        if (x) geos.push(beam(x, -1.3, z, x - Math.sign(x) * 0.8, -0.52, z, 0.09, S.paint));
        if (z) geos.push(beam(x, -1.3, z, x, -0.52, z - Math.sign(z) * 0.8, 0.09, S.paint));
      }
    }
    for (const s of [-1, 1]) {
      const [ax, az] = along ? at(s < 0 ? 0 : cols - 1, 0) : at(0, s < 0 ? 0 : rows - 1), [bx, bz] = along ? at(s < 0 ? 0 : cols - 1, rows - 1) : at(cols - 1, s < 0 ? 0 : rows - 1);
      const depth = Math.min(reach(ax, az), reach(bx, bz), 4.5);
      if (depth > 1.5) geos.push(beam(ax, -depth + 0.3, az, bx, -0.55, bz, 0.1, S.paint), beam(ax, -0.55, az, bx, -depth + 0.3, bz, 0.1, S.paint));
    }
    for (const [x0, z0, x1, z1, a, b] of models.deckRailSpans(w, d, rails, cuts)) geos.push(...steelRail(x0, z0, x1, z1, [a, b]));
    return geos;
  };
  const steelStair = (ax, ay, az, bx, by, bz, w = 1.6, posts = [true, true]) => {
    const S = STEEL, geos = [], rise = by - ay, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, px = -uz, pz = ux;
    for (const s of [-1, 1]) geos.push(beam(ax + px * s * w / 2, ay, az + pz * s * w / 2, bx + px * s * w / 2, by, bz + pz * s * w / 2, 0.2, S.paint));
    const n = models.stairTreads(rise), run = len / n, yaw = Math.atan2(ux, uz);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, top = ay + rise * (i + 1) / (n + 1);
      geos.push(moved(turnedY(box({ w: w - 0.06, h: 0.06, d: run - 0.1, color: S.grate }), yaw), ax + (bx - ax) * t + ux * 0.035, top - 0.03, az + (bz - az) * t + uz * 0.035));
      geos.push(moved(turnedY(box({ w: w - 0.06, h: 0.07, d: 0.07, color: S.nosing }), yaw), ax + (bx - ax) * i / n + ux * 0.035, top - 0.035, az + (bz - az) * i / n + uz * 0.035));
    }
    for (const s of [-1, 1]) {
      const sx = px * s * (w / 2 + 0.05), sz = pz * s * (w / 2 + 0.05), m = Math.max(2, Math.round(len / 1.6) + 1);
      for (let i = 0; i < m; i++) {
        if (i === 0 && !posts[0] || i === m - 1 && !posts[1]) continue;
        const t = i / (m - 1);
        geos.push(box({ w: 0.08, h: 1.02, d: 0.08, color: S.rail, offset: { x: ax + (bx - ax) * t + sx, y: ay + rise * t + 0.51, z: az + (bz - az) * t + sz } }));
      }
      geos.push(beam(ax + sx, ay + 1.04, az + sz, bx + sx, by + 1.04, bz + sz, 0.09, S.rail), beam(ax + sx, ay + 0.55, az + sz, bx + sx, by + 0.55, bz + sz, 0.06, S.rail));
    }
    return geos;
  };

  // The chamber: a floor of graphite tiles; walls of the kit's panels standing straight up, ribs out of the side walls
  // on the gantries' lines and a surround framing the launch tunnel's mouth in the back wall and round the door over
  // the landing in the front (`front`, apart from the rest, which the window into the hangar leaves out), its reveal
  // running back to the door's arch; a vault of graphite panels with ribs across
  // it on the gantries' lines, meeting the walls' ribs, and light slots down the bays between them (`slots`, a mesh of
  // their own, so an anomaly dims them with the hall's lights); and behind it all a dark backing, so the sky the launch
  // tunnel lets in never shows between two faces.
  const shell = cached(() => {
    const { x0: X0, x1: X1, back: B, front: F, h: H } = HALL, S = LAYOUT.shell, d = LAYOUT.door, t = LAYOUT.tunnel, rand = mulberry32(5150), floor = [], walls = [], frontWall = [], vault = [], slots = [];
    const mid = (X0 + X1) / 2, span = X1 - X0, top = H + 1;
    floor.push(box({ w: span, h: 0.2, d: F - B, color: PANEL.seam, offset: { x: mid, y: -0.16, z: (B + F) / 2 } }));
    for (let x = X0; x < X1; x += 4) for (let z = B; z < F; z += 4) {
      const w = Math.min(4, X1 - x);
      floor.push(box({ w: w - 0.06, h: 0.2, d: 3.94, color: FLOOR_TONES[Math.floor(rand() * 3)], offset: { x: x + w / 2, y: -0.11, z: z + 2 } }));
    }
    const left = X0 + S.face, right = X1 - S.face, front = F - S.face, back = B + S.face;
    // The left wall, its panels built whole and then those in the control room's opening left out, and its seam behind
    // them laid round the opening (`CONTROL`); the ribs either side cover the panels' cut edges.
    const C = CONTROL, leftWall = [];
    panels(leftWall, rand, "x", left, 1, B, back - PANEL.d, front + PANEL.d, 0, top);
    const opening = (g) => {
      let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < g.verts.length; i += 3) { y0 = Math.min(y0, g.verts[i + 1]); y1 = Math.max(y1, g.verts[i + 1]); z0 = Math.min(z0, g.verts[i + 2]); z1 = Math.max(z1, g.verts[i + 2]); }
      const y = (y0 + y1) / 2, z = (z0 + z1) / 2;
      return y > C.y0 && y < C.y1 && z > C.z0 && z < C.z1;
    };
    const seam = (u0, u1, y0, y1) => walls.push(wallBox("x", left, 1, u0, u1 - u0, y0, y1 - y0, -PANEL.d - 0.1, -PANEL.d, PANEL.seam));
    seam(back - PANEL.d, C.z0, 0, top); seam(C.z1, front + PANEL.d, 0, top); seam(C.z0, C.z1, 0, C.y0); seam(C.z0, C.z1, C.y1, top);
    for (let i = 1; i < leftWall.length; i++) if (!opening(leftWall[i])) walls.push(leftWall[i]);
    // The right wall likewise round the crew's rooms (`SIDE_ROOMS`), at the control room's heights.
    const R = SIDE_ROOMS, holes = R.bays.map((z) => [z - R.half, z + R.half]).sort((a, b) => a[0] - b[0]), rightWall = [];
    panels(rightWall, rand, "x", right, -1, B, back - PANEL.d, front + PANEL.d, 0, top);
    const hole = (g) => {
      let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < g.verts.length; i += 3) { y0 = Math.min(y0, g.verts[i + 1]); y1 = Math.max(y1, g.verts[i + 1]); z0 = Math.min(z0, g.verts[i + 2]); z1 = Math.max(z1, g.verts[i + 2]); }
      const y = (y0 + y1) / 2, z = (z0 + z1) / 2;
      return y > C.y0 && y < C.y1 && holes.some(([a, b]) => z > a && z < b);
    };
    const rightSeam = (u0, u1, y0, y1) => walls.push(wallBox("x", right, -1, u0, u1 - u0, y0, y1 - y0, -PANEL.d - 0.1, -PANEL.d, PANEL.seam));
    let u = back - PANEL.d;
    for (const [a, b] of holes) { rightSeam(u, a, 0, top); rightSeam(a, b, 0, C.y0); rightSeam(a, b, C.y1, top); u = b; }
    rightSeam(u, front + PANEL.d, 0, top);
    for (let i = 1; i < rightWall.length; i++) if (!hole(rightWall[i])) walls.push(rightWall[i]);
    for (const z of LAYOUT.gantries) {
      const k = kneeSpan(), gap = [k.foot, k.top];
      rib(walls, left, 1, z, top, gap), rib(walls, right, -1, z, top, gap);
      knee(walls, slots, left, 1, z), knee(walls, slots, right, -1, z);
    }
    // The back wall round the tunnel's mouth, its surround's reveal running back to the tunnel's sleeve.
    const mw = t.r + 0.4, mt = t.y + t.r;
    panels(walls, rand, "z", back, 1, X0, left, -mw - 1, 0, top);
    panels(walls, rand, "z", back, 1, X0, mw + 1, right, 0, top);
    panels(walls, rand, "z", back, 1, X0, -mw - 1, mw + 1, mt + 1, top);
    surround(walls, "z", back, 1, -mw, mw, mt, S.face);
    // The front wall round the door, the landing standing in its surround and the surround's reveal running back to the
    // door's arch.
    const dw = LAYOUT.landing.w / 2 + 0.1, dt = S.doorTop;
    panels(frontWall, rand, "z", front, -1, X0, left, d.x - dw - 1, 0, top);
    panels(frontWall, rand, "z", front, -1, X0, d.x + dw + 1, right, 0, top);
    panels(frontWall, rand, "z", front, -1, X0, d.x - dw - 1, d.x + dw + 1, dt + 1, top);
    surround(frontWall, "z", front, -1, d.x - dw, d.x + dw, dt, S.face + 0.5);
    // The roof's deck, then the lattice under it: the ribs, the purlins in lengths from rib to cross member (so the
    // Canvas 2D sort keeps them in front of the deck's panels), the cross members in lengths between the purlins, and
    // the light strips under the purlins at `lit`, a pair down each coffer.
    const V = VAULT, lattice = [];
    for (let x = X0 + Math.floor((left - X0) / 4) * 4; x < right; x += 4) for (let z = B + Math.floor((back - B) / 4) * 4; z < front; z += 4) {
      const x0 = Math.max(x, left), x1 = Math.min(x + 4, right), z0 = Math.max(z, back), z1 = Math.min(z + 4, front);
      vault.push(box({ w: x1 - x0 - PANEL.gap, h: 0.2, d: z1 - z0 - PANEL.gap, color: V.deck[Math.floor(rand() * V.deck.length)], offset: { x: (x0 + x1) / 2, y: H + 0.1, z: (z0 + z1) / 2 } }));
    }
    for (const z of LAYOUT.gantries) {
      lattice.push(box({ w: right - left, h: V.rib, d: S.ribW, color: RIB.color, offset: { x: mid, y: H - V.rib / 2, z } }));
      lattice.push(box({ w: right - left, h: 0.04, d: S.ribW * 0.4, color: RIB.edge, offset: { x: mid, y: H - V.rib - 0.02, z } }));
    }
    const xs = [left], zs = [back];
    for (let x = X0 + 4; x < right - 1; x += 4) if (x > left + 1) xs.push(x);
    for (let z = B + 4; z < front - 1; z += 4) if (z > back + 1) zs.push(z);
    xs.push(right), zs.push(front);
    const onRib = (z) => LAYOUT.gantries.includes(z), fy = H - V.purlin + 0.03;
    for (let j = 1; j < zs.length; j++) {
      const z0 = zs[j - 1], z1 = zs[j], zc = (z0 + z1) / 2, d = z1 - z0;
      for (let i = 1; i < xs.length - 1; i++) {
        const x = xs[i];
        lattice.push(box({ w: V.purlinW, h: V.purlin - 0.06, d, color: V.steel, offset: { x, y: H - (V.purlin - 0.06) / 2, z: zc } }));
        lattice.push(box({ w: V.flange, h: 0.06, d, color: V.edge, offset: { x, y: fy, z: zc } }));
        if (!V.lit.includes(x)) continue;
        const s0 = z0 + V.end + (onRib(z0) ? S.ribW / 2 : 0), s1 = z1 - V.end - (onRib(z1) ? S.ribW / 2 : 0);
        for (const side of [-1, 1]) slots.push(box({ w: V.strip, h: 0.03, d: s1 - s0, color: V.color, emissive: 1, offset: { x: x + side * V.pair, y: H - V.purlin - 0.015, z: (s0 + s1) / 2 } }));
      }
      if (j === zs.length - 1) continue;
      const z = zs[j];
      if (onRib(z)) continue;
      for (let i = 1; i < xs.length; i++) {
        const x0 = xs[i - 1], x1 = xs[i];
        lattice.push(box({ w: x1 - x0, h: V.cross, d: V.crossW, color: V.steel, offset: { x: (x0 + x1) / 2, y: H - V.cross / 2, z } }));
      }
    }
    // The backing round the shell, and the dark sheet over the roof's panels: one box, whose middle would sort it over
    // whatever hangs under the roof on Canvas 2D, so it sorts with the backing.
    const backing = [
      box({ w: 1, h: H + 4, d: F - B + 4, color: PANEL.seam, offset: { x: X0 - 1.2, y: H / 2, z: (B + F) / 2 } }),
      box({ w: 1, h: H + 4, d: F - B + 4, color: PANEL.seam, offset: { x: X1 + 1.2, y: H / 2, z: (B + F) / 2 } }),
      box({ w: span + 4, h: H + 4, d: 1, color: PANEL.seam, offset: { x: mid, y: H / 2, z: F + 1.6 } }),
      box({ w: span + 4, h: 1, d: F - B + 4, color: PANEL.seam, offset: { x: mid, y: H + 3, z: (B + F) / 2 } }),
      box({ w: right - left, h: 0.2, d: front - back, color: PANEL.seam, offset: { x: mid, y: H + 0.3, z: (back + front) / 2 } })
    ];
    // The back wall's backing leaves the tunnel's mouth, in three slabs round it.
    const bw = t.r + 0.6;
    backing.push(box({ w: -bw - X0 + 2, h: H + 4, d: 1, color: PANEL.seam, offset: { x: (X0 - 2 - bw) / 2, y: H / 2, z: B - 1.6 } }), box({ w: X1 + 2 - bw, h: H + 4, d: 1, color: PANEL.seam, offset: { x: (bw + X1 + 2) / 2, y: H / 2, z: B - 1.6 } }));
    backing.push(box({ w: 2 * bw, h: H + 4 - (t.y + bw), d: 1, color: PANEL.seam, offset: { y: (H + 4 + t.y + bw) / 2 - 2, z: B - 1.6 } }));
    return { floor: merge(...floor), walls: noShadow(merge(...walls)), front: noShadow(merge(...frontWall)), vault: noShadow(merge(...vault)), lattice: noShadow(merge(...lattice)), slots: noShadow(merge(...slots)), backing: merge(...backing) };
  });

  // The landing inside the door: a grated steel deck on columns, railed down both sides and along its front but for
  // its steps, which come down to the runway on steel stringers.
  const landing = cached(() => {
    const l = LAYOUT.landing, [sx, , sz0, , sy1, sz1, sw] = LAYOUT.steps, geos = [];
    placed(geos, steelDeck(l.w, l.d, l.y, "new", [[sx - l.x, sz1 - l.z, sw / 2 + 0.05, 0, -1]]), l.x, l.y, l.z);
    geos.push(...steelStair(sx, 0, sz0, sx, sy1, sz1, sw, [true, false]));
    return merge(...geos);
  });

  // The steel bulkhead the stone arch of the door back to the Factory stands in, in the door's frame (+z into the
  // hangar, the sill at y 0): a plate filling the front wall's surround round the arch, its opening the arch's outer
  // ring (`R` round its centre `cy`, straight down below it), cut in wedges along rays from that centre so each is a
  // quad; a dark reveal round the opening back to the arch and an orange edge on its face; rivets down its sides and
  // along its top; and a steel board the scene hangs the door's sign on, the sign's own bolts glowing either side.
  const BULKHEAD = { R: 3.6, cy: 2.6, z: 0.71, d: 0.1, reveal: 1.06, edge: 0.12, n: 7 };
  const doorBulkhead = cached(() => {
    const B = BULKHEAD, S = STEEL, D = FM.HANGAR_DOOR, geos = [];
    const half = LAYOUT.landing.w / 2 + 0.1, top = LAYOUT.shell.doorTop - LAYOUT.door.y, rise = top - B.cy, front = B.z + B.d / 2;
    const ring = (r, a) => [Math.cos(a) * r, B.cy + Math.sin(a) * r];
    const out = (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return Math.abs(c) * rise > s * half ? [Math.sign(c) * half, B.cy + half * s / Math.abs(c)] : [rise * c / s, top];
    };
    const corner = Math.atan2(rise, half), wedges = [];
    for (const [a0, a1] of [[0, corner], [corner, Math.PI - corner], [Math.PI - corner, Math.PI]]) {
      for (let k = 0; k < B.n; k++) wedges.push([a0 + (a1 - a0) * k / B.n, a0 + (a1 - a0) * (k + 1) / B.n]);
    }
    for (const [a0, a1] of wedges) {
      geos.push(moved(prism([ring(B.R, a0), out(a0), out(a1), ring(B.R, a1)], B.d, S.plate), 0, 0, B.z));
      geos.push(moved(prism([ring(B.R, a0), ring(B.R + 0.1, a0), ring(B.R + 0.1, a1), ring(B.R, a1)], B.reveal, S.frame), 0, 0, front - B.reveal / 2));
      geos.push(moved(prism([ring(B.R - 0.02, a0), ring(B.R + B.edge, a0), ring(B.R + B.edge, a1), ring(B.R - 0.02, a1)], 0.04, S.rail), 0, 0, front + 0.02));
    }
    for (const s of [-1, 1]) {
      geos.push(box({ w: half - B.R, h: B.cy, d: B.d, color: S.plate, offset: { x: s * (half + B.R) / 2, y: B.cy / 2, z: B.z } }));
      geos.push(box({ w: 0.1, h: B.cy, d: B.reveal, color: S.frame, offset: { x: s * (B.R + 0.05), y: B.cy / 2, z: front - B.reveal / 2 } }));
      geos.push(box({ w: B.edge + 0.02, h: B.cy, d: 0.04, color: S.rail, offset: { x: s * (B.R + B.edge / 2 - 0.01), y: B.cy / 2, z: front + 0.02 } }));
      for (let y = 0.4; y < top - 0.3; y += 0.6) geos.push(box({ w: 0.08, h: 0.08, d: 0.04, color: S.frame, offset: { x: s * (half - 0.22), y, z: front + 0.02 } }));
    }
    for (let x = -half + 0.82; x < half - 0.6; x += 0.6) geos.push(box({ w: 0.08, h: 0.08, d: 0.04, color: S.frame, offset: { x, y: top - 0.22, z: front + 0.02 } }));
    geos.push(box({ w: 5.6, h: 1.9, d: 0.06, color: S.frame, offset: { y: D.sign[1], z: front + 0.04 } }));
    for (const s of [-1, 1]) for (const t of [-1, 1]) geos.push(box({ w: 0.2, h: 0.2, d: 0.04, color: S.plate, offset: { x: s * 2.62, y: D.sign[1] + t * 0.77, z: front + 0.09 } }));
    return merge(...geos);
  });

  // The runway: slate panels with their seams between twin yellow centre lines and hazard-striped edges, yellow and
  // black bands across it every eight metres and at the hold-short line, chevrons before the shield, and blue marker
  // lamps along both edges, the length of the floor and on through the tunnel; and on the floor beside it, the stripes
  // round the Jet's bay and along the crew's side. The lamps glow, so they are their own mesh (`glow`, for the Factory's
  // window into the hangar), and where each stands (`markers`, [x, z, ...]) for the scene's own, one `marker` each so
  // it can light them one at a time. Paint that crosses other paint stands a centimetre higher, the seams under the
  // centre lines under the bands and chevrons under the edges, and round the bay the stripes along it over the ones
  // across where they meet, so no two faces share a height and flicker.
  const runway = cached(() => {
    const r = LAYOUT.runway, flat = [], glow = [], markers = [], len = r.z0 - r.z1, mid = (r.z0 + r.z1) / 2, top = 0.08;
    flat.push(box({ w: r.halfW * 2, h: 0.04, d: len, color: RUNWAY, offset: { y: 0.02, z: mid } }));
    for (let z = r.z0 - 2; z > r.z1; z -= 4) flat.push(box({ w: r.halfW * 2 - 0.7, h: 0.01, d: 0.05, color: SEAM, offset: { y: 0.045, z } }));
    for (const x of [-2.6, 2.6]) flat.push(box({ w: 0.05, h: 0.01, d: len - 0.4, color: SEAM, offset: { x, y: 0.045, z: mid } }));
    for (const x of [-0.18, 0.18]) flat.push(box({ w: 0.12, h: 0.02, d: len - 1, color: PAINT, offset: { x, y: 0.05, z: mid } }));
    for (const s of [-1, 1]) hazard(flat, s * (r.halfW - 0.2), r.z0, s * (r.halfW - 0.2), r.z1, top, 0.3, 0.7, 0.04);
    const band = (z, d = 0.5) => {
      for (let k = 0; k < 10; k++) flat.push(box({ w: r.halfW * 0.2 - 0.02, h: 0.03, d, color: k % 2 ? INK : PAINT, offset: { x: -r.halfW + (k + 0.5) * r.halfW * 0.2, y: 0.055, z } }));
    };
    for (let z = r.z0 - 4; z > r.z1 + 6; z -= 8) band(z);
    band(r.z1 + 0.35, 0.7);
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const z = r.z1 + 2 + k * 1.2;
      flat.push(moved(turnedY(box({ w: 2.4, h: 0.03, d: 0.35, color: PAINT }), s * 0.6), s * 1.1, 0.055, z));
    }
    for (let z = r.z0 - 1; z > r.z1; z -= 3) for (const s of [-1, 1]) {
      flat.push(box({ w: 0.3, h: 0.08, d: 0.3, color: IRON_DK, offset: { x: s * (r.halfW + 0.45), y: 0.04, z } }));
      glow.push(box({ w: 0.18, h: 0.1, d: 0.18, color: MARKER, emissive: 1, offset: { x: s * (r.halfW + 0.45), y: 0.12, z } }));
      markers.push(s * (r.halfW + 0.45), z);
    }
    // The Jet's bay, striped all round, and the line along the crew's side of the runway.
    const [bx0, bx1, bz0, bz1] = LAYOUT.bay;
    hazard(flat, bx0, bz0, bx1, bz0, 0.025, 0.28);
    hazard(flat, bx1, bz0, bx1, bz1, 0.03, 0.28);
    hazard(flat, bx1, bz1, bx0, bz1, 0.025, 0.28);
    hazard(flat, bx0, bz1, bx0, bz0, 0.03, 0.28);
    hazard(flat, -5.9, 22, -5.9, HALL.back + 3, 0.025, 0.24, 0.8);
    return { flat: merge(...flat), glow: noShadow(merge(...glow)), markers: new Float32Array(markers) };
  });
  const marker = cached(() => noShadow(box({ w: 0.18, h: 0.1, d: 0.18, color: MARKER, emissive: 1, offset: { y: 0.12 } })));

  // The launch tunnel from the back wall to the shield: a stone sleeve, floored, walled and roofed, and inside it an
  // octagonal iron frame every few metres, the mouth's heaviest, each with a neon strip round its inside, a white-hot
  // core in a blue tube; the hazard bar across the hold-short line. Every frame's strip is the one `neon` ring, set at
  // each of `neonZ` by the scene, which flickers each on its own.
  const tunnel = cached(() => {
    const t = LAYOUT.tunnel, iron = [], stone = [], neon = [], neonZ = [], len = t.z0 - t.z1, mid = (t.z0 + t.z1) / 2, half = t.r + 0.4;
    stone.push(box({ w: half * 2 + 1, h: 0.4, d: len + 0.4, color: STONE[3], offset: { y: -0.2, z: mid } }));
    for (const s of [-1, 1]) stone.push(box({ w: 0.6, h: t.y + t.r + 0.6, d: len, color: STONE_DK, offset: { x: s * (half + 0.3), y: (t.y + t.r) / 2, z: mid } }));
    stone.push(box({ w: half * 2 + 1.2, h: 0.6, d: len, color: STONE_DK, offset: { y: t.y + t.r + 0.3, z: mid } }));
    for (let z = t.z0 + 0.6, i = 0; z >= t.z1; z -= t.step, i++) {
      const heavy = i === 0, w = heavy ? 0.7 : 0.42;
      for (let k = 0; k < 8; k++) {
        const a0 = TAU * (k + 0.5) / 8, a1 = TAU * (k + 1.5) / 8;
        const ax = Math.cos(a0) * t.r, ay = t.y + Math.sin(a0) * t.r, bx = Math.cos(a1) * t.r, by = t.y + Math.sin(a1) * t.r;
        if (ay < 0 && by < 0) continue;
        const cut = (px, py, qx, qy) => py >= 0 ? [px, py] : [px + (qx - px) * (-py) / (qy - py), 0];
        const [cx0, cy0] = cut(ax, ay, bx, by), [cx1, cy1] = cut(bx, by, ax, ay);
        iron.push(beam(cx0, cy0, z, cx1, cy1, z, w, heavy ? IRON : IRON_DK));
        if (i === 0) {
          const n = 0.93, p0 = [cx0 * n, t.y + (cy0 - t.y) * n], p1 = [cx1 * n, t.y + (cy1 - t.y) * n];
          neon.push(beam(p0[0], p0[1], 0, p1[0], p1[1], 0, 0.16, NEON, 1), beam(p0[0], p0[1], 0.07, p1[0], p1[1], 0.07, 0.055, "#e6f4ff", 1));
        }
      }
      neonZ.push(z + w / 2 + 0.04);
    }
    // The hazard bar across the hold-short line: a striped beam on two posts.
    const hs = t.holdShort - 0.4;
    for (const s of [-1, 1]) iron.push(box({ w: 0.2, h: 1.1, d: 0.2, color: IRON_DK, offset: { x: s * 5.6, y: 0.55, z: hs } }));
    for (let k = 0; k < 14; k++) iron.push(box({ w: 0.8, h: 0.22, d: 0.18, color: k % 2 ? INK : PAINT, offset: { x: -5.6 + (k + 0.5) * 0.8, y: 1.05, z: hs } }));
    return { iron: merge(...iron), stone: merge(...stone), neon: noShadow(merge(...neon)), neonZ };
  });

  // The catwalks along the side walls: grated steel decks bracketed into the wall (no posts to stand in front of the
  // boards below), railed along the hall side and across both ends but where the stair comes up, and the steel stairs
  // up to them.
  const catwalks = cached(() => {
    const L = LAYOUT, y = L.catwalkY, geos = [], B = L.boards;
    const underBoard = (x, z) => Object.values(B).some((b) => Math.sign(b.x) === Math.sign(x) && Math.abs(z - b.z) < b.w * b.scale / 2 + 0.4);
    L.catwalks.forEach(([x0, x1, z0, z1], i) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, side = i ? 1 : -1, [sx, , , , , sz1, sw] = L.catwalkStairs[i];
      // The rails: the hall side and both ends; the wall side is the wall.
      const rails = side < 0 ? "nse" : "nsw";
      placed(geos, steelDeck(x1 - x0, z1 - z0, 0, rails, [[sx - cx, sz1 - cz, sw / 2 + 0.05, 0, -1]]), cx, y, cz);
      const wall = side < 0 ? HALL.x0 + 1.4 : HALL.x1 - 1.4, edge = side < 0 ? x1 - 0.2 : x0 + 0.2;
      for (let z = z0 + 1.5; z < z1 - 1; z += 4) {
        if (underBoard(edge, z)) continue;
        geos.push(beam(wall, y - 2.6, z, edge, y - 0.6, z, 0.14, STEEL.frame), beam(wall, y - 0.5, z, edge, y - 0.5, z, 0.2, STEEL.frame));
        geos.push(box({ w: 0.08, h: 2.6, d: 0.36, color: STEEL.plate, offset: { x: wall + side * 0.04, y: y - 1.5, z } }));
      }
    });
    for (const [ax, ay, az, bx, by, bz, w] of L.catwalkStairs) geos.push(...steelStair(ax, ay, az, bx, by, bz, w, [true, false]));
    return merge(...geos);
  });

  // The polished runway, after the concept: a sheet over the runway the whole of its length, from inside the door
  // down through the launch tunnel to the shield, just above its paint (`y`), that the WebGL renderer turns into a
  // glossy reflector (`reflector`, `gloss`): the hall and the tunnel's neon mirrored softly in it, `strength` of it
  // looking straight down and more toward the grazing. Its plane clips the capture, so the runway and its paint never
  // block the reflection. In the xy plane facing +z; the scene lays it face up. Canvas 2D has no reflection and keeps
  // the runway as it is.
  const GLOSS = { y: 0.085, strength: 0.55 };
  const glossRunway = cached(() => {
    const r = LAYOUT.runway, w = r.halfW, h = (r.z0 - r.z1) / 2;
    return { verts: [-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false, reflector: true, gloss: GLOSS.strength,
      at: { x: 0, y: GLOSS.y, z: (r.z0 + r.z1) / 2 } };
  });

  // The side walls' lights, after the concept, all glow and no light of their own (`WALL_LIGHTS`): pairs of amber strip
  // lamps in recessed steel housings in every bay between the ribs, a row just under the catwalks over the boards and a
  // row low down under them; the same pairs along each catwalk's hall-side edge with a blue strip under them, shining
  // down; and an amber box lamp on each rib over the catwalks; a pair under a catwalk stands `aside` along from its bay's middle, clear of the catwalk's
  // brackets. `wall` the lamps on the walls and ribs and `edge` those on the catwalks, each its `flat` housings and its
  // `glow` lenses, which the scene dims with the hall's glass (and on Canvas 2D sorts the wall's with the wall).
  const WALL_LIGHTS = { rows: [6.9, 1.5], strip: 1.2, gap: 0.24, aside: 1.5, beam: 0.3, sconceY: 9.6, amber: "#ff9f43", blue: "#5fb8ff", housing: "#24282f", lip: "#3a3f48" };
  const wallLights = cached(() => {
    const L = LAYOUT, W = WALL_LIGHTS, S = L.shell, onWall = { flat: [], glow: [] }, onEdge = { flat: [], glow: [] };
    let into = onWall;
    const bays = [HALL.front - S.face, ...L.gantries, HALL.back + S.face], mids = [];
    for (let i = 0; i < bays.length - 1; i++) mids.push((bays[i] + bays[i + 1]) / 2);
    // A strip lamp on a wall at (x, y, z) facing `side` across the hall: a back plate, lips round it standing out of the
    // wall, and the lens set back between them.
    const strip = (x, y, z, side) => {
      const l = W.strip, at = (dx, w, h, d, color, emissive, out) => (emissive ? into.glow : into.flat).push(box({ w: d, h, d: w, color, emissive, offset: { x: x + side * out, y: y + dx, z } }));
      at(0, l + 0.1, 0.26, 0.04, W.housing, 0, 0.02);
      for (const s of [-1, 1]) at(s * 0.115, l + 0.1, 0.03, 0.1, W.lip, 0, 0.05);
      for (const s of [-1, 1]) into.flat.push(box({ w: 0.1, h: 0.26, d: 0.03, color: W.lip, offset: { x: x + side * 0.05, y, z: z + s * (l + 0.1) / 2 } }));
      at(0, l, 0.14, 0.03, W.amber, 1, 0.055);
    };
    for (const side of [-1, 1]) {
      const wall = side < 0 ? HALL.x0 + S.face : HALL.x1 - S.face, rib = wall - side * S.rib;
      // Under a catwalk a bay's pair stands to one side of its middle, between the catwalk's brackets on the wall.
      const [, , c0, c1] = L.catwalks[side < 0 ? 0 : 1];
      for (const mid of mids) {
        const z = mid > c0 && mid < c1 ? mid - W.aside : mid;
        for (const y of W.rows) for (const s of [-1, 1]) strip(wall, y, z + s * (W.strip + W.gap) / 2, -side);
      }
      // The box lamps on the ribs: a dark body and cap round an amber glass facing the hall.
      for (const z of L.gantries) {
        onWall.flat.push(bevelBox({ w: 0.18, h: 0.36, d: 0.28, color: W.housing, bevel: 0.02, offset: { x: rib - side * 0.09, y: W.sconceY, z } }));
        onWall.flat.push(box({ w: 0.22, h: 0.05, d: 0.32, color: W.lip, offset: { x: rib - side * 0.11, y: W.sconceY + 0.2, z } }));
        onWall.glow.push(box({ w: 0.03, h: 0.26, d: 0.2, color: W.amber, emissive: 1, offset: { x: rib - side * 0.19, y: W.sconceY, z } }));
      }
    }
    // Along each catwalk's hall-side edge beam (its deck's frame, `W.beam` deep under the walkway), between each pair of
    // brackets: a pair of amber strips on its face and a blue strip under it.
    into = onEdge;
    L.catwalks.forEach(([x0, x1, z0, z1], i) => {
      const side = i ? -1 : 1, face = i ? x0 : x1, under = L.catwalkY - 0.2 - W.beam;
      for (let z = z0 + 3.5; z < z1 - 1; z += 4) {
        for (const s of [-1, 1]) strip(face, under + W.beam / 2, z + s * (W.strip + W.gap) / 2, side);
        onEdge.flat.push(box({ w: 0.14, h: 0.05, d: 1.7, color: W.housing, offset: { x: face - side * 0.08, y: under - 0.025, z } }));
        onEdge.glow.push(box({ w: 0.09, h: 0.025, d: 1.6, color: W.blue, emissive: 1, offset: { x: face - side * 0.08, y: under - 0.06, z } }));
      }
    });
    const out = (g) => ({ flat: merge(...g.flat), glow: noShadow(merge(...g.glow)) });
    return { wall: out(onWall), edge: out(onEdge) };
  });

  // The control room on the catwalks' level, after its concept: set into the left wall's bay between the ribs at
  // `z0`..`z1`, through an opening in its panels from `y0` to `y1` (on the panels' rows, so the wall round it keeps its
  // seams), its front standing out from the wall to just off the left catwalk's wall-side edge (`front`), so the catwalk
  // and its rail run past it, and reaching back to just short of the hall's backing (`back`). Its front is two big panes
  // of glass in a heavy dark frame from `z0` to `glazed`, under a deep header with an orange-framed amber lightbox on it,
  // and past them a solid stretch with the door (an amber-lit window in it, a lever handle, a lamp over it) and a keypad
  // beside it. Inside, lit blue: strips along the ceiling running out to the glass, paneled walls, on the back wall a
  // chart and a radar stacked beside a big blueprint of the Jet marked READY (`pictures`, painted once), a server rack
  // with its lights, a filing cabinet with a plant on it and binders beside, and the console, the bolt on its front, its
  // monitors turned to the one of the crew who works it from behind it, facing out over the hall (`LAYOUT.crew`'s last),
  // an office chair behind. `flat` the room, `glow` its lit parts, which the scene dims with the hall's glass, `glass`
  // the panes, and `pictures` the screens' faces, each { geometry, x, y, z, turn }.
  const CONTROL = { z0: 6.6, z1: 13.4, glazed: 11.75, y0: 7.2, floor: 7.5, y1: 10.2, front: HALL.x0 + 2.95, back: HALL.x0 - 0.6,
    frame: "#232836", lip: "#363c4c", face: "#3a404d", inside: "#26324d", seam: "#1a2236", deep: "#1b2540", strip: "#c8ecff", pane: "#9fdcff",
    amber: "#ffb347", orange: "#e8761e", door: "#3a4152" };
  // A screen's picture, `w` by `h` metres facing +z, painted on `px` pixels a metre by `paint(g, W, H)`.
  const screenPicture = (w, h, px, paint) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * px); canvas.height = Math.round(h * px);
    const g = canvas.getContext("2d");
    paint(g, canvas.width, canvas.height);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], bright: 0.5 };
    return geo;
  };
  // The screens' faces: a dark field in a lit border, and on it a line chart over bars, a radar's sweep, or the Jet's
  // blueprint on its grid with its READY badge; fixed shapes, so every page paints the same.
  const SCREEN_INK = { field: "#0a1838", edge: "#3fa9ff", line: "#7fdcff", bar: "#2f8ae0", text: "#e8f4ff", grid: "#173a72", green: "#2ecc71" };
  const screenField = (g, W, H) => {
    const S = SCREEN_INK;
    g.fillStyle = S.field; g.fillRect(0, 0, W, H);
    g.strokeStyle = S.edge; g.lineWidth = Math.max(3, W / 90); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  };
  const paintChart = (g, W, H) => {
    const S = SCREEN_INK, ys = [0.62, 0.4, 0.55, 0.3, 0.48, 0.22, 0.42, 0.18, 0.36, 0.26, 0.5, 0.2];
    screenField(g, W, H);
    g.strokeStyle = S.line; g.lineWidth = W / 80; g.beginPath();
    ys.forEach((v, i) => { const x = W * (0.08 + i * 0.5 / (ys.length - 1)), y = H * (0.15 + v * 0.75); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    [0.35, 0.6, 0.45, 0.8, 0.55, 0.9].forEach((v, i) => { g.fillStyle = i % 2 ? S.line : S.bar; g.fillRect(W * (0.64 + i * 0.055), H * (0.88 - v * 0.7), W * 0.04, H * v * 0.7); });
  };
  const paintRadar = (g, W, H) => {
    const S = SCREEN_INK, cx = W * 0.3, cy = H * 0.5, r = H * 0.38;
    screenField(g, W, H);
    g.strokeStyle = S.edge; g.lineWidth = W / 120;
    for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    g.fillStyle = "rgba(127, 220, 255, 0.45)"; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, -1.2, -0.5); g.closePath(); g.fill();
    g.fillStyle = S.text;
    for (const [a, d] of [[-0.8, 0.6], [2.1, 0.45], [3.6, 0.75]]) { g.beginPath(); g.arc(cx + Math.cos(a) * r * d, cy + Math.sin(a) * r * d, W / 70, 0, Math.PI * 2); g.fill(); }
    [0.8, 0.55, 0.7, 0.4].forEach((v, i) => { g.fillStyle = i % 2 ? S.bar : S.line; g.fillRect(W * 0.62, H * (0.2 + i * 0.17), W * 0.3 * v, H * 0.09); });
  };
  const paintBlueprint = (g, W, H) => {
    const S = SCREEN_INK;
    screenField(g, W, H);
    g.strokeStyle = S.grid; g.lineWidth = 1;
    for (let x = W * 0.05; x < W; x += W / 24) { g.beginPath(); g.moveTo(x, H * 0.04); g.lineTo(x, H * 0.96); g.stroke(); }
    for (let y = H * 0.05; y < H; y += W / 24) { g.beginPath(); g.moveTo(W * 0.03, y); g.lineTo(W * 0.97, y); g.stroke(); }
    g.fillStyle = S.text; g.font = `bold ${Math.round(H * 0.12)}px sans-serif`; g.textBaseline = "top";
    g.fillText("LIGHTNING JET", W * 0.06, H * 0.08);
    // The Jet from above, nose to the right: its fuselage, swept wings, tailplanes and canopy, in outline.
    const P = (pts) => { g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo : g.moveTo).call(g, W * u, H * v)); g.closePath(); g.stroke(); };
    g.strokeStyle = "#bfe6ff"; g.lineWidth = W / 220;
    P([[0.16, 0.55], [0.6, 0.5], [0.72, 0.53], [0.6, 0.6], [0.16, 0.58]]);
    P([[0.36, 0.5], [0.5, 0.29], [0.55, 0.29], [0.48, 0.5]]);
    P([[0.36, 0.6], [0.5, 0.83], [0.55, 0.83], [0.48, 0.6]]);
    P([[0.18, 0.55], [0.24, 0.4], [0.27, 0.4], [0.25, 0.55]]);
    P([[0.18, 0.58], [0.24, 0.72], [0.27, 0.72], [0.25, 0.58]]);
    P([[0.56, 0.53], [0.65, 0.54], [0.56, 0.57]]);
    // The READY badge, and the status bars down the right.
    g.fillStyle = S.green; g.fillRect(W * 0.6, H * 0.76, W * 0.26, H * 0.14);
    g.fillStyle = "#ffffff"; g.font = `bold ${Math.round(H * 0.1)}px sans-serif`; g.textBaseline = "middle";
    g.fillText("✓ READY", W * 0.625, H * 0.83);
    [0.7, 0.45, 0.85, 0.6].forEach((v, i) => { g.fillStyle = i % 2 ? S.bar : S.line; g.fillRect(W * 0.8, H * (0.2 + i * 0.12), W * 0.15 * v, H * 0.06); });
  };
  const controlRoom = cached(() => {
    const C = CONTROL, flat = [], glow = [], glass = [], S = STEEL_DESK, top = C.y1, wall = HALL.x0 + LAYOUT.shell.face, f = C.front, b = C.back;
    const z0 = C.z0, z1 = C.glazed, zc = (z0 + z1) / 2, zw = z1 - z0, xc = (f + b) / 2, xw = f - b, room = top - C.floor;
    // The room: its floor, ceiling, back wall and sides, glowing a little as a lit room does, with seams down its back
    // wall and across its sides.
    flat.push(box({ w: xw, h: 0.3, d: zw, color: "#232a38", offset: { x: xc, y: C.floor - 0.15, z: zc } }));
    flat.push(box({ w: xw, h: 0.3, d: zw, color: C.deep, emissive: 0.25, offset: { x: xc, y: top + 0.15, z: zc } }));
    flat.push(box({ w: 0.2, h: room, d: zw, color: C.inside, emissive: 0.3, offset: { x: b - 0.1, y: (top + C.floor) / 2, z: zc } }));
    for (let z = z0 + 1.3; z < z1 - 0.5; z += 1.3) flat.push(box({ w: 0.01, h: room, d: 0.03, color: C.seam, offset: { x: b + 0.005, y: (top + C.floor) / 2, z } }));
    for (const z of [z0, z1]) {
      flat.push(box({ w: xw, h: top - C.y0 + 0.3, d: 0.2, color: C.inside, emissive: 0.3, offset: { x: xc, y: (top + C.y0 + 0.3) / 2, z } }));
      flat.push(box({ w: xw, h: 0.03, d: 0.01, color: C.seam, offset: { x: xc, y: C.floor + room * 0.55, z: z + (z === z0 ? 0.105 : -0.105) } }));
    }
    for (const [z, s] of [[C.z0, -1], [C.z1, 1]]) flat.push(box({ w: f - wall, h: top - C.y0 + 0.55, d: 0.06, color: C.frame, offset: { x: (f + wall) / 2, y: (top + C.y0 + 0.55) / 2, z: z + s * 0.13 } }));
    // The strips along the ceiling, running out to the glass.
    for (let k = 0; k < 4; k++) glow.push(box({ w: xw - 0.5, h: 0.04, d: 0.14, color: C.strip, emissive: 1, offset: { x: xc - 0.1, y: top - 0.02, z: z0 + 0.65 + k * (zw - 1.3) / 3 } }));
    // The screens' frames on the back wall; their faces are `pictures`.
    const pictures = [], screen = (w, h, y, z, paint, px) => {
      flat.push(box({ w: 0.08, h: h + 0.1, d: w + 0.1, color: C.frame, offset: { x: b + 0.04, y, z } }));
      pictures.push({ geometry: screenPicture(w, h, px, paint), x: b + 0.09, y, z, turn: Math.PI / 2 });
    };
    screen(0.95, 0.58, 9.4, z1 - 1.3, paintChart, 256);
    screen(0.95, 0.58, 8.7, z1 - 1.3, paintRadar, 256);
    screen(1.9, 1.1, 8.95, z0 + 1.15, paintBlueprint, 256);
    // The server rack in the back corner: a dark cabinet, its grille and a column of lights.
    const rz = z1 - 0.4;
    flat.push(bevelBox({ w: 0.6, h: 2.2, d: 0.6, color: "#2b3140", bevel: 0.02, offset: { x: b + 0.32, y: C.floor + 1.1, z: rz } }));
    for (let k = 0; k < 9; k++) flat.push(box({ w: 0.01, h: 0.03, d: 0.44, color: C.seam, offset: { x: b + 0.625, y: C.floor + 0.35 + k * 0.08, z: rz } }));
    for (let k = 0; k < 6; k++) glow.push(box({ w: 0.01, h: 0.04, d: 0.06, color: k % 3 === 1 ? "#ffb347" : k % 3 ? "#2ecc71" : "#7fdcff", emissive: 1, offset: { x: b + 0.625, y: C.floor + 1.3 + k * 0.12, z: rz - 0.12 + (k % 2) * 0.24 } }));
    // The filing cabinet by the glass with a plant on it, and the binders on a low cabinet beside it.
    const cz = z1 - 0.45, cx = f - 0.75;
    flat.push(bevelBox({ w: 0.5, h: 0.95, d: 0.5, color: "#7d8594", bevel: 0.015, offset: { x: cx, y: C.floor + 0.475, z: cz } }));
    for (let k = 0; k < 3; k++) flat.push(box({ w: 0.01, h: 0.025, d: 0.16, color: "#2a2f3a", offset: { x: cx + 0.255, y: C.floor + 0.3 + k * 0.28, z: cz } }));
    flat.push(box({ w: 0.24, h: 0.18, d: 0.24, color: "#e8e6df", offset: { x: cx, y: C.floor + 1.04, z: cz } }));
    for (const [dx, dy, dz, s] of [[0, 0.24, 0, 0.2], [0.08, 0.34, 0.06, 0.14], [-0.07, 0.36, -0.05, 0.13], [0.02, 0.44, -0.02, 0.12]]) flat.push(box({ w: s, h: s, d: s, color: dy > 0.4 ? "#5fbf3a" : "#3f9a2c", offset: { x: cx + dx, y: C.floor + 0.9 + dy, z: cz + dz } }));
    const bz = cz - 0.75;
    flat.push(bevelBox({ w: 0.45, h: 0.7, d: 0.6, color: "#5a6170", bevel: 0.015, offset: { x: cx, y: C.floor + 0.35, z: bz } }));
    for (let k = 0; k < 5; k++) flat.push(box({ w: 0.3, h: 0.32, d: 0.07, color: k % 2 ? "#e8eef6" : "#2a5ad0", offset: { x: cx, y: C.floor + 0.86, z: bz - 0.18 + k * 0.09 } }));
    // The console in front of the one who works it, its front to the glass with the bolt on it, a row of lit buttons
    // along its top, and two monitors turned to its operator; the chair behind.
    const kx = b + 1.55, kz = z0 + 2.7, kd = 2.2, kt = C.floor + 0.85;
    // Where things happen in the room, in the hangar's frame: the operator's post behind the console, facing out over
    // the hall; where a fire takes on the console's top, by its far end; the extinguisher's bracket on the side wall by
    // the back, the foot of the extinguisher standing in it, and the way the extinguisher faces there; where the
    // operator stands to take it, facing the wall; and
    // where he stands to put a fire out, facing it from its side, so he is seen side-on through the glass.
    const spots = {
      post: { x: HALL.x0 + 0.45, z: kz, heading: Math.PI / 2 },
      fire: { x: kx, y: kt + 0.07, z: kz - 0.8 },
      bracket: { x: b + 0.7, y: C.floor + 0.42, z: z0 + 0.2, turn: 0 },
      take: { x: b + 0.7, z: z0 + 0.75, heading: Math.PI },
      spray: { x: kx + 0.05, z: kz - 1.95 }
    };
    spots.spray.heading = Math.atan2(spots.fire.x - spots.spray.x, spots.fire.z - spots.spray.z);
    flat.push(bevelBox({ w: 0.6, h: 0.85, d: kd, color: "#4a5160", bevel: 0.02, offset: { x: kx, y: C.floor + 0.425, z: kz } }));
    flat.push(box({ w: 0.66, h: 0.05, d: kd + 0.06, color: "#2a2f3a", offset: { x: kx, y: kt + 0.025, z: kz } }));
    flat.push(moved(turnedY(FM.smoothBolt(0.32, 0.02, "#ffd23a", 0.4), Math.PI / 2), kx + 0.31, C.floor + 0.45, kz));
    const buttons = ["#7fdcff", "#ffb347", "#2ecc71", "#7fdcff", "#ff6b4a", "#ffffff", "#2ecc71", "#7fdcff", "#ffb347", "#7fdcff"];
    buttons.forEach((color, i) => glow.push(box({ w: 0.06, h: 0.025, d: 0.08, color, emissive: 1, offset: { x: kx + 0.22, y: kt + 0.06, z: kz - kd / 2 + 0.2 + i * (kd - 0.4) / (buttons.length - 1) } })));
    for (const dz of [-0.45, 0.45]) {
      flat.push(box({ w: 0.06, h: 0.42, d: 0.6, color: C.frame, offset: { x: kx - 0.05, y: kt + 0.3, z: kz + dz } }));
      glow.push(box({ w: 0.01, h: 0.34, d: 0.52, color: "#2f7fd8", emissive: 0.9, offset: { x: kx - 0.085, y: kt + 0.3, z: kz + dz } }));
      flat.push(box({ w: 0.12, h: 0.06, d: 0.2, color: C.frame, offset: { x: kx - 0.05, y: kt + 0.08, z: kz + dz } }));
    }
    const chx = b + 0.6;
    flat.push(box({ w: 0.08, h: 0.45, d: 0.08, color: "#1d1f24", offset: { x: chx, y: C.floor + 0.225, z: kz } }));
    flat.push(bevelBox({ w: 0.5, h: 0.08, d: 0.5, color: "#3a4152", bevel: 0.02, offset: { x: chx, y: C.floor + 0.48, z: kz } }));
    flat.push(bevelBox({ w: 0.08, h: 0.6, d: 0.46, color: "#3a4152", bevel: 0.02, offset: { x: chx - 0.24, y: C.floor + 0.82, z: kz } }));
    // The front: the sill, head, posts and mullion round two panes, the glass, and over it the header with the
    // lightbox on it; the floor's edge down to the wall.
    const mid = zc;
    flat.push(box({ w: 0.38, h: 0.32, d: zw + 0.24, color: C.frame, offset: { x: f - 0.1, y: C.floor + 0.06, z: zc } }));
    flat.push(box({ w: 0.38, h: 0.36, d: zw + 0.24, color: C.frame, offset: { x: f - 0.1, y: top - 0.08, z: zc } }));
    for (const [z, w] of [[z0, 0.26], [mid, 0.12], [z1, 0.26]]) flat.push(box({ w: 0.22, h: room, d: w, color: C.frame, offset: { x: f - 0.04, y: (top + C.floor) / 2, z } }));
    for (const [a, c] of [[z0, mid], [mid, z1]]) glass.push(box({ w: 0.03, h: room - 0.32, d: c - a - 0.18, color: C.pane, emissive: 0.15, offset: { x: f - 0.04, y: (top + C.floor) / 2 + 0.02, z: (a + c) / 2 } }));
    const hz = (C.z0 + C.z1) / 2, hw = C.z1 - C.z0 + 0.24;
    flat.push(box({ w: f - wall + 0.1, h: 0.75, d: hw, color: C.lip, offset: { x: (f + wall) / 2 + 0.05, y: top + 0.42, z: hz } }));
    flat.push(box({ w: f - wall + 0.2, h: 0.08, d: hw + 0.1, color: C.frame, offset: { x: (f + wall) / 2 + 0.1, y: top + 0.04, z: hz } }));
    flat.push(box({ w: 0.08, h: 0.46, d: 1.9, color: C.orange, emissive: 0.35, offset: { x: f + 0.18, y: top + 0.45, z: zc } }));
    glow.push(box({ w: 0.03, h: 0.32, d: 1.72, color: "#ffc77a", emissive: 1, offset: { x: f + 0.23, y: top + 0.45, z: zc } }));
    flat.push(box({ w: f - wall, h: 0.35, d: C.z1 - C.z0 + 0.2, color: C.frame, offset: { x: (f + wall) / 2, y: C.y0 + 0.025, z: hz } }));
    // Past the glass: the solid stretch with the door, its frame, its amber window, its handle and the lamp over it,
    // and the keypad beside it.
    const sz = (z1 + C.z1) / 2, sd = C.z1 - z1, dz = sz + 0.08, dh = 2.1;
    flat.push(box({ w: 0.2, h: room, d: sd, color: C.face, offset: { x: f - 0.04, y: (top + C.floor) / 2, z: sz } }));
    flat.push(box({ w: 0.04, h: dh + 0.1, d: 1.04, color: C.frame, offset: { x: f + 0.07, y: C.floor + (dh + 0.1) / 2, z: dz } }));
    flat.push(box({ w: 0.05, h: dh, d: 0.9, color: C.door, offset: { x: f + 0.1, y: C.floor + dh / 2, z: dz } }));
    flat.push(box({ w: 0.02, h: 0.52, d: 0.38, color: C.frame, offset: { x: f + 0.13, y: C.floor + 1.55, z: dz } }));
    glow.push(box({ w: 0.02, h: 0.44, d: 0.3, color: C.amber, emissive: 0.85, offset: { x: f + 0.14, y: C.floor + 1.55, z: dz } }));
    flat.push(box({ w: 0.05, h: 0.04, d: 0.16, color: "#c9d0d8", offset: { x: f + 0.16, y: C.floor + 1.0, z: dz - 0.3 } }));
    flat.push(box({ w: 0.12, h: 0.12, d: 0.36, color: "#24282f", offset: { x: f + 0.12, y: C.floor + dh + 0.22, z: dz } }));
    glow.push(box({ w: 0.02, h: 0.06, d: 0.3, color: C.amber, emissive: 1, offset: { x: f + 0.19, y: C.floor + dh + 0.22, z: dz } }));
    const kpz = z1 + 0.23, kpy = C.floor + 1.15;
    flat.push(box({ w: 0.04, h: 0.26, d: 0.16, color: "#1d2028", offset: { x: f + 0.08, y: kpy, z: kpz } }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) glow.push(box({ w: 0.01, h: 0.03, d: 0.03, color: r === 3 ? "#2ecc71" : "#7fdcff", emissive: 1, offset: { x: f + 0.105, y: kpy + 0.08 - r * 0.05, z: kpz - 0.04 + c * 0.04 } }));
    const windows = noShadow(merge(...glass));
    windows.glass = 0.16;
    // The extinguisher's bracket on the side wall by the back, its foot at `spots.bracket`.
    const X = spots.bracket;
    flat.push(box({ w: 0.2, h: 0.08, d: 0.06, color: C.frame, offset: { x: X.x, y: X.y + 0.05, z: X.z - 0.05 } }));
    flat.push(box({ w: 0.22, h: 0.03, d: 0.16, color: C.frame, offset: { x: X.x, y: X.y - 0.015, z: X.z + 0.02 } }));
    flat.push(box({ w: 0.04, h: 0.5, d: 0.03, color: C.frame, offset: { x: X.x, y: X.y + 0.25, z: X.z - 0.065 } }));
    return { flat: merge(...flat), glow: noShadow(merge(...glow)), glass: windows, pictures, spots };
  });

  // The crew's rooms on the right wall (`SIDE_ROOMS`), after the concept, each built as the control room is, in that
  // room's frame as if on the left wall with its middle at z 0, then turned round onto the right wall at its bay's
  // middle. Its front to the catwalk is glazed in three panes in a heavy dark frame but for the solid stretch at its
  // door's end with the door (its amber window, its handle, the lamp over it) and the keypad beside it, and an amber
  // strip lamp in a dark housing runs along the middle of its header (centred on it, so the Canvas 2D sort keeps it
  // over the header). Inside, lit blue: strips along the ceiling, the
  // control room's pictures on the back wall, laid out differently in each room (`SIDE_SCREENS`, each [picture, height,
  // along the wall from the room's middle in its frame]), a server rack in the far corner, a filing cabinet with a plant
  // by the glass, and the console its crew member works from behind, facing out over the hall, the chair behind.
  // Its extinguisher's bracket and the places a fire there plays out are the control room's too, at its far end
  // (`spots`, turned with the room). `sideRooms()` is the rooms in the hangar's frame, each `flat`, `glow` (which the scene dims with the
  // hall's glass), `glass`, `pictures` and `spots` as the control room's.
  const SIDE_SCREENS = [
    [["blueprint", 8.95, -1], ["chart", 9.4, 0.9], ["radar", 8.7, 0.9]],
    [["chart", 9.05, -2.2], ["blueprint", 8.95, -0.4], ["radar", 9.05, 1.4]],
    [["radar", 9.4, -2.4], ["chart", 8.7, -2.4], ["blueprint", 8.95, 0.2]]
  ];
  const sideScreens = cached(() => ({ chart: screenPicture(0.95, 0.58, 256, paintChart), radar: screenPicture(0.95, 0.58, 256, paintRadar), blueprint: screenPicture(1.9, 1.1, 256, paintBlueprint) }));
  const sideRooms = cached(() => SIDE_ROOMS.bays.map((middle, i) => {
    const C = CONTROL, R = SIDE_ROOMS, flat = [], glow = [], glass = [], pictures = [], top = C.y1, wall = HALL.x0 + LAYOUT.shell.face, f = C.front, b = C.back;
    const z0 = -R.half, z1 = R.half, g0 = z0 + R.door, xc = (f + b) / 2, xw = f - b, room = top - C.floor, ry = (top + C.floor) / 2;
    // The room: its floor, ceiling, back wall and ends, glowing a little as a lit room does, with seams down its back
    // wall, and the frames from the wall out to its front at its ends.
    flat.push(box({ w: xw, h: 0.3, d: z1 - z0, color: "#232a38", offset: { x: xc, y: C.floor - 0.15 } }));
    flat.push(box({ w: xw, h: 0.3, d: z1 - z0, color: C.deep, emissive: 0.25, offset: { x: xc, y: top + 0.15 } }));
    flat.push(box({ w: 0.2, h: room, d: z1 - z0, color: C.inside, emissive: 0.3, offset: { x: b - 0.1, y: ry } }));
    for (let z = z0 + 1.3; z < z1 - 0.5; z += 1.3) flat.push(box({ w: 0.01, h: room, d: 0.03, color: C.seam, offset: { x: b + 0.005, y: ry, z } }));
    for (const [z, s] of [[z0, -1], [z1, 1]]) {
      flat.push(box({ w: xw, h: top - C.y0 + 0.3, d: 0.2, color: C.inside, emissive: 0.3, offset: { x: xc, y: (top + C.y0 + 0.3) / 2, z } }));
      flat.push(box({ w: f - wall, h: top - C.y0 + 0.55, d: 0.06, color: C.frame, offset: { x: (f + wall) / 2, y: (top + C.y0 + 0.55) / 2, z: z + s * 0.13 } }));
    }
    for (let k = 0; k < 5; k++) glow.push(box({ w: xw - 0.5, h: 0.04, d: 0.14, color: C.strip, emissive: 1, offset: { x: xc - 0.1, y: top - 0.02, z: z0 + 0.65 + k * (z1 - z0 - 1.3) / 4 } }));
    // The screens on the back wall, their frames here and their faces `pictures`.
    const screens = sideScreens();
    for (const [name, y, z] of SIDE_SCREENS[i]) {
      const big = name === "blueprint", w = big ? 1.9 : 0.95, h = big ? 1.1 : 0.58;
      flat.push(box({ w: 0.08, h: h + 0.1, d: w + 0.1, color: C.frame, offset: { x: b + 0.04, y, z } }));
      pictures.push({ geometry: screens[name], x: b + 0.09, y, z, turn: Math.PI / 2 });
    }
    // The server rack in the far corner, its grille and lights, and the filing cabinet by the glass with a plant on it.
    const rz = z1 - 0.4;
    flat.push(bevelBox({ w: 0.6, h: 2.2, d: 0.6, color: "#2b3140", bevel: 0.02, offset: { x: b + 0.32, y: C.floor + 1.1, z: rz } }));
    for (let k = 0; k < 9; k++) flat.push(box({ w: 0.01, h: 0.03, d: 0.44, color: C.seam, offset: { x: b + 0.625, y: C.floor + 0.35 + k * 0.08, z: rz } }));
    for (let k = 0; k < 6; k++) glow.push(box({ w: 0.01, h: 0.04, d: 0.06, color: k % 3 === 1 ? "#ffb347" : k % 3 ? "#2ecc71" : "#7fdcff", emissive: 1, offset: { x: b + 0.625, y: C.floor + 1.3 + k * 0.12, z: rz - 0.12 + (k % 2) * 0.24 } }));
    const cx = f - 0.75, cz = z1 - 0.45;
    flat.push(bevelBox({ w: 0.5, h: 0.95, d: 0.5, color: "#7d8594", bevel: 0.015, offset: { x: cx, y: C.floor + 0.475, z: cz } }));
    for (let k = 0; k < 3; k++) flat.push(box({ w: 0.01, h: 0.025, d: 0.16, color: "#2a2f3a", offset: { x: cx + 0.255, y: C.floor + 0.3 + k * 0.28, z: cz } }));
    flat.push(box({ w: 0.24, h: 0.18, d: 0.24, color: "#e8e6df", offset: { x: cx, y: C.floor + 1.04, z: cz } }));
    for (const [dx, dy, dz, s] of [[0, 0.24, 0, 0.2], [0.08, 0.34, 0.06, 0.14], [-0.07, 0.36, -0.05, 0.13], [0.02, 0.44, -0.02, 0.12]]) flat.push(box({ w: s, h: s, d: s, color: dy > 0.4 ? "#5fbf3a" : "#3f9a2c", offset: { x: cx + dx, y: C.floor + 0.9 + dy, z: cz + dz } }));
    // The console, a row of lit buttons along its top and two monitors turned to its crew member behind it; the chair.
    const kx = b + 1.55, kz = R.consoles[i], kd = 2.2, kt = C.floor + 0.85;
    flat.push(bevelBox({ w: 0.6, h: 0.85, d: kd, color: "#4a5160", bevel: 0.02, offset: { x: kx, y: C.floor + 0.425, z: kz } }));
    flat.push(box({ w: 0.66, h: 0.05, d: kd + 0.06, color: "#2a2f3a", offset: { x: kx, y: kt + 0.025, z: kz } }));
    const buttons = ["#7fdcff", "#ffb347", "#2ecc71", "#7fdcff", "#ff6b4a", "#ffffff", "#2ecc71", "#7fdcff", "#ffb347", "#7fdcff"];
    buttons.forEach((color, k) => glow.push(box({ w: 0.06, h: 0.025, d: 0.08, color, emissive: 1, offset: { x: kx + 0.22, y: kt + 0.06, z: kz - kd / 2 + 0.2 + k * (kd - 0.4) / (buttons.length - 1) } })));
    for (const dz of [-0.45, 0.45]) {
      flat.push(box({ w: 0.06, h: 0.42, d: 0.6, color: C.frame, offset: { x: kx - 0.05, y: kt + 0.3, z: kz + dz } }));
      glow.push(box({ w: 0.01, h: 0.34, d: 0.52, color: "#2f7fd8", emissive: 0.9, offset: { x: kx - 0.085, y: kt + 0.3, z: kz + dz } }));
      flat.push(box({ w: 0.12, h: 0.06, d: 0.2, color: C.frame, offset: { x: kx - 0.05, y: kt + 0.08, z: kz + dz } }));
    }
    const chx = b + 0.6;
    flat.push(box({ w: 0.08, h: 0.45, d: 0.08, color: "#1d1f24", offset: { x: chx, y: C.floor + 0.225, z: kz } }));
    flat.push(bevelBox({ w: 0.5, h: 0.08, d: 0.5, color: "#3a4152", bevel: 0.02, offset: { x: chx, y: C.floor + 0.48, z: kz } }));
    flat.push(bevelBox({ w: 0.08, h: 0.6, d: 0.46, color: "#3a4152", bevel: 0.02, offset: { x: chx - 0.24, y: C.floor + 0.82, z: kz } }));
    // Where a fire plays out, as in the control room but toward the far end, behind the glass rather than the door's
    // stretch: the fire at the console's far end, sprayed from beyond it, and the extinguisher's bracket on the far end
    // wall between the rack and the filing cabinet, where he takes it facing the wall.
    const spots = {
      post: { x: HALL.x0 + 0.45, z: kz, heading: Math.PI / 2 },
      fire: { x: kx, y: kt + 0.07, z: kz + 0.8 },
      bracket: { x: b + 1.3, y: C.floor + 0.42, z: z1 - 0.2, turn: Math.PI },
      take: { x: b + 1.3, z: z1 - 0.75, heading: 0 },
      spray: { x: kx + 0.05, z: kz + 1.95 }
    };
    spots.spray.heading = Math.atan2(spots.fire.x - spots.spray.x, spots.fire.z - spots.spray.z);
    const X = spots.bracket;
    flat.push(box({ w: 0.2, h: 0.08, d: 0.06, color: C.frame, offset: { x: X.x, y: X.y + 0.05, z: X.z + 0.05 } }));
    flat.push(box({ w: 0.22, h: 0.03, d: 0.16, color: C.frame, offset: { x: X.x, y: X.y - 0.015, z: X.z - 0.02 } }));
    flat.push(box({ w: 0.04, h: 0.5, d: 0.03, color: C.frame, offset: { x: X.x, y: X.y + 0.25, z: X.z + 0.065 } }));
    // The front: the sill and head along it, the posts at its ends and the mullions between three panes, the glass;
    // the header over it with its strip lamp; and the floor's edge down to the wall.
    const pane = (z1 - g0) / 3;
    flat.push(box({ w: 0.38, h: 0.32, d: z1 - z0 + 0.24, color: C.frame, offset: { x: f - 0.1, y: C.floor + 0.06 } }));
    flat.push(box({ w: 0.38, h: 0.36, d: z1 - z0 + 0.24, color: C.frame, offset: { x: f - 0.1, y: top - 0.08 } }));
    for (const [z, w] of [[z0, 0.26], [g0, 0.2], [g0 + pane, 0.12], [g0 + 2 * pane, 0.12], [z1, 0.26]]) flat.push(box({ w: 0.22, h: room, d: w, color: C.frame, offset: { x: f - 0.04, y: ry, z } }));
    for (let k = 0; k < 3; k++) glass.push(box({ w: 0.03, h: room - 0.32, d: pane - 0.16, color: C.pane, emissive: 0.15, offset: { x: f - 0.04, y: ry + 0.02, z: g0 + (k + 0.5) * pane } }));
    flat.push(box({ w: f - wall + 0.1, h: 0.75, d: z1 - z0 + 0.24, color: C.lip, offset: { x: (f + wall) / 2 + 0.05, y: top + 0.42 } }));
    flat.push(box({ w: f - wall + 0.2, h: 0.08, d: z1 - z0 + 0.34, color: C.frame, offset: { x: (f + wall) / 2 + 0.1, y: top + 0.04 } }));
    const lz = 0, ll = z1 - g0 - 1.2;
    flat.push(box({ w: 0.1, h: 0.22, d: ll + 0.12, color: "#24282f", offset: { x: f + 0.17, y: top + 0.45, z: lz } }));
    glow.push(box({ w: 0.03, h: 0.12, d: ll, color: C.amber, emissive: 1, offset: { x: f + 0.23, y: top + 0.45, z: lz } }));
    flat.push(box({ w: f - wall, h: 0.35, d: z1 - z0 + 0.2, color: C.frame, offset: { x: (f + wall) / 2, y: C.y0 + 0.025 } }));
    // The solid stretch at the door's end, in three lengths either side of the door and behind it, so the Canvas 2D sort
    // keeps the keypad over it: the door in its frame, its amber window, its handle and the lamp over it, and the keypad
    // beside it, toward the glass.
    const sz = (z0 + g0) / 2, dz = sz - 0.05, dh = 2.1;
    for (const [a, c] of [[z0, dz - 0.52], [dz - 0.52, dz + 0.52], [dz + 0.52, g0]]) flat.push(box({ w: 0.2, h: room, d: c - a, color: C.face, offset: { x: f - 0.04, y: ry, z: (a + c) / 2 } }));
    flat.push(box({ w: 0.04, h: dh + 0.1, d: 1.04, color: C.frame, offset: { x: f + 0.07, y: C.floor + (dh + 0.1) / 2, z: dz } }));
    flat.push(box({ w: 0.05, h: dh, d: 0.9, color: C.door, offset: { x: f + 0.1, y: C.floor + dh / 2, z: dz } }));
    flat.push(box({ w: 0.02, h: 0.52, d: 0.38, color: C.frame, offset: { x: f + 0.13, y: C.floor + 1.55, z: dz } }));
    glow.push(box({ w: 0.02, h: 0.44, d: 0.3, color: C.amber, emissive: 0.85, offset: { x: f + 0.14, y: C.floor + 1.55, z: dz } }));
    flat.push(box({ w: 0.05, h: 0.04, d: 0.16, color: "#c9d0d8", offset: { x: f + 0.16, y: C.floor + 1.0, z: dz + 0.3 } }));
    flat.push(box({ w: 0.12, h: 0.12, d: 0.36, color: "#24282f", offset: { x: f + 0.12, y: C.floor + dh + 0.22, z: dz } }));
    glow.push(box({ w: 0.02, h: 0.06, d: 0.3, color: C.amber, emissive: 1, offset: { x: f + 0.19, y: C.floor + dh + 0.22, z: dz } }));
    const kpz = g0 - 0.2, kpy = C.floor + 1.15;
    flat.push(box({ w: 0.04, h: 0.26, d: 0.16, color: "#1d2028", offset: { x: f + 0.08, y: kpy, z: kpz } }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) glow.push(box({ w: 0.01, h: 0.03, d: 0.03, color: r === 3 ? "#2ecc71" : "#7fdcff", emissive: 1, offset: { x: f + 0.105, y: kpy + 0.08 - r * 0.05, z: kpz - 0.04 + c * 0.04 } }));
    // Turned round onto the right wall at the bay's middle.
    const onto = (g) => moved(turnedY(g, Math.PI), HALL.x0 + HALL.x1, 0, middle);
    const windows = noShadow(onto(merge(...glass)));
    windows.glass = 0.16;
    for (const p of [...pictures, ...Object.values(spots)]) {
      p.x = HALL.x0 + HALL.x1 - p.x; p.z = middle - p.z;
      for (const key of ["turn", "heading"]) if (p[key] !== undefined) p[key] += Math.PI;
    }
    return { flat: onto(merge(...flat)), glow: noShadow(onto(merge(...glow))), glass: windows, pictures, spots };
  }));
  // The small lit windows of the crew's lofts high on the right wall over the rooms (`SIDE_ROOMS.lofts`), after the
  // concept: each a deep dark frame standing out of the panels round a lit blue space, with a small amber lamp over it
  // (`flat` and `glow`, where they hang). In each a monitor and one of the crew in a hard hat, which the scene moves and
  // lights: the lit back, dark but for its own glow, so it goes dark when its light goes out, and the
  // monitor's screen in its colours (`screens`), each built about its own middle; and, one of each a window, its glass
  // where it hangs, which dims with its light, and the crew member's shoulders and head (`body`, from its feet, reaching
  // down into the frame's sill, and `head`, from the neck `neck` up, its hard hat's brim to its front, +z), clipped to
  // the window across and up (`clipSlab`, `clipSlab2`, which the Canvas 2D renderer honours too, so its sort never
  // paints a figure over the frame), so whoever walks out past its frame is gone. `windows` says where in each window
  // its back, its screen and its crew member stand (the screen `screen` along from the window's middle), and `still` is
  // the backs and screens where they stand, for the Factory's view through the door.
  const LOFT = { y: 12, w: 2.6, h: 1.3, deep: 0.42, neck: 0.24, screen: -0.65, crew: "#151b2b", screens: ["#2f7fd8", "#2fc7b8", "#7fb0ff"] };
  const loftWindows = cached(() => {
    const W = LOFT, flat = [], glow = [], still = [], wall = HALL.x1 - LAYOUT.shell.face, out = wall - W.deep, xm = (wall + out) / 2;
    const back = () => noShadow(box({ w: 0.02, h: W.h, d: W.w, color: CONTROL.deep, emissive: 0.85 }));
    const screen = (color) => noShadow(box({ w: 0.03, h: 0.3, d: 0.6, color, emissive: 0.9 }));
    const windows = SIDE_ROOMS.lofts.map((z) => {
      const y0 = W.y - W.h / 2, y1 = W.y + W.h / 2, at = { back: { x: wall - 0.01, y: W.y, z }, screen: { x: wall - 0.035, y: y0 + 0.45, z: z + W.screen }, crew: { x: wall - 0.11, y: y0, z } };
      for (const s of [-1, 1]) {
        flat.push(box({ w: W.deep, h: 0.16, d: W.w + 0.32, color: CONTROL.frame, offset: { x: xm, y: W.y + s * (W.h / 2 + 0.08), z } }));
        flat.push(box({ w: W.deep, h: W.h, d: 0.16, color: CONTROL.frame, offset: { x: xm, y: W.y, z: z + s * (W.w / 2 + 0.08) } }));
      }
      flat.push(box({ w: 0.1, h: W.h, d: 0.08, color: CONTROL.frame, offset: { x: out + 0.05, y: W.y, z } }));
      const glass = noShadow(box({ w: 0.03, h: W.h, d: W.w, color: CONTROL.pane, emissive: 0.15, offset: { x: out + 0.06, y: W.y, z } }));
      glass.glass = 0.16;
      flat.push(box({ w: 0.1, h: 0.1, d: 0.5, color: "#24282f", offset: { x: out + 0.03, y: y1 + 0.3, z } }));
      glow.push(box({ w: 0.03, h: 0.05, d: 0.42, color: CONTROL.amber, emissive: 1, offset: { x: out - 0.02, y: y1 + 0.3, z } }));
      still.push(moved(back(), at.back.x, at.back.y, z), moved(screen(W.screens[0]), at.screen.x, at.screen.y, at.screen.z));
      const clipSlab = [0, 0, 2 / W.w, -2 * z / W.w];
      const body = noShadow(box({ w: 0.48, h: 0.4, d: 0.1, color: W.crew, offset: { y: 0.04 } }));
      const head = noShadow(merge(box({ w: 0.2, h: 0.2, d: 0.2, color: W.crew, offset: { y: 0.1 } }), box({ w: 0.26, h: 0.08, d: 0.26, color: PAINT, offset: { y: 0.23 } }),
        box({ w: 0.14, h: 0.03, d: 0.1, color: PAINT, offset: { y: 0.2, z: 0.17 } })));
      body.clipSlab = head.clipSlab = clipSlab;
      body.clipSlab2 = head.clipSlab2 = [0, 2 / W.h, 0, -2 * W.y / W.h];
      return { ...at, glass, body, head };
    });
    return { flat: merge(...flat), glow: noShadow(merge(...glow)), back: back(), screens: W.screens.map(screen), windows, still: merge(...still) };
  });

  // The control room's fire extinguisher, in its own frame, its foot at (0, 0, 0) and its front (the hose's nozzle)
  // toward +z: a red cylinder with a domed top, a white band, the black valve with its lever and carrying handle and its
  // gauge, and the black hose down its side to the nozzle, held out in front.
  // Where its nozzle's mouth is, in its frame, for the spray.
  const NOZZLE = { x: 0.09, y: 0.29, z: 0.28 };
  const extinguisher = cached(() => {
    const parts = [], red = "#d4231b", black = "#1d1f24";
    parts.push(lathe({ profile: [[0, 0], [0.075, 0], [0.08, 0.02], [0.08, 0.36], [0.07, 0.4], [0.04, 0.43], [0, 0.44]], segments: 14, color: red }));
    parts.push(lathe({ profile: [[0.081, 0.24], [0.081, 0.3], [0.08, 0.3], [0.08, 0.24]], segments: 14, color: "#f2f0e8" }));
    parts.push(box({ w: 0.05, h: 0.06, d: 0.05, color: black, offset: { y: 0.47 } }));
    parts.push(box({ w: 0.03, h: 0.02, d: 0.16, color: black, offset: { y: 0.51, z: -0.05 } }));
    parts.push(box({ w: 0.03, h: 0.02, d: 0.14, color: "#3a3d44", offset: { y: 0.545, z: -0.04 } }));
    parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.022, 0], [0.022, 0.012], [0, 0.012]], segments: 10, color: "#e8e8e0" }), Math.PI / 2), 0.03, 0.46, 0.02));
    parts.push(tube({ path: (u) => ({ x: 0.06 + 0.03 * Math.sin(u * Math.PI), y: 0.47 - 0.3 * u + 0.12 * u * u, z: 0.03 + 0.17 * u }), radius: () => 0.012, rings: 10, segments: 6, colorFn: () => black }));
    parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.016, 0], [0.026, 0.08], [0, 0.08]], segments: 8, color: black }), Math.PI / 2), 0.09, 0.29, 0.2));
    return merge(...parts);
  });

  // ---- the ceiling crane --------------------------------------------------------------------------------------

  // The overhead cranes, after their concept: each a yellow box-girder bridge across the hall on two end trucks that
  // run on the runways along the side walls (`x`, their rails' tops at `railY`, the length of the hall between end
  // stops at `runway`'s ends). The working crane, LJ-02, travels its bridge's middle `travel` along the hall, clear of
  // the projector's cradle and the film screen hanging from the roof; its sister, LJ-01, stands parked at the far end
  // (`far`). The girder's top is the walkway, railed along its back; amber lamps light its underside and front, a twin
  // lamp box stands on each end, and the festoon carrying the trolley's power hangs in loops near its left end. The
  // trolley (`trolley`, the range of its middle across the hall, the hook kept off the catwalks) rides the girder's
  // front half: a navy hoist house with the bolt on both faces, the railing passing behind it, and a yellow carriage
  // down the girder's face and under it with its number on a plate, the hoist's drum under that and the ropes from it,
  // `ropeTop` under the trolley's frame, down to the hook block, at least `rope` long. From the hook hangs a navy crate
  // with yellow edges on a four-leg sling (`load`, `sling` from the hook's eye to the crate's top, `crate` its size).
  // Between jobs the crate sits on one of two laydown stands (`stands`, [x, z], their decks `standTop` up), each in a
  // painted keep-out square, its sling lying slack on its top; LJ-02 carries it between them with its bottom `carry` up,
  // throwing its blue safety spot, `spot` metres round, on the floor under the hook (`craneSpot`).
  // Where LJ-02 parks between jobs (`park`): at the runways' door end, the trolley over the right of the hall behind the
  // Jet's tail, its hook up. `cx` is the middle between the runways, where a bridge's frame stands. Its yellow and navy
  // glow a little (`lift`), as the concept's catch the hall's light, and dim with the hall's glass.
  const CRANE = {
    railY: 14.2, x: [HALL.x0 + 2.65, HALL.x1 - 2.65], runway: [-32.4, 28.4], travel: [-16, 11.2], trolley: [-15, 20.5],
    ropeTop: -0.3, rope: 0.6, eye: -1.0, sling: 1.15, crate: [1.3, 1.2, 1.3], park: { z: 11.2, x: 17.5 }, far: { z: -30.2, x: -4 }, lift: 0.16,
    stands: [[17.5, 11.2], [-7.5, -1]], standTop: 0.3, carry: 5, spot: 1.5,
    yellow: "#f2b630", yellowDk: "#c88a1c", rivet: "#9a6a12", navy: "#1e2c66", navyDk: "#131c45", dark: "#2b3038", rail: "#8a929c",
    amber: "#ffb347", plate: "#ffd04a"
  };
  CRANE.cx = (CRANE.x[0] + CRANE.x[1]) / 2;
  // The cranes' meshes: their runways (`runways`, in the hangar's frame), and the rest each in its own frame for the
  // scene to move: a bridge (`bridge`, its lamps `glow`), its frame's zero on the runways' rail line midway between them,
  // x along the bridge; a trolley (`trolley`, LJ-01's `farTrolley`: its `body` and the small parts on its faces,
  // `trim`, their bolts and lamps `trolleyGlow`), its zero under its middle at that same height; the hoist's four falls
  // a metre long, hanging from y 0 (`rope`, the scene stretches them to length); the hook block hanging from its top
  // (`hook`); and the crate, its sling's eye at its zero (`load`), with its sling taut (`sling`, its legs from the eye
  // down to the crate's top, which the scene shortens as the hook comes down to the crate) or slack (`slack`); and where
  // the warning beacons stand on the twin lamp boxes' bases, in the bridge's frame (`beacons`, the forklift's dome).
  const crane = cached(() => {
    const C = CRANE, H = (C.x[1] - C.x[0]) / 2, bridge = [], glow = [], trolleyGlow = [], hook = [], load = [], beacons = [];
    // The runways along the side walls: an I-beam with its rail on top, sitting on the columns' knees (`knee`), with an
    // end stop at each end; and down the left one the conductor bar.
    const runways = [], [r0, r1] = C.runway, len = r1 - r0, rz = (r0 + r1) / 2, ry = C.railY;
    for (const [x, s] of [[C.x[0], -1], [C.x[1], 1]]) {
      runways.push(box({ w: 0.36, h: 0.05, d: len, color: C.dark, offset: { x, y: ry - 0.105, z: rz } }));
      runways.push(box({ w: 0.06, h: 0.52, d: len, color: C.dark, offset: { x, y: ry - 0.39, z: rz } }));
      runways.push(box({ w: 0.36, h: 0.05, d: len, color: C.dark, offset: { x, y: ry - 0.675, z: rz } }));
      runways.push(box({ w: 0.07, h: 0.08, d: len, color: C.rail, offset: { x, y: ry - 0.04, z: rz } }));
      for (const [z, k] of [[r0 + 0.15, 1], [r1 - 0.15, -1]]) {
        runways.push(box({ w: 0.4, h: 0.5, d: 0.25, color: C.yellow, offset: { x, y: ry + 0.25, z } }));
        runways.push(box({ w: 0.3, h: 0.3, d: 0.12, color: INK, offset: { x, y: ry + 0.25, z: z + k * 0.18 } }));
      }
    }
    runways.push(box({ w: 0.05, h: 0.1, d: len, color: "#b8332a", offset: { x: C.x[0] + 0.07, y: ry - 0.45, z: rz } }));
    // Black and yellow stripes on a face square to z, from x0 to x1 and y0 to y1, at z, as parallelograms on the yellow.
    const stripes = (out, x0, x1, y0, y1, z, width, lean) => {
      for (let x = x0; x + width + lean <= x1 + 1e-6; x += width * 2) out.push(moved(prism([[x, y0], [x + width, y0], [x + width + lean, y1], [x + lean, y1]], 0.02, INK), 0, 0, z));
    };
    // The end trucks on the rails: a dark frame, its wheels' lower halves showing, yellow ends with black buffers and a
    // striped plate on each end.
    for (const s of [-1, 1]) {
      const x = s * H;
      bridge.push(box({ w: 0.7, h: 0.5, d: 3.2, color: C.dark, offset: { x, y: 0.32 } }));
      for (const k of [-1, 1]) {
        bridge.push(box({ w: 0.74, h: 0.54, d: 0.12, color: C.yellow, offset: { x, y: 0.32, z: k * 1.56 } }));
        bridge.push(box({ w: 0.34, h: 0.22, d: 0.14, color: INK, offset: { x, y: 0.42, z: k * 1.69 } }));
        bridge.push(moved(turnedZ(lathe({ profile: [[0, -0.08], [0.24, -0.08], [0.24, 0.08], [0, 0.08]], segments: 12, color: "#1d2126" }), Math.PI / 2), x, 0.24, k * 1.1));
      }
      stripes(bridge, x - 0.3, x + 0.3, 0.12, 0.26, 1.63, 0.07, 0.07);
    }
    // The girder: a box with a lip of plate under it and on top, its face in panels with rivets along the top and the
    // bottom, the trolley's rails along its top's front half and the walkway's grating on the back half.
    // It is laid in panels between its stiffeners, and so is everything along it, so the Canvas 2D sort never lets one
    // long face paint over what is on it.
    const W = 2 * H + 0.7, panels = Math.ceil(W / 2.4), pw = W / panels, lift = C.lift;
    for (let i = 0; i < panels; i++) {
      const x = -W / 2 + (i + 0.5) * pw;
      bridge.push(box({ w: pw, h: 0.15, d: 2.0, color: C.yellowDk, emissive: lift, offset: { x, y: 0.675 } }));
      bridge.push(box({ w: pw, h: 1.0, d: 1.8, color: C.yellow, emissive: lift, offset: { x, y: 1.25 } }));
      bridge.push(box({ w: pw, h: 0.05, d: 1.86, color: C.yellowDk, emissive: lift, offset: { x, y: 1.775 } }));
    }
    for (const z of [-0.915, 0.915]) {
      for (let i = 0; i < panels; i++) bridge.push(box({ w: pw, h: 0.035, d: 0.02, color: C.yellowDk, offset: { x: -W / 2 + (i + 0.5) * pw, y: 1.43, z } }));
      for (let i = 1; i < panels; i++) bridge.push(box({ w: 0.06, h: 0.96, d: 0.03, color: C.yellowDk, offset: { x: -W / 2 + i * pw, y: 1.25, z } }));
    }
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) for (const y of [1.62, 0.86]) bridge.push(box({ w: 0.06, h: 0.06, d: 0.03, color: C.rivet, offset: { x, y, z: 0.92 } }));
    for (let i = 0; i < panels; i++) {
      const x = -W / 2 + (i + 0.5) * pw;
      for (const z of [0.15, 0.75]) bridge.push(box({ w: pw, h: 0.06, d: 0.07, color: C.dark, offset: { x, y: 1.83, z } }));
      bridge.push(box({ w: pw, h: 0.02, d: 0.9, color: "#3a4049", offset: { x, y: 1.81, z: -0.43 } }));
    }
    // The railing along the walkway's back edge, and across both ends.
    const posts = Math.round(W / 1.2);
    for (let i = 0; i <= posts; i++) bridge.push(box({ w: 0.06, h: 0.9, d: 0.06, color: C.yellow, offset: { x: -W / 2 + 0.05 + (W - 0.1) * i / posts, y: 2.25, z: -0.85 } }));
    for (const [y, h] of [[2.68, 0.06], [2.22, 0.05], [1.88, 0.1]]) {
      for (let i = 0; i < panels; i++) bridge.push(box({ w: pw, h, d: 0.06, color: C.yellow, offset: { x: -W / 2 + (i + 0.5) * pw, y, z: -0.85 } }));
      for (const s of [-1, 1]) bridge.push(box({ w: 0.06, h, d: 0.9, color: C.yellow, offset: { x: s * (W / 2 - 0.05), y, z: -0.4 } }));
    }
    for (const s of [-1, 1]) bridge.push(box({ w: 0.06, h: 0.9, d: 0.06, color: C.yellow, offset: { x: s * (W / 2 - 0.05), y: 2.25, z: 0.05 } }));
    // Hazard stripes along the face's lower band right of the middle, and a navy badge on the face near each end.
    stripes(bridge, 1.6, 5.4, 0.8, 1.38, 0.925, 0.26, 0.42);
    for (const s of [-1, 1]) {
      bridge.push(box({ w: 0.55, h: 0.55, d: 0.04, color: C.navy, offset: { x: s * (H - 1.4), y: 1.2, z: 0.92 } }));
      bridge.push(moved(FM.smoothBolt(0.36, 0.03, "#ffd23a", 0), s * (H - 1.4), 1.2, 0.95));
    }
    // The lamps: panels under the lip, each lens showing along its front edge too, and a twin lamp box on each end.
    for (let i = 0; i < 8; i++) {
      const x = -H + 2 + i * (2 * H - 4) / 7;
      bridge.push(box({ w: 1.1, h: 0.08, d: 0.7, color: C.dark, offset: { x, y: 0.56, z: 0.5 } }));
      glow.push(box({ w: 0.96, h: 0.03, d: 0.56, color: C.amber, emissive: 1, offset: { x, y: 0.51, z: 0.5 } }));
      glow.push(box({ w: 0.9, h: 0.09, d: 0.02, color: C.amber, emissive: 1, offset: { x, y: 0.675, z: 1.005 } }));
    }
    for (const s of [-1, 1]) {
      const x = s * (H - 0.4);
      bridge.push(box({ w: 1.0, h: 0.5, d: 0.6, color: C.yellowDk, offset: { x, y: 2.06, z: 0.35 } }));
      for (const dx of [-0.23, 0.23]) for (const k of [-1, 1]) {
        bridge.push(box({ w: 0.4, h: 0.36, d: 0.03, color: C.dark, offset: { x: x + dx, y: 2.06, z: 0.35 + k * 0.31 } }));
        glow.push(box({ w: 0.32, h: 0.28, d: 0.02, color: C.amber, emissive: 1, offset: { x: x + dx, y: 2.06, z: 0.35 + k * 0.325 } }));
      }
      bridge.push(moved(lathe({ profile: [[0, 0], [0.2, 0], [0.2, 0.04], [0.16, 0.07], [0, 0.07]], segments: 14, color: C.dark }), x, 2.31, 0.35));
      beacons.push({ x, y: 2.38, z: 0.35 });
    }
    // The festoon: a track under the lip's back edge and two cables hanging from it in loops near the left end.
    bridge.push(box({ w: 7, h: 0.08, d: 0.1, color: C.dark, offset: { x: -H + 4, y: 0.56, z: -0.75 } }));
    for (const [x0, x1, sag, z] of [[-H + 0.8, -H + 3.2, 1.3, -0.7], [-H + 3.2, -H + 5.4, 1.05, -0.8], [-H + 0.9, -H + 3.4, 1.15, -0.8]]) {
      bridge.push(tube({ path: (t) => ({ x: x0 + (x1 - x0) * t, y: 0.5 - sag * Math.sin(Math.PI * t), z }), radius: () => 0.04, rings: 14, segments: 6, colorFn: () => "#15171b" }));
      for (const x of [x0, x1]) bridge.push(box({ w: 0.16, h: 0.12, d: 0.14, color: C.dark, offset: { x, y: 0.48, z } }));
    }
    // The trolley: saddles on the rails, the navy hoist house framed at its edges with a bolt at each corner of its face
    // and the bolt on both faces, a darker lid; the yellow carriage down the girder's face with the number's plate, and
    // under the girder, the drum under it the ropes come off, and two small amber lamps on the carriage's ends.
    // The trolley, after its concept's close-up: the navy hoist house straddling the girder's top, its front square with a
    // raised rim round it and a screw in each corner, the same on its back, slots down its sides; the yellow ledge under
    // its front with the number's plate and a pin either side of it; the carriage under the girder with the drum the
    // ropes come off and its cheeks; and the bolt on the house's front and back and two small amber lamps on the
    // carriage's ends (`trolleyGlow`). The house's top stays under the roof's ribs wherever the bridge runs.
    const T = { w: 1.8, y0: 1.2, y1: 2.68, z0: -0.25, z1: 1.35, rim: 0.1, ledge: [0.67, 1.17, 0.87, 1.37] };
    const ty = (T.y0 + T.y1) / 2, tz = (T.z0 + T.z1) / 2;
    const trolleyParts = (text) => {
      const out = [], trim = [];
      out.push(bevelBox({ w: T.w, h: T.y1 - T.y0, d: T.z1 - T.z0, color: C.navy, emissive: C.lift, bevel: 0.06, offset: { y: ty, z: tz } }));
      out.push(box({ w: T.w - 0.1, h: 0.04, d: T.z1 - T.z0 - 0.1, color: C.navyDk, offset: { y: T.y1 + 0.02, z: tz } }));
      for (const [z, k] of [[T.z1, 1], [T.z0, -1]]) {
        const f = z + k * 0.015, hw = T.w / 2 - 0.08, hh = (T.y1 - T.y0) / 2 - 0.08;
        for (const sx of [-1, 1]) trim.push(box({ w: T.rim, h: 2 * hh, d: 0.03, color: C.navyDk, offset: { x: sx * (hw - T.rim / 2), y: ty, z: f } }));
        for (const sy of [-1, 1]) trim.push(box({ w: 2 * hw - 2 * T.rim, h: T.rim, d: 0.03, color: C.navyDk, offset: { y: ty + sy * (hh - T.rim / 2), z: f } }));
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) trim.push(moved(turnedX(lathe({ profile: [[0, 0], [0.065, 0], [0.065, 0.025], [0.04, 0.045], [0, 0.045]], segments: 10, color: "#3a4150" }), k * Math.PI / 2), sx * (hw - T.rim / 2), ty + sy * (hh - T.rim / 2), z + k * 0.03));
      }
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) trim.push(box({ w: 0.03, h: 0.06, d: 0.9, color: C.navyDk, offset: { x: sx * (T.w / 2 + 0.01), y: ty + 0.3 - i * 0.3, z: tz } }));
      // The ledge, its pins, and the carriage under the girder with its rivets.
      const [ly0, ly1, lz0, lz1] = T.ledge, ly = (ly0 + ly1) / 2;
      out.push(bevelBox({ w: 1.9, h: ly1 - ly0, d: lz1 - lz0, color: C.yellow, emissive: C.lift, bevel: 0.04, offset: { y: ly, z: (lz0 + lz1) / 2 } }));
      for (const sx of [-1, 1]) trim.push(moved(turnedX(lathe({ profile: [[0, 0], [0.055, 0], [0.055, 0.03], [0, 0.03]], segments: 10, color: C.dark }), Math.PI / 2), sx * 0.82, ly, lz1));
      out.push(box({ w: 2.3, h: 0.5, d: 2.1, color: C.yellow, emissive: C.lift, offset: { y: 0.35, z: 0.03 } }));
      out.push(box({ w: 2.34, h: 0.06, d: 2.14, color: C.yellowDk, offset: { y: 0.1, z: 0.03 } }));
      for (const sx of [-1, 1]) trim.push(box({ w: 0.08, h: 0.08, d: 0.03, color: C.rivet, offset: { x: sx * 1.0, y: 0.38, z: 1.09 } }));
      // The number's plate on the ledge, a grid of cells each yellow or black: its border, a margin and its letters, none
      // over another.
      const G = BL.hubModels.SIGN_GLYPHS, cell = 0.05, cols = text.length * 4 + 3;
      for (let c = 0; c < cols; c++) for (let r = 0; r < 9; r++) {
        const gc = c - 2, gr = r - 2, i = Math.floor(gc / 4), border = c === 0 || c === cols - 1 || r === 0 || r === 8;
        const ink = border || (gc >= 0 && gc % 4 < 3 && i < text.length && gr >= 0 && gr < 5 && G[text[i]][gr][gc % 4] === "1");
        trim.push(box({ w: cell, h: cell, d: 0.03, color: ink ? INK : C.plate, offset: { x: (c - (cols - 1) / 2) * cell, y: ly + (4 - r) * cell, z: lz1 + 0.015 } }));
      }
      out.push(moved(turnedZ(lathe({ profile: [[0, -0.75], [0.22, -0.75], [0.22, 0.75], [0, 0.75]], segments: 14, color: C.dark }), Math.PI / 2), 0, -0.1, 0.1));
      for (const sx of [-1, 1]) {
        out.push(box({ w: 0.1, h: 0.5, d: 0.5, color: C.yellowDk, offset: { x: sx * 0.8, y: -0.1, z: 0.1 } }));
        out.push(box({ w: 0.04, h: 0.16, d: 0.3, color: C.dark, offset: { x: sx * 1.17, y: 0.35, z: 0.6 } }));
      }
      return { body: merge(...out), trim: merge(...trim) };
    };
    trolleyGlow.push(moved(FM.smoothBolt(0.72, 0.05, "#ffd23a", 1), 0, ty, T.z1 + 0.04), moved(turnedY(FM.smoothBolt(0.72, 0.05, "#ffd23a", 1), Math.PI), 0, ty, T.z0 - 0.04));
    for (const sx of [-1, 1]) trolleyGlow.push(box({ w: 0.02, h: 0.12, d: 0.24, color: C.amber, emissive: 1, offset: { x: sx * 1.19, y: 0.35, z: 0.6 } }));
    // The ropes, four falls a metre long, two pairs off the drum.
    const rope = merge(...[-0.3, -0.2, 0.2, 0.3].map((x) => box({ w: 0.035, h: 1, d: 0.035, color: "#15171b", offset: { x, y: -0.5, z: 0.1 } })));
    // The hook block: a yellow block with its sheaves on both sides, a black band, the crosshead and the shank, and the
    // hook itself, curled round under it with its latch, the eye of the sling's link in its throat at `eye`.
    hook.push(box({ w: 0.6, h: 0.46, d: 0.42, color: C.yellow, emissive: C.lift, offset: { y: -0.23, z: 0.1 } }));
    for (const sx of [-1, 1]) hook.push(moved(turnedZ(lathe({ profile: [[0, -0.03], [0.17, -0.03], [0.17, 0.03], [0, 0.03]], segments: 12, color: C.dark }), Math.PI / 2), sx * 0.33, -0.2, 0.1));
    hook.push(box({ w: 0.62, h: 0.07, d: 0.44, color: INK, offset: { y: -0.41, z: 0.1 } }));
    hook.push(box({ w: 0.34, h: 0.1, d: 0.2, color: C.dark, offset: { y: -0.51, z: 0.1 } }));
    hook.push(box({ w: 0.11, h: 0.16, d: 0.11, color: C.dark, offset: { y: -0.64, z: 0.1 } }));
    const hr = 0.17, hy = C.eye + hr;
    hook.push(tube({ path: (t) => ({ x: -0.02 + Math.sin(-0.2 + t * 4.6) * hr, y: hy + Math.cos(-0.2 + t * 4.6) * hr, z: 0.1 }), radius: (t) => 0.06 - t * 0.025, rings: 16, segments: 8, colorFn: () => C.dark }));
    hook.push(beam(-0.02 + Math.sin(4.4) * hr, hy + Math.cos(4.4) * hr, 0.1, -0.02, hy + hr, 0.1, 0.025, "#8a929c"));
    // The load, its sling's eye at its zero, after its close-up: the crate, royal blue in a yellow frame along all its
    // edges with a chunky yellow block on each corner, a dark square set in each of its outer faces; the bolt on all four
    // faces, beside a raised diagonal brace on the two broad ones; the sling taut (`sling`), its yellow ring in the hook
    // and four yellow legs down to the crate's top corners; and the same sling lying slack on the crate's top (`slack`),
    // its ring at the middle and its legs out to the corners. The crate's frame, blocks, braces and bolts are its `loadTrim`,
    // which the scene sorts a little nearer on Canvas 2D, so the crate's big faces never paint over them.
    const [cw, ch, cd] = C.crate, ct = -C.sling, sling = [], slack = [], trim = [], cy = ct - ch / 2, blue = "#2a46c0", brace = "#16246e";
    sling.push(moved(turnedX(torus(0.1, 0.03, C.yellow, 0, 12, 6), Math.PI / 2), 0, -0.02, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sling.push(beam(0, -0.1, 0, sx * (cw / 2 - 0.1), ct, sz * (cd / 2 - 0.1), 0.04, C.yellow));
    slack.push(moved(torus(0.1, 0.03, C.yellow, 0, 12, 6), 0.05, ct + 0.03, -0.04));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) slack.push(beam(0.05 + sx * 0.08, ct + 0.03, -0.04 + sz * 0.08, sx * (cw / 2 - 0.1), ct + 0.02, sz * (cd / 2 - 0.1), 0.04, C.yellow));
    load.push(box({ w: cw - 0.04, h: ch - 0.04, d: cd - 0.04, color: blue, emissive: C.lift, offset: { y: cy } }));
    const e = 0.1, k = 0.2, out = 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) trim.push(box({ w: e, h: ch - 2 * k, d: e, color: C.yellow, emissive: C.lift, offset: { x: sx * (cw / 2 - e / 2), y: cy, z: sz * (cd / 2 - e / 2) } }));
    for (const y of [ct - e / 2, ct - ch + e / 2]) for (const s of [-1, 1]) {
      trim.push(box({ w: cw - 2 * k, h: e, d: e, color: C.yellow, emissive: C.lift, offset: { y, z: s * (cd / 2 - e / 2) } }));
      trim.push(box({ w: e, h: e, d: cd - 2 * k, color: C.yellow, emissive: C.lift, offset: { x: s * (cw / 2 - e / 2), y } }));
    }
    // The corner blocks, standing a little proud, a dark square in each outer face.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (cw / 2 - k / 2 + out), y = cy + sy * (ch / 2 - k / 2 + out), z = sz * (cd / 2 - k / 2 + out);
      trim.push(bevelBox({ w: k, h: k, d: k, color: C.yellow, emissive: C.lift, bevel: 0.02, offset: { x, y, z } }));
      trim.push(box({ w: 0.08, h: 0.08, d: 0.01, color: C.dark, offset: { x, y, z: z + sz * k / 2 } }));
      trim.push(box({ w: 0.01, h: 0.08, d: 0.08, color: C.dark, offset: { x: x + sx * k / 2, y, z } }));
      trim.push(box({ w: 0.08, h: 0.01, d: 0.08, color: C.dark, offset: { x, y: y + sy * k / 2, z } }));
    }
    // The braces on the broad faces (front and back, square to z), from the frame's foot near one end up to its top at
    // the other, and the bolts, beside the braces on those faces and in the middle of the narrow ones.
    const span = cw - 2 * e, rise = ch - 2 * e, braceLen = Math.hypot(span * 0.7, rise), tilt = Math.atan2(rise, span * 0.7);
    for (const s of [-1, 1]) for (const part of [box({ w: braceLen, h: 0.1, d: 0.03, color: brace, emissive: C.lift }), box({ w: braceLen, h: 0.018, d: 0.034, color: C.yellow, emissive: C.lift, offset: { y: 0.05 } })]) {
      trim.push(moved(turnedY(moved(turnedZ(part, tilt), span * 0.15, 0, cd / 2 + 0.005), s > 0 ? 0 : Math.PI), 0, cy, 0));
    }
    for (let q = 0; q < 4; q++) {
      const broad = q % 2 === 0, a = q * Math.PI / 2, aside = broad ? -0.2 : 0;
      trim.push(moved(turnedY(FM.smoothBolt(broad ? 0.6 : 0.52, 0.04, "#ffd23a", 0), a), Math.sin(a) * (cw / 2 + 0.005) + Math.cos(a) * aside, cy, Math.cos(a) * (cd / 2 + 0.01) - Math.sin(a) * aside));
    }
    return { runways: merge(...runways), bridge: merge(...bridge), glow: noShadow(merge(...glow)), trolley: trolleyParts("LJ-02"), farTrolley: trolleyParts("LJ-01"), trolleyGlow: noShadow(merge(...trolleyGlow)), rope, hook: merge(...hook), load: merge(...load), loadTrim: merge(...trim), sling: merge(...sling), slack: merge(...slack), beacons };
  });

  // The laydown stands the crane sets its crate down on (`CRANE.stands`), in the hangar's frame: each a steel skid, a
  // dark deck `standTop` up on four short legs with yellow and black ends, in a painted square on the floor round it.
  const laydown = cached(() => {
    const C = CRANE, geos = [], top = C.standTop, h = 0.8;
    for (const [x, z] of C.stands) {
      geos.push(box({ w: 1.6, h: 0.08, d: 1.6, color: "#3a4049", offset: { x, y: top - 0.04, z } }));
      for (const k of [-1, 1]) {
        geos.push(box({ w: 1.66, h: 0.14, d: 0.12, color: C.yellow, offset: { x, y: top - 0.11, z: z + k * 0.77 } }));
        for (let i = 0; i < 4; i++) geos.push(box({ w: 0.18, h: 0.145, d: 0.125, color: INK, offset: { x: x - 0.6 + i * 0.4, y: top - 0.11, z: z + k * 0.77 } }));
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) geos.push(box({ w: 0.14, h: top - 0.08, d: 0.14, color: C.dark, offset: { x: x + sx * 0.7, y: (top - 0.08) / 2, z: z + sz * 0.7 } }));
      hazard(geos, x - h - 0.4, z - h - 0.4, x + h + 0.4, z - h - 0.4, 0.015, 0.2);
      hazard(geos, x + h + 0.4, z - h - 0.4, x + h + 0.4, z + h + 0.4, 0.015, 0.2);
      hazard(geos, x + h + 0.4, z + h + 0.4, x - h - 0.4, z + h + 0.4, 0.015, 0.2);
      hazard(geos, x - h - 0.4, z + h + 0.4, x - h - 0.4, z - h - 0.4, 0.015, 0.2);
    }
    return merge(...geos);
  });

  // The crane's safety spot, the blue light its trolley throws on the floor under the hook while it works: a soft halo
  // with a brighter ring near its edge, `CRANE.spot` metres round, as a picture laid in the xy plane facing +z (the scene
  // lays it face up) and added to the light under it. The picture runs `OVER` times past its square, so no pixel on the
  // square's edge falls outside it and is cut, which would leave the renderer reading the picture there at a blur level
  // it can't tell, as a dotted line round the square.
  const craneSpot = cached(() => {
    const OVER = 1.1, canvas = document.createElement("canvas"), n = 128, r = n / 2;
    canvas.width = canvas.height = n;
    const paint = canvas.getContext("2d"), gradient = paint.createRadialGradient(r, r, 0, r, r, r / OVER);
    for (const [at, rgba] of [[0, "130,196,255,0.5"], [0.55, "60,140,255,0.32"], [0.76, "40,120,255,0.24"], [0.84, "120,186,255,0.9"], [0.9, "60,140,255,0.36"], [1, "30,100,255,0"]]) gradient.addColorStop(at, `rgba(${rgba})`);
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, n, n);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const R = CRANE.spot, P = R * OVER, geo = { verts: [-R, -R, 0, R, -R, 0, R, R, 0, -R, R, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: n, height: n, load: () => image }, rect: [-P, -P, 2 * P, 2 * P], cutout: true, soft: true, blend: "add", bright: 0.25 };
    return geo;
  });

  // ---- the floor's fixtures ---------------------------------------------------------------------------------------

  // A monitor facing +z: a dark frame round a glowing blue screen, its face 0.02 in front of the origin, for the
  // pictures `hangar-terminals.js` lays on it.
  const monitor = (flat, glow, w, h) => {
    flat.push(box({ w: w + 0.08, h: h + 0.08, d: 0.06, color: IRON_DK, offset: { y: h / 2, z: -0.03 } }));
    glow.push(box({ w, h, d: 0.02, color: SCREEN, emissive: 0.95, offset: { y: h / 2, z: 0.01 } }));
  };
  // A workstation's two monitors on its desk, [x, width, turn] each, the foot of each screen at (x, y, z) in the desk's
  // frame and `h` tall.
  const DESK = { y: 0.99, z: -0.2, h: 0.52, monitors: [[-0.47, 0.84, 0.18], [0.5, 0.7, -0.2]] };
  // The crew's desks in steel, after the concept: slate steel, a lighter slate on the drawers' faces, a yellow edge, trims
  // and pulls, and the amber of the desk lanterns.
  const STEEL_DESK = { body: "#33405c", face: "#41517a", top: "#4b5a7c", dark: "#212839", trim: "#f2b630", pull: "#ffd04a", lamp: "#ffb347" };
  // A workstation in its own frame, the crew's side toward +z, its top at `top` within 2.1 by 0.9 (the walk blocks'
  // footprint), into `f`, its glowing parts into `g` and the small parts on its faces into `d` (drawn after the rest on
  // Canvas 2D, so its big faces don't paint over them): a slate steel top with a yellow lip along its front, on a drawer
  // pedestal at its left end (three drawers, each with a yellow pull between dark end caps, yellow trims up its front
  // corners, a dark plinth) and a steel end leg at its right on a yellow foot, a modesty panel across its back, and the
  // tower under it with its lamp lit; the two monitors each on a neck and foot, the keyboard and mouse, a mug and papers,
  // and on every other desk an amber lantern at its back corner.
  const workstation = (f, g, d, i) => {
    const S = STEEL_DESK, top = 0.84;
    f.push(bevelBox({ w: 2.1, h: 0.05, d: 0.9, color: S.top, bevel: 0.015, offset: { y: top - 0.025 } }));
    d.push(box({ w: 2.1, h: 0.05, d: 0.025, color: S.trim, offset: { y: top - 0.025, z: 0.4625 } }));
    // The pedestal: its plinth, body, the drawers bottom up with their pulls, and the trims up its front corners.
    const px = -0.73, front = 0.42;
    f.push(box({ w: 0.56, h: 0.06, d: 0.78, color: S.dark, offset: { x: px, y: 0.03, z: -0.02 } }));
    f.push(bevelBox({ w: 0.6, h: 0.73, d: 0.84, color: S.body, bevel: 0.02, offset: { x: px, y: 0.425 } }));
    let y = 0.08;
    for (const h of [0.26, 0.22, 0.175]) {
      d.push(bevelBox({ w: 0.5, h, d: 0.02, color: S.face, bevel: 0.006, offset: { x: px, y: y + h / 2, z: front + 0.01 } }));
      const py = y + h - 0.05;
      d.push(box({ w: 0.2, h: 0.03, d: 0.025, color: S.pull, offset: { x: px, y: py, z: front + 0.0325 } }));
      for (const sx of [-1, 1]) d.push(box({ w: 0.03, h: 0.04, d: 0.02, color: S.dark, offset: { x: px + sx * 0.115, y: py, z: front + 0.03 } }));
      y += h + 0.015;
    }
    for (const sx of [-1, 1]) d.push(box({ w: 0.035, h: 0.73, d: 0.035, color: S.trim, offset: { x: px + sx * 0.2825, y: 0.425, z: front + 0.0175 } }));
    // The end leg on its foot, and the modesty panel.
    f.push(bevelBox({ w: 0.05, h: 0.73, d: 0.84, color: S.body, bevel: 0.01, offset: { x: 1.0, y: 0.425 } }));
    f.push(box({ w: 0.09, h: 0.06, d: 0.86, color: S.trim, offset: { x: 1.0, y: 0.03 } }));
    f.push(box({ w: 1.4, h: 0.5, d: 0.03, color: S.dark, offset: { x: 0.27, y: 0.54, z: -0.39 } }));
    // The tower and its lamp.
    f.push(bevelBox({ w: 0.3, h: 0.6, d: 0.6, color: S.dark, bevel: 0.015, offset: { x: 0.62, y: 0.32, z: -0.04 } }));
    g.push(box({ w: 0.05, h: 0.05, d: 0.02, color: MARKER, emissive: 1, offset: { x: 0.62, y: 0.52, z: 0.27 } }));
    // The monitors, each on a neck and foot behind it.
    for (const [dx, w, a] of DESK.monitors) {
      const mf = [], mg = [], drop = DESK.y - top;
      monitor(mf, mg, w, DESK.h);
      mf.push(box({ w: 0.07, h: drop + 0.12, d: 0.05, color: IRON_DK, offset: { y: (0.12 - drop) / 2, z: -0.09 } }));
      mf.push(bevelBox({ w: 0.32, h: 0.025, d: 0.22, color: IRON_DK, bevel: 0.008, offset: { y: 0.0125 - drop, z: -0.06 } }));
      for (const p of mf) f.push(moved(turnedY(p, a), dx, DESK.y, DESK.z));
      for (const p of mg) g.push(moved(turnedY(p, a), dx, DESK.y, DESK.z));
    }
    // The keyboard and mouse, a mug and a stack of papers.
    d.push(box({ w: 0.56, h: 0.03, d: 0.18, color: "#1d1f24", offset: { y: top + 0.015, z: 0.17 } }), box({ w: 0.09, h: 0.03, d: 0.13, color: "#1d1f24", offset: { x: 0.42, y: top + 0.015, z: 0.19 } }));
    d.push(moved(lathe({ profile: [[0.045, 0], [0.045, 0.1], [0, 0.1]], segments: 8, color: i % 2 ? "#c23a2e" : "#e8e2d4" }), -0.85, top, 0.2));
    d.push(box({ w: 0.3, h: 0.04, d: 0.22, color: "#efe9dc", offset: { x: 0.8, y: top + 0.02, z: 0.14 } }));
    // The lantern: a dark base and cap round its amber glass.
    if (i % 2) {
      const lx = 0.96, lz = -0.32;
      d.push(bevelBox({ w: 0.15, h: 0.03, d: 0.15, color: S.dark, bevel: 0.008, offset: { x: lx, y: top + 0.015, z: lz } }));
      g.push(box({ w: 0.11, h: 0.15, d: 0.11, color: S.lamp, emissive: 1, offset: { x: lx, y: top + 0.105, z: lz } }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.push(box({ w: 0.02, h: 0.15, d: 0.02, color: S.dark, offset: { x: lx + sx * 0.06, y: top + 0.105, z: lz + sz * 0.06 } }));
      d.push(bevelBox({ w: 0.16, h: 0.03, d: 0.16, color: S.dark, bevel: 0.008, offset: { x: lx, y: top + 0.195, z: lz } }));
    }
  };

  // A mechanic's rolling tool chest in its own frame, its front toward +z, the floor at y 0, after the concept: royal
  // blue steel trimmed in yellow, into `f` and the small parts on its faces into `d` (drawn after the rest on Canvas 2D).
  // The roll cab on four casters with three deep drawers, each a face standing proud of it with a chunky white pull bar
  // across it on dark brackets; a yellow strip down its front left edge, round onto its side; blocky yellow bumpers on
  // all its corners, each with a bolt in it; the hangar's winged bolt on its left side; a dark rubber worktop with a
  // wrench and a screwdriver left on it, and a chrome push handle on its right; and the top box on its back half in the
  // same blue, two drawers, bumpers on its front corners, side handles, a navy lid with a yellow rivet at each corner and
  // a chrome latch, and the bolt on a badge.
  // Its worktop's height, and its top box's lid's, where things stand on it.
  const CHEST_TOPS = [0.965, 1.375];
  const CHEST = { body: "#2a46c0", face: "#3352cc", dark: "#1a2a70", trim: "#f2b630", bumper: "#eaa21f", pull: "#f1efe8",
    chrome: "#d6dbe1", black: "#1d1f24", rubber: "#22263a", gold: "#ffc83a", emblem: "#f08a1c" };
  const toolChest = (f, d) => {
    const C = CHEST;
    // A bumper `s` across at (x, y, z), with a bolt in its front face if it is on the front.
    const bumper = (x, y, z, s, front = true) => {
      d.push(bevelBox({ w: s, h: s, d: s, color: C.bumper, bevel: s * 0.15, offset: { x, y, z } }));
      if (front) d.push(box({ w: 0.024, h: 0.024, d: 0.012, color: C.black, offset: { x, y, z: z + s / 2 + 0.004 } }));
    };
    // Casters, each a wheel turned on its axle under a bracket.
    for (const [cx, cz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) {
      f.push(moved(turnedZ(lathe({ profile: [[0, -0.02], [0.045, -0.02], [0.055, -0.012], [0.055, 0.012], [0.045, 0.02], [0, 0.02]], segments: 10, color: C.black }), Math.PI / 2), cx, 0.055, cz));
      f.push(box({ w: 0.06, h: 0.05, d: 0.07, color: "#8d949c", offset: { x: cx, y: 0.115, z: cz } }));
    }
    // The cab and its plinth; the strip down its front left edge and round its side; its bumpers.
    f.push(bevelBox({ w: 1, h: 0.8, d: 0.58, color: C.body, bevel: 0.02, offset: { y: 0.54 } }));
    f.push(box({ w: 1.01, h: 0.05, d: 0.59, color: C.black, offset: { y: 0.165 } }));
    d.push(box({ w: 0.06, h: 0.62, d: 0.03, color: C.trim, offset: { x: -0.47, y: 0.54, z: 0.305 } }));
    d.push(box({ w: 0.03, h: 0.62, d: 0.06, color: C.trim, offset: { x: -0.515, y: 0.54, z: 0.26 } }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.2, 0.89]) bumper(sx * 0.475, y, sz * 0.265, 0.09, sz > 0);
    // The drawers, bottom up.
    let y = 0.19;
    for (const h of [0.27, 0.24, 0.22]) {
      d.push(bevelBox({ w: 0.83, h: h - 0.014, d: 0.02, color: C.face, bevel: 0.008, offset: { y: y + h / 2, z: 0.295 } }));
      d.push(bevelBox({ w: 0.7, h: 0.046, d: 0.03, color: C.pull, bevel: 0.01, offset: { y: y + h - 0.06, z: 0.32 } }));
      for (const sx of [-1, 1]) d.push(box({ w: 0.03, h: 0.05, d: 0.02, color: C.dark, offset: { x: sx * 0.365, y: y + h - 0.06, z: 0.315 } }));
      y += h;
    }
    // The winged bolt on its left side: the bolt between two swept wings, in the cab's mesh, since it sits on the middle
    // of the side's face.
    f.push(moved(turnedY(FM.smoothBolt(0.2, 0.02, C.emblem, 0.3), -Math.PI / 2), -0.512, 0.6, 0));
    for (const s of [-1, 1]) f.push(moved(turnedY(prism([[0, 0], [0.11, 0.045], [0.125, 0.018], [0.025, -0.028]].map(([u, v]) => [s * (u + 0.055), v]), 0.012, C.emblem, 0.3), -Math.PI / 2), -0.508, 0.62, 0));
    // The worktop and what was left on it.
    f.push(box({ w: 1.02, h: 0.025, d: 0.6, color: C.rubber, offset: { y: 0.952 } }));
    d.push(moved(turnedY(box({ w: 0.28, h: 0.014, d: 0.035, color: "#9aa3ad" }), 0.4), 0.18, 0.972, 0.2));
    d.push(moved(turnedY(box({ w: 0.06, h: 0.016, d: 0.07, color: "#9aa3ad" }), 0.4), 0.31, 0.972, 0.255));
    d.push(moved(turnedY(bevelBox({ w: 0.11, h: 0.034, d: 0.034, color: C.gold, bevel: 0.008 }), -0.3), -0.3, 0.982, 0.22));
    d.push(moved(turnedY(box({ w: 0.13, h: 0.01, d: 0.01, color: "#9aa3ad" }), -0.3), -0.18, 0.98, 0.257));
    // The push handle on the right.
    for (const dz of [-0.2, 0.2]) f.push(box({ w: 0.06, h: 0.025, d: 0.025, color: C.chrome, offset: { x: 0.53, y: 0.86, z: dz } }));
    f.push(box({ w: 0.025, h: 0.025, d: 0.44, color: C.chrome, offset: { x: 0.565, y: 0.86, z: 0 } }));
    // The top box: its case on the cab's back half, drawers, bumpers, side handles, the lid with its rivets and latch,
    // and the badge.
    f.push(bevelBox({ w: 0.98, h: 0.34, d: 0.42, color: C.body, bevel: 0.02, offset: { y: 1.135, z: -0.07 } }));
    let ty = 0.985;
    for (const h of [0.15, 0.13]) {
      d.push(bevelBox({ w: 0.8, h: h - 0.014, d: 0.02, color: C.face, bevel: 0.006, offset: { y: ty + h / 2, z: 0.15 } }));
      d.push(bevelBox({ w: 0.62, h: 0.034, d: 0.026, color: C.pull, bevel: 0.008, offset: { y: ty + h - 0.045, z: 0.172 } }));
      ty += h;
    }
    for (const sx of [-1, 1]) for (const y of [1.0, 1.26]) bumper(sx * 0.455, y, 0.115, 0.07);
    for (const sx of [-1, 1]) {
      f.push(box({ w: 0.05, h: 0.022, d: 0.022, color: C.chrome, offset: { x: sx * 0.51, y: 1.2, z: -0.16 } }), box({ w: 0.05, h: 0.022, d: 0.022, color: C.chrome, offset: { x: sx * 0.51, y: 1.2, z: 0.02 } }));
      f.push(box({ w: 0.022, h: 0.022, d: 0.2, color: C.chrome, offset: { x: sx * 0.535, y: 1.2, z: -0.07 } }));
    }
    f.push(bevelBox({ w: 1, h: 0.07, d: 0.44, color: C.dark, bevel: 0.025, offset: { y: 1.34, z: -0.07 } }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.push(box({ w: 0.05, h: 0.012, d: 0.05, color: C.trim, offset: { x: sx * 0.45, y: 1.381, z: -0.07 + sz * 0.17 } }));
    d.push(box({ w: 0.09, h: 0.04, d: 0.02, color: C.chrome, offset: { y: 1.31, z: 0.155 } }));
    d.push(box({ w: 0.16, h: 0.06, d: 0.008, color: C.dark, offset: { x: -0.34, y: 1.31, z: 0.162 } }));
    d.push(moved(prism([[-0.012, 0.024], [0.02, 0.024], [0.004, 0.002], [-0.02, 0.002]], 0.006, C.gold, 0.4), -0.345, 1.31, 0.167));
    d.push(moved(prism([[-0.006, -0.002], [0.018, -0.002], [-0.014, -0.026], [0.002, -0.002]], 0.006, C.gold, 0.4), -0.34, 1.31, 0.167));
  };

  // A crate after the concept, in its own frame, centred on its foot at (0, 0, 0) and `s` times the full size (0.9 across
  // and 0.8 tall, its top `CRATE_TOPS`' first): a royal blue body under a navy lid with a raised rim and corner blocks
  // round its recessed top, a yellow band round it under the lid studded with rivets, yellow bands down its corners,
  // dark bumper caps on its bottom corners with a bolt in each face, a panel seam and the hangar's bolt on its front and
  // back; or, `grey`, the plain slate one, its bands and corners dark and no bolt. `body` its parts and `small` the
  // rivets, bolts, seam and bolt on its faces, which Canvas 2D draws a little nearer (the scene's `CRATE_BIAS`: not as
  // much as the other fixtures' details, or those on its back would show through its lid).
  const CRATE = { body: "#2a44b0", lid: "#1a2a70", trim: "#f2b630", cap: "#262c3c", dot: "#0f1218", grey: "#59607a", greyLid: "#3d4356", greyTrim: "#2f3446" };
  const crateParts = (s, grey) => {
    const C = CRATE, body = [], small = [], k = (v) => v * s;
    const skin = grey ? C.grey : C.body, lid = grey ? C.greyLid : C.lid, trim = grey ? C.greyTrim : C.trim;
    body.push(bevelBox({ w: k(0.86), h: k(0.72), d: k(0.86), color: skin, bevel: k(0.02), offset: { y: k(0.36) } }));
    // The lid, its rim and its corner blocks, the top `CRATE_TOPS` stands on.
    body.push(bevelBox({ w: k(0.92), h: k(0.06), d: k(0.92), color: lid, bevel: k(0.015), offset: { y: k(0.74) } }));
    for (const sz of [-1, 1]) body.push(box({ w: k(0.66), h: k(0.02), d: k(0.07), color: lid, offset: { y: k(0.78), z: sz * k(0.425) } }));
    for (const sx of [-1, 1]) body.push(box({ w: k(0.07), h: k(0.02), d: k(0.66), color: lid, offset: { x: sx * k(0.425), y: k(0.78) } }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.push(bevelBox({ w: k(0.13), h: k(0.03), d: k(0.13), color: lid, bevel: k(0.008), offset: { x: sx * k(0.395), y: k(0.785), z: sz * k(0.395) } }));
    // The band under the lid and its rivets, the bands down the corners, and the caps on the bottom corners with
    // their bolts.
    for (const sd of [-1, 1]) {
      body.push(box({ w: k(0.89), h: k(0.07), d: k(0.03), color: trim, offset: { y: k(0.64), z: sd * k(0.43) } }));
      body.push(box({ w: k(0.03), h: k(0.07), d: k(0.83), color: trim, offset: { x: sd * k(0.43), y: k(0.64) } }));
    }
    for (const u of [-0.25, 0, 0.25]) for (const sd of [-1, 1]) {
      small.push(box({ w: k(0.025), h: k(0.025), d: k(0.01), color: C.dot, offset: { x: k(u), y: k(0.64), z: sd * k(0.45) } }));
      small.push(box({ w: k(0.01), h: k(0.025), d: k(0.025), color: C.dot, offset: { x: sd * k(0.45), y: k(0.64), z: k(u) } }));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      body.push(box({ w: k(0.1), h: k(0.48), d: k(0.1), color: trim, offset: { x: sx * k(0.405), y: k(0.36), z: sz * k(0.405) } }));
      body.push(bevelBox({ w: k(0.15), h: k(0.12), d: k(0.15), color: C.cap, bevel: k(0.015), offset: { x: sx * k(0.405), y: k(0.06), z: sz * k(0.405) } }));
      small.push(box({ w: k(0.03), h: k(0.03), d: k(0.01), color: C.dot, offset: { x: sx * k(0.405), y: k(0.06), z: sz * k(0.485) } }));
      small.push(box({ w: k(0.01), h: k(0.03), d: k(0.03), color: C.dot, offset: { x: sx * k(0.485), y: k(0.06), z: sz * k(0.405) } }));
    }
    // The panel seam and the bolt, front and back.
    for (const sz of [-1, 1]) {
      small.push(box({ w: k(0.012), h: k(0.46), d: k(0.006), color: lid, offset: { x: -sz * k(0.1), y: k(0.35), z: sz * k(0.432) } }));
      if (!grey) small.push(moved(turnedY(FM.smoothBolt(k(0.34), k(0.02), C.trim, 0.25), sz > 0 ? 0 : Math.PI), sz * k(0.13), k(0.33), sz * k(0.44)));
    }
    return { body, small };
  };

  // A terminal's screen on its stand, in the stand's frame: its width and height, where its bottom edge stands, and how
  // far it leans back; `hangar-terminals.js` lays its pictures over it.
  const KIOSK = { w: 0.78, h: 0.5, y: 1.08, z: 0.02, tilt: -0.45 };
  // A terminal on a pole, in its own frame, its front toward +z, into `f` and its glowing parts into `g`, in the concept's
  // slate and yellow: a round weighted base with a yellow band round its edge, a slim steel pole with a yellow collar and
  // its cable down its back, a keyboard tray on an arm with its keys lit, and the mount head the screen leans back from
  // (`KIOSK`).
  const kiosk = (f, g) => {
    const S = STEEL_DESK, K = KIOSK, foot = 0.07, pole = 0.045, head = K.y + 0.05;
    f.push(lathe({ profile: [[0.27, 0], [0.3, 0], [0.3, 0.03], [0.27, 0.03]], segments: 20, color: S.trim }));
    f.push(lathe({ profile: [[0, 0], [0.27, 0], [0.28, 0.03], [0.27, 0.055], [0.22, foot], [0, foot]], segments: 20, color: S.body }));
    // The pole in two lengths either side of its collar, so Canvas 2D never paints one long face over the collar.
    const collar = [0.42, 0.47];
    for (const [y0, y1] of [[foot, collar[0]], [collar[1], head]]) f.push(moved(lathe({ profile: [[0, 0], [pole, 0], [pole, y1 - y0], [0, y1 - y0]], segments: 12, color: S.top }), 0, y0, -0.08));
    f.push(moved(lathe({ profile: [[0, 0], [pole + 0.012, 0], [pole + 0.012, collar[1] - collar[0]], [0, collar[1] - collar[0]]], segments: 12, color: S.trim }), 0, collar[0], -0.08));
    f.push(tube({ path: (u) => ({ x: 0.035, y: head - 0.04 - u * (head - foot - 0.06), z: -0.08 - pole - 0.012 - 0.02 * Math.sin(u * Math.PI) }), radius: () => 0.012, rings: 10, segments: 6, colorFn: () => "#1d1f24" }));
    // The keyboard tray on its arm, its keys lit.
    const ty = 0.93, tilt = -0.18;
    f.push(box({ w: 0.06, h: 0.05, d: 0.2, color: S.dark, offset: { y: ty - 0.03, z: 0.02 } }));
    for (const p of [bevelBox({ w: 0.46, h: 0.025, d: 0.2, color: S.dark, bevel: 0.006 }), box({ w: 0.48, h: 0.03, d: 0.02, color: S.trim, offset: { z: 0.11 } }),
      box({ w: 0.4, h: 0.02, d: 0.13, color: "#1d1f24", offset: { y: 0.022 } })]) f.push(moved(turnedX(p, tilt), 0, ty, 0.14));
    g.push(moved(turnedX(box({ w: 0.36, h: 0.005, d: 0.1, color: SCREEN, emissive: 0.6, offset: { y: 0.034 } }), tilt), 0, ty, 0.14));
    // The mount head and the hinge the screen hangs from.
    f.push(bevelBox({ w: 0.16, h: 0.14, d: 0.07, color: S.dark, bevel: 0.015, offset: { y: head, z: -0.1 } }));
    f.push(moved(turnedZ(lathe({ profile: [[0, -0.1], [0.025, -0.1], [0.025, 0.1], [0, 0.1]], segments: 10, color: S.top }), Math.PI / 2), 0, head, -0.06));
    const mf = [], mg = [];
    monitor(mf, mg, K.w, K.h);
    for (const p of mf) f.push(moved(turnedX(p, K.tilt), 0, K.y, K.z));
    for (const p of mg) g.push(moved(turnedX(p, K.tilt), 0, K.y, K.z));
  };
  // The crew's workstations, the terminals on stands, the tool chests, the crates (some stacked, a lantern on the
  // tallest), and the blue floor lamps. Screens glow, so they are their own mesh, and so do the lamps (`lampGlow`, for
  // the Factory's window into the hangar; the scene stands a `floorLamp` of its own on each base to light them one at a
  // time); the lanterns on the crates come back with their lights.
  const fixtures = cached(() => {
    const L = LAYOUT, flat = [], glow = [], detail = [], crateDetail = [], lamps = [], frame = [], glass = [], lights = [];
    L.stations.forEach(([x, z, turn], i) => {
      const f = [], g = [], d = [];
      workstation(f, g, d, i);
      placed(flat, f, x, 0, z, turn);
      placed(glow, g, x, 0, z, turn);
      placed(detail, d, x, 0, z, turn);
    });
    for (const [x, z, turn] of L.kiosks) {
      const f = [], g = [];
      kiosk(f, g);
      placed(flat, f, x, 0, z, turn);
      placed(glow, g, x, 0, z, turn);
    }
    for (const [x, z, turn] of L.toolChests) {
      const f = [], d = [];
      toolChest(f, d);
      placed(flat, f, x, 0, z, turn);
      placed(detail, d, x, 0, z, turn);
    }
    const crate = (x, y, z, a, s, grey) => {
      const { body, small } = crateParts(s, grey);
      for (const p of body) flat.push(moved(turnedY(p, a), x, y, z));
      for (const p of small) crateDetail.push(moved(turnedY(p, a), x, y, z));
    };
    L.crates.forEach(([x, z, a, stacked], i) => {
      crate(x, 0, z, a, 1, i % 4 === 3);
      if (stacked > 1) crate(x + 0.05, CRATE_TOPS[0], z - 0.04, a + 0.3, 0.8, true);
      const top = CRATE_TOPS[stacked > 1 ? 1 : 0];
      if (i % 3 === 0) {
        lanternParts(0.75, x, top, z, frame, glass);
        lights.push(x, top + 0.35, z, 6);
      } else if (i % 3 === 1) {
        // A small yellow case left on it, its lid's band and handle dark.
        flat.push(moved(turnedY(bevelBox({ w: 0.42, h: 0.2, d: 0.22, color: CRATE.trim, bevel: 0.03 }), a + 0.5), x, top + 0.1, z));
        flat.push(moved(turnedY(box({ w: 0.43, h: 0.035, d: 0.23, color: CRATE.lid, offset: { y: 0.06 } }), a + 0.5), x, top + 0.1, z));
        flat.push(moved(turnedY(box({ w: 0.16, h: 0.03, d: 0.03, color: CRATE.cap, offset: { y: 0.115 } }), a + 0.5), x, top + 0.1, z));
      }
    });
    for (const [x, z] of L.floorLamps) {
      flat.push(bevelBox({ w: 0.56, h: 0.1, d: 0.56, color: IRON_DK, bevel: 0.02, offset: { x, y: 0.05, z } }));
      lamps.push(bevelBox({ w: 0.44, h: 0.42, d: 0.44, color: FLOOR_LAMP, emissive: 1, bevel: 0.03, offset: { x, y: 0.31, z } }));
    }
    return { flat: merge(...flat), detail: merge(...detail), crateDetail: merge(...crateDetail), glow: noShadow(merge(...glow)), lampGlow: noShadow(merge(...lamps)), frame: merge(...frame), glass: noShadow(merge(...glass)), lights };
  });
  const floorLamp = cached(() => noShadow(bevelBox({ w: 0.44, h: 0.42, d: 0.44, color: FLOOR_LAMP, emissive: 1, bevel: 0.03, offset: { y: 0.31 } })));

  // The boards' frames: a blue light frame round the glass, on an iron back plate, held off the wall on a mount: two
  // rails across the board's back, clamped to it, each on standoff arms that run back into the rock with a collar
  // where they leave the wall's shadow, and a brace up each side. The scene lays each board's face over its glass.
  const MOUNT = { rail: 0.36, arm: 0.32, reach: 2.2 };
  const boardFrame = (w, h) => {
    const flat = [], glow = [], M = MOUNT;
    flat.push(bevelBox({ w: w + 0.4, h: h + 0.4, d: 0.16, color: IRON_DK, bevel: 0.04, offset: { z: -0.1 } }));
    for (const [bw, bh, x, y] of [[w + 0.24, 0.08, 0, h / 2 + 0.08], [w + 0.24, 0.08, 0, -h / 2 - 0.08], [0.08, h + 0.24, w / 2 + 0.08, 0], [0.08, h + 0.24, -w / 2 - 0.08, 0]]) {
      glow.push(box({ w: bw, h: bh, d: 0.05, color: "#5fb8ff", emissive: 1, offset: { x, y, z: 0.01 } }));
    }
    const arms = [-w * M.arm, 0, w * M.arm], back = -0.18, rail = back - 0.16, wall = rail - M.reach;
    for (const s of [-1, 1]) {
      const y = s * h * M.rail;
      flat.push(bevelBox({ w: w * 0.8, h: 0.16, d: 0.14, color: IRON, bevel: 0.03, offset: { y, z: rail } }));
      for (const x of arms) {
        flat.push(box({ w: 0.24, h: 0.22, d: 0.12, color: IRON_DK, offset: { x, y, z: back - 0.07 } }));
        flat.push(box({ w: 0.13, h: 0.13, d: M.reach, color: IRON, offset: { x, y, z: rail - M.reach / 2 } }));
        flat.push(box({ w: 0.26, h: 0.26, d: 0.06, color: IRON_DK, offset: { x, y, z: rail - M.reach * 0.45 } }));
      }
    }
    for (const x of [arms[0], arms[2]]) flat.push(beam(x, -h * M.rail, rail - 0.25, x, h * M.rail - 0.12, wall + 0.5, 0.09, IRON_DK));
    return { flat: merge(...flat), glow: noShadow(merge(...glow)) };
  };
  const boardFrames = cached(() => ({ stats: boardFrame(LAYOUT.boards.stats.w, LAYOUT.boards.stats.h), timeline: boardFrame(LAYOUT.boards.timeline.w, LAYOUT.boards.timeline.h) }));

  // ---- the boards' faces -----------------------------------------------------------------------------------------

  // Each board's face in its own frame, metres from its middle, x right and y up on the glass, which stands at z 0.02.
  // The stats board's tiles [x0, y0, x1, y1] under its header and over its footnote; the timeline's six stops along `y`
  // from `x0` every `step`, each a hexagon of radius `r` over its title, date and text. Its geometry and its lettering
  // both read these, so a word always sits on its tile. `JETS` are where the Jet itself flies across the faces, at
  // `scale`, climbing, turned toward the eye and banked so its top shows: [x, y, z, scale, climb, yaw, roll].
  const STATS_FACE = {
    tiles: { commits: [-4.3, -0.1, -1.85, 1.2], prs: [-1.7, -0.1, -0.05, 1.2], issues: [0.1, -0.1, 1.75, 1.2],
      stars: [-4.3, -1.55, -1.85, -0.25], release: [-1.7, -1.55, 1.75, -0.25], jet: [1.9, -1.55, 4.3, 1.2] },
    mark: [-3.95, 1.6, 0.5], title: [-3.55, 1.72], about: [-3.55, 1.4], footer: -1.8
  };
  // What Jet is now, as Jet 2.0's README puts it, which the stats board says under its name: the repository's
  // description is still 1.7's, a rebalancer.
  const JET_IS = "Jet 2.0: an autonomous economic engine for LND routing nodes.";
  const TIMELINE_FACE = { x0: -4.6, step: 1.84, y: 0.05, r: 0.48, bolt: [-4.95, 1.45], title: [-4.5, 1.52], intro: [1.08, 0.84], stopTitle: -0.66, stopDate: -0.87, stopText: -1.08, footer: -1.86 };
  const JETS = { stats: [[3.1, 0.28, 0.3, 0.06, 0.2, -0.35, -0.55]], timeline: [[3.75, 1.36, 0.3, 0.05, 0.14, -0.3, -0.5], [TIMELINE_FACE.x0 + 5 * TIMELINE_FACE.step, TIMELINE_FACE.y, 0.24, 0.021, 0.3, -0.3, -0.5]] };
  // The timeline's stops, written by hand; no date is. Each says where its date comes from in the reading: the
  // repository's creation, the releases whose versions fall in a span (by major and minor, so `v1.4.0-new-rebalancer`
  // counts as 1.4), the newest release, or none.
  const STOPS = [
    { title: "PLEBNET ERA", icon: "cubes", text: "Node runners balanced channels and set fees by hand." },
    { title: "JET BEGINS", icon: "bulb", date: "created", text: "A simple idea: automate the work of running a Lightning node." },
    { title: "EARLY REBALANCING", icon: "tools", date: ["1.1", "1.4"], text: "Full profitability, missed HTLCs, then a new rebalancer." },
    { title: "MAIN RELEASES", icon: "boxes", date: ["1.5", "1.6"], text: "LND 0.15, metrics, liquidity, probes and database cleanup." },
    { title: "LATEST RELEASE", icon: "crew", date: "latest", text: (r) => r.releases.length ? `${r.releases[0].tag}, with ${r.stars} stars and ${r.forks} forks so far.` : "No release yet." },
    { title: "JET V2 AHEAD", icon: "jet", text: "Rebuilt from the ground up as an economic engine for routing nodes." }
  ];
  const BOARD_SCREEN = "#040a1e", TILE = "#0a1a45", EDGE = "#4a9dff", HEX = "#08163d", ICON = "#9fd0ff", GOLD = "#ffd23a";
  // The board's dark glass, its full width and height, behind the face.
  const screen = (key) => box({ w: LAYOUT.boards[key].w, h: LAYOUT.boards[key].h, d: 0.04, color: BOARD_SCREEN, emissive: 0.3 });

  // A flat round piece facing +z, its back at z 0: a disc of radius `r`, or a ring round a hole.
  const roundel = (r, color, emissive, hole = 0, d = 0.03) => turnedX(lathe({ profile: hole ? [[hole, 0], [r, 0], [r, d], [hole, d], [hole, 0]] : [[r, 0], [r, d], [0, d]], segments: 18, color, emissive }), Math.PI / 2);
  const hoop = (R, r, color, emissive) => turnedX(torus(R, r, color, emissive, 18, 6), Math.PI / 2);
  const ball = (r, color, emissive) => lathe({ profile: Array.from({ length: 7 }, (_, k) => [Math.sin(k / 6 * Math.PI) * r, -Math.cos(k / 6 * Math.PI) * r]), segments: 12, color, emissive });
  // A star of `points` points, `r` to its tips and `ri` to its notches, `d` deep, centred on z 0.
  const star = (r, ri, d, color, emissive, points = 5) => prism(Array.from({ length: points * 2 }, (_, k) => {
    const a = Math.PI / 2 + k * Math.PI / points, rr = k % 2 ? ri : r;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }), d, color, emissive);
  // A tile: a raised panel of the screen's blue, edged in light.
  const tile = (flat, glow, x0, y0, x1, y1) => {
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    flat.push(box({ w, h, d: 0.04, color: TILE, emissive: 0.22, offset: { x: cx, y: cy, z: 0.04 } }));
    for (const [bw, bh, x, y] of [[w + 0.03, 0.03, cx, y1], [w + 0.03, 0.03, cx, y0], [0.03, h, x0, cy], [0.03, h, x1, cy]]) glow.push(box({ w: bw, h: bh, d: 0.02, color: EDGE, emissive: 1, offset: { x, y, z: 0.065 } }));
  };
  // A flight's streak behind a jet on a face: a thin wedge from its tail back along its climb.
  const streak = (out, x, y, z, climb, from, length, width, color) => {
    const dx = Math.cos(climb), dy = Math.sin(climb), tx = x - dx * from, ty = y - dy * from;
    out.push(moved(prism([[tx - dy * width, ty + dx * width], [tx - dx * length, ty - dy * length], [tx + dy * width, ty - dx * width]], 0.02, color, 1), 0, 0, z));
  };
  // A pixel cloud on a face, in blocks.
  const cloud = (out, x, y, s) => {
    for (const [cx, cy, w, h] of [[0, 0, 1, 0.26], [-0.22, 0.17, 0.46, 0.3], [0.18, 0.2, 0.56, 0.36], [0.42, 0.06, 0.3, 0.22]]) out.push(box({ w: w * s, h: h * s, d: 0.03, color: "#5f8fe8", emissive: 0.5, offset: { x: x + cx * s, y: y + cy * s, z: 0.05 } }));
  };
  // Small blocky things seen a little from above and to the side, as the concept's icons are: parts built round the
  // origin, turned, then set down at (x, y, z).
  const iso = (out, parts, x, y, z, yaw = 0.6, tilt = 0.4) => { for (const g of parts) out.push(moved(turnedX(turnedY(g, yaw), tilt), x, y, z)); };

  // The stats board's face: its dark glass, its tiles, and each tile's icon: the commits' branch graph, the pull request's two
  // branches and arrow, the issues' red ring, the release's green cube; and for the fifth tile both a star (the
  // repository's stars) and a milestone's flag, which the scene shows as the reading says. The Jet on the last tile
  // and its streak are the scene's.
  const statsFace = cached(() => {
    const T = STATS_FACE.tiles, flat = [screen("stats")], glow = [], z = 0.075;
    for (const t of Object.values(T)) tile(flat, glow, ...t);
    const at = (t) => {
      const narrow = t[2] - t[0] < 2;
      return [t[0] + (narrow ? 0.38 : 0.5), (t[1] + t[3]) / 2 + 0.05];
    };
    let [x, y] = at(T.commits);
    for (const dy of [0.25, -0.25]) glow.push(moved(hoop(0.065, 0.02, ICON, 0.9), x - 0.06, y + dy, z));
    glow.push(moved(roundel(0.06, ICON, 0.9), x - 0.06, y, z), moved(hoop(0.065, 0.02, ICON, 0.9), x + 0.2, y + 0.12, z));
    glow.push(beam(x - 0.06, y - 0.18, z + 0.01, x - 0.06, y + 0.18, z + 0.01, 0.026, ICON, 0.9), beam(x - 0.06, y - 0.1, z + 0.01, x + 0.16, y + 0.07, z + 0.01, 0.026, ICON, 0.9));
    [x, y] = at(T.prs);
    for (const [dx, dy] of [[-0.12, 0.23], [-0.12, -0.23], [0.13, -0.23]]) glow.push(moved(hoop(0.06, 0.018, ICON, 0.9), x + dx, y + dy, z));
    glow.push(beam(x - 0.12, y - 0.17, z + 0.01, x - 0.12, y + 0.17, z + 0.01, 0.024, ICON, 0.9), beam(x + 0.13, y - 0.17, z + 0.01, x + 0.13, y + 0.2, z + 0.01, 0.024, ICON, 0.9));
    glow.push(beam(x + 0.13, y + 0.2, z + 0.01, x + 0.03, y + 0.2, z + 0.01, 0.024, ICON, 0.9), moved(prism([[x - 0.04, y + 0.2], [x + 0.04, y + 0.14], [x + 0.04, y + 0.26]], 0.03, ICON, 0.9), 0, 0, z + 0.01));
    [x, y] = at(T.issues);
    glow.push(moved(hoop(0.15, 0.03, "#ff5a5a", 0.9), x, y, z), moved(roundel(0.045, "#ff5a5a", 0.9), x, y, z));
    [x, y] = at(T.release);
    iso(flat, [bevelBox({ w: 0.28, h: 0.28, d: 0.28, color: "#3ad07a", emissive: 0.45, bevel: 0.035 })], x, y, 0.26, Math.PI / 4, 0.55);
    [x, y] = at(T.stars);
    const stars = merge(moved(star(0.2, 0.085, 0.05, GOLD, 0.9), x, y, z + 0.02));
    const flag = merge(beam(x - 0.12, y - 0.26, z + 0.01, x - 0.12, y + 0.26, z + 0.01, 0.03, "#e8eeff", 0.6), moved(prism([[x - 0.12, y + 0.25], [x - 0.12, y + 0.02], [x + 0.2, y + 0.135]], 0.03, GOLD, 0.9), 0, 0, z + 0.01));
    return { flat: merge(...flat), glow: noShadow(merge(...glow)), stars: noShadow(stars), flag: noShadow(flag) };
  });

  // The timeline's face: its dark glass, the bolt by its title, the pixel clouds, a far islet, and the six stops, each a
  // hexagon edged in light round its icon, joined by yellow arrows and parted by faint rules. The Jets and their streaks
  // are the scene's.
  const timelineFace = cached(() => {
    const F = TIMELINE_FACE, flat = [screen("timeline")], glow = [], z = 0.07;
    glow.push(moved(FM.smoothBolt(0.78, 0.06, GOLD, 1), F.bolt[0], F.bolt[1], 0.08));
    cloud(glow, 1.95, 1.58, 0.5);
    cloud(glow, 4.75, 1.62, 0.42);
    cloud(glow, 5.0, 0.98, 0.36);
    glow.push(moved(merge(
      lathe({ profile: [[0, -0.3], [0.12, -0.16], [0.21, -0.04], [0.22, 0], [0, 0]], segments: 8, color: "#8a6e58", emissive: 0.45 }),
      lathe({ profile: [[0.225, 0], [0.2, 0.03], [0, 0.04]], segments: 8, color: "#5fbf4a", emissive: 0.55 }),
      moved(lathe({ profile: [[0.06, 0], [0.04, 0.1], [0, 0.14]], segments: 6, color: "#3f9a3a", emissive: 0.55 }), 0.05, 0.03, 0)
    ), 4.85, 0.72, 0.12));
    const hex = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
    STOPS.forEach((stop, i) => {
      const x = F.x0 + i * F.step, y = F.y, r = F.r;
      flat.push(moved(prism(hex.map(([u, v]) => [x + u * r, y + v * r]), 0.04, HEX, 0.28), 0, 0, 0.04));
      for (let k = 0; k < 6; k++) {
        const [u0, v0] = hex[k], [u1, v1] = hex[(k + 1) % 6], R = r + 0.02;
        glow.push(beam(x + u0 * R, y + v0 * R, z, x + u1 * R, y + v1 * R, z, 0.04, EDGE, 1));
      }
      if (i < STOPS.length - 1) {
        const a = x + r + 0.12, e = x + F.step - r - 0.12;
        glow.push(beam(a, y, 0.06, e - 0.12, y, 0.06, 0.05, GOLD, 1), moved(prism([[e, y], [e - 0.16, y + 0.09], [e - 0.16, y - 0.09]], 0.04, GOLD, 1), 0, 0, 0.06));
        glow.push(box({ w: 0.015, h: 1.15, d: 0.01, color: "#2b5fb8", emissive: 0.7, offset: { x: x + F.step / 2, y: -1.15, z: 0.03 } }));
      }
      const icon = [];
      if (stop.icon === "cubes") {
        for (const [cx, cy, c] of [[-0.14, -0.12, 0], [0, -0.12, 1], [0.14, -0.12, 0], [-0.07, 0.01, 1], [0.07, 0.01, 0], [0, 0.14, 1]]) icon.push(bevelBox({ w: 0.13, h: 0.13, d: 0.13, color: c ? "#c6ccda" : "#8f9bb5", emissive: 0.3, bevel: 0.02, offset: { x: cx, y: cy } }));
        iso(flat, icon, x, y - 0.02, 0.2, 0.5, 0.35);
      } else if (stop.icon === "bulb") {
        glow.push(moved(lathe({ profile: [[0.06, 0], [0.11, 0.07], [0.13, 0.16], [0.11, 0.25], [0.06, 0.3], [0, 0.31]], segments: 14, color: "#ffe58a", emissive: 1 }), x, y - 0.1, 0.2));
        flat.push(moved(lathe({ profile: [[0, -0.13], [0.045, -0.13], [0.06, -0.1], [0.065, -0.075], [0.058, -0.05], [0.065, -0.025], [0.06, 0]], segments: 12, color: "#a9b2c4", emissive: 0.3 }), x, y - 0.1, 0.2));
        for (let k = 0; k < 5; k++) {
          const a = Math.PI / 2 + (k - 2) * 0.55;
          glow.push(beam(x + Math.cos(a) * 0.2, y + 0.06 + Math.sin(a) * 0.2, 0.12, x + Math.cos(a) * 0.3, y + 0.06 + Math.sin(a) * 0.3, 0.12, 0.025, "#ffe58a", 1));
        }
      } else if (stop.icon === "tools") {
        flat.push(moved(roundel(0.13, "#9fb6d8", 0.35, 0.05, 0.06), x + 0.1, y - 0.06, z));
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          flat.push(moved(turnedZ(box({ w: 0.07, h: 0.07, d: 0.06, color: "#9fb6d8", emissive: 0.35 }), a), x + 0.1 + Math.cos(a) * 0.15, y - 0.06 + Math.sin(a) * 0.15, z + 0.03));
        }
        flat.push(beam(x - 0.2, y - 0.2, z + 0.08, x + 0.0, y + 0.03, z + 0.08, 0.06, "#c9d6ea", 0.4), moved(roundel(0.085, "#c9d6ea", 0.4, 0.035, 0.05), x + 0.05, y + 0.1, z + 0.06));
      } else if (stop.icon === "boxes") {
        for (const [cx, cy, c] of [[-0.09, -0.1, 0], [0.09, -0.1, 1], [-0.02, 0.07, 1], [0.15, 0.06, 0]]) icon.push(bevelBox({ w: 0.16, h: 0.16, d: 0.16, color: c ? GOLD : "#eef2f8", emissive: 0.35, bevel: 0.02, offset: { x: cx, y: cy } }));
        iso(flat, icon, x, y - 0.02, 0.2, 0.5, 0.35);
      } else if (stop.icon === "crew") {
        for (const [dx, dz, k] of [[-0.16, 0, 0.9], [0.16, 0, 0.9], [0, 0.04, 1.12]]) {
          glow.push(moved(ball(0.055 * k, "#a8ccff", 0.55), x + dx, y + 0.07 * k, z + dz + 0.1));
          glow.push(moved(lathe({ profile: [[0.11 * k, 0], [0.1 * k, 0.07 * k], [0.06 * k, 0.12 * k], [0, 0.13 * k]], segments: 12, color: "#a8ccff", emissive: 0.55 }), x + dx, y - 0.13 * k, z + dz + 0.1));
        }
      }
    });
    return { flat: merge(...flat), glow: noShadow(merge(...glow)) };
  });
  // The streak behind each board's flying Jet (its first in `JETS`), two thin wedges back from its tail along its climb,
  // in the Jet's own frame (x along the climb), so the scene's Jet takes it along as it leaves and brings it back.
  const jetStreak = (key, dz, drop, long, wide) => {
    const [, , , s, climb] = JETS[key][0], glow = [];
    streak(glow, 0, 0, -dz, 0, 27.75 * s * 0.38, long[0], wide[0], "#bfe3ff");
    streak(glow, -drop * Math.sin(climb), -drop * Math.cos(climb), -dz - 0.02, 0, 27.75 * s * 0.3, long[1], wide[1], "#7fb8ff");
    return noShadow(merge(...glow));
  };
  const jetStreaks = cached(() => ({ stats: jetStreak("stats", 0.1, 0.14, [0.48, 0.34], [0.05, 0.018]), timeline: jetStreak("timeline", 0.12, 0.16, [1.6, 1], [0.06, 0.02]) }));

  // The lettering both boards carry over their geometry, painted from a reading. `full` paints the whole board flat
  // for the board dialog: the glass, the tiles and hexagons, and simple drawings of the icons, under the same words.
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif', PX = 320;
  const MARK = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
  const WHITE = "#f4f7ff", PALE = "#cfe0ff", GREEN = "#5be38a", DATE = "#8fc4ff";
  const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const month = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const number = (n) => n >= 1000 ? BL.game.formatLarge(n) : String(n);
  const version = (tag) => {
    const m = /^v?(\d+)\.(\d+)/.exec(tag);
    return m ? Number(m[1]) * 1000 + Number(m[2]) : -1;
  };
  const stopDate = (stop, r) => {
    if (!stop.date) return "";
    if (stop.date === "created") return day(r.createdAt);
    if (stop.date === "latest") return r.releases.length ? day(r.releases[0].at) : "";
    const [from, to] = stop.date.map(version), hits = r.releases.filter((x) => version(x.tag) >= from && version(x.tag) <= to);
    if (!hits.length) return "";
    const first = month(hits[hits.length - 1].at), last = month(hits[0].at);
    return first === last ? first : `${first} – ${last}`;
  };
  // What a board says of its reading's freshness, under it and in the dialog.
  const boardNote = (r) => {
    if (!r) return "No reading yet · couldn't reach GitHub";
    if (r.source === "fetch") return `Static snapshot · fetched at ${clock(r.at)} as you came in, not live`;
    const st = BL.jetFeed.state, what = r.source === "cache" ? `Reading from ${day(r.at)}, ${clock(r.at)}` : `Snapshot from ${day(r.at)}`;
    return `${what} · ${st.loading ? "fetching from GitHub" : st.failed ? "couldn't reach GitHub" : "not live"}`;
  };

  const sheet = (canvas, w, h) => {
    canvas.width = Math.round(w * PX);
    canvas.height = Math.round(h * PX);
    const g = canvas.getContext("2d");
    return { g, w, h, x: (x) => (x + w / 2) * PX, y: (y) => (h / 2 - y) * PX };
  };
  // Words at (x, y), `size` metres tall, narrowed to `max` metres wide rather than cut: semi-bold at least, so small
  // type holds across the hall, and only a title glowing in its colour, so the rest stays crisp.
  const write = (S, text, x, y, size, color, { bold = false, align = "left", max = 0 } = {}) => {
    const g = S.g, weight = bold ? "bold" : "600";
    let px = size * PX;
    g.font = `${weight} ${px}px ${FONT}`;
    const m = g.measureText(text).width;
    if (max && m > max * PX) {
      px *= max * PX / m;
      g.font = `${weight} ${px}px ${FONT}`;
    }
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = size >= 0.3 ? px * 0.1 : 0;
    g.fillText(text, S.x(x), S.y(y));
    g.shadowBlur = 0;
  };
  // Words wrapped to `width` metres, a line every `step` metres down from `y`, in at most `lines` lines: smaller type
  // before fewer words.
  const wrap = (S, text, x, y, size, color, width, step, lines) => {
    const g = S.g, words = text.split(" ");
    for (let k = 0; ; k++) {
      const s = size * Math.pow(0.9, k);
      g.font = `600 ${s * PX}px ${FONT}`;
      const rows = [];
      for (const word of words) {
        const row = rows.length ? `${rows[rows.length - 1]} ${word}` : word;
        if (rows.length && g.measureText(row).width <= width * PX) rows[rows.length - 1] = row;
        else rows.push(word);
      }
      if (rows.length <= lines || k === 5) {
        rows.forEach((row, i) => write(S, row, x, y - i * step * s / size, s, color, { align: "center", max: width }));
        return;
      }
    }
  };
  const rounded = (g, x, y, w, h, r) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  // The flat board under the words, for the dialog: glass, frame and the tiles or hexagons in the face's colours.
  const glass = (S) => {
    const g = S.g;
    g.fillStyle = BOARD_SCREEN;
    g.fillRect(0, 0, S.w * PX, S.h * PX);
    g.strokeStyle = "#5fb8ff";
    g.lineWidth = 6;
    g.strokeRect(3, 3, S.w * PX - 6, S.h * PX - 6);
  };
  const glyph = (S, kind, x, y) => {
    const g = S.g, k = PX;
    g.save();
    g.translate(S.x(x), S.y(y));
    g.lineWidth = 0.03 * k;
    g.strokeStyle = g.fillStyle = kind === "issues" ? "#ff5a5a" : kind === "release" ? "#3ad07a" : kind === "stars" || kind === "flag" ? GOLD : kind === "bulb" ? "#ffe58a" : ICON;
    const ring = (cx, cy, r) => { g.beginPath(); g.arc(cx * k, -cy * k, r * k, 0, Math.PI * 2); g.stroke(); };
    const line = (ax, ay, bx, by) => { g.beginPath(); g.moveTo(ax * k, -ay * k); g.lineTo(bx * k, -by * k); g.stroke(); };
    const square = (cx, cy, s) => g.fillRect((cx - s / 2) * k, (-cy - s / 2) * k, s * k, s * k);
    if (kind === "commits") { ring(-0.06, 0.25, 0.06); ring(-0.06, -0.25, 0.06); ring(0.2, 0.12, 0.06); line(-0.06, -0.19, -0.06, 0.19); line(-0.06, -0.1, 0.16, 0.07); }
    else if (kind === "prs") { ring(-0.12, 0.23, 0.06); ring(-0.12, -0.23, 0.06); ring(0.13, -0.23, 0.06); line(-0.12, -0.17, -0.12, 0.17); line(0.13, -0.17, 0.13, 0.2); line(0.13, 0.2, -0.02, 0.2); }
    else if (kind === "issues") { ring(0, 0, 0.15); ring(0, 0, 0.02); }
    else if (kind === "release" || kind === "boxes" || kind === "cubes") { square(-0.08, -0.08, 0.14); square(0.08, -0.08, 0.14); square(0, 0.08, 0.14); }
    else if (kind === "stars") { g.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.085 : 0.2) * k; g.lineTo(Math.cos(a) * r, -Math.sin(a) * r); } g.fill(); }
    else if (kind === "flag") { line(-0.12, -0.26, -0.12, 0.26); g.beginPath(); g.moveTo(-0.12 * k, -0.25 * k); g.lineTo(-0.12 * k, -0.02 * k); g.lineTo(0.2 * k, -0.135 * k); g.fill(); }
    else if (kind === "bulb") { ring(0, 0.06, 0.12); line(-0.05, -0.1, 0.05, -0.1); }
    else if (kind === "tools") { ring(0.1, -0.06, 0.12); line(-0.2, -0.2, 0.02, 0.05); }
    else if (kind === "crew") { for (const dx of [-0.16, 0, 0.16]) { ring(dx, 0.07, 0.05); g.beginPath(); g.arc(dx * k, 0.12 * k, 0.1 * k, Math.PI, 0); g.stroke(); } }
    else if (kind === "jet") { line(-0.3, 0, 0.32, 0); line(0.05, 0, -0.1, 0.3); line(0.05, 0, -0.1, -0.3); line(-0.22, 0, -0.3, 0.14); line(-0.22, 0, -0.3, -0.14); }
    g.restore();
  };

  const paintStats = (canvas, r, full) => {
    const B = LAYOUT.boards.stats, F = STATS_FACE, T = F.tiles, S = sheet(canvas, B.w, B.h), g = S.g;
    if (full) {
      glass(S);
      for (const [x0, y0, x1, y1] of Object.values(T)) {
        rounded(g, S.x(x0), S.y(y1), (x1 - x0) * PX, (y1 - y0) * PX, 8);
        g.fillStyle = TILE;
        g.fill();
        g.strokeStyle = EDGE;
        g.lineWidth = 5;
        g.stroke();
      }
    }
    const [mx, my, ms] = F.mark, mark = new Path2D(MARK);
    g.save();
    g.translate(S.x(mx - ms / 2), S.y(my + ms / 2));
    g.scale(ms * PX / 16, ms * PX / 16);
    g.fillStyle = WHITE;
    g.shadowColor = WHITE;
    g.shadowBlur = 6;
    g.fill(mark);
    g.restore();
    write(S, BL.jetFeed.REPO, F.title[0], F.title[1], 0.34, WHITE, { bold: true, max: 7.6 });
    write(S, JET_IS, F.about[0], F.about[1], 0.16, PALE, { max: 7.8 });
    const milestone = r && r.milestones.length ? r.milestones[0] : null;
    const tiles = {
      commits: ["Commits", r ? number(r.commits) : "-", r ? `+${r.commitsWeek >= 100 ? "100+" : r.commitsWeek} this week` : "", GREEN],
      prs: ["Open PRs", r ? r.openPRs >= 100 ? "100+" : String(r.openPRs) : "-", r ? r.openPRs ? `${r.readyPRs} ready for review` : "none open" : "", PALE],
      issues: ["Issues", r ? number(r.openIssues) : "-", "open", PALE],
      stars: milestone ? ["Milestones", String(r.milestones.length), `${milestone.title} · ${milestone.closed}/${milestone.open + milestone.closed} done`, PALE]
        : ["Stars", r ? number(r.stars) : "-", r ? `${number(r.forks)} forks` : "", PALE],
      release: ["Latest Release", r && r.releases.length ? r.releases[0].tag : "None yet", r && r.releases.length ? day(r.releases[0].at) : "", PALE]
    };
    for (const [key, [label, value, note, tone]] of Object.entries(tiles)) {
      const [x0, y0, x1, y1] = T[key], narrow = x1 - x0 < 2, tx = x0 + (narrow ? 0.72 : 1.0), max = x1 - tx - 0.08;
      if (full) glyph(S, key === "stars" && milestone ? "flag" : key, x0 + (narrow ? 0.38 : 0.5), (y0 + y1) / 2 + 0.05);
      write(S, label, tx, y1 - 0.27, 0.18, WHITE, { max });
      write(S, value, tx, (y0 + y1) / 2 - 0.02, key === "release" ? 0.32 : 0.42, WHITE, { bold: true, max });
      if (note) write(S, note, tx, y0 + 0.24, 0.15, tone, { max });
    }
    const [jx0, jy0, jx1] = T.jet, jc = (jx0 + jx1) / 2;
    if (full) glyph(S, "jet", jc, JETS.stats[0][1]);
    write(S, "JET V2", jc, jy0 + 0.75, 0.34, GOLD, { bold: true, align: "center", max: 2.1 });
    write(S, "COMING SOON", jc, jy0 + 0.4, 0.22, GOLD, { bold: true, align: "center", max: 2.1 });
    write(S, `ⓘ  ${boardNote(r)}`, 0, F.footer, 0.13, "#b4c8ee", { align: "center", max: 8.4 });
  };

  const paintTimeline = (canvas, r, full) => {
    const B = LAYOUT.boards.timeline, F = TIMELINE_FACE, S = sheet(canvas, B.w, B.h), g = S.g;
    if (full) {
      glass(S);
      STOPS.forEach((stop, i) => {
        const x = F.x0 + i * F.step;
        g.beginPath();
        for (let k = 0; k < 6; k++) g.lineTo(S.x(x + Math.cos(k * Math.PI / 3) * F.r), S.y(F.y + Math.sin(k * Math.PI / 3) * F.r));
        g.closePath();
        g.fillStyle = HEX;
        g.fill();
        g.strokeStyle = EDGE;
        g.lineWidth = 6;
        g.stroke();
        glyph(S, stop.icon, x, F.y);
        if (i < STOPS.length - 1) {
          g.strokeStyle = g.fillStyle = GOLD;
          g.beginPath();
          g.moveTo(S.x(x + F.r + 0.12), S.y(F.y));
          g.lineTo(S.x(x + F.step - F.r - 0.2), S.y(F.y));
          g.stroke();
        }
      });
    }
    write(S, "LIGHTNING JET TIMELINE", F.title[0], F.title[1], 0.42, GOLD, { bold: true, max: 7.4 });
    write(S, "It began as a rebalancer. Jet 2.0 is an economic engine for routing nodes.", F.title[0], F.intro[0], 0.15, WHITE, { max: 5.8 });
    write(S, r ? `From its first commit in ${new Date(r.createdAt).getUTCFullYear()} through ${r.releases.length} releases, and now Jet v2.` : "From its first commit to Jet v2.", F.title[0], F.intro[1], 0.15, WHITE, { max: 5.8 });
    STOPS.forEach((stop, i) => {
      const x = F.x0 + i * F.step, when = r ? stopDate(stop, r) : "", text = typeof stop.text === "function" ? r ? stop.text(r) : "" : stop.text;
      write(S, stop.title, x, F.stopTitle, 0.16, GOLD, { bold: true, align: "center", max: 1.75 });
      if (when) write(S, when, x, F.stopDate, 0.13, DATE, { align: "center", max: 1.75 });
      wrap(S, text, x, when ? F.stopText : F.stopDate, 0.13, WHITE, 1.66, 0.18, 4);
    });
    write(S, `Dates from github.com/${BL.jetFeed.REPO}: when it began and its releases · ${boardNote(r)}`, 0, F.footer, 0.12, "#b4c8ee", { align: "center", max: 10.4 });
  };

  // A board's lettering as a picture laid over its face: a see-through quad the board's size, in front of its tiles.
  const boardText = (key, r) => {
    const B = LAYOUT.boards[key], canvas = document.createElement("canvas");
    (key === "stats" ? paintStats : paintTimeline)(canvas, r, false);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const w = B.w, h = B.h, z = 0.085;
    const geo = { verts: [-w / 2, -h / 2, z, w / 2, -h / 2, z, w / 2, h / 2, z, -w / 2, h / 2, z], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], cutout: true, soft: true, blend: "alpha", bright: 0.08 };
    return geo;
  };
  // A board painted whole into `canvas` for the board dialog.
  const paintBoard = (key, canvas, r) => (key === "stats" ? paintStats : paintTimeline)(canvas, r, true);

  // ---- the Jet's dock ----------------------------------------------------------------------------------------

  // The dock: the gangway up the Jet's left flank in steel, its grated decks on braced columns in front of the wing and
  // behind it and the span between on two steel stringers over the wing, railed along its outer edge and across both
  // ends but where the stair comes up, and open along the fuselage; its steel stair; and the steel trestles under the
  // wings, each a braced pair of legs on foot plates under a padded cradle.
  const dock = cached(() => {
    const L = LAYOUT, g = L.gangway, [sx, , sz0, , sy1, sz1, sw] = L.jetStairs, geos = [], last = g.decks.length - 1;
    g.decks.forEach(([z0, z1, posts], i) => {
      const d = z1 - z0, cz = (z0 + z1) / 2, rails = (i === 0 ? "n" : "") + (i === last ? "s" : "");
      placed(geos, steelDeck(g.w, d, posts ? g.y : 0, rails, i === last ? [[sx - g.x, d / 2, sw / 2 + 0.05, 0, 1]] : []), g.x, g.y, cz);
    });
    const z0 = g.decks[0][0], z1 = g.decks[last][1], outer = g.x - g.w / 2 + 0.1;
    placed(geos, steelRail(outer, z0 + 0.1, outer, z1 - 0.1, [false, false]), 0, g.y, 0);
    const [b0, b1] = g.decks.find(([, , posts]) => !posts);
    for (const dx of [-0.8, 0.8]) geos.push(beam(g.x + dx, g.y - 0.62, b0 - 0.6, g.x + dx, g.y - 0.62, b1 + 0.6, 0.3, STEEL.frame));
    geos.push(...steelStair(sx, 0, sz0, sx, sy1, sz1, sw, [true, false]));
    for (const [x, z] of L.trestles) {
      const top = 3.3, S = STEEL;
      for (const s of [-1, 1]) {
        geos.push(beam(x - 0.9, 0, z + s * 0.6, x - 0.2, top - 0.2, z + s * 0.6, 0.16, S.paint), beam(x + 0.9, 0, z + s * 0.6, x + 0.2, top - 0.2, z + s * 0.6, 0.16, S.paint));
        geos.push(beam(x - 0.6, 1, z + s * 0.6, x + 0.6, 1, z + s * 0.6, 0.1, S.paint));
        for (const k of [-1, 1]) geos.push(box({ w: 0.36, h: 0.04, d: 0.3, color: S.plate, offset: { x: x + k * 0.9, y: 0.02, z: z + s * 0.6 } }));
      }
      geos.push(beam(x - 0.55, 1.6, z - 0.6, x + 0.55, 1.6, z + 0.6, 0.08, S.paint), beam(x + 0.55, 1.6, z - 0.6, x - 0.55, 1.6, z + 0.6, 0.08, S.paint));
      geos.push(box({ w: 0.7, h: 0.22, d: 1.5, color: S.frame, offset: { x, y: top - 0.11, z } }), box({ w: 0.6, h: 0.06, d: 1.4, color: "#2b2b2b", offset: { x, y: top + 0.02, z } }));
    }
    return merge(...geos);
  });

  // The crew's hi-vis vest, sized for the gorillas' chests in their chest's frame: navy, banded twice in yellow.
  const vest = cached(() => merge(
    box({ w: 1.24, h: 0.86, d: 0.64, color: "#24346b", offset: { y: 0.55 } }),
    ...[0.42, 0.7].map((y) => box({ w: 1.27, h: 0.07, d: 0.67, color: "#f2c230", emissive: 0.25, offset: { y } }))
  ));

  // ---- the engine static fire test ---------------------------------------------------------------------------------

  // The test booth in its own frame (`LAYOUT.fireTest`), its front toward +z and the floor at y 0, after its concept: a
  // steel cabinet in navy panels with the WARNING plate between a hatch and a vent, hazard-striped corners and yellow
  // brackets at its foot, under a desk sloped to the presser (`desk`: its front and back edges, (z, y)): four levers on
  // yellow mounts and two lit keys on its left, the oscilloscope (`scope`) and its keys in the middle, and on a block
  // rising out of its right half the big red button (`button`) under its clear guard, hinged at its back edge (`hinge`),
  // the DO NOT PRESS sign glowing on the block's front (`plate`). Behind, a bar of status lamps (`leds`, x along it at
  // `ledY`, `ledZ`) under the screen's housing (`screen`: centre, width, height; `timer`, the countdown's box on it, from
  // its centre), the ready, armed and fire lamps down its left margin (`lamps`), the JET V2 badge and speaker grilles
  // down its right, and the ENGINE STATIC FIRE TEST header on top (`header`) between hazard-striped ends, a yellow light
  // bar either side of a red strobe over it (`bars`, `strobe`); two caged lanterns on posts either side (`posts`,
  // `postY`, the lantern's foot); and round it all a barrier open at the front, bollards with glowing strips
  // (`bollards`) and striped rails (`railY`), in a striped box on the floor. `blocks` are what walkers keep out of,
  // [x0, x1, z0, z1, top], and `stand` is where the presser stands to reach the button.
  const FIRE = {
    desk: { front: [0.36, 0.96], back: [-0.25, 1.2] }, scope: [0, 0.04, -0.08],
    button: [0.68, 1.22, 0.06], hinge: [0.68, 1.22, -0.15], plate: [0.68, 1.1, 0.2995],
    screen: [-0.02, 1.9, -0.297, 1.38, 0.68], timer: [0.428, -0.095, 0.33, 0.19],
    leds: [-0.62, -0.48, -0.34, 0.34, 0.48, 0.62], ledY: 1.26, ledZ: -0.208,
    lamps: [[-0.91, 2.16, -0.3], [-0.91, 2.0, -0.3], [-0.91, 1.84, -0.3]],
    header: [0, 2.535, -0.377], bars: [[-0.55, 2.745, -0.44], [0.55, 2.745, -0.44]], strobe: [0, 2.71, -0.44],
    posts: [[-1.33, -0.45], [1.33, -0.45]], postY: 2.3,
    bollards: [[-1.85, 0.8], [1.85, 0.8], [-1.85, -0.85], [1.85, -0.85]], railY: 0.8,
    blocks: [[-1.42, 1.42, -0.72, 0.42, 2.8], [-1.98, -1.72, -0.98, 0.93, 1], [1.72, 1.98, -0.98, 0.93, 1], [-1.98, 1.98, -0.92, -0.78, 1]],
    stand: [0.68, 1.15],
    // The pictures that stand still on its faces, [key, x, y, z].
    pictures: [["title", 0, 2.535, -0.377], ["plate", 0.68, 1.1, 0.2995], ["sign", 0, 0.52, 0.321], ["badge", 0.89, 2.06, -0.297],
      ["stripes:0.11:0.6", -1.13, 0.5, 0.318], ["stripes:0.11:0.6", 1.13, 0.5, 0.318], ["stripes:0.18:0.29", -0.91, 2.535, -0.367], ["stripes:0.18:0.29", 0.91, 2.535, -0.367]]
  };
  // The desk's lean, and a point on its face in the booth's frame: `x` across, `h` above the face, `zl` down it.
  FIRE.lean = Math.atan2(FIRE.desk.back[1] - FIRE.desk.front[1], FIRE.desk.front[0] - FIRE.desk.back[0]);
  const DESK_MID = [(FIRE.desk.front[0] + FIRE.desk.back[0]) / 2, (FIRE.desk.front[1] + FIRE.desk.back[1]) / 2];
  const onDesk = (g) => moved(turnedX(g, FIRE.lean), 0, DESK_MID[1], DESK_MID[0]);
  FIRE.onDesk = (x, h, zl) => [x, DESK_MID[1] + h * Math.cos(FIRE.lean) - zl * Math.sin(FIRE.lean), DESK_MID[0] + h * Math.sin(FIRE.lean) + zl * Math.cos(FIRE.lean)];
  const FIRE_STEEL = "#3b4250", FIRE_DK = "#262b33", FIRE_NAVY = "#22406c", FIRE_SLOT = "#0c1119", FIRE_RED = "#d62828", FIRE_AMBER = "#ffb02e";
  const BOLT = "#9aa3ad", GUARD = "#cfe8ff", FIRE_BLACK = "#15171b";
  // A curved cable along the floor from (ax, az) by (mx, mz) to (bx, bz), in whatever frame they are given.
  const floorCable = (ax, az, mx, mz, bx, bz, color) => models.tube({
    path: (t) => { const u = 1 - t; return { x: u * u * ax + 2 * u * t * mx + t * t * bx, y: 0.05, z: u * u * az + 2 * u * t * mz + t * t * bz }; },
    radius: () => 0.05, rings: 20, segments: 6, colorFn: () => color
  });
  // A rail of square section from (ax, az) to (bx, bz) at height y, in yellow and black bands.
  const bandedRail = (out, ax, az, bx, bz, y) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.24)), a = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push(moved(turnedY(box({ w: 0.075, h: 0.075, d: len / n, color: i % 2 ? INK : PAINT }), a), ax + (bx - ax) * t, y, az + (bz - az) * t));
    }
  };
  const fireStation = cached(() => {
    const body = [], details = [], panel = [], F = FIRE;
    const bolt = (out, x, y, z) => out.push(box({ w: 0.035, h: 0.035, d: 0.02, color: BOLT, offset: { x, y, z } }));
    // The floor's stripes round the booth, its sides over its front and back where they meet.
    hazard(body, -2.2, -1.2, 2.2, -1.2, 0.025, 0.26, 0.45); hazard(body, 2.2, -1.2, 2.2, 1.5, 0.03, 0.26, 0.45);
    hazard(body, 2.2, 1.5, -2.2, 1.5, 0.025, 0.26, 0.45); hazard(body, -2.2, 1.5, -2.2, -1.2, 0.03, 0.26, 0.45);
    // The cabinet on its plinth, and the desk over it, a profile in (z, y) run across.
    body.push(bevelBox({ w: 2.5, h: 0.12, d: 1.0, color: FIRE_DK, bevel: 0.03, offset: { y: 0.06, z: -0.15 } }));
    body.push(bevelBox({ w: 2.4, h: 0.82, d: 0.9, color: FIRE_STEEL, bevel: 0.04, offset: { y: 0.53, z: -0.15 } }));
    const [fz, fy] = F.desk.front, [bz, by] = F.desk.back;
    body.push(turnedY(prism([[-0.6, 0.94], [fz, 0.94], [fz, fy], [bz, by], [-0.6, by]], 2.4, "#343a44"), -Math.PI / 2));
    body.push(bevelBox({ w: 2.44, h: 0.06, d: 0.07, color: FIRE_DK, bevel: 0.02, offset: { y: 0.95, z: 0.355 } }));
    // The cabinet's front: a navy panel either side of the WARNING plate, the left with a hatch and its handle over a
    // vent, the right a tall vent; the corners striped, yellow brackets at the foot, bolts at every corner.
    for (const s of [-1, 1]) details.push(box({ w: 0.44, h: 0.62, d: 0.02, color: FIRE_NAVY, offset: { x: s * 0.82, y: 0.52, z: 0.305 } }));
    for (const [w, h, x, y] of [[0.3, 0.025, -0.82, 0.8], [0.3, 0.025, -0.82, 0.55], [0.025, 0.25, -0.97, 0.675], [0.025, 0.25, -0.67, 0.675]]) details.push(box({ w, h, d: 0.012, color: FIRE_SLOT, offset: { x, y, z: 0.318 } }));
    details.push(bevelBox({ w: 0.14, h: 0.035, d: 0.035, color: "#7d8691", bevel: 0.01, offset: { x: -0.82, y: 0.675, z: 0.33 } }));
    for (let k = 0; k < 4; k++) details.push(box({ w: 0.32, h: 0.025, d: 0.01, color: FIRE_SLOT, offset: { x: -0.82, y: 0.27 + k * 0.055, z: 0.317 } }));
    for (let k = 0; k < 8; k++) details.push(box({ w: 0.32, h: 0.028, d: 0.01, color: FIRE_SLOT, offset: { x: 0.82, y: 0.27 + k * 0.066, z: 0.317 } }));
    details.push(box({ w: 1.08, h: 0.6, d: 0.02, color: "#101214", offset: { y: 0.52, z: 0.308 } }));
    for (const s of [-1, 1]) {
      details.push(box({ w: 0.13, h: 0.64, d: 0.02, color: FIRE_DK, offset: { x: s * 1.13, y: 0.5, z: 0.305 } }));
      details.push(bevelBox({ w: 0.17, h: 0.15, d: 0.06, color: PAINT, bevel: 0.015, offset: { x: s * 1.17, y: 0.2, z: 0.31 } }));
      bolt(details, s * 1.17, 0.2, 0.343);
      for (const x of [0.62, 1.02]) for (const y of [0.25, 0.79]) bolt(details, s * x, y, 0.318);
    }
    // The desk's face (in its own frame, y 0 the face and +z down it): a dark inset under the levers and the scope,
    // the four levers on their yellow mounts, two lit keys before them, the scope's housing and the three keys under
    // it. The block rising out of the right half carries the button.
    panel.push(box({ w: 1.44, h: 0.015, d: 0.56, color: "#1f242c", offset: { x: -0.38, y: 0.006 } }));
    [-0.98, -0.8, -0.62, -0.44].forEach((x, i) => {
      panel.push(bevelBox({ w: 0.11, h: 0.06, d: 0.2, color: PAINT, bevel: 0.015, offset: { x, y: 0.03, z: -0.06 } }));
      panel.push(box({ w: 0.03, h: 0.006, d: 0.15, color: FIRE_BLACK, offset: { x, y: 0.061, z: -0.06 } }));
      panel.push(beam(x, 0.06, -0.03, x, 0.22, -0.09, 0.045, FIRE_BLACK));
      panel.push(bevelBox({ w: 0.085, h: 0.065, d: 0.065, color: FIRE_BLACK, bevel: 0.015, offset: { x, y: 0.245, z: -0.095 } }));
      if (i === 0) panel.push(box({ w: 0.087, h: 0.02, d: 0.067, color: "#ff8a2e", emissive: 0.5, offset: { x, y: 0.285, z: -0.095 } }));
    });
    for (const x of [-1.03, -0.92]) panel.push(bevelBox({ w: 0.085, h: 0.03, d: 0.075, color: "#ffc93a", emissive: 0.8, bevel: 0.01, offset: { x, y: 0.015, z: 0.2 } }));
    panel.push(bevelBox({ w: 0.52, h: 0.08, d: 0.3, color: FIRE_DK, bevel: 0.02, offset: { x: F.scope[0], y: F.scope[1], z: F.scope[2] } }));
    [["#e5352a", 0.8], ["#ffc93a", 0.8], ["#3a3f46", 0]].forEach(([color, emissive], i) => {
      panel.push(bevelBox({ w: 0.09, h: 0.035, d: 0.08, color, emissive, bevel: 0.012, offset: { x: -0.13 + i * 0.13, y: 0.018, z: 0.2 } }));
    });
    for (const g of panel) details.push(onDesk(g));
    // The button's block, its front's dark bezel for the sign, and the yellow and black ring round the button's well.
    body.push(bevelBox({ w: 0.62, h: 0.34, d: 0.46, color: FIRE_DK, bevel: 0.03, offset: { x: F.button[0], y: F.button[1] - 0.17, z: F.button[2] } }));
    details.push(box({ w: 0.54, h: 0.18, d: 0.012, color: "#120607", offset: { x: F.plate[0], y: F.plate[1], z: F.plate[2] - 0.008 } }));
    details.push(moved(lathe({ profile: [[0.19, 0], [0.19, 0.025], [0.13, 0.025], [0.13, 0]], segments: 24, color: PAINT }), F.button[0], F.button[1], F.button[2]));
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + 0.2;
      details.push(moved(turnedY(box({ w: 0.06, h: 0.03, d: 0.05, color: INK }), a), F.button[0] + Math.sin(a) * 0.16, F.button[1] + 0.012, F.button[2] + Math.cos(a) * 0.16));
    }
    // The lamp bar on the desk's back under the housing, its socket block in the middle; the housing on a riser.
    body.push(bevelBox({ w: 1.7, h: 0.12, d: 0.1, color: FIRE_DK, bevel: 0.02, offset: { y: F.ledY, z: -0.27 } }));
    body.push(bevelBox({ w: 0.3, h: 0.16, d: 0.14, color: "#1c2027", bevel: 0.02, offset: { y: F.ledY + 0.02, z: -0.26 } }));
    body.push(box({ w: 1.9, h: 0.12, d: 0.2, color: FIRE_DK, offset: { y: F.ledY, z: -0.47 } }));
    body.push(bevelBox({ w: 2.1, h: 1.06, d: 0.26, color: "#2d333c", bevel: 0.04, offset: { y: 1.85, z: -0.45 } }));
    for (const x of [-0.98, 0.98]) for (const y of [1.39, 2.31]) bolt(details, x, y, -0.315);
    // The screen's bezel; the lamps' bezels down the left margin; down the right the badge's plate; a grille each side.
    details.push(box({ w: F.screen[3] + 0.1, h: F.screen[4] + 0.1, d: 0.02, color: "#12161b", offset: { x: F.screen[0], y: F.screen[1], z: -0.31 } }));
    for (const [x, y] of F.lamps) details.push(box({ w: 0.15, h: 0.15, d: 0.012, color: "#0e1014", offset: { x, y, z: -0.314 } }));
    details.push(bevelBox({ w: 0.25, h: 0.27, d: 0.02, color: "#1b2029", bevel: 0.01, offset: { x: 0.89, y: 2.06, z: -0.31 } }));
    for (const x of [-0.91, 0.89]) {
      details.push(box({ w: 0.17, h: 0.17, d: 0.01, color: "#1a1e24", offset: { x, y: 1.53, z: -0.313 } }));
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) details.push(box({ w: 0.028, h: 0.028, d: 0.01, color: "#07080a", offset: { x: x + i * 0.045, y: 1.53 + j * 0.045, z: -0.306 } }));
    }
    // The header on the housing between its striped ends, and over it the light bars' and the strobe's bases.
    body.push(bevelBox({ w: 1.62, h: 0.27, d: 0.12, color: "#0e1114", bevel: 0.02, offset: { y: F.header[1], z: -0.44 } }));
    for (const s of [-1, 1]) body.push(bevelBox({ w: 0.2, h: 0.31, d: 0.14, color: FIRE_DK, bevel: 0.02, offset: { x: s * 0.91, y: F.header[1], z: -0.44 } }));
    for (const [x, , z] of F.bars) body.push(box({ w: 0.3, h: 0.04, d: 0.12, color: FIRE_DK, offset: { x, y: 2.69, z } }));
    body.push(moved(lathe({ profile: [[0.09, 0], [0.09, 0.04], [0, 0.04]], segments: 14, color: FIRE_DK }), F.strobe[0], 2.67, F.strobe[2]));
    // The lantern posts, with the arms that hold the housing to them; each lantern's caps and cage, its globe the scene's.
    for (const [x, z] of F.posts) {
      body.push(box({ w: 0.3, h: 0.05, d: 0.3, color: FIRE_DK, offset: { x, y: 0.025, z } }), box({ w: 0.12, h: F.postY, d: 0.12, color: "#2a2f36", offset: { x, y: F.postY / 2, z } }));
      for (const y of [1.5, 2.2]) body.push(box({ w: 0.24, h: 0.06, d: 0.06, color: FIRE_DK, offset: { x: x - Math.sign(x) * 0.16, y, z } }));
      body.push(moved(lathe({ profile: [[0, 0], [0.13, 0], [0.13, 0.04], [0.1, 0.06], [0, 0.06]], segments: 16, color: "#22262c" }), x, F.postY, z));
      body.push(moved(lathe({ profile: [[0, 0.33], [0.13, 0.33], [0.13, 0.37], [0.07, 0.41], [0, 0.42]], segments: 16, color: "#22262c" }), x, F.postY, z));
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU;
        body.push(box({ w: 0.018, h: 0.27, d: 0.018, color: "#1c1f24", offset: { x: x + Math.sin(a) * 0.118, y: F.postY + 0.195, z: z + Math.cos(a) * 0.118 } }));
      }
      for (const y of [0.12, 0.27]) body.push(moved(torus(0.118, 0.012, "#1c1f24", 0, 16, 4), x, F.postY + y, z));
    }
    // The barrier: bollards with yellow caps, their glowing strips the scene's, and striped rails along the sides and
    // the back, open at the front.
    for (const [x, z] of F.bollards) {
      body.push(box({ w: 0.3, h: 0.04, d: 0.3, color: FIRE_DK, offset: { x, y: 0.02, z } }), box({ w: 0.22, h: 0.92, d: 0.22, color: "#2a2f36", offset: { x, y: 0.46, z } }));
      body.push(bevelBox({ w: 0.26, h: 0.08, d: 0.26, color: PAINT, bevel: 0.02, offset: { x, y: 0.96, z } }));
      details.push(box({ w: 0.1, h: 0.56, d: 0.012, color: "#0e1014", offset: { x, y: 0.5, z: z + 0.111 } }));
    }
    const [fl, fr, bl, br] = F.bollards;
    bandedRail(body, fl[0], fl[1] - 0.12, bl[0], bl[1] + 0.12, F.railY);
    bandedRail(body, fr[0], fr[1] - 0.12, br[0], br[1] + 0.12, F.railY);
    bandedRail(body, bl[0] + 0.12, bl[1], br[0] - 0.12, br[1], F.railY);
    // Cables out of the cabinet's sides to the bollards' feet.
    body.push(floorCable(-1.2, 0.05, -1.55, 0.5, -1.85, 0.66, "#d9862a"), floorCable(-1.2, -0.3, -1.6, -0.3, -1.85, -0.72, FIRE_BLACK));
    body.push(floorCable(1.2, -0.2, 1.6, 0.1, 1.85, 0.66, FIRE_BLACK));
    // The moving parts: the button, a red mushroom on its stem; the guard, a clear box in its hinge's frame, and its
    // hinge pin; the lanterns' globes, the light bars, the strobe's dome, the status lamps, one of the bar's lamps and
    // a bollard's strip.
    const button = shaded([turn([[0.05, -0.06], [0.05, 0.03], [0.13, 0.035], [0.13, 0.075], [0.1, 0.1], [0, 0.11]], 24, FIRE_RED, 0.6)]);
    const guard = merge(
      box({ w: 0.42, h: 0.015, d: 0.42, color: GUARD, offset: { y: 0.24, z: 0.21 } }),
      box({ w: 0.015, h: 0.24, d: 0.42, color: GUARD, offset: { x: -0.21, y: 0.12, z: 0.21 } }),
      box({ w: 0.015, h: 0.24, d: 0.42, color: GUARD, offset: { x: 0.21, y: 0.12, z: 0.21 } }),
      box({ w: 0.42, h: 0.24, d: 0.015, color: GUARD, offset: { y: 0.12, z: 0.42 } }),
      box({ w: 0.42, h: 0.24, d: 0.015, color: GUARD, offset: { y: 0.12, z: 0.005 } })
    );
    guard.glass = 0.3;
    const hinge = turnedZ(lathe({ profile: [[0.02, -0.22], [0.02, 0.22]], segments: 8, color: "#7d8691" }), Math.PI / 2);
    const globe = noShadow(shaded([turn([[0, 0.06], [0.095, 0.065], [0.105, 0.14], [0.105, 0.27], [0.08, 0.32], [0, 0.33]], 18, FIRE_AMBER, 1)]));
    const bar = noShadow(bevelBox({ w: 0.26, h: 0.07, d: 0.09, color: "#ffd23a", emissive: 1, bevel: 0.015 }));
    const strobe = noShadow(shaded([turn(Array.from({ length: 6 }, (_, k) => [Math.cos(k / 5 * Math.PI / 2) * 0.085, Math.sin(k / 5 * Math.PI / 2) * 0.11]), 16, "#ff3a2e", 1)]));
    const lamp = (color) => noShadow(bevelBox({ w: 0.11, h: 0.11, d: 0.03, color, emissive: 1, bevel: 0.015 }));
    const led = (color) => noShadow(bevelBox({ w: 0.08, h: 0.05, d: 0.02, color, emissive: 1, bevel: 0.01 }));
    const strip = noShadow(box({ w: 0.07, h: 0.5, d: 0.016, color: FIRE_AMBER, emissive: 1 }));
    return {
      body: merge(...body), details: merge(...details), button, guard, hinge, globe, bar, strobe, strip,
      lamps: [lamp("#3fe07a"), lamp("#ffc93a"), lamp("#ff3a2e")], leds: [led("#ffb02e"), led("#ff7a2a")]
    };
  });
  // The booth's cables: from its back along the floor to a port a little over a metre from under the Jet's tail end, and
  // from the port up in a droop to its plug on the Jet's underside (`LAYOUT.fireTest.cables`), at the bottom of the
  // Jet's cells there (`jetModels.columns`), a steel connector with a yellow collar. In two: `floor`, the runs and their
  // ports in the hangar's frame; and `droop`, each droop and its plug in the Jet's frame, to ride with the Jet as the
  // hangar's anomalies move it, its foot running down through its port's slot on under the floor (`PORT`), so the cable
  // feeds through the slot as the Jet moves and never parts from it.
  const PORT = { w: 0.5, d: 0.72, h: 0.05, slot: [0.22, 0.6], below: 0.5, over: 1.15 };
  const fireCables = cached(() => {
    const T = LAYOUT.fireTest, c = Math.cos(T.turn), s = Math.sin(T.turn), floor = [], droop = [], J = JM.columns(), j = LAYOUT.jet;
    const back = (x, z) => [T.x + x * c + z * s, T.z - x * s + z * c];
    const under = (x, z) => J.bottom[(Math.floor((x - j.x) / J.U) - J.i0) * J.nk + Math.floor((z - j.z) / J.U) - J.k0];
    T.cables.forEach(([px, pz], i) => {
      const color = i === 1 ? "#d9862a" : FIRE_BLACK, py = under(px, pz) - 0.12, [ax, az] = back(-0.6 + i * 0.6, -0.65);
      // Where its port is: a little over a metre from under its plug, toward the booth.
      const l = Math.hypot(ax - px, az - pz), fx = px + (ax - px) / l * 1.3, fz = pz + (az - pz) / l * 1.3;
      const mx = (ax + fx) / 2 + (i - 1) * 0.8, mz = (az + fz) / 2 + 0.6;
      floor.push(floorCable(ax, az, mx, mz, fx, fz, color));
      // The port: a low steel plate, its dark slot along the Jet.
      floor.push(box({ w: PORT.w, h: PORT.h, d: PORT.d, color: FIRE_STEEL, offset: { x: fx, y: PORT.h / 2, z: fz } }),
        box({ w: PORT.slot[0], h: 0.01, d: PORT.slot[1], color: FIRE_SLOT, offset: { x: fx, y: PORT.h + 0.005, z: fz } }));
      // The droop: from the plug over and straight down into the port, on below the floor.
      droop.push(models.tube({
        path: (t) => { const u = 1 - t; return { x: u * u * px + 2 * u * t * fx + t * t * fx, y: u * u * py + 2 * u * t * PORT.over - t * t * PORT.below, z: u * u * pz + 2 * u * t * fz + t * t * fz }; },
        radius: () => 0.05, rings: 18, segments: 6, colorFn: () => color
      }));
      droop.push(bevelBox({ w: 0.2, h: 0.16, d: 0.2, color: FIRE_STEEL, bevel: 0.03, offset: { x: px, y: py + 0.06, z: pz } }), box({ w: 0.22, h: 0.04, d: 0.22, color: PAINT, offset: { x: px, y: py - 0.02, z: pz } }));
    });
    return { floor: merge(...floor), droop: moved(merge(...droop), -j.x, 0, -j.z) };
  });

  // The Jet's exhaust for the test, built at a nozzle's exit and blowing along +z: the plume, a white-hot core in a blue
  // mantle inside the orange envelope, each a turned flame, the outer two see-through; the shock diamonds down the
  // core; the throat's glow inside the nozzle, red as it spools and blue-white at full thrust; and the heat's shimmer,
  // a faint ring the scene drifts back along the plume.
  const flame = (profile, colors, glass) => {
    const g = noShadow(forwardLathe(lathe({ profile, segments: 20, color: (t) => colors[Math.min(colors.length - 1, Math.floor(t * colors.length))], emissive: 1 })));
    g.smooth = true;
    if (glass) g.glass = glass;
    return g;
  };
  const exhaust = cached(() => ({
    core: flame([[0, -0.05], [0.36, 0], [0.34, 0.7], [0.24, 1.7], [0.1, 2.6], [0, 3]], ["#ffffff", "#eaf6ff", "#cfe6ff"]),
    mantle: flame([[0, -0.05], [0.7, 0], [0.76, 0.9], [0.62, 2.3], [0.32, 3.6], [0, 4.4]], ["#6fb7ff", "#3a86ff", "#2a5cff"], 0.8),
    envelope: flame([[0, 0.9], [0.45, 1.1], [0.95, 2.2], [1.15, 3.6], [1, 5.4], [0.55, 7], [0, 8.4]], ["#ff9a3a", "#ff7a1e", "#ff5a14", "#e8461a"], 0.5),
    diamond: flame([[0, -0.2], [0.2, 0], [0, 0.2]], ["#ffffff"]),
    throatHot: noShadow(forwardLathe(lathe({ profile: [[0.8, 0], [0, 0]], segments: 24, color: "#ff5a1e", emissive: 1 }))),
    throatBlue: noShadow(forwardLathe(lathe({ profile: [[0.8, 0], [0, 0]], segments: 24, color: "#cfe6ff", emissive: 1 }))),
    haze: Object.assign(noShadow(turnedX(torus(0.9, 0.05, "#ffe6cc", 0.05, 24, 5), Math.PI / 2)), { glass: 0.05 })
  }));
  // The blast's pieces, each the scene pools: puffy fireballs in three heats, smoke in two greys, the shockwave's ring
  // on the floor and its shell, and the bits of iron it throws.
  const puff = (color, emissive) => Object.assign(noShadow(ball(1, color, emissive)), { smooth: true });
  const blast = cached(() => ({
    fire: [puff("#ffd34a", 1), puff("#ff8a1e", 1), puff("#d63a16", 1)],
    smoke: [puff("#5d5852", 0.04), puff("#36322f", 0.02)],
    ring: Object.assign(noShadow(torus(1, 0.035, "#eaf4ff", 0.8, 48, 5)), { glass: 0.3 }),
    shell: Object.assign(puff("#ffffff", 0.6), { glass: 0.12 }),
    iron: models.particleGeometry("#5a6068", 0.11, 0), spark: models.particleGeometry("#ffd36a", 0.08, 1)
  }));

  // The booth's pictures, painted once each (`firePicture(key)`): the screen in each state of the test (`FIRE_SCREENS`),
  // the countdown's box at each second (`timer:<n>`), the scope calm and wild (`scope:0`, `scope:1`), the header, the
  // DO NOT PRESS plate, the cabinet's WARNING sign, the JET V2 badge and the hazard stripes of a size (`stripes:<w>:<h>`,
  // metres).
  const FIRE_FONT = 'Impact, "Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const FIRE_SCREENS = {
    ready: { ink: "#3dff8a", bg: "#03140a", icon: "ok", lines: ["STATUS", "READY", "ENGINES COLD"] },
    armed: { ink: "#ff3b30", bg: "#170303", icon: "warn", lines: ["ENGINE TEST", "SEQUENCE", "ARMED"] },
    spool: { ink: "#ffb02e", bg: "#160c02", icon: "warn", lines: ["TURBINE", "SPOOL-UP", "STAND CLEAR"] },
    fire: { ink: "#ff8a2e", bg: "#170802", icon: "warn", lines: ["STATIC FIRE", "FULL THRUST", "HOLD ON"] },
    warning: { ink: "#ff3b30", bg: "#1c0303", icon: "warn", lines: ["WARNING", "COMBUSTION", "UNSTABLE"] },
    boom: { ink: "#ff3b30", bg: "#0a0101", icon: "boom", lines: ["SYSTEM", "ERROR", "!!!"] },
    result: { ink: "#ffd23a", bg: "#141004" },
    // While the booth stands ready it turns through these with the ready screen (`IDLE` in `hangar-fire.js`).
    checks: { ink: "#3dff8a", bg: "#03140a", rows: [["FUEL", "12%", "#ffb02e"], ["IGNITERS", "OK", "#3dff8a"], ["TURBINES", "OK?", "#ffb02e"], ["FLIGHT MANUAL", "MISSING", "#ff3b30"], ["CHIEF ENGINEER", "FURIOUS", "#ff3b30"]] },
    days: { ink: "#ffb02e", bg: "#160c02" },
    rules: { ink: "#3dff8a", bg: "#03140a", lines: ["1. DO NOT PRESS", "THE RED BUTTON.", "2. SEE RULE 1."] }
  };
  // The size of each picture that is not a screen, metres.
  const FIRE_SIZES = { title: [1.54, 0.21], plate: [0.5, 0.15], sign: [1.0, 0.52], badge: [0.21, 0.23], scope: [0.44, 0.22] };
  // Sets the largest font up to `px` at which `text` fits `max` pixels wide.
  const fitText = (g, text, px, max, weight = "") => {
    g.font = `${weight}${px}px ${FIRE_FONT}`;
    while (g.measureText(text).width > max && px > 6) { px *= 0.94; g.font = `${weight}${px}px ${FIRE_FONT}`; }
    return px;
  };
  // A warning triangle centred at (x, y), `r` from its middle to a corner, with its "!".
  const triangle = (g, x, y, r, stroke, fill, mark) => {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r * 0.95, y + r * 0.62); g.lineTo(x - r * 0.95, y + r * 0.62); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineJoin = "round"; g.stroke(); }
    g.fillStyle = mark;
    g.fillRect(x - r * 0.09, y - r * 0.42, r * 0.18, r * 0.55);
    g.fillRect(x - r * 0.09, y + r * 0.22, r * 0.18, r * 0.17);
  };
  // The Jet's two engines in wireframe, at (x, y), `s` the height of each.
  const engines = (g, x, y, s) => {
    for (const dx of [-0.42, 0.42]) {
      const cx = x + dx * s, rx = s * 0.36, ry = s * 0.5;
      for (const k of [1, 0.7, 0.32]) { g.beginPath(); g.ellipse(cx, y, rx * k, ry * k, 0, 0, TAU); g.stroke(); }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * rx * 0.32, y + Math.sin(a) * ry * 0.32); g.lineTo(cx + Math.cos(a + 0.35) * rx * 0.7, y + Math.sin(a + 0.35) * ry * 0.7); g.stroke();
      }
      g.beginPath(); g.ellipse(cx - s * 0.3, y - s * 0.16, rx * 0.8, ry * 0.8, 0, Math.PI * 0.55, Math.PI * 1.55); g.stroke();
      g.beginPath(); g.moveTo(cx, y - ry); g.lineTo(cx - s * 0.3, y - s * 0.16 - ry * 0.8); g.moveTo(cx, y + ry); g.lineTo(cx - s * 0.3, y - s * 0.16 + ry * 0.8); g.stroke();
    }
  };
  // The screen's frame, scanlines and the strips along its foot, shared by every state.
  const screenFrame = (g, W, H, S) => {
    g.fillStyle = S.bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = S.ink; g.lineWidth = H * 0.012; g.globalAlpha = 0.85;
    g.strokeRect(W * 0.025, H * 0.05, W * 0.95, H * 0.9);
    g.globalAlpha = 0.6;
    for (let i = 0; i < 6; i++) g.fillRect(W * (0.05 + i * 0.03), H * 0.08, W * 0.02, H * 0.012);
    g.fillStyle = S.ink;
    for (let i = 0; i < 9; i++) {
      g.beginPath(); const x = W * (0.05 + i * 0.03);
      g.moveTo(x, H * 0.9); g.lineTo(x + W * 0.018, H * 0.9); g.lineTo(x + W * 0.032, H * 0.82); g.lineTo(x + W * 0.014, H * 0.82); g.closePath(); g.fill();
    }
    for (let i = 0; i < 10; i++) g.fillRect(W * (0.4 + i * 0.022), H * (0.84 + (i % 3) * 0.018), W * 0.014, H * 0.03);
    g.globalAlpha = 1;
  };
  const scanlines = (g, W, H) => {
    g.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
  };
  const paintScreen = (g, W, H, key) => {
    const S = FIRE_SCREENS[key];
    screenFrame(g, W, H, S);
    g.shadowColor = S.ink; g.shadowBlur = H * 0.018;
    g.textAlign = "center"; g.textBaseline = "middle";
    if (key === "checks") {
      // The pre-fire checklist, each check's state in its own colour along dotted leaders.
      g.fillStyle = S.ink;
      fitText(g, "PRE-FIRE CHECKS", H * 0.11, W * 0.6, "bold ");
      g.fillText("PRE-FIRE CHECKS", W / 2, H * 0.19);
      g.textAlign = "left";
      S.rows.forEach(([name, state, ink], i) => {
        const y = H * (0.32 + i * 0.105);
        g.fillStyle = S.ink; fitText(g, name, H * 0.075, W * 0.4); g.fillText(name, W * 0.09, y);
        g.globalAlpha = 0.5;
        for (let x = W * 0.5; x < W * 0.68; x += W * 0.025) g.fillRect(x, y + H * 0.01, W * 0.008, H * 0.012);
        g.globalAlpha = 1;
        g.fillStyle = ink; g.shadowColor = ink; fitText(g, state, H * 0.075, W * 0.2, "bold "); g.fillText(state, W * 0.7, y);
        g.shadowColor = S.ink;
      });
    } else if (key === "days") {
      // The days since the last explosion, which never get past nought.
      g.fillStyle = S.ink;
      fitText(g, "DAYS SINCE LAST", H * 0.1, W * 0.62, "bold ");
      g.fillText("DAYS SINCE LAST", W / 2, H * 0.2);
      fitText(g, "ENGINE EXPLOSION", H * 0.1, W * 0.62, "bold ");
      g.fillText("ENGINE EXPLOSION", W / 2, H * 0.31);
      g.fillStyle = "#ff3b30"; g.shadowColor = "#ff3b30"; g.shadowBlur = H * 0.04;
      fitText(g, "0", H * 0.42, W * 0.3, "bold ");
      g.fillText("0", W / 2, H * 0.58);
      g.fillStyle = S.ink; g.shadowColor = S.ink; g.shadowBlur = H * 0.018;
      fitText(g, "RECORD: 0", H * 0.065, W * 0.3);
      g.fillText("RECORD: 0", W / 2, H * 0.79);
    } else if (key === "rules") {
      // The safety briefing, all of it.
      g.fillStyle = S.ink;
      fitText(g, "SAFETY BRIEFING", H * 0.11, W * 0.6, "bold ");
      g.fillText("SAFETY BRIEFING", W / 2, H * 0.2);
      triangle(g, W * 0.17, H * 0.52, H * 0.2, S.ink, null, S.ink);
      g.textAlign = "left";
      S.lines.forEach((line, i) => {
        fitText(g, line, H * 0.095, W * 0.62, "bold ");
        g.fillText(line, W * 0.3, H * (0.4 + i * 0.14));
      });
    } else if (key === "result") {
      g.fillStyle = S.ink;
      fitText(g, "TEST RESULT:", H * 0.13, W * 0.6);
      g.fillText("TEST RESULT:", W / 2, H * 0.24);
      fitText(g, "FAILED SUCCESSFULLY", H * 0.2, W * 0.88);
      g.fillText("FAILED SUCCESSFULLY", W / 2, H * 0.45);
      g.fillRect(W * 0.2, H * 0.58, W * 0.6, H * 0.008);
      g.fillStyle = "#ffe9a6";
      fitText(g, "LIGHTNING JET V2 — STILL UNDER CONSTRUCTION", H * 0.085, W * 0.86);
      g.fillText("LIGHTNING JET V2 — STILL UNDER CONSTRUCTION", W / 2, H * 0.7);
    } else {
      g.strokeStyle = S.ink; g.fillStyle = S.ink; g.lineWidth = H * 0.008;
      engines(g, W * 0.19, H * 0.44, H * 0.42);
      g.lineWidth = H * 0.035;
      if (S.icon === "ok") {
        g.beginPath(); g.arc(W * 0.5, H * 0.44, H * 0.22, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(W * 0.5 - H * 0.11, H * 0.45); g.lineTo(W * 0.5 - H * 0.02, H * 0.54); g.lineTo(W * 0.5 + H * 0.13, H * 0.34); g.stroke();
      } else if (S.icon === "boom") {
        g.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = H * (i % 2 ? 0.13 : 0.27); g[i ? "lineTo" : "moveTo"](W * 0.5 + Math.cos(a) * r, H * 0.44 + Math.sin(a) * r); }
        g.closePath(); g.stroke();
      } else triangle(g, W * 0.5, H * 0.46, H * 0.28, S.ink, null, S.ink);
      S.lines.forEach((line, i) => {
        fitText(g, line, H * 0.1, W * 0.28);
        g.fillText(line, W * 0.81, H * (0.2 + i * 0.105));
      });
      // The countdown's box; while the test runs its figures lie over it (`timer:<n>`), and at rest it reads blank.
      g.lineWidth = H * 0.012;
      g.strokeRect(W * 0.69, H * 0.5, W * 0.24, H * 0.28);
      if (key === "ready" || key === "boom") {
        fitText(g, "--:--", H * 0.2, W * 0.2);
        g.fillText("--:--", W * 0.81, H * 0.645);
      }
    }
    g.shadowBlur = 0;
    scanlines(g, W, H);
  };
  const paintPicture = (g, W, H, key) => {
    const [kind, a, b] = key.split(":");
    g.textAlign = "center"; g.textBaseline = "middle";
    if (FIRE_SCREENS[kind]) return paintScreen(g, W, H, kind);
    if (kind === "timer") {
      g.fillStyle = "#170303"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#ff3b30"; g.lineWidth = H * 0.04; g.strokeRect(H * 0.02, H * 0.02, W - H * 0.04, H - H * 0.04);
      g.fillStyle = "#ff3b30"; g.shadowColor = "#ff3b30"; g.shadowBlur = H * 0.08;
      const text = `00:${String(a).padStart(2, "0")}`;
      fitText(g, text, H * 0.72, W * 0.84);
      g.fillText(text, W / 2, H * 0.54);
      g.shadowBlur = 0;
      return scanlines(g, W, H);
    }
    if (kind === "title") {
      g.fillStyle = "#0e1114"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ffd23a";
      fitText(g, "ENGINE STATIC FIRE TEST", H * 0.78, W * 0.94);
      return g.fillText("ENGINE STATIC FIRE TEST", W / 2, H * 0.55);
    }
    if (kind === "plate") {
      g.fillStyle = "#a8141a"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#ff6a6a"; g.lineWidth = H * 0.07; g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
      g.fillStyle = "#ffffff"; g.shadowColor = "#ff8080"; g.shadowBlur = H * 0.1;
      fitText(g, "DO NOT PRESS", H * 0.62, W * 0.84);
      g.fillText("DO NOT PRESS", W / 2, H * 0.55);
      return void (g.shadowBlur = 0);
    }
    if (kind === "sign") {
      g.fillStyle = "#d9a21c"; g.fillRect(0, 0, W, H);
      g.strokeStyle = INK; g.lineWidth = H * 0.05; g.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1);
      triangle(g, W * 0.17, H * 0.47, H * 0.27, null, INK, "#d9a21c");
      g.fillStyle = INK; g.textAlign = "left";
      fitText(g, "WARNING", H * 0.34, W * 0.6);
      g.fillText("WARNING", W * 0.32, H * 0.3);
      fitText(g, "STATIC FIRE TEST", H * 0.19, W * 0.6);
      g.fillText("STATIC FIRE TEST", W * 0.32, H * 0.58);
      fitText(g, "AUTHORIZED PERSONNEL ONLY", H * 0.12, W * 0.6);
      return g.fillText("AUTHORIZED PERSONNEL ONLY", W * 0.32, H * 0.8);
    }
    if (kind === "badge") {
      g.fillStyle = "#1b2029"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#e8ecf2";
      fitText(g, "JET V2", H * 0.3, W * 0.86);
      g.fillText("JET V2", W / 2, H * 0.26);
      // The Jet seen from above, small: fuselage, swept wings and the tail.
      const x = W / 2, y = H * 0.68, s = W * 0.4;
      g.beginPath();
      g.moveTo(x + s, y); g.lineTo(x + s * 0.2, y - s * 0.12); g.lineTo(x - s * 0.15, y - s * 0.6); g.lineTo(x - s * 0.3, y - s * 0.6);
      g.lineTo(x - s * 0.2, y - s * 0.1); g.lineTo(x - s * 0.75, y - s * 0.08); g.lineTo(x - s * 0.95, y - s * 0.35); g.lineTo(x - s * 1, y - s * 0.32);
      g.lineTo(x - s * 0.9, y); g.lineTo(x - s * 1, y + s * 0.32); g.lineTo(x - s * 0.95, y + s * 0.35); g.lineTo(x - s * 0.75, y + s * 0.08);
      g.lineTo(x - s * 0.2, y + s * 0.1); g.lineTo(x - s * 0.3, y + s * 0.6); g.lineTo(x - s * 0.15, y + s * 0.6); g.lineTo(x + s * 0.2, y + s * 0.12);
      return g.fill();
    }
    if (kind === "scope") {
      g.fillStyle = "#0b0d08"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,160,40,0.22)"; g.lineWidth = 1;
      for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(W * i / 8, 0); g.lineTo(W * i / 8, H); g.stroke(); }
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke(); }
      g.strokeStyle = "#ffb02e"; g.shadowColor = "#ffb02e"; g.shadowBlur = H * 0.08; g.lineWidth = H * 0.035;
      const rand = mulberry32(a === "1" ? 77 : 33);
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, wild = a === "1" ? (rand() - 0.5) * 0.7 + Math.sin(t * 40) * 0.2 : 0;
        g[i ? "lineTo" : "moveTo"](W * t, H * (0.5 - (Math.sin(t * TAU * 2) * 0.22 + wild) * (a === "1" ? 1 : 0.8)));
      }
      g.stroke();
      return void (g.shadowBlur = 0);
    }
    if (kind === "stripes") {
      g.fillStyle = PAINT; g.fillRect(0, 0, W, H);
      g.fillStyle = INK;
      const band = Math.round(0.06 * W / Number(a));
      for (let x = -H; x < W + H; x += band * 2) {
        g.beginPath(); g.moveTo(x, H); g.lineTo(x + band, H); g.lineTo(x + band + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill();
      }
      return;
    }
    throw new Error(`no fire picture ${key}`);
  };
  const firePictures = new Map(), FIRE_PX = 420;
  const firePicture = (key) => {
    let geo = firePictures.get(key);
    if (geo) return geo;
    const [kind, a, b] = key.split(":");
    const [w, h] = FIRE_SCREENS[kind] ? [FIRE.screen[3], FIRE.screen[4]] : kind === "timer" ? [FIRE.timer[2], FIRE.timer[3]] : kind === "stripes" ? [Number(a), Number(b)] : FIRE_SIZES[kind];
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * FIRE_PX); canvas.height = Math.round(h * FIRE_PX);
    paintPicture(canvas.getContext("2d"), canvas.width, canvas.height, key);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const lit = FIRE_SCREENS[kind] || kind === "timer" || kind === "scope" ? 0.45 : kind === "plate" ? 0.6 : 0.05;
    geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], bright: lit };
    firePictures.set(key, geo);
    return geo;
  };

  // ---- the film show ------------------------------------------------------------------------------------------------

  // The old projector the terminals run, a cinema's in the hangar's colours, aimed at the screen's picture. Its cradle in
  // the hangar's frame (`cradle`): a timber deck hung on four rods from the roof's rib over it, railed all round, the
  // pedestal on it and two film cans beside. The head in its own frame, its pivot on the pedestal's top at the origin
  // and its lens toward -z (`head`): the enamelled body on its base plate with chrome trim and the operator's door, a
  // chimney off its lamp, the lens barrel in front with its focus knob, the reels' arms, and the film running down from
  // the feed reel into the gate and up out of it to the take-up; its glow (`glow`): the lamp's vents down both sides,
  // the lens's glass and the pilot lamp; and one reel, built about x, which the head carries at `REELS` (y, z) and the
  // show turns. `at` and `turn` stand the head on the pedestal turned and tipped toward the picture's middle, and `lens`
  // is where the light leaves it, in the hangar's frame. All of it is `size` times its own measures, so it reads across
  // the hall; the head's node carries that as its scale.
  const PROJECTOR = { size: 1.8, pivot: 0.62, lens: [0, 0.3, -0.69], reels: [[0.9, -0.2], [0.9, 0.44]], reel: 0.3 };
  const FILM = { body: "#2f3d38", trim: "#c9ced4", lamp: "#ffb347", glass: "#fff1c8", reel: "#aeb4ba", film: "#3a2a1c", cloth: "#e9e4d8" };
  const projector = cached(() => {
    const P = PROJECTOR, S = P.size, [px, py, pz] = LAYOUT.show.projector, roof = LAYOUT.roofY, cradle = [], head = [], glow = [];
    // The cradle: the deck, the iron under it, the rods up to the roof, the rail and the pedestal.
    const ex = 0.74 * S, ez = 0.68 * S;
    cradle.push(bevelBox({ w: 1.6 * S, h: 0.12, d: 1.5 * S, color: TIMBER, bevel: 0.03, offset: { x: px, y: py - 0.06, z: pz } }));
    for (const dz of [-0.6, 0.6]) cradle.push(box({ w: 1.7 * S, h: 0.1, d: 0.12, color: IRON_DK, offset: { x: px, y: py - 0.17, z: pz + dz * S } }));
    for (const dx of [-ex, ex]) for (const dz of [-ez, ez]) {
      cradle.push(box({ w: 0.07, h: roof - py, d: 0.07, color: IRON_DK, offset: { x: px + dx, y: (roof + py) / 2, z: pz + dz } }));
    }
    for (const [ax, az, bx, bz] of [[-ex, -ez, ex, -ez], [ex, -ez, ex, ez], [ex, ez, -ex, ez], [-ex, ez, -ex, -ez]]) {
      cradle.push(beam(px + ax, py + 0.55 * S, pz + az, px + bx, py + 0.55 * S, pz + bz, 0.06, IRON));
    }
    const pv = P.pivot * S;
    cradle.push(moved(lathe({ profile: [[0, 0], [0.18 * S, 0], [0.18 * S, 0.04 * S], [0.06 * S, 0.06 * S], [0.06 * S, pv - 0.04 * S], [0.09 * S, pv - 0.02 * S], [0.09 * S, pv], [0, pv]], segments: 12, color: IRON_DK }), px, py, pz + 0.05 * S));
    for (const [k, h] of [[0, 0], [1, 0.05]]) cradle.push(moved(lathe({ profile: [[0, 0], [0.19 * S, 0], [0.19 * S, 0.045 * S], [0, 0.045 * S]], segments: 14, color: k ? "#8d949c" : "#6e757d" }), px + 0.48 * S, py + h * S, pz + 0.42 * S));
    // The head: the base plate, the body with its trim, door and knob, and the chimney off the lamp.
    head.push(box({ w: 0.44, h: 0.05, d: 1.0, color: IRON_DK, offset: { y: 0.025, z: 0.08 } }));
    head.push(bevelBox({ w: 0.36, h: 0.5, d: 0.94, color: FILM.body, bevel: 0.03, offset: { y: 0.3, z: 0.09 } }));
    for (const sx of [-1, 1]) head.push(box({ w: 0.01, h: 0.03, d: 0.9, color: FILM.trim, offset: { x: sx * 0.182, y: 0.09, z: 0.09 } }));
    head.push(box({ w: 0.012, h: 0.32, d: 0.36, color: "#3a4a44", offset: { x: 0.184, y: 0.32, z: -0.12 } }), box({ w: 0.03, h: 0.04, d: 0.04, color: FILM.trim, offset: { x: 0.2, y: 0.32, z: -0.26 } }));
    head.push(moved(lathe({ profile: [[0, 0], [0.05, 0], [0.05, 0.22], [0.075, 0.22], [0.075, 0.25], [0, 0.25]], segments: 10, color: IRON_DK }), 0.11, 0.55, 0.36));
    // The lens barrel, its rims and its focus knob.
    head.push(moved(forwardLathe(lathe({ profile: [[0, 0], [0.078, 0], [0.078, -0.04], [0.07, -0.05], [0.07, -0.24], [0.084, -0.25], [0.084, -0.31], [0, -0.31]], segments: 14, color: FILM.trim })), 0, P.lens[1], -0.38));
    head.push(moved(turnedZ(lathe({ profile: [[0, 0], [0.025, 0], [0.025, 0.05], [0, 0.05]], segments: 8, color: IRON_DK }), -Math.PI / 2), 0.07, P.lens[1], -0.52));
    // The reels' arms, the spindles and the film's path through the gate.
    for (const [ry, rz] of P.reels) {
      head.push(beam(-0.07, 0.54, rz, -0.07, ry, rz, 0.045, IRON_DK));
      head.push(moved(turnedZ(lathe({ profile: [[0, 0], [0.025, 0], [0.025, 0.1], [0, 0.1]], segments: 8, color: FILM.trim }), -Math.PI / 2), -0.08, ry, rz));
    }
    head.push(beam(0, P.reels[0][0] - 0.2, P.reels[0][1] - 0.13, 0, 0.55, -0.3, 0.012, FILM.film), beam(0, 0.55, 0.3, 0, P.reels[1][0] - 0.2, P.reels[1][1] - 0.1, 0.012, FILM.film));
    // The glow: four vents down each side, the lens's glass and the pilot lamp.
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) glow.push(box({ w: 0.01, h: 0.024, d: 0.26, color: FILM.lamp, emissive: 1, offset: { x: sx * 0.182, y: 0.2 + k * 0.07, z: 0.38 } }));
    glow.push(moved(forwardLathe(lathe({ profile: [[0, 0], [0.064, 0], [0.064, -0.006], [0, -0.006]], segments: 14, color: FILM.glass, emissive: 1 })), 0, P.lens[1], P.lens[2]));
    glow.push(box({ w: 0.012, h: 0.03, d: 0.03, color: "#ff5a3a", emissive: 1, offset: { x: 0.19, y: 0.48, z: -0.3 } }));
    // One reel about x: its two flanges with dark windows, the film wound on its core and the hub.
    const reel = [], r = P.reel;
    for (const sx of [-1, 1]) {
      reel.push(moved(turnedZ(lathe({ profile: [[0, -0.005], [r, -0.005], [r, 0.005], [0, 0.005]], segments: 20, color: FILM.reel }), -Math.PI / 2), sx * 0.035, 0, 0));
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3;
        reel.push(moved(turnedX(box({ w: 0.008, h: 0.1, d: 0.11, color: "#16181b" }), a), sx * 0.041, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62));
      }
    }
    reel.push(turnedZ(lathe({ profile: [[0, -0.03], [r * 0.66, -0.03], [r * 0.66, 0.03], [0, 0.03]], segments: 18, color: FILM.film }), -Math.PI / 2));
    reel.push(turnedZ(lathe({ profile: [[0, -0.05], [0.04, -0.05], [0.04, 0.05], [0, 0.05]], segments: 10, color: FILM.trim }), -Math.PI / 2));
    // Turned toward the picture's middle and tipped down to it, from the pivot.
    const pic = filmScreen().picture, at = { x: px, y: py + pv, z: pz + 0.05 * S };
    const dx = pic.x - at.x, dy = pic.y - at.y - P.lens[1] * S, dz = pic.z - at.z, yaw = Math.atan2(-dx, -dz), tip = Math.atan2(dy, Math.hypot(dx, dz));
    const [lx, ly, lz] = P.lens.map((v) => v * S), cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tip), st = Math.sin(tip);
    const ty = ly * ct - lz * st, tz = ly * st + lz * ct;
    return {
      cradle: merge(...cradle), head: merge(...head), glow: noShadow(merge(...glow)), reel: merge(...reel), reels: P.reels, scale: S,
      at, turn: { x: tip, y: yaw, z: 0 }, lens: { x: at.x + lx * cy + tz * sy, y: at.y + ty, z: at.z - lx * sy + tz * cy }
    };
  });

  // The roll-down screen over the runway, facing the door: its roller in a case (`frame`, about the roller's middle),
  // which the show winds down from where it is stowed and back up, on two rods from the roof's rib over it (`rods`,
  // a metre long hanging from the rib, which the show stretches to the case, `roof` its height in the hangar's
  // frame); its cloth a metre long hanging from the origin, matte white with black bands down its sides, which the show
  // stands `under` the case's middle and stretches as it unrolls (`cloth`, from `top` when the case is down); and the
  // weighted batten along its foot with the pull ring, which goes down with it (`batten`). `picture` is where the film's
  // picture falls on the cloth unrolled, its middle a little in front of it, and its width and height.
  const filmScreen = cached(() => {
    const S = LAYOUT.show.screen, roof = LAYOUT.roofY, frame = [], rods = [], cloth = [], batten = [], w = S.w, under = 0.17;
    frame.push(moved(turnedZ(lathe({ profile: [[0, 0], [under, 0], [under, w + 0.5], [0, w + 0.5]], segments: 12, color: IRON_DK }), -Math.PI / 2), -w / 2 - 0.25, 0, 0));
    for (const sx of [-1, 1]) {
      frame.push(moved(turnedZ(lathe({ profile: [[0, 0], [0.2, 0], [0.2, 0.06], [0, 0.06]], segments: 12, color: FILM.trim }), -Math.PI / 2), sx * (w / 2 + 0.28) - 0.03, 0, 0));
      rods.push(box({ w: 0.05, h: 1, d: 0.05, color: IRON_DK, offset: { x: sx * (w / 2 - 0.1), y: -0.5 } }));
    }
    cloth.push(box({ w: w - 0.36, h: 1, d: 0.02, color: FILM.cloth, offset: { y: -0.5 } }));
    for (const sx of [-1, 1]) cloth.push(box({ w: 0.18, h: 1, d: 0.02, color: INK, offset: { x: sx * (w / 2 - 0.09), y: -0.5 } }));
    batten.push(box({ w: w + 0.12, h: 0.08, d: 0.08, color: IRON_DK, offset: { y: -0.04 } }));
    batten.push(box({ w: 0.012, h: 0.24, d: 0.012, color: "#c8b48a", offset: { y: -0.2, z: 0.05 } }), moved(turnedX(torus(0.045, 0.01, FILM.trim, 0, 12, 6), Math.PI / 2), 0, -0.36, 0.05));
    const top = S.y - under, ph = (w - 0.4) * 9 / 16;
    return { frame: merge(...frame), rods: merge(...rods), cloth: merge(...cloth), batten: merge(...batten), roof, under, top, picture: { x: S.x, y: top - S.drop / 2, z: S.z + 0.04, w: w - 0.4, h: ph } };
  });

  // The projector's beam, through the hall's dust from the lens to the picture's corners: a long frustum of glass, its
  // faces in lengths so the Canvas 2D renderer fades it too, brightest at the lens and fading toward the screen, built
  // along +x from `position` and turned by `rotation` onto the line to the picture's middle.
  const projectorBeam = cached(() => {
    const L = projector().lens, P = filmScreen().picture, dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z, len = Math.hypot(dx, dy, dz);
    const th = Math.asin(dy / len), ph = Math.atan2(-dz, dx), ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    const ax = [ct * cp, st, -ct * sp], ay = [-st * cp, ct, st * sp], az = [sp, 0, cp];
    const far = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const cx = P.x + u * P.w / 2 - L.x, cy = P.y + v * P.h / 2 - L.y, cz = P.z - 0.02 - L.z;
      return [cx * ax[0] + cy * ax[1] + cz * ax[2], cx * ay[0] + cy * ay[1] + cz * ay[2], cx * az[0] + cy * az[1] + cz * az[2]];
    });
    const g = models.geometry(), color = math.hexToRgb("#fff0c4"), lit = { emissive: 1 }, n = 8, rings = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, s = 0.012 + t * 0.988;
      rings.push(far.map(([x, y, z]) => models.pushVert(g, x * t, y * s, z * s)));
    }
    for (let k = 0; k < n; k++) for (let e = 0; e < 4; e++) models.face(g, [rings[k][e], rings[k + 1][e], rings[k + 1][(e + 1) % 4], rings[k][(e + 1) % 4]], color, lit);
    g.glass = 0.075;
    g.lightBeam = len * 1.6;
    return { geometry: noShadow(g), position: { x: L.x, y: L.y, z: L.z }, rotation: { x: 0, y: ph, z: th } };
  });

  // ---- the hangar's light, and the hangar through the Factory's door ----------------------------------------------

  // The hangar's fixed point lights, most important first, [x, y, z, radius, r, g, b] each: the door's shield in the
  // hall's cyan, a cool fill high over the whole hall, two cool rims on the Jet (from over the runway behind its nose and
  // from the right wall), the boards' blue, the tunnel's mouth (`TINTS.mouth`, which the scene flickers with the neon)
  // and the launch shield (`TINTS.launch`), and warm work light where people work: a pool at the static fire booth and
  // one over the crew's desks. The scene lights them and the crates' lanterns after them; the window into the hangar
  // bakes them all.
  const TINTS = { door: math.hexToRgb("#5fe3ff").map((k) => k / 255), mouth: [0.36, 0.66, 1.2], launch: [0.45, 0.72, 1] };
  const LANTERN_GLOW = [1.3, 0.8, 0.36];
  // The Jet's key light, the scene's spot: hung under the roof over the Jet's left flank and aimed down at it, a cone of
  // cool white on the Jet and the floor round it, as far as `reach` m, full inside `inner` radians of its axis and gone
  // by `outer`.
  const KEY = { at: [LAYOUT.jet.x - 9, 14.2, LAYOUT.jet.z], aim: [LAYOUT.jet.x, 2, LAYOUT.jet.z], reach: 45, outer: 0.96, inner: 0.61, color: [10, 10.5, 11.4] };
  const fixedLights = cached(() => {
    const L = LAYOUT, B = L.boards, D = L.door, T = L.tunnel;
    return [
      [D.x, D.y + 2.2, D.z - 2, 8, ...TINTS.door], [4, 16, -4, 46, 0.22, 0.3, 0.44],
      [L.jet.x - 11, 10, L.jet.z - 16, 20, 0.32, 0.5, 0.85], [HALL.x1 - 2, 10, L.jet.z + 4, 18, 0.28, 0.42, 0.78],
      [B.stats.x + 2.5, B.stats.y, B.stats.z, 9, 0.24, 0.42, 0.72], [B.timeline.x + 2.5, B.timeline.y, B.timeline.z, 10, 0.24, 0.42, 0.72],
      [0, T.y, HALL.back + 3, 16, ...TINTS.mouth], [0, T.y, T.z1 + 4, 14, ...TINTS.launch],
      [L.fireTest.x, 4.5, L.fireTest.z + 1.5, 9, 1, 0.62, 0.3], [-11.5, 7, -2, 22, 1, 0.66, 0.32]
    ];
  });

  // The hangar as the Factory's walkway sees it through the door's shield, for `hangar-window.js`, which pulls every
  // point of it along its own sight line into a band just behind the shield: so it is built at full size in the
  // hangar's frame and kept light. The hall's own shell (`shell`: its floor, walls, vault and light slots, but not the
  // front wall, which stands behind the eye); the landing, the runway and its lamps, the
  // tunnel's frames and every neon ring, the catwalks, the floor's fixtures, the boards on their mounts with their
  // faces, and the Jet at its dock; and past the tunnel's end space, deep blue with stars, the galaxy's haze and a ringed
  // planet. Every face glows with the hangar's light at rest baked into its colour (`FM.bakeWindow` under `MOOD`, with
  // every fixed light, the crates' lanterns and a point light where the Jet's key hangs, `KEY_BAKE` of its colour and
  // reach), so the Factory's own light never touches it, and veiled: its haze much nearer and thicker than the hall's
  // own and its light lower, so the door gives only a glimpse of it, and the walls stay dark so the hall's bloom picks
  // out its lights.
  const MOOD = {
    sky: [0.54, 0.38, 0.26], ground: [0.24, 0.16, 0.1], floor: 0.4, sun: [0.25, 0.9, 0.35], direct: [0.7, 0.52, 0.36], strength: 0.36, fill: [0.05, 0.04, 0.11],
    fog: [0.06, 0.078, 0.12], near: 6, far: 60, eye: [0, 3.3, 27], dim: 0.45, knee: 0.08, cap: 0.22
  };
  const KEY_BAKE = { color: 0.66, reach: 0.75 };
  const doorWindow = cached(() => {
    const L = LAYOUT, T = L.tunnel, rand = mulberry32(5151), parts = [], sh = shell();
    parts.push(sh.floor, sh.walls, sh.vault, sh.lattice, sh.slots);
    const run = runway(), tun = tunnel(), fix = fixtures();
    parts.push(landing(), run.flat, run.glow, tun.stone, tun.iron, catwalks(), wallLights().wall.flat, wallLights().wall.glow, wallLights().edge.flat, wallLights().edge.glow, controlRoom().flat, controlRoom().glow, ...sideRooms().flatMap((r) => [r.flat, r.glow]), loftWindows().flat, loftWindows().glow, loftWindows().still, fix.flat, fix.detail, fix.crateDetail, fix.glow, fix.lampGlow, fix.glass, dock());
    for (const z of tun.neonZ) parts.push(moved(merge(tun.neon), 0, 0, z));
    // The boards on their mounts, their glass and tiles, as they hang.
    const frames = boardFrames(), faces = { stats: statsFace(), timeline: timelineFace() };
    for (const [key, b] of Object.entries(L.boards)) {
      for (const g of [frames[key].flat, frames[key].glow, faces[key].flat, faces[key].glow]) {
        const c = merge(g), v = c.verts;
        for (let i = 0; i < v.length; i++) v[i] *= b.scale;
        parts.push(moved(turnedY(c, b.turn), b.x, b.y, b.z));
      }
    }
    parts.push(moved(merge(...JM.pieces(JM.STAGE)), L.jet.x, 0, L.jet.z));
    // Space past the shield: deep blue, stars, the band's haze and a ringed planet.
    const sz = T.z1 - 6;
    parts.push(box({ w: 34, h: 26, d: 0.2, color: "#070c2a", emissive: 1, offset: { y: T.y, z: sz } }));
    for (let i = 0; i < 18; i++) parts.push(box({ w: 2 + rand() * 3, h: 1 + rand() * 2, d: 0.05, color: rand() < 0.5 ? "#2a1a5a" : "#1a3a6a", emissive: 1, offset: { x: (rand() - 0.5) * 16, y: T.y + (rand() - 0.5) * 12, z: sz + 0.12 } }));
    for (let i = 0; i < 140; i++) {
      const k = 0.06 + rand() * 0.1;
      parts.push(box({ w: k, h: k, d: 0.04, color: rand() < 0.8 ? "#f4f6ff" : "#ffe6b0", emissive: 1, offset: { x: (rand() - 0.5) * 18, y: T.y + (rand() - 0.5) * 14, z: sz + 0.2 } }));
    }
    parts.push(moved(lathe({ profile: Array.from({ length: 9 }, (_, k) => [Math.sin(k / 8 * Math.PI) * 1.4, -Math.cos(k / 8 * Math.PI) * 1.4]), segments: 14, color: "#e8b070", emissive: 1 }), -2.6, T.y + 2.4, sz + 1.5));
    parts.push(moved(turnedZ(turnedX(torus(2.3, 0.12, "#c8a878", 1, 24, 4), 1.25), 0.35), -2.6, T.y + 2.4, sz + 1.5));
    const geo = merge(...parts);
    geo.lines = [];
    delete geo.voxel;
    const lit = [...fixedLights(), [...KEY.at, KEY.reach * KEY_BAKE.reach, ...KEY.color.map((k) => k * KEY_BAKE.color)]];
    for (let i = 0; i < fix.lights.length; i += 4) lit.push([fix.lights[i], fix.lights[i + 1], fix.lights[i + 2], fix.lights[i + 3], ...LANTERN_GLOW]);
    return [FM.bakeWindow(geo, FM.windowLights(lit), [0, 0, 0], MOOD)];
  });

  // ---- the floor an Ooga walks ----------------------------------------------------------------------------------

  // Every surface with its height, as the Factory keeps its own: the floor, the landing, the catwalks and the dock's
  // decks as rects, the steps and the stairs as their treads, a rect each at its top (`flight`), the tops of the crates
  // and tool chests (`solid`), and the top of the Jet column by column (`jetModels.columns`); and what stands in the way
  // as boxes [x0, x1, z0, z1, from, to, top] between two heights of the feet (`top` 1 for a solid's), and the Jet's own
  // cells. `supportAt(x, z,
  // feet)` is the highest surface within a step of the feet, so a walker on a catwalk stands on it and one on the floor
  // walks under it.
  const STEP = 0.6;
  const FLOOR = cached(() => {
    const L = LAYOUT, rects = [], boxes = [], solids = [];
    const rect = (x0, x1, z0, z1, y) => rects.push(x0, x1, z0, z1, y);
    const deck = (d) => rect(d.x - d.w / 2 + 0.15, d.x + d.w / 2 - 0.15, d.z - d.d / 2 + 0.15, d.z + d.d / 2 - 0.15, d.y);
    deck(L.landing);
    // The door's threshold runs on in under its shield, so a walker keeps its footing until it crosses.
    const d = L.door;
    rect(d.x - d.half + 0.1, d.x + d.half - 0.1, L.landing.z, d.z + 1.2, d.y);
    for (const [x0, x1, z0, z1] of L.catwalks) rect(x0 + 0.15, x1 - 0.15, z0 + 0.15, z1 - 0.15, L.catwalkY);
    // The gangway, end to end, runs on to the fuselage's side.
    const g = L.gangway, gz0 = g.decks[0][0], gz1 = g.decks[g.decks.length - 1][1];
    rect(g.x - g.w / 2 + 0.15, g.x + g.w / 2, gz0 + 0.15, gz1 - 0.15, g.y);
    // Each flight's treads as `stairParts` draws them stepped (`stairTreads`), a rect a tread at its top and running
    // half a metre on, flat, past its head onto the deck it comes up to. The hangar's flights run along z or x, so each
    // tread is the rect round it.
    const flight = (ax, ay, az, bx, by, bz, w) => {
      const n = models.stairTreads(by - ay), len = Math.hypot(bx - ax, bz - az), px = -(bz - az) / len * w / 2, pz = (bx - ax) / len * w / 2;
      const tread = (t0, t1, y) => {
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        rect(Math.min(x0 - px, x0 + px, x1 - px, x1 + px), Math.max(x0 - px, x0 + px, x1 - px, x1 + px), Math.min(z0 - pz, z0 + pz, z1 - pz, z1 + pz), Math.max(z0 - pz, z0 + pz, z1 - pz, z1 + pz), y);
      };
      for (let i = 0; i < n; i++) tread(i / n, (i + 1) / n, ay + (by - ay) * (i + 1) / (n + 1));
      tread(1, 1 + 0.5 / len, by);
    };
    flight(...L.steps.slice(0, 6), L.steps[6] - 0.3);
    for (const st of L.catwalkStairs) flight(...st.slice(0, 6), st[6] - 0.2);
    flight(...L.jetStairs.slice(0, 6), L.jetStairs[6] - 0.2);
    const block = (x0, x1, z0, z1, from, to, top = 0) => boxes.push(x0, x1, z0, z1, from, to, top);
    const around = (x, z, hx, hz, to) => block(x - hx, x + hx, z - hz, z + hz, -1, to);
    // A box with a top to stand on, as high as the box, so whatever comes down on it lands on top rather than in it: its
    // top a surface under the middle of whoever stands on it, and also under any body it reaches into (`supportAt`'s
    // radius).
    const solid = (x, z, hx, hz, from, to) => {
      block(x - hx, x + hx, z - hz, z + hz, from, to, 1);
      rect(x - hx, x + hx, z - hz, z + hz, to);
      solids.push(x - hx, x + hx, z - hz, z + hz, to);
    };
    // A stair's handrails, both sides (as `stairParts` puts them), from the inner face of its posts outward, so a body
    // stops at the rail rather than in it (the flights are wide enough for the widest Ooga between them). Each in two
    // lengths: from its foot to where it rises over a walker's head, in the way of everyone there, on the stair or on
    // the floor beside its low end; and on up to its head, in the way of walkers on the stair alone, so one on the
    // floor walks under the rail where the stair is overhead. Two lengths, not many, so a walker along a rail never
    // meets a seam. The hangar's stairs all run along z or x, so each length is the box round it.
    const RAIL_HEAD = 1.8;
    const rails = (ax, ay, az, bx, by, bz, w) => {
      const len = Math.hypot(bx - ax, bz - az), px = -(bz - az) / len, pz = (bx - ax) / len, split = Math.min(1, Math.max(0, (RAIL_HEAD - ay) / (by - ay)));
      const length = (t0, t1, from, to) => {
        for (const s of [-1, 1]) {
          const x0 = ax + (bx - ax) * t0 + px * s * (w / 2 - 0.03), z0 = az + (bz - az) * t0 + pz * s * (w / 2 - 0.03);
          const x1 = ax + (bx - ax) * t1 + px * s * (w / 2 + 0.15), z1 = az + (bz - az) * t1 + pz * s * (w / 2 + 0.15);
          block(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), from, to);
        }
      };
      length(0, split, -1, RAIL_HEAD + 0.9);
      if (split < 1) length(split, 1, RAIL_HEAD - 1.2, by + 0.9);
    };
    rails(...L.steps);
    for (const st of L.catwalkStairs) rails(...st);
    rails(...L.jetStairs);
    // A deck's rails as `deckParts` stands them (`edges` of "nsew", each 0.1 in from its edge, with a gap where a stair
    // comes up through it, `cuts` in the deck's frame as `deckParts` takes them), in the way of walkers on the deck from
    // the rail's inner face out past the edge, so a body stops at a rail rather than in it; walkers below the deck pass.
    const deckRails = (cx, y, cz, w, d, edges, cuts = []) => {
      const hw = w / 2 - 0.1, hd = d / 2 - 0.1, from = y - 0.5, to = y + 1.1;
      for (const [edge, z, z0, z1] of [["n", cz - hd, cz - hd - 0.15, cz - hd + 0.1], ["s", cz + hd, cz + hd - 0.1, cz + hd + 0.15]]) {
        if (!edges.includes(edge)) continue;
        let spans = [[cx - hw, cx + hw]];
        for (const [kx, kz, half] of cuts) {
          if (Math.abs(cz + kz - z) > 0.6) continue;
          spans = spans.flatMap(([a, b]) => [[a, Math.min(b, cx + kx - half)], [Math.max(a, cx + kx + half), b]]).filter(([a, b]) => b - a > 0.12);
        }
        for (const [a, b] of spans) block(a, b, z0, z1, from, to);
      }
      if (edges.includes("w")) block(cx - hw - 0.15, cx - hw + 0.1, cz - hd, cz + hd, from, to);
      if (edges.includes("e")) block(cx + hw - 0.1, cx + hw + 0.15, cz - hd, cz + hd, from, to);
    };
    const l0 = L.landing;
    deckRails(l0.x, l0.y, l0.z, l0.w, l0.d, "new", [[L.steps[0] - l0.x, L.steps[5] - l0.z, L.steps[6] / 2 + 0.05]]);
    L.catwalks.forEach(([x0, x1, z0, z1], i) => {
      const [sx, , , , , sz1, sw] = L.catwalkStairs[i], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      deckRails(cx, L.catwalkY, cz, x1 - x0, z1 - z0, i ? "nsw" : "nse", [[sx - cx, sz1 - cz, sw / 2 + 0.05]]);
    });
    // The gangway: its first deck's end, its last deck's end round the stair, and the hall side end to end.
    g.decks.forEach(([z0, z1], i) => {
      const cz = (z0 + z1) / 2, edges = (i === 0 ? "n" : "") + (i === g.decks.length - 1 ? "s" : "");
      if (edges) deckRails(g.x, g.y, cz, g.w, z1 - z0, edges, [[L.jetStairs[0] - g.x, (z1 - z0) / 2, L.jetStairs[6] / 2 + 0.05]]);
    });
    deckRails(g.x, g.y, (gz0 + gz1) / 2, g.w, gz1 - gz0 + 0.2, "w");
    // Under the landing, beside its steps, and under the deep end of each stair, where no Ooga stands.
    const l = L.landing;
    block(l.x - l.w / 2, l.x + l.w / 2, l.z - l.d / 2 + 0.05, l.z + l.d / 2, -1, l.y - 0.4);
    for (const [sx, , sz0, , , sz1, w] of L.catwalkStairs) block(sx - w / 2, sx + w / 2, Math.min(sz0, sz1) + 3.6, Math.max(sz0, sz1), -1, 0.3);
    // The dock: the gangway's posts alone (as `dock` stands them, `deckPosts`), so a walker goes freely in under the
    // decks between them, its cross braces passing over the head but near the posts; and under its stair from two
    // metres up its foot to where it clears a walker's head (`HEADROOM` over the floor, the stair's own depth with it),
    // from the floor, low enough that the widest Ooga on the stair clears it, so a walker on the floor passes under its
    // high end. The Jet itself stands in the way by its cells (`jetIn`).
    for (const [z0, z1, posts] of g.decks) {
      if (!posts) continue;
      for (const [px, pz] of models.deckPosts(g.w, z1 - z0)) around(g.x + px, (z0 + z1) / 2 + pz, 0.2, 0.2, g.y - 0.6);
    }
    const [jx, , jz0, , jy1, jz1, jw] = L.jetStairs, HEADROOM = 2.3;
    block(jx - jw / 2, jx + jw / 2, jz0 + (jz1 - jz0) * Math.min(1, HEADROOM / jy1), jz0 - 2, -1, 0.3);
    for (const [x, z] of L.trestles) around(x, z, 1.05, 0.85, 3.2);
    // The test booth: its console, and the barrier's rails low enough to jump, each the box round its footprint turned
    // into the hangar (square to it, so each box is its footprint).
    const T = L.fireTest, tc = Math.cos(T.turn), ts = Math.sin(T.turn);
    for (const [fx0, fx1, fz0, fz1, top] of FIRE.blocks) {
      const xs = [], zs = [];
      for (const lx of [fx0, fx1]) for (const lz of [fz0, fz1]) { xs.push(T.x + lx * tc + lz * ts); zs.push(T.z - lx * ts + lz * tc); }
      block(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), -1, top);
    }
    // The gap behind each board, where a head would meet its lower edge.
    for (const b of Object.values(L.boards)) block(HALL.x0, b.x + 0.35, b.z - b.w * b.scale / 2, b.z + b.w * b.scale / 2, -1, 2.2);
    // The workstations, the terminals, the tool chests, the crates and the floor lamps; a desk or a crate turned on
    // the floor by the box round its turned footprint, so nothing sinks into a corner, a desk's in four lengths along it
    // so the boxes keep close to its edges.
    const turned = (hx, hz, turn) => {
      const c = Math.abs(Math.cos(turn)), sn = Math.abs(Math.sin(turn));
      return [hx * c + hz * sn, hx * sn + hz * c];
    };
    for (const [x, z, turn] of L.stations) {
      const [hx, hz] = turned(1.1 / 4, 0.5, turn), c = Math.cos(turn), sn = Math.sin(turn);
      for (let k = 0; k < 4; k++) {
        const u = (k - 1.5) * 0.55;
        around(x + u * c, z - u * sn, hx, hz, 1.3);
      }
    }
    for (const [x, z] of L.kiosks) around(x, z, 0.4, 0.4, 1.4);
    // A tool chest's worktop, and on its back half the top box up to its lid, to stand on.
    for (const [x, z, turn] of L.toolChests) {
      solid(x, z, 0.6, 0.6, -1, CHEST_TOPS[0]);
      const [hx, hz] = turned(0.5, 0.22, turn);
      solid(x - 0.07 * Math.sin(turn), z - 0.07 * Math.cos(turn), hx, hz, CHEST_TOPS[0], CHEST_TOPS[1]);
    }
    // A crate's top to stand on, and a stacked pair's: the smaller crate on top standing in the way from the floor up,
    // since the lower one's rim round it is too narrow to stand on.
    for (const [x, z, a, stacked] of L.crates) {
      const [hx, hz] = turned(0.55, 0.55, a);
      solid(x, z, hx, hz, -1, CRATE_TOPS[0]);
      if (stacked < 2) continue;
      const [ux, uz] = turned(0.45, 0.45, a + 0.3);
      solid(x + 0.05, z - 0.04, ux, uz, -1, CRATE_TOPS[1]);
    }
    for (const [x, z] of L.floorLamps) around(x, z, 0.3, 0.3, 0.4);
    // The crane's laydown stands, kept clear as high as a crate standing on one.
    for (const [x, z] of CRANE.stands) around(x, z, 0.85, 0.85, CRANE.standTop + CRANE.crate[1]);
    // The control room's front out from the left wall, its door and keypad with it, in the way at the catwalk's level.
    block(HALL.x0, CONTROL.front + 0.2, CONTROL.z0, CONTROL.z1, CONTROL.y0 - 0.3, CONTROL.y1 + 0.5);
    // The crew's rooms' fronts out from the right wall likewise.
    for (const z of SIDE_ROOMS.bays) block(HALL.x0 + HALL.x1 - CONTROL.front - 0.2, HALL.x1, z - SIDE_ROOMS.half, z + SIDE_ROOMS.half, CONTROL.y0 - 0.3, CONTROL.y1 + 0.5);
    // The ribs standing out of the side walls, plinths and all.
    const S = L.shell, reach = S.face + S.rib + 0.2, half = S.ribW / 2 + 0.2;
    for (const z of L.gantries) block(HALL.x0, HALL.x0 + reach, z - half, z + half, -1, HALL.h), block(HALL.x1 - reach, HALL.x1, z - half, z + half, -1, HALL.h);
    return { rects: new Float32Array(rects), boxes: new Float32Array(boxes), solids: new Float32Array(solids), jet: JM.columns() };
  });
  // How many of the Jet's columns a walker of `radius` at (x, z) with its feet at `feet` stands among: those reaching
  // within it whose cells rise more than a step above its feet and come down below its head (JET_HEAD up), so it walks
  // under a wing or the belly and up the fuselage's terraces, and onto whatever is no higher than a step.
  const JET_HEAD = 1.8, JET_FOOT = 0.25;
  const jetIn = (J, x, z, feet, radius) => {
    const lx = x - LAYOUT.jet.x, lz = z - LAYOUT.jet.z, U = J.U;
    const i0 = Math.max(0, Math.floor((lx - radius) / U) - J.i0), i1 = Math.min(J.ni - 1, Math.floor((lx + radius) / U) - J.i0);
    const k0 = Math.max(0, Math.floor((lz - radius) / U) - J.k0), k1 = Math.min(J.nk - 1, Math.floor((lz + radius) / U) - J.k0);
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      const cx0 = (i + J.i0) * U, dx = Math.max(cx0 - lx, 0, lx - cx0 - U);
      for (let k = k0; k <= k1; k++) {
        const c = i * J.nk + k, bottom = J.bottom[c];
        if (bottom < 0 || J.top[c] <= feet + STEP || bottom >= feet + JET_HEAD) continue;
        const cz0 = (k + J.k0) * U, dz = Math.max(cz0 - lz, 0, lz - cz0 - U);
        if (dx * dx + dz * dz < radius * radius) n++;
      }
    }
    return n;
  };
  // With a body's `radius`, a solid's top (`solid`) holds it up wherever the body reaches a foot's breadth over it
  // (SOLID_FOOT), so a body that comes down overlapping a crate or a chest stands on its edge rather than sinking into it,
  // and one that only grazes it drops beside it.
  const SOLID_FOOT = 0.25;
  const supportAt = (x, z, feet, radius = 0) => {
    const F = FLOOR(), reach = feet + STEP;
    let best = 0;
    const R = F.rects;
    for (let i = 0; i < R.length; i += 5) {
      const y = R[i + 4];
      if (y > best && y <= reach && x >= R[i] && x <= R[i + 1] && z >= R[i + 2] && z <= R[i + 3]) best = y;
    }
    if (radius > SOLID_FOOT) {
      const S = F.solids, holds = radius - SOLID_FOOT;
      for (let i = 0; i < S.length; i += 5) {
        const y = S[i + 4];
        if (y > best && y <= reach && Math.hypot(Math.max(S[i] - x, 0, x - S[i + 1]), Math.max(S[i + 2] - z, 0, z - S[i + 3])) < holds) best = y;
      }
    }
    // The Jet's top: the highest of its columns within a foot's breadth (JET_FOOT) of where it stands, so the edge of
    // a walker's body comes to rest on the fuselage's narrow terraces as it lands or steps down them.
    const J = F.jet, lx = x - LAYOUT.jet.x, lz = z - LAYOUT.jet.z, U = J.U;
    const i0 = Math.max(0, Math.floor((lx - JET_FOOT) / U) - J.i0), i1 = Math.min(J.ni - 1, Math.floor((lx + JET_FOOT) / U) - J.i0);
    const k0 = Math.max(0, Math.floor((lz - JET_FOOT) / U) - J.k0), k1 = Math.min(J.nk - 1, Math.floor((lz + JET_FOOT) / U) - J.k0);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const top = J.top[i * J.nk + k];
      if (top > best && top <= reach) best = top;
    }
    return best;
  };
  // Inside the hall, a step clear of its leaning walls; down the launch tunnel to the hold-short line; and through the
  // door's passage out to a little past its shield, so a walker crosses it on its feet. A movement may leave a box it
  // already overlaps, so long as it does not go in deeper, and the same among the Jet's columns: never among more of
  // them than it was, so a walker that ends up in the Jet (a jump, a fall) can always walk out. A box stands in the way
  // of feet from its foot up to below its top, so one standing on it walks across it; on foot (`step`), a solid's within a
  // step above the feet lets a foot's breadth of the body over it (SOLID_FOOT), as a step does, and then holds it up
  // (`supportAt`).
  const inside = (x, z, feet) => {
    const d = LAYOUT.door, t = LAYOUT.tunnel;
    if (Math.abs(x - d.x) < d.half - 0.3 && z > HALL.front - 2.4 && z < HALL.front + 1 && Math.abs(feet - d.y) < 0.8) return true;
    if (z <= HALL.back + 2.2) return z > t.holdShort && Math.abs(x) < t.r - 1.6;
    return x > HALL.x0 + 2.4 && x < HALL.x1 - 2.4 && z < HALL.front - 1.6;
  };
  const depthIn = (B, i, x, z, radius) => {
    const dx = Math.max(B[i] - x, 0, x - B[i + 1]), dz = Math.max(B[i + 2] - z, 0, z - B[i + 3]);
    return radius - Math.hypot(dx, dz);
  };
  const clearAt = (x, z, feet, radius, fromX = x, fromZ = z, step = true) => {
    if (!inside(x, z, feet)) return false;
    const B = FLOOR().boxes;
    for (let i = 0; i < B.length; i += 7) {
      if (feet < B[i + 4] || feet >= B[i + 5]) continue;
      const r = step && B[i + 6] && B[i + 5] <= feet + STEP ? radius - SOLID_FOOT : radius, now = depthIn(B, i, x, z, r);
      if (now <= 0) continue;
      if (depthIn(B, i, fromX, fromZ, r) <= 0 || now > depthIn(B, i, fromX, fromZ, r) + 1e-9) return false;
    }
    const J = FLOOR().jet, now = jetIn(J, x, z, feet, radius);
    if (now > 0) {
      const was = jetIn(J, fromX, fromZ, feet, radius);
      if (was === 0 || now > was) return false;
    }
    return true;
  };
  // A body of `radius` at `p` with its feet at `feet` pushed out sideways of any solid it has come to rest in (one not a
  // step up for it, which it may lean a foot's breadth into), the nearest way, where that is clear; whether it moved.
  // A foot's breadth over a step, or a body come down beside a crate's edge, never stays inside it.
  const pushOut = (p, feet, radius) => {
    const B = FLOOR().boxes;
    let moved = false;
    for (let i = 0; i < B.length; i += 7) {
      if (!B[i + 6] || feet < B[i + 4] || feet >= B[i + 5] || B[i + 5] <= feet + STEP) continue;
      const cx = Math.min(Math.max(p.x, B[i]), B[i + 1]), cz = Math.min(Math.max(p.z, B[i + 2]), B[i + 3]), d = Math.hypot(p.x - cx, p.z - cz);
      if (d <= 1e-6 || d >= radius) continue;
      const k = (radius - d + 1e-4) / d, nx = p.x + (p.x - cx) * k, nz = p.z + (p.z - cz) * k;
      if (!clearAt(nx, nz, feet, radius, p.x, p.z)) continue;
      p.x = nx; p.z = nz; moved = true;
    }
    return moved;
  };
  // Whether a walker of `radius` whose feet are at `feet` can step from (ax, az) to (bx, bz): clear all the way, and
  // never dropping more than a step, so the landing's and the catwalks' edges hold as their rails do.
  const walkable = (ax, az, bx, bz, feet, radius = 0.35) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
    for (let i = 1; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps, floor = supportAt(x, z, feet, radius);
      const px = ax + (bx - ax) * (i - 1) / steps, pz = az + (bz - az) * (i - 1) / steps;
      if (!clearAt(x, z, Math.max(feet, floor), radius, px, pz) || floor < feet - STEP) return false;
    }
    return true;
  };

  BL.hangarModels = {
    LAYOUT, STEP, TINTS, LANTERN_GLOW, shell, landing, doorBulkhead, GLOSS, glossRunway, wallLights, CONTROL, controlRoom, SIDE_ROOMS, sideRooms, LOFT, loftWindows, extinguisher, NOZZLE, CRANE, crane, laydown, craneSpot, runway, marker, floorLamp, tunnel, catwalks, fixtures, boardFrames, statsFace, timelineFace, JETS, jetStreaks, boardText, boardNote, paintBoard, dock, vest,
    fixedLights, KEY, doorWindow, FIRE, fireStation, fireCables, firePicture, exhaust, blast, KIOSK, DESK, projector, filmScreen, projectorBeam,
    hallGlimpse: cached(() => noShadow(merge(
      box({ w: 4.4, h: 4.6, d: 0.1, color: "#2a1a10", emissive: 0.55, offset: { y: 2.3, z: -3.25 } }),
      ...[-1.3, -0.4, 0.5, 1.4].map((x, i) => box({ w: 0.14, h: 0.18, d: 0.05, color: "#ffc86a", emissive: 1, offset: { x, y: 2.6 + (i % 2) * 0.7, z: -3.18 } }))
    ))),
    supportAt, clearAt, walkable, pushOut
  };
})();
