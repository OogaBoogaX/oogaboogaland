// The Lightning Factory's geometry: a tiered cavern behind the 2 o'clock mouth, the tunnel the hub dresses that
// mouth with, and the light stand-in of the hall the hub's window shows through its shield (`hubWindow`). Everything
// is cached and built once per page; the scene places nodes and animates them.
//
// `LAYOUT` is the one table of where everything stands, read by the scene as well, so the camera presets, the
// point lights, the gorillas' decks and the geometry cannot disagree. The cave's frame: the node core stands
// over the origin, +z runs out toward the entrance balcony and -z into the back wall, and the tiers step up
// from the pit (y 0) to the galleries under the vault. Levels are LEVEL.pit, low, main, high and top.
//
// Station pieces are built facing +z, the way a visitor on the balcony reads them, and turned into place by the
// scene. Where the scene animates a part (the core's chamber, a capacitor's glass, the rebalancer's ring, the
// lookout's beam, the treasury's pile and hopper, the carts, the cooker's jaw, porthole and gears) it is its own
// geometry, with a lit and a dim
// variant where it flashes, so a flash is a geometry swap and never a rebuild.
//
// The house style: timber and stone are chamfered `bevelBox`es; the machines are turned, lathes and tubes shaded
// smooth, with their signs (the bolt, the Bitcoin sign) cut as smooth solids. Labels are lit boards set in the
// system's sans (`label`), as the concept letters them.
(() => {
  "use strict";

  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { cached, box, bevelBox, lathe, tube, merge, noShadow, geometry, pushVert, face, makeVox, voxelGeometry, moved, turnedX, turnedY, turnedZ, prism, beam, forwardLathe, turn, shaded, torus, along, chain, railParts, columnParts, deckGrid, deckPosts, deckParts, stairParts, lanternParts, LANTERN_GLASS } = models;
  const { mulberry32, hexToRgb } = math;
  const TAU = Math.PI * 2;

  const STONE = ["#5b4a3e", "#524238", "#66544a", "#4a3d34"];
  const STONE_DK = "#3a2f28";
  const TIMBER = "#8a5a32";
  const TIMBER_LT = "#a8703e";
  const TIMBER_DK = "#5c3a1e";
  const IRON_DK = "#2c2e33";
  const IRON_LT = "#6f737a";
  const BRASS = "#c9962e";
  const GOLD = "#ffc83a";
  const CRYSTAL = "#4f9dff";
  const CYAN = "#5fe3ff";
  // Each line's two capacitors: blue lights on a settled forward, orange sputters on a failed one.
  const CAP_BLUE = { dim: ["#1a5fb8", "#2f96e8"], lit: ["#3fb4ff", "#9fe4ff"], halo: "#6fcaff" };
  const CAP_ORANGE = { dim: ["#b8440c", "#f2701a"], lit: ["#ff8420", "#ffc868"], halo: "#ffa040" };
  const BRONZE = "#a86a34";
  const BRONZE_DK = "#6e4222";
  const COPPER = "#c0703a";
  const COPPER_DK = "#7e4220";

  const LEVEL = { pit: 0, low: 2.5, main: 5, high: 10, top: 15.5 };
  // Rock outcrops on the left of the front of the pit: [x, z, size, tiers, tier height]. While the Lightning Jet Hangar is
  // open the one under the left walkway stands two shorter tiers, its top (about 4 m) under the walkway's frame, and the
  // one between the balcony and Kortik's Switchboard is taken away, leaving its crystal, so his board shows from the way in.
  const OUTCROPS = [[-11, 21, 1.3, 4, 1], [-16, 25, 1.6, 4, 1]], OUTCROPS_OPEN = [[-11, 21, 1.3, 0, 1], [-16, 25, 1.6, 2, 0.9]];
  // How far the front wall stands back over the left walkway while the hangar is open (`hall`).
  const HANGAR_SET_BACK = 3.4;
  const HALL = { halfW: 23, back: -22, front: 30, h: 26 };
  const WALL_LEAN = 3.5;
  const STATION_BACK = 0.8;
  // Kortik's Switchboard on its deck (LAYOUT.kortik): the patch wall stands along the deck's west edge, its face `face`
  // in from the edge and looking into the hall (+x), `wall` either side of the deck's middle. What stands in front of
  // it blocks the walkers, as [along the wall, out from it, radius]; along runs toward -z. Its lanterns hang from
  // `hooks` at the ends of the beam over its sign, [along, up, out]; the station's own two (the one on the bracket by
  // the board and the one on the floor by the cabinet) stand at `lanterns`, [along, foot, out, scale], and light the
  // deck from inside their glass.
  const KORTIK = {
    face: 0.55, wall: 2.8, seat: 0.8, hooks: [[-2.6, 5.05, 0.28], [2.6, 5.05, 0.28]], lanterns: [[-2.82, 1.638, 0.4, 0.55], [1.5, 0, 1.62, 0.62]],
    blocks: [[-2.45, 0.22, 0.4], [-1.75, 0.22, 0.4], [-1.05, 0.22, 0.4], [-0.35, 0.22, 0.4], [0.35, 0.22, 0.4], [1.05, 0.22, 0.4],
      [1.75, 0.22, 0.4], [2.45, 0.22, 0.4], [-2.5, 0.68, 0.38], [-1.85, 0.68, 0.38], [-1.2, 0.68, 0.38], [1.2, 0.68, 0.38],
      [1.85, 0.68, 0.38], [2.5, 0.68, 0.38], [0, 0.8, 0.42], [2.25, 1.5, 0.5], [1.5, 1.62, 0.25], [-2.5, 1.95, 0.45]]
  };
  // Where the glowing water runs down the back wall.
  const FALLS = [-17, -4.5, 4.5, 18];
  // Every standing place, in the cave's frame. A deck is its centre, top height, width (x) and depth (z).
  const LAYOUT = {
    LEVEL, HALL,
    core: { x: 0, z: -4, chamber: [6.4, 11.2], radius: 2.5 },
    // The balcony where the visitor comes in and first sees the hall, and the grand stairway from its front edge
    // down to the forge, as the concept draws it: [x, y, z] at its foot and at its head, and its width.
    entrance: { x: 0, y: LEVEL.main, z: 26, w: 5, d: 8 },
    stairway: [0, 0, 13, 0, LEVEL.main, 22, 3.4],
    ring: { x: 0, y: LEVEL.main, z: -4, inner: 3.6, outer: 6.6 },
    // Featured lines, lettered A to D: two on the main level either side of the core, two higher and further back.
    // Every deck leaves a walker's lane round its station on both sides. C and D stand theirs `STATION_BACK` behind
    // the deck's middle and `shift` toward the wall, with the porch out to the tunnel beside it; A and B stand theirs
    // in the middle (`back` 0) of a deeper deck, so there is a lane behind it to the porch at the back.
    bays: [
      { letter: "A", x: -11, y: LEVEL.high, z: -12.7, w: 9.4, d: 6.4, back: 0 },
      { letter: "B", x: 11, y: LEVEL.high, z: -12.7, w: 9.4, d: 6.4, back: 0 },
      { letter: "C", x: -12.4, y: LEVEL.main, z: -2, w: 8.8, d: 5, shift: -0.3 },
      { letter: "D", x: 12.4, y: LEVEL.main, z: -2, w: 8.8, d: 5, shift: 0.3 }
    ],
    // A peer tunnel behind each featured line, cut into the wall it stands against. `turn` faces it into the hall.
    tunnels: [
      { bay: 0, x: -11, y: LEVEL.high, z: -19.8, turn: 0 },
      { bay: 1, x: 11, y: LEVEL.high, z: -19.8, turn: 0 },
      { bay: 2, x: -20.8, y: LEVEL.main, z: -2, turn: Math.PI / 2 },
      { bay: 3, x: 20.8, y: LEVEL.main, z: -2, turn: -Math.PI / 2 }
    ],
    switchboard: { x: -12, y: LEVEL.low, z: 6, w: 7, d: 5 },
    // Kortik's Switchboard: a deck forward and to the left of the Routing Console's, at its height, reached by a stair
    // from the pit on its east side and a level bridge north onto the console's deck (both in `stairs`).
    kortik: { x: -16.9, y: LEVEL.low, z: 12.2, w: 7.2, d: 6 },
    // One platform along the right wall carries the node's money in a row toward the way out: the rebalancer, the
    // treasury and the banana cooker, each station facing +z. The platform is the deck; a station's entry is where
    // it stands, and its w and d size its gorilla's patch. The cooker stands far enough from the treasury, and the
    // treasury's cart beside its vault, for the widest Ooga to walk round the treasury's front to its operator.
    platform: { x: 13.4, y: LEVEL.low, z: 12.15, w: 8, d: 20.7 },
    rebalancer: { x: 14, y: LEVEL.low, z: 5, w: 8, d: 6.4 },
    treasury: { x: 14.1, y: LEVEL.low, z: 13.2, w: 8, d: 5 },
    cooker: { x: 13.75, y: LEVEL.low, z: 19.9, w: 8, d: 5 },
    // In front of the core's stone foot, whose face is at z 0.2 there.
    forge: { x: 0, z: 0.7 },
    // The rear landing leaves a full body clear of both the tower and the deck posts.
    lookout: { x: -16, y: LEVEL.top, z: -14, w: 6, d: 8, tower: 5.5 },
    lookoutDeck: { x: -16, y: LEVEL.top + 5.65, z: -14, w: 5, d: 5 },
    lookoutApproach: { x: -16, y: LEVEL.top, z: -10.8, w: 2, d: 1.5 },
    // Vertical climbing planes; normals point out from the upper landing.
    ladders: [
      { x: -10, z: 8.4, bottom: 0, top: LEVEL.low, nx: 0, nz: 1, width: 1.4, inset: 0.3 },
      { x: 9.5, z: 6.8, bottom: 0, top: LEVEL.low, nx: -1, nz: 0, width: 1.4, inset: 0.3 },
      { x: 9.5, z: 12, bottom: 0, top: LEVEL.low, nx: -1, nz: 0, width: 1.4, inset: 0.3 },
      { x: -17.2, z: -16, bottom: LEVEL.top, top: LEVEL.top + 5.65, nx: 0, nz: -1, width: 1.4, inset: 0.3 }
    ],
    study: { x: 21.4, y: LEVEL.main, z: 12, w: 4, d: 7 },
    // The donation kiosk, built into the right wall where the walkway from the balcony meets it, facing back along the
    // walkway (turned like the study hall, its +z out of the rock).
    kiosk: { x: 21.4, y: LEVEL.main, z: 24.7, turn: -Math.PI / 2 },
    // The donations board on the right wall between the study hall and the kiosk, over the walkway, facing into the hall
    // as they do, in a recess the hall leaves in its rock.
    board: { x: 21.4, y: LEVEL.main, z: 19.125, turn: -Math.PI / 2 },
    // Level 2, the balcony's level: the walkway from the balcony's right side round the right wall, past the study
    // hall, to the Harbor line's porch, as decks [x0, x1, z0, z1]; each line's porch out to its peer tunnel comes
    // from the line and the tunnel (`porchOf`).
    walk: [[2.5, 17.6, 23.7, 26.3], [17.6, 20.2, 0, 26.3]],
    // Level 2 on the left, while the Lightning Jet Hangar is open (`hangarEntry`): the walkway from the balcony's left
    // side straight along the front wall, over the lowered outcrop, to the landing before the hangar's door; decks
    // [x0, x1, z0, z1], as `walk`.
    walkLeft: [[-17, -2.5, 23.7, 26.3]],
    // The Lightning Jet Hangar's door: in the left wall at the walkway's end, at the balcony's level over the front of
    // the pit, forward of Kortik's station, facing back along the walkway as line C's tunnel faces into the hall. The
    // front wall is set back over the walkway (`HANGAR_SET_BACK`) so the arch and its banners stand clear of the rock.
    hangar: { x: -20.8, y: LEVEL.main, z: 25, turn: Math.PI / 2 },
    // The landing before the hangar's door, at the walkway's end: a deck as wide as the door's frame and its header,
    // so the walkway, narrower than the door, comes out onto deck either side of it, seen from the hall or through the
    // door from the hangar. Railed but where the walkway arrives and along the door, a lantern post at each outer corner
    // (`hangarLamps`), and dressed with the hangar's stripes and crates (`hangarLanding`).
    hangarLanding: { x: -18.6, y: LEVEL.main, z: 25, w: 3.2, d: 8.6 },
    // Every other flight of stairs, [x, y, z] at the bottom and at the top and its width, read by the scaffold that
    // builds them (cutting the rail wherever one lands) and by the floor an Ooga walks: pit to the
    // core's walkway, the main level to the high lines up the lines' inner sides, the high
    // lines to the landing in front of the first gallery, one flight from each, the pit up to the platform by the
    // cooker and up to Kortik's deck, and a level flight from his deck to the Routing Console's. An end on a deck's
    // edge stands on that edge's rail line and crosses it square, so its rails meet the ends of the deck's. The level
    // flight stands midway between his deck's east rail and the console deck's west one, wide enough to cut both decks'
    // rails to their corners, so the widest Ooga crosses clear of the rails either side.
    stairs: [
      [-4.8, 0, 7.5, -4.8, LEVEL.main, 1.3, 1.6], [4.8, 0, 7.5, 4.8, LEVEL.main, 1.3, 1.6],
      [-9.2, LEVEL.main, -4.4, -9.2, LEVEL.high, -9.6, 1.6], [9.2, LEVEL.main, -4.4, 9.2, LEVEL.high, -9.6, 1.6],
      [-6.4, LEVEL.high, -14.05, -0.8, LEVEL.top, -14.05, 1.6], [6.4, LEVEL.high, -14.05, 0.8, LEVEL.top, -14.05, 1.6],
      [5.6, 0, 20.4, 9.5, LEVEL.low, 20.4, 1.6],
      [-9.5, 0, 13.4, -13.4, LEVEL.low, 13.4, 1.6], [-14.4, LEVEL.low, 9.3, -14.4, LEVEL.low, 8.4, 1.8]
    ],
    // The landing the flights from A and B meet at, against the first gallery's front, and the bridges along the top:
    // the watchtower to the first gallery and the first gallery to the second, [x0, z0, x1, z1, width] edge to edge.
    landing: { x: 0, y: LEVEL.top, z: -13.95, w: 1.8, d: 1.7 },
    bridges: [[-13, -16, -11, -16, 1.8], [5, -16.4, 8, -16.4, 1.8]],
    // The galleries under the vault: a row of smaller stations for every line past the featured four.
    galleries: [
      { x: -3, y: LEVEL.top, z: -16.8, w: 16, d: 4, stations: 6 },
      { x: 13.5, y: LEVEL.top, z: -16, w: 11, d: 4, stations: 4 }
    ]
  };

  // The donation corner (the kiosk, its niche in the rock and the donations board) stands only where donations are real,
  // the page's Worker having bananapayserver's binding, or on a debug page, so a build merged before donations go live
  // shows the hall as it was. Decided once a page: the account's look answers before the first scene is built.
  let corner = null;
  const donationCorner = () => corner ?? (corner = !BL.donations || BL.donations.real
    || typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1");
  // The Lightning Jet Hangar's door, the left walkway to it and the lowered outcrop under that stand only while the
  // hangar's scene is registered (one still `wip` is not, unless the page opts in), so the hall stays as it was until
  // the hangar opens. Decided once a page, after the director has dropped the scenes still being built.
  let hangarOpen = null;
  const hangarEntry = () => hangarOpen ?? (hangarOpen = !!(BL.scenes && BL.scenes.hangar));
  const outcrops = () => hangarEntry() ? OUTCROPS_OPEN : OUTCROPS;
  // The highest tier of a lowered outcrop standing under (x, z), for a post to rest on; 0 off them, the pit floor.
  const outcropTop = (x, z) => {
    for (const [ox, oz, s, tiers, th] of outcrops()) {
      if (tiers === 4) continue;
      for (let k = tiers - 1; k >= 0; k--) {
        const w = (3.6 - k * 0.7) * s;
        if (Math.abs(x - ox) < w / 2 && Math.abs(z - oz) < w * 0.45) return (k + 1) * 1.4 * s * th;
      }
    }
    return 0;
  };

  // Where a line's station stands: its x, shifted from the deck's middle, and its z, `STATION_BACK` behind it.
  const stationX = (b) => b.x + (b.shift || 0);
  const stationZ = (b) => b.z - (b.back ?? STATION_BACK);

  // A line's porch out to its peer tunnel, [x0, x1, z0, z1] at the tunnel's level: from the line's outer edge to
  // the tunnel's face for the lines on the side walls, from the line's back edge for those at the back. It is
  // `PORCH_HALF` either side of the tunnel's middle, nearly the arch's width, so the widest Ooga walks up the middle
  // past the console box by the arch.
  const PORCH_HALF = 2;
  const porchOf = (t) => {
    const b = LAYOUT.bays[t.bay];
    if (t.turn === 0) return [t.x - PORCH_HALF, t.x + PORCH_HALF, t.z + 0.6, b.z - b.d / 2];
    const s = Math.sign(t.x), inner = b.x + s * b.w / 2, face = t.x - s * 0.5;
    return [Math.min(inner, face), Math.max(inner, face), t.z - PORCH_HALF, t.z + PORCH_HALF];
  };

  // A stair that lands at the core's walkway, and how far its landing runs on over the walkway's curve.
  const RING_LANDING = 2;
  // The bridges from the core's walkway out to lines C and D, [x, z] where each leaves the walkway and where it lands.
  const RING_BRIDGES = [[-6.6, -4, -8.5, -2.5], [6.6, -4, 8.5, -2.5]];
  const ringLanding = (x, y, z) => y === LAYOUT.ring.y && Math.hypot(x - LAYOUT.ring.x, z - LAYOUT.ring.z) < LAYOUT.ring.outer + 1;
  // A flat sign made of convex pieces, each extruded `depth` thick and wound counter-clockwise whatever order its
  // points came in, then leant by `lean` radians clockwise: `height` is the span of the unit pieces' -1..1.
  const solidGlyph = (pieces, height, depth, color, emissive, lean = 0) => {
    const k = height / 2, c = Math.cos(lean), sn = Math.sin(lean);
    return merge(...pieces.map((piece) => {
      const points = piece.map(([x, y]) => [(x * c + y * sn) * k, (-x * sn + y * c) * k]);
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      return prism(area < 0 ? points.reverse() : points, depth, color, emissive);
    }));
  };
  // A lightning bolt as smooth solid geometry rather than voxels: the classic zigzag, split into three convex
  // pieces (the upper slab, the step and the tip), `height` tall, centred on the origin and facing +z.
  const BOLT_PIECES = [
    [[0.1, 1], [0.6, 1], [0.2, 0.2], [-0.213, 0.2]],
    [[-0.35, -0.15], [0.331, -0.15], [0.55, 0.2], [-0.213, 0.2]],
    [[0, -0.15], [0.331, -0.15], [-0.2, -1]]
  ].map((piece) => piece.map(([x, y]) => [x - 0.125, y]));
  const smoothBolt = (height, depth, color, emissive = 1) => solidGlyph(BOLT_PIECES, height, depth, color, emissive);
  // The Bitcoin sign the same way: the stem, three bars, two bowls in segments and the four ticks, leant as the
  // logo leans.
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const bowl = (cx, cy, ro, ri, n) => Array.from({ length: n }, (_, k) => {
    const a0 = -Math.PI / 2 + Math.PI * k / n, a1 = -Math.PI / 2 + Math.PI * (k + 1) / n;
    return [[cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri], [cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro], [cx + Math.cos(a1) * ro, cy + Math.sin(a1) * ro], [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri]];
  });
  const BTC_PIECES = [
    rect(-0.55, -0.75, -0.3, 0.75), rect(-0.3, 0.5, 0.05, 0.75), rect(-0.3, -0.12, 0.1, 0.12), rect(-0.3, -0.75, 0.1, -0.5),
    ...bowl(0.05, 0.315, 0.435, 0.185, 9), ...bowl(0.1, -0.315, 0.435, 0.185, 9),
    rect(-0.45, 0.75, -0.3, 1), rect(-0.12, 0.75, 0.03, 1), rect(-0.45, -1, -0.3, -0.75), rect(-0.12, -1, 0.03, -0.75)
  ];
  const smoothBitcoin = (height, depth, color, emissive = 1) => solidGlyph(BTC_PIECES, height, depth, color, emissive, 0.24);
  // The network sign the concept puts on the blue tank: three nodes joined by two links.
  const NET_PIECES = (() => {
    const disc = (cx, cy, r) => Array.from({ length: 10 }, (_, k) => [cx + Math.cos(k / 10 * TAU) * r, cy + Math.sin(k / 10 * TAU) * r]);
    const link = (ax, ay, bx, by, w) => {
      const l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l * w, ny = (bx - ax) / l * w;
      return [[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]];
    };
    return [disc(0.42, 0.62, 0.27), disc(-0.45, 0, 0.27), disc(0.42, -0.62, 0.27), link(-0.45, 0, 0.42, 0.62, 0.07), link(-0.45, 0, 0.42, -0.62, 0.07)];
  })();
  const networkGlyph = (height, depth, color, emissive = 1) => solidGlyph(NET_PIECES, height, depth, color, emissive);

  // A banner of the concept's blue (or `cloth`) with the bolt on both faces, hung from a rod: `h` tall, the rod at
  // the origin, facing +z. Cached by height and cloth and shared, so a builder that places one moves a copy
  // (`merge`), never the banner.
  const bannerCache = BL.models.scopedMap();
  const banner = (h = 2, cloth = "#2b4fb0") => {
    const key = `${h}|${cloth}`;
    let geo = bannerCache.get(key);
    if (geo) return geo;
    geo = merge(
      bevelBox({ w: 1.25, h: 0.09, d: 0.09, color: TIMBER_DK, bevel: 0.02 }),
      box({ w: 1, h, d: 0.04, color: cloth, offset: { y: -h / 2 - 0.05 } }),
      prism([[-0.5, 0], [0, 0.3], [0, 0]].map(([x, y]) => [x, y - h - 0.35]), 0.04, cloth),
      prism([[0, 0.3], [0.5, 0], [0, 0]].map(([x, y]) => [x, y - h - 0.35]), 0.04, cloth),
      moved(smoothBolt(h * 0.5, 0.04, "#ffd23a", 0.9), 0, -h * 0.5, 0.04),
      turnedY(moved(smoothBolt(h * 0.5, 0.04, "#ffd23a", 0.9), 0, -h * 0.5, 0.04), Math.PI)
    );
    bannerCache.set(key, geo);
    return geo;
  };

  // ---- labels ---------------------------------------------------------------------------------------
  // A label as the concept draws them: a near-black board with a thin pale edge, the name in bold capitals and
  // what it does under it, set in the system's sans at a sign's size so it reads sharp from across the hall. The
  // lettering is a picture on the board's face (`imageSurface`), drawn unlit like a lit sign; `back` is the iron
  // board behind it. `height` is a two-line label's height in metres. Fixed labels are cached; a label whose
  // reading changes passes `keep: false`, and the scene releases what it replaces. Styles: plain and `gold` (the study
  // hall's sign, whose frame is its portal's).
  const LABEL_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const LABEL_STYLES = {
    plain: { board: "#0d0b0a", edge: "rgba(236,226,206,0.6)", title: "#f8f4ec", sub: "#d6cfc1", back: IRON_DK },
    gold: { board: "#1e140d", edge: "rgba(0,0,0,0)", title: "#fbe3a4", sub: "#e8c887", back: TIMBER_DK }
  };
  const labelCache = BL.models.scopedMap();
  const label = (title, sub = "", { height = 1.25, style = "plain", keep = true } = {}) => {
    const key = `${title}|${sub}|${height}|${style}`;
    let out = keep ? labelCache.get(key) : null;
    if (out) return out;
    const S = LABEL_STYLES[style], canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    const titleFont = `bold 50px ${LABEL_FONT}`, subFont = `37px ${LABEL_FONT}`, lines = title.split("\n");
    g.font = titleFont;
    let tw = 0;
    for (const line of lines) tw = Math.max(tw, g.measureText(line).width);
    g.font = subFont;
    const sw = sub ? g.measureText(sub).width : 0, w = Math.ceil(Math.max(tw, sw) + 56), h = (sub ? 124 : 80) + (lines.length - 1) * 44;
    canvas.width = w;
    canvas.height = h;
    g.fillStyle = S.board;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = S.edge;
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = S.title;
    g.font = titleFont;
    const titleY = sub ? 45 : h / 2 + 2 - (lines.length - 1) * 22;
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], w / 2, titleY + i * 44);
    if (sub) {
      g.fillStyle = S.sub;
      g.font = subFont;
      g.fillText(sub, w / 2, 90 + (lines.length - 1) * 44);
    }
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const m = height / 124, W = w * m, H = h * m, face = { verts: [-W / 2, -H / 2, 0.03, W / 2, -H / 2, 0.03, W / 2, H / 2, 0.03, -W / 2, H / 2, 0.03], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [-W / 2, -H / 2, W, H] };
    const back = bevelBox({ w: W + 0.14, h: H + 0.14, d: 0.08, color: S.back, bevel: 0.03, offset: { z: -0.02 } });
    back.castShadow = false;
    out = { face, back, width: W, height: H };
    if (keep) labelCache.set(key, out);
    return out;
  };

  // The highest thing standing under (x, z) below the height y, for a post to rest on: a walkable floor, a tunnel's
  // rock ledge, or else the pit floor.
  const groundUnder = (x, z, y) => {
    const R = FLOOR().rects;
    let best = 0;
    for (let i = 0; i < R.length; i += 5) {
      const top = R[i + 4];
      if (top > best && top < y - 0.5 && x >= R[i] - 0.1 && x <= R[i + 1] + 0.1 && z >= R[i + 2] - 0.1 && z <= R[i + 3] + 0.1) best = top;
    }
    for (const t of LAYOUT.tunnels) {
      const [cx, cz, hw, hd] = t.turn === 0 ? [t.x, t.z + 2.2, 3.2, 1.9] : [t.x - Math.sign(t.x) * 2.4, t.z, 2.7, 3.4], top = t.y - 0.3;
      if (top > best && top < y - 0.5 && Math.abs(x - cx) < hw && Math.abs(z - cz) < hd) best = top;
    }
    return best;
  };

  // Where the timber's rails run, shared by the mesh (`scaffold`) and the floor an Ooga walks (`FLOOR`): the bridges'
  // sides from rail line to rail line, and the cuts each deck's rails leave where something lands on them (`cutsFor`).
  const railPlan = cached(() => {
    const L = LAYOUT, r = L.ring, R = r.outer - 0.15, e = L.entrance, [[, , a0, a1]] = L.walk;
    // A bridge's two sides, each from where it leaves the rail line `from` of what it starts on to where it meets the
    // rail line `to` of what it lands on: `t0` and `t1` the fractions along it, `a` and `b` the points. A line is a
    // function of a side's ends giving that fraction: the circle round the core's walkway going out, or a line x = x.
    const crossCircle = (rad) => (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, cx = ax - r.x, cz = az - r.z, qa = dx * dx + dz * dz, qb = 2 * (cx * dx + cz * dz), qc = cx * cx + cz * cz - rad * rad;
      return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
    };
    const crossX = (x) => (ax, az, bx) => (x - ax) / (bx - ax);
    const bridgeOf = (x0, z0, x1, z1, w, from, to) => {
      const len = Math.hypot(x1 - x0, z1 - z0), px = -(z1 - z0) / len * w / 2, pz = (x1 - x0) / len * w / 2;
      const sides = [-1, 1].map((s) => {
        const ax = x0 + px * s, az = z0 + pz * s, bx = x1 + px * s, bz = z1 + pz * s, t0 = from(ax, az, bx, bz), t1 = to(ax, az, bx, bz);
        const at = (t) => [ax + (bx - ax) * t, az + (bz - az) * t];
        return { t0, t1, at, a: at(t0), b: at(t1) };
      });
      return { x0, z0, x1, z1, w, len, sides };
    };
    const ringBridges = RING_BRIDGES.map(([x0, z0, x1, z1]) => {
      const line = Math.sign(x1) * (Math.abs(L.bays[3].x) - L.bays[3].w / 2 + 0.1);
      return { ...bridgeOf(x0, z0, x1, z1, 2, crossCircle(R), crossX(line)), line };
    });
    const topBridges = L.bridges.map(([x0, z0, x1, z1, w]) => bridgeOf(x0, z0, x1, z1, w, crossX(x0 - 0.1), crossX(x1 + 0.1)));
    // Where a stair, a bridge, a porch, the stairway or the walkway lands on a deck, as cuts on that deck's rail:
    // exactly as wide as the rails that arrive, which end on the cut's end posts.
    const landings = [];
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) {
      const l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
      landings.push([ax, ay, az, w / 2 + 0.05, dx, dz], [bx, by, bz, w / 2 + 0.05, -dx, -dz]);
    }
    for (const l of L.ladders) {
      landings.push([l.x, l.top, l.z, l.width / 2 + 0.15, l.nx, l.nz]);
      landings.push([l.x, l.bottom, l.z, l.width / 2 + 0.15, l.nx, l.nz]);
    }
    const cutAcross = ([p, q], y) => landings.push([(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2, Math.hypot(p[0] - q[0], p[1] - q[1]) / 2]);
    for (const bd of ringBridges) cutAcross(bd.sides.map((sd) => sd.b), LEVEL.main);
    for (const bd of topBridges) for (const end of ["a", "b"]) cutAcross(bd.sides.map((sd) => sd[end]), LEVEL.top);
    // The first gallery's front opens onto the landing, exactly between the flights' rails.
    const ld = L.landing;
    landings.push([ld.x, ld.y, ld.z - ld.d / 2 - 0.1, ld.w / 2 - 0.1]);
    for (const t of L.tunnels) {
      const b = L.bays[t.bay];
      landings.push(t.turn === 0 ? [t.x, t.y, b.z - b.d / 2 + 0.1, PORCH_HALF - 0.1] : [b.x + Math.sign(t.x) * (b.w / 2 - 0.1), t.y, t.z, PORCH_HALF - 0.1]);
    }
    const [gx, , , , gy1, , gw] = L.stairway;
    landings.push([gx, gy1, e.z - e.d / 2 + 0.1, gw / 2 + 0.1], [e.x + e.w / 2 - 0.1, e.y, (a0 + a1) / 2, (a1 - a0) / 2 - 0.1]);
    if (hangarEntry()) {
      const [[, , b0, b1]] = L.walkLeft, hl = L.hangarLanding;
      landings.push([e.x - e.w / 2 + 0.1, e.y, (b0 + b1) / 2, (b1 - b0) / 2 - 0.1], [hl.x + hl.w / 2 - 0.1, hl.y, (b0 + b1) / 2, (b1 - b0) / 2 - 0.1]);
    }
    const cutsFor = (d) => landings.filter(([x, y, z]) => Math.abs(y - d.y) < 0.3 && Math.abs(x - d.x) < d.w / 2 + 1 && Math.abs(z - d.z) < d.d / 2 + 1).map(([x, , z, ...rest]) => [x - d.x, z - d.z, ...rest]);
    return { ringBridges, topBridges, cutsFor };
  });
  // Every deck and the edges it is railed along (`deckParts`' `rails`), with how far its posts reach down where that is
  // not to whatever stands under it: railed all round, open only where something lands on it (`railPlan`'s cuts); the
  // galleries' backs are the wall, and they hang from it on brackets rather than stand on posts, which would land in
  // the porches below them; Kortik's switchboard stands along his deck's west edge, where a rail would be; and the
  // hangar's landing is open along its door, its posts standing on the lowered outcrop where they come down on it.
  const deckRailing = cached(() => {
    const L = LAYOUT;
    return [...L.bays.map((b) => [b, "nsew"]), [L.switchboard, "nsew"], [L.platform, "nsew"], [L.kortik, "nse"], [L.lookout, "nsew"],
      [L.lookoutDeck, "nsew", 0], [L.lookoutApproach, "ew", 0], [L.landing, "s"], ...L.galleries.map((g) => [g, "swe", 0]), [L.entrance, "nwe"],
      ...hangarEntry() ? [[L.hangarLanding, "nse", (x, z) => L.hangarLanding.y - outcropTop(L.hangarLanding.x + x, L.hangarLanding.z + z)]] : []];
  });
  // The rails along level 2's walkway round the right wall, from the balcony's rail to the Harbor porch's, every corner
  // one shared post; along both sides of the hangar's walkway on the left while it is open, to the landing's rail; and
  // along each line's porch
  // out to its peer tunnel from its deck's rail: [x0, z0, x1, z1, y, ends], as `railParts` takes them.
  const walkRails = cached(() => {
    const L = LAYOUT, e = L.entrance, [[, , a0, a1], [s1x0, s1x1, s1z0]] = L.walk, out = [];
    const ex = e.x + e.w / 2 - 0.1, wx = s1x0 + 0.1;
    out.push([ex, a0 + 0.1, wx, a0 + 0.1, e.y, [false, true]], [ex, a1 - 0.1, s1x1 - 0.1, a1 - 0.1, e.y, [false, true]], [wx, a0 + 0.1, wx, s1z0 - 0.1, e.y, [false, true]]);
    if (hangarEntry()) {
      const [[, , z0, z1]] = L.walkLeft, hl = L.hangarLanding, lx = e.x - e.w / 2 + 0.1;
      for (const z of [z0 + 0.1, z1 - 0.1]) out.push([lx, z, hl.x + hl.w / 2 - 0.1, z, e.y, [false, false]]);
    }
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = porchOf(t), b = L.bays[t.bay], s = Math.sign(t.x);
      if (t.turn === 0) for (const x of [x0 + 0.1, x1 - 0.1]) out.push([x, z0, x, z1 + 0.1, t.y, [true, false]]);
      else {
        const inner = b.x + s * (b.w / 2 - 0.1), face = t.x - s * 0.5;
        out.push([inner, z0 + 0.1, face, z0 + 0.1, t.y, [false, true]]);
        // The Harbor line's porch meets the walkway along its hall-side edge.
        out.push(t.x > 0 ? [inner, z1 - 0.1, wx, z1 - 0.1, t.y, [false, false]] : [inner, z1 - 0.1, face, z1 - 0.1, t.y, [false, true]]);
      }
    }
    return out;
  });

  // ---- the floor an Ooga walks --------------------------------------------------------------------------

  // Every surface in the hall with its height at a point: the pit floor, the decks, the balcony and its stairway, the
  // bridges, the core's walkway and the stairs. `supportAt(x, z, feet)` is the highest of them within a step of
  // the feet, the layered support the crew expects, so an Ooga on a deck stands on it and one on the pit floor
  // walks under it. `clearAt` keeps bodies out of what stands on the floors. Both allocate nothing.
  const STEP = 0.6;
  const FLOOR = cached(() => {
    const L = LAYOUT, rects = [], strips = [], blocks = [], discs = [];
    const rect = (d, y = d.y) => rects.push(d.x - d.w / 2 + 0.15, d.x + d.w / 2 - 0.15, d.z - d.d / 2 + 0.15, d.z + d.d / 2 - 0.15, y);
    for (const d of [...L.bays, L.switchboard, L.kortik, L.platform, L.lookout, L.lookoutDeck, L.lookoutApproach, ...L.galleries]) rect(d);
    // The landing runs on into the first gallery it opens onto.
    const ld = L.landing;
    rects.push(ld.x - ld.w / 2 + 0.15, ld.x + ld.w / 2 - 0.15, ld.z - ld.d / 2 - 0.4, ld.z + ld.d / 2 - 0.15, ld.y);
    rect(L.entrance);
    // Level 2's walkway and the porches, running a little into whatever they meet so a walker crosses over.
    const [[ax0, ax1, az0, az1], [bx0, bx1, bz0, bz1]] = L.walk, y2 = L.entrance.y;
    rects.push(ax0 - 0.3, ax1 + 0.3, az0 + 0.15, az1 - 0.15, y2, bx0 + 0.15, bx1 - 0.15, bz0 - 0.3, bz1 - 0.15, y2);
    if (hangarEntry()) {
      const [[cx0, cx1, cz0, cz1]] = L.walkLeft, h = L.hangar, hl = L.hangarLanding;
      rects.push(cx0 - 0.3, cx1 + 0.3, cz0 + 0.15, cz1 - 0.15, y2);
      rect(hl);
      // The hangar door's threshold runs on in under its shield, so a walker keeps its footing until it crosses.
      rects.push(h.x - 0.6, hl.x - hl.w / 2 + 0.3, h.z - HANGAR_DOOR.half + 0.1, h.z + HANGAR_DOOR.half - 0.1, h.y);
    }
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = porchOf(t);
      // Continue the threshold underneath the glass: a walker must retain
      // support until its centre crosses the connected mirror plane.
      if (t.turn === 0) rects.push(x0 + 0.15, x1 - 0.15, t.z - 0.35, z1 + 0.3, t.y);
      else rects.push(x0 - 0.3, x1 + 0.3, z0 + 0.15, z1 - 0.15, t.y);
    }
    // A strip runs from one end to the other, `w` wide, rising from y0 to y1: bridges and stairs.
    const strip = (x0, y0, z0, x1, y1, z1, w) => strips.push(x0, z0, x1, z1, w / 2, y0, y1);
    const [gx, gy0, gz0, gx1, gy1, gz1, gw] = L.stairway;
    strip(gx, gy0, gz0, gx1, gy1, gz1, gw - 0.3);
    strip(gx1, gy1, gz1 - 0.1, gx1, gy1, gz1 + 0.4, gw - 0.3);
    strip(-6.4, LEVEL.main, -4, -9.1, LEVEL.main, -2.25, 1.9);
    strip(6.4, LEVEL.main, -4, 9.1, LEVEL.main, -2.25, 1.9);
    for (const [x0, z0, x1, z1, w] of L.bridges) strip(x0 - 0.3, LEVEL.top, z0, x1 + 0.3, LEVEL.top, z1, w - 0.1);
    for (const [, , , bx, by, bz, w] of L.stairs) if (ringLanding(bx, by, bz)) rects.push(bx - w / 2 + 0.1, bx + w / 2 - 0.1, bz - RING_LANDING, bz + 0.3, by);
    // Each stair runs half a metre on, flat, past both ends, so it meets the deck or floor it lands on.
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len * 0.5, uz = (bz - az) / len * 0.5;
      strip(ax, ay, az, bx, by, bz, w - 0.2);
      strip(ax - ux, ay, az - uz, ax, ay, az, w - 0.2);
      strip(bx, by, bz, bx + ux, by, bz + uz, w - 0.2);
    }
    // What stands in the way, as circles [x, z, radius, from, to] between two heights of the feet.
    const block = (x, z, r, from, to) => blocks.push(x, z, r, from, to);
    block(L.core.x, L.core.z, 4.35, -1, LEVEL.main - 0.3);
    block(L.core.x, L.core.z, L.ring.inner, LEVEL.main - 0.3, HALL.h);
    for (const x of [-2.9, -2.2, -1, 0, 1, 2.2, 2.9]) block(L.forge.x + x, L.forge.z + 0.6, 0.75, -1, 4);
    // The forge's shafts, their mounds and mouths.
    for (const [x, z] of SHAFTS) for (const dz of [1.2, 3]) block(x, z + dz, 2.3, -1, 4.4);
    block(L.forge.x + FORGE_CONSOLE[0], L.forge.z + FORGE_CONSOLE[1], 0.45, -1, 2);
    for (const s of [-1, 1]) block(L.forge.x + s * 3.7, L.forge.z + 0.75, 0.35, -1, 4.4);
    for (const [x, z] of COILS) block(x, z, 0.45, LEVEL.main - 0.5, LEVEL.main + 2.5);
    for (const [x, z] of FORGE_STORES) block(x, z, 0.6, -1, 1.5);
    for (const [x, z, k, tiers, th] of outcrops()) if (tiers) block(x, z, 1.9 * k, -1, tiers * 1.4 * k * th);
    // The watchtower's posts where they stand on line A's deck.
    for (const [x, z] of deckPosts(L.lookout.w, L.lookout.d)) {
      const px = L.lookout.x + x, pz = L.lookout.z + z;
      for (const d of L.bays) if (d.y < L.lookout.y && Math.abs(px - d.x) < d.w / 2 && Math.abs(pz - d.z) < d.d / 2) block(px, pz, 0.28, d.y - 0.5, d.y + 5);
    }
    // Each line's tanks, its frame's posts and back plate, and the panel between the tanks.
    for (const b of L.bays) {
      const sx = stationX(b), sz = stationZ(b);
      for (const x of [-1.2, 1.2]) block(sx + x, sz, 0.84, b.y - 0.5, b.y + 3);
      for (const x of [-2.4, 2.4]) block(sx + x, sz - 0.6, 0.2, b.y - 0.5, b.y + 4);
      for (const x of [-1.6, 0, 1.6]) block(sx + x, sz - 0.95, 0.25, b.y - 0.5, b.y + 4);
      block(sx, sz + 0.62, 0.35, b.y - 0.5, b.y + 1.5);
    }
    const sw = L.switchboard, rb = L.rebalancer, tr = L.treasury, lk = L.lookout;
    // The switchboard's desk, round the operator.
    for (let i = 0; i < 5; i++) {
      const b = -CONSOLE.arc + (i + 0.5) / 5 * CONSOLE.arc * 2;
      block(sw.x + CONSOLE.x + Math.sin(b) * CONSOLE.desk, sw.z + CONSOLE.z - Math.cos(b) * CONSOLE.desk, 0.65, sw.y - 0.5, sw.y + 3);
    }
    block(sw.x - 3, sw.z - 1.4, 0.75, sw.y - 0.5, sw.y + 2);
    // The low drum is a step, not a four-metre invisible wall. Its column and glass tubes have their own shells.
    discs.push(rb.x, rb.z + REB.cz, 1.85, rb.y + 0.56);
    block(rb.x, rb.z + REB.cz, 0.36, rb.y + 0.54, rb.y + REB.top + 0.36);
    for (const s of [-1, 1]) block(rb.x + s * 1.15, rb.z + REB.cz - 0.95, 0.22, rb.y + 0.54, rb.y + 1.68);
    // The pipes' feet, console, crates and sign posts.
    for (const s of [-1, 1]) {
      block(rb.x + s * REB.leg, rb.z + REB.cz, 0.4, rb.y - 0.5, rb.y + 4);
      block(rb.x + s * REB.post, rb.z + REB.postZ, 0.25, rb.y - 0.5, rb.y + 6);
      block(tr.x + s * TRE.post, tr.z + TRE.postZ, 0.25, tr.y - 0.5, tr.y + 6);
    }
    for (const x of [-0.42, 0, 0.42]) block(rb.x + REB.console[0] + x, rb.z + REB.console[1], 0.36, rb.y - 0.5, rb.y + 1.5);
    for (const [x, z] of REB.crates) block(rb.x + x, rb.z + z, 0.55, rb.y - 0.5, rb.y + 1);
    // The treasury's vault, its belt and crate, the desk, the cart and the crate of gold.
    block(tr.x, tr.z + TRE.vz, 1.9, tr.y - 0.5, tr.y + 4);
    block(tr.x, tr.z + 1.15, 0.4, tr.y - 0.5, tr.y + 1.2);
    block(tr.x + TRE.crate[0], tr.z + TRE.crate[1], 0.5, tr.y - 0.5, tr.y + 1);
    block(tr.x + TRE.desk[0], tr.z + TRE.desk[1], 0.6, tr.y - 0.5, tr.y + 1.6);
    block(tr.x + TRE.cart[0], tr.z + TRE.cart[1], 0.65, tr.y - 0.5, tr.y + 1.3);
    for (const [x, z] of TRE.crates) block(tr.x + x, tr.z + z, 0.55, tr.y - 0.5, tr.y + 1);
    // The cooker's chest, whose jaw opens above it, its stack and chute, and its sign's posts.
    const ck = L.cooker;
    for (const dz of [-0.7, 0.7]) block(ck.x, ck.z + dz, 1.35, ck.y - 0.5, ck.y + 3.4);
    block(ck.x + COOK.stack[0], ck.z + COOK.stack[1], 0.3, ck.y - 0.5, ck.y + COOK.stackTop);
    const [hx, , hz] = COOK.hatch, [cx, , cz] = COOK.lip;
    for (const t of [0.45, 1]) block(ck.x + hx + (cx - hx) * t, ck.z + hz + (cz - hz) * t, 0.33, ck.y - 0.5, ck.y + 1.3);
    for (const s of [-1, 1]) block(ck.x + s * COOK.post, ck.z + COOK.postZ, 0.25, ck.y - 0.5, ck.y + 6);
    block(lk.x, lk.z, 1.35, lk.y - 0.5, L.lookoutDeck.y - 0.3);
    block(lk.x, lk.z, 1, L.lookoutDeck.y - 0.3, lk.y + lk.tower + 3);
    // Each peer tunnel's console box; the connected glass stays walkable.
    // And the study hall's locked door, and the donation kiosk's counter at the walkway's edge.
    for (const t of L.tunnels) {
      const [bx, bz] = TUNNEL_BOX, c = Math.cos(t.turn), sn = Math.sin(t.turn);
      block(t.x + bx * c + bz * sn, t.z - bx * sn + bz * c, 0.45, t.y - 0.5, t.y + 1.5);
    }
    block(L.study.x + 0.4, L.study.z, 1.2, L.study.y - 0.5, L.study.y + 5);
    if (donationCorner()) block(L.kiosk.x - 0.15, L.kiosk.z, 1, L.kiosk.y - 0.5, L.kiosk.y + 5);
    // The study hall's portal faces -x, so its x runs along world z and its z comes out toward -x.
    const st = L.study, S = STUDY;
    for (const s of [-1, 1]) block(st.x - S.z, st.z + s * S.post, 0.35, st.y - 0.5, st.y + 8);
    block(st.x - S.crate[1], st.z + S.crate[0], 0.4, st.y - 0.5, st.y + 1.2);
    block(st.x - S.easel[1], st.z + S.easel[0], 0.5, st.y - 0.5, st.y + 2.8);
    // Kortik's switchboard, desk, stool, side table and crates.
    const k = L.kortik, kx = k.x - k.w / 2 + KORTIK.face;
    for (const [along, out, r] of KORTIK.blocks) block(kx + out, k.z - along, r, k.y - 0.5, k.y + 3);
    // On the hangar's landing, what its width brings within reach: the door's frame posts and the legs of its arch
    // either side of the opening, the lantern posts and the crates and the drum.
    if (hangarEntry()) {
      const h = L.hangar, c = Math.cos(h.turn), sn = Math.sin(h.turn), at = (lx, lz) => [h.x + lx * c + lz * sn, h.z - lx * sn + lz * c];
      for (const s of [-1, 1]) for (const [lx, lz, r] of [[HANGAR_DOOR.post, 0.35, 0.35], [2.85, 0.1, 0.65]]) block(...at(s * lx, lz), r, h.y - 0.5, h.y + 4);
      for (const [kind, x, , z] of hangarLamps()) if (kind === "post") block(x, z, 0.2, h.y - 0.5, h.y + 3);
      for (const [x, z, r] of HANGAR_LANDING.blocks) block(x, z, r, h.y - 0.5, h.y + 1.6);
    }
    // The rails along the decks' edges (`deckRailing`, cut by `railPlan`) and the walkways (`walkRails`), as boxes
    // [x0, x1, z0, z1, from, to] round each rail from just past its outer face to its inner one, in the way of walkers
    // on foot on that deck (`railClear`), so a body stops at a rail rather than in it; walkers below pass under and a
    // jump goes over. A length ends `CUT_EASE` short of a cut, since the stairs and bridges landing there are about as
    // narrow as the widest Ooga.
    const walls = [], CUT_EASE = 0.6;
    const wall = (x0, x1, z0, z1, y) => walls.push(x0, x1, z0, z1, y - 0.5, y + 1.1);
    const { cutsFor } = railPlan();
    for (const [d, rails] of deckRailing()) {
      const hw = d.w / 2 - 0.1, hd = d.d / 2 - 0.1;
      for (const [x0, z0, x1, z1] of models.deckRailSpans(d.w, d.d, rails, cutsFor(d))) {
        const ease = (u, half) => Math.abs(Math.abs(u) - half) < 0.01 ? 0 : CUT_EASE;
        if (z0 === z1) {
          const a = Math.min(x0, x1), b = Math.max(x0, x1), ea = ease(a, hw), eb = ease(b, hw), inner = z0 < 0 ? 1 : -1;
          if (b - eb > a + ea) wall(d.x + a + ea, d.x + b - eb, d.z + Math.min(z0 - 0.15 * inner, z0 + 0.1 * inner), d.z + Math.max(z0 - 0.15 * inner, z0 + 0.1 * inner), d.y);
        } else {
          const a = Math.min(z0, z1), b = Math.max(z0, z1), ea = ease(a, hd), eb = ease(b, hd), inner = x0 < 0 ? 1 : -1;
          if (b - eb > a + ea) wall(d.x + Math.min(x0 - 0.15 * inner, x0 + 0.1 * inner), d.x + Math.max(x0 - 0.15 * inner, x0 + 0.1 * inner), d.z + a + ea, d.z + b - eb, d.y);
        }
      }
    }
    for (const [ax, az, bx, bz, y] of walkRails()) wall(Math.min(ax, bx) - 0.1, Math.max(ax, bx) + 0.1, Math.min(az, bz) - 0.1, Math.max(az, bz) + 0.1, y);
    return { rects: new Float32Array(rects), strips: new Float32Array(strips), blocks: new Float32Array(blocks), discs: new Float32Array(discs), walls: new Float32Array(walls),
      stairs: new Float32Array([L.stairway, ...L.stairs].flat()), ring: L.ring };
  });
  // Conduits from each featured line's capacitors to the chamber: a thick tube of clear glass (`glass`, drawn in the
  // renderer's glass pass) that the sats ride inside, with brass flanges along it and thin glowing orange bands between
  // them. It rises straight out of the top of the line's inner capacitor, where its
  // terminal was, and arches over to the chamber, meeting both in a turned bronze flare so the pipe grows out of
  // them. A bronze clamp at the top of its arch hangs it on a chain from the vault. The path the sats ride is sampled
  // once so the scene only reads it.
  // Where the conduit sits on the capacitor's cap, above the glass's top, and the flare it grows out of.
  const CONDUIT_SAMPLES = 48;
  const CONDUIT_SEAT = 0.54;
  const conduitPath = (bay) => {
    const c = LAYOUT.core, side = Math.sign(bay.x), [lo, hi] = c.chamber;
    const ax = stationX(bay) - side * 1.2, ay = bay.y + CAP.top + CONDUIT_SEAT, az = stationZ(bay);
    const bx = c.x + side * 2.47, by = bay.y > LEVEL.main ? hi - 0.9 : lo + 1.2, bz = c.z + (bay.z < c.z ? -0.6 : 0.6);
    const lift = (bay.y > LEVEL.main ? 0.8 : 2.2) * 0.8, y1 = ay + 1.1, x2 = bx + side * 2;
    return (t) => {
      const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
      return { x: (a + b) * ax + d * x2 + e * bx, y: a * ay + b * y1 + d * (by + lift) + e * by, z: (a + b) * az + (d + e) * bz };
    };
  };
  // A sat: a small faceted gold gem, drawn by the hundred as one instanced batch.
  const sat = cached(() => noShadow(lathe({ profile: [[0, -0.2], [0.17, -0.02], [0.14, 0.08], [0, 0.2]], segments: 6, color: GOLD, emissive: 0.85 })));
  // A failed forward's sat on its way back: the same gem, glowing red.
  const satFailed = cached(() => noShadow(lathe({ profile: [[0, -0.2], [0.17, -0.02], [0.14, 0.08], [0, 0.2]], segments: 6, color: "#ff3a2a", emissive: 0.9 })));

  // ---- a featured line ----------------------------------------------------------------------------------

  // A line's standing parts, facing +z at its deck's centre, after the concept's pair of tanks: each capacitor
  // stands on a chunky riveted bronze foot with a little lit screen and lamps on its front, and wears a riveted cap
  // with a ring of orange bulbs round its top and a terminal. Behind the pair, a riveted copper plate between
  // bronze posts, a beam across the top with more bulbs, and a copper pipe arching between the terminals. The glass
  // itself is `capacitor`, which flashes.
  const CAP = { r: 0.68, foot: 0.62, top: 2.75 };

  // ---- the stations ---------------------------------------------------------------------------------

  // The on-chain forge in the core's foot: an arch of voussoirs in two rings with a keystone, on brick piers, with a
  // brass rim round the furnace mouth, and two tracks running out of it toward the stairway. The furnace's glowing
  // face, the ring of heat round it, its flames and its Bitcoin sign are `forgeFire`, lit hotter when a line is
  // opened or closed on chain.
  // The height of the arch's and the fire's middle: low enough that the keystone ends inside the core walkway's planks.
  const FORGE_CY = 1.55;
  const FORGE_TRACKS = [-0.95, 0.95];
  const FORGE_CONSOLE = [-2.45, 1.4];
  // The stores by the forge, [x, z]: between its tracks and the stairs up to the core's walkway, clear of both.
  const FORGE_STORES = [[-2.5, 3.4], [2.5, 2.8], [-2.5, 5], [2.5, 4.6]];
  // A flame: a teardrop of orange with a smaller one of yellow in front of it.
  const FLAME = [[0, 1], [-0.24, 0.42], [-0.2, 0.12], [0, 0], [0.2, 0.12], [0.24, 0.42]];
  const flame = (h, x, y, z, hot) => [
    moved(prism(FLAME.map(([u, v]) => [u * h, v * h]), 0.08, hot ? "#ff7a1e" : "#e0561a", 1), x, y, z),
    moved(prism(FLAME.map(([u, v]) => [u * h * 0.55, v * h * 0.6]), 0.08, hot ? "#ffe890" : "#ffb040", 1), x, y, z + 0.06)
  ];
  // A Tesla coil for the core's walkway: a turned bronze foot, copper wound up a dark column, a brass toroid on top
  // and sparks leaping off it.
  const COILS = [[-3.85, -2.6], [3.85, -2.6]];
  // The ring of light that runs out over the forge's arch when it takes a cart (gold) or mints a coin (cyan), at unit
  // radius facing +z; the scene scales it out.
  const forgeWave = cached(() => {
    const build = (color) => noShadow(forwardLathe(torus(1, 0.05, color, 1, 48, 8)));
    return { gold: build("#ffe9a8"), cyan: build("#bff4ff") };
  });

  // ---- the forge's lines -------------------------------------------------------------------------------

  // The forge's two mine shafts either side of the stairway's foot, where its lines come up out of the ground: [x, z]
  // of each mouth, which faces the forge (-z). The left, from the chain, sends carts of sats up to be consumed; the
  // right, to the chain, takes the coins the forge mints back down. Inside each the line runs SHAFT_DEEP metres into
  // the dark, the last SHAFT_RAMP of it dropping away down the shaft.
  const SHAFTS = [[-6, 14.2], [6, 14.2]];
  const LINE_STEP = 0.05;
  const gem = (size, color, emissive = 0.8) => lathe({ profile: [[0, -0.1], [0.12, 0.01], [0.085, 0.05], [0, 0.055]].map(([r, h]) => [r * size, h * size]), segments: 8, color, emissive });
  // The coin the forge mints when sats leave: a thick disc of gold with a raised rim, a milled edge and the ₿ struck
  // on both faces, `COIN_R` in radius and standing on its edge, its axle along x, so it rolls along z.
  const COIN_R = 0.6;

  // The switchboard, a cockpit of screens round the operator as the concept draws it. Everything is placed round
  // `CONSOLE`, where the operator stands, facing -z: a curved timber desk wrapped round him, its front a row of
  // raked control decks studded with lit buttons, a lower row of five upright monitors on necks along its back,
  // an upper row of four on posts, and the upright routing board above the middle. A monitor is
  // [bearing, reach, height, width, tall, tilt, kind]: bearing 0 is straight ahead, tilt is 0 for upright screens,
  // and kind is what its lit face shows (`switchScreens`). A cart of gold stands by.
  const CONSOLE = { x: 0, z: 0.9, desk: 2, deep: 0.9, top: 1, arc: 1.3 };
  const MONITORS = [
    [-1.05, 2.25, 1.6, 1.05, 0.66, 0, "bars"], [-0.52, 2.25, 1.6, 1.05, 0.66, 0, "text"], [0, 2.25, 1.6, 1.05, 0.66, 0, "line"],
    [0.52, 2.25, 1.6, 1.05, 0.66, 0, "text"], [1.05, 2.25, 1.6, 1.05, 0.66, 0, "bars"],
    [-0.78, 2.5, 2.45, 1.05, 0.66, 0, "text"], [-0.26, 2.5, 2.45, 1.05, 0.66, 0, "line"], [0.26, 2.5, 2.45, 1.05, 0.66, 0, "bars"], [0.78, 2.5, 2.45, 1.05, 0.66, 0, "text"],
    [0, 2.7, 3.3, 1.6, 0.95, 0, "graph"]
  ];

  // The rebalancer: a round platform with rings of light on its top and a lens in its middle, two pipes arching
  // over it to a junction above the middle, the channel the sats leave by in orange on the left and the one they
  // go to in blue on the right, arrows lit along them, and a column from the junction down to a beam over the
  // lens. Small glass tubes stand at the platform's back, the boards hang between the pipes, a console with a
  // screen, buttons and a lever faces the operator, and crates of gold stand either side; the sign is on two
  // posts at the back. `rebalancerRing` spins on the platform's top, `rebalancerFlow` lights the arrows while it
  // runs. In the deck's frame, +z toward the entrance. `REB` places what the scene hangs: the sign, the boards,
  // the lanterns, and the operator's and the crates' spots.
  const REB = {
    cz: -0.6, leg: 2.5, top: 3.4, pipe: 0.19, post: 2.8, postZ: -2.75, sign: [0.5, 4.55, -2.45], boards: [[-1.75, 2.35, -0.22], [0, 2.35, -0.2], [1.75, 2.35, -0.22]],
    lamps: [[-2.8, 5.24, -2.25], [2.8, 5.24, -2.25]], console: [0, 3], crates: [[-2.2, 1.95], [2.2, 1.95]], operator: [0, 4.1]
  };

  // The treasury: a riveted vault with the Bitcoin sign on a bronze medallion on its front, a cage of glass under a
  // bronze crown on its top over the heap of gold (`goldPile`), copper pipes over it into the vault's sides, and a
  // belt out of a chute under the medallion that lifts each fee's nugget (`beltNugget`) into the crate at the front,
  // whose gold (`hopperFill`) the scene raises. A desk with a monitor stands at the left; the boards hang from the
  // sign's posts, and the sign carries stacks of coins beside its lettering. `TRE` places what the scene hangs.
  const TRE = {
    vz: -0.7, deep: 2.6, top: 1.62, dome: [1.15, 1.45], pipeX: 1.55, pipeY: 3.75, post: 2.4, postZ: -2.3, sign: [0.45, 4.9, -1.97],
    boards: [[-2.45, 2.55, -2.05], [2.45, 2.55, -2.05]], lamps: [[-2.4, 5.24, -1.8], [2.4, 5.24, -1.8]],
    belt: [[0, 0.34, 0.66], [0, 0.98, 1.66]], crate: [0, 2.1], desk: [-2.05, 1.55], cart: [2.45, 0.4], crates: [[2.4, -1.1]], operator: [1.05, 1.6]
  };

  // The banana cooker, at the platform's end nearest the way out, as the concept draws it: black iron in a bright
  // orange frame on a hazard-striped plinth, its lid a jaw hinged at the back (the wall side, +x) that opens toward the
  // hall on white teeth, a red palate and a tongue. The porthole (`cookerPort`, dim, and lit while it cooks) and the
  // gears (`cookerGear`, turned by the scene) face the hall (-x); the stack stands at the back corner away from the way
  // out, clear of the open jaw and behind the chest from the kiosk's side; the launch chute leaves the right side (+z) from a hatch and runs down toward the way out, where its lip
  // throws the bananas. The sign and the donations board hang on two posts behind it. In the deck's frame, +z toward
  // the entrance. `COOK` places what the scene hangs and moves: the lid's hinge and how far it opens, the mouth the
  // sats drop into, the porthole, the gears, the stack, the hatch and the chute's lip and heading, the sign, the board,
  // the lanterns and the cook's spot.
  const ORANGE = "#f39a1e";
  const IRON_BK = "#211c19";
  const COOK = (() => {
    const c = LAYOUT.cooker, hatch = [0.25, 1.02, 1.46], gx = -c.x - hatch[0], gz = HALL.front - 0.6 - c.z - hatch[2], gl = Math.hypot(gx, gz);
    const lip = [hatch[0] + gx / gl * 0.9, 0.86, hatch[2] + gz / gl * 0.9], dx = -c.x - lip[0], dz = HALL.front - 0.6 - c.z - lip[2], l = Math.hypot(dx, dz);
    return {
      w: 2.2, h: 1.5, d: 2.8, plinth: 0.16, rim: 1.2, hinge: [1.1, 1.5, 0], open: 1.3, mouth: [0, 1.55, 0], port: [-1.14, 0.84, -0.5],
      // [x, y, z, radius, teeth] on the hall side: teeth in step with the radius, the centres their radii and a tooth
      // apart, so they mesh.
      gears: [[-1.2, 0.96, 0.5, 0.34, 13], [-1.2, 0.54, 0.956, 0.18, 7]],
      stack: [1.55, -0.85], stackTop: 3.7, hatch, lip, intakeY: HALL.h - c.y - 1.35, dir: [dx / l, dz / l],
      post: 2, postZ: -2.3, postH: 6.2, sign: [0, 5.65, -1.97], board: [-0.8, 2.55, -2.05], lamps: [[-2, 5.84, -1.8], [2, 5.84, -1.8]],
      operator: [1.95, 0.75]
    };
  })();

  // The donation kiosk, built into the right wall where the walkway from the balcony meets it, as the concept draws
  // it: a timber frame on a timber platform, two posts rising past the beam over the screen to a cap that runs out
  // past them, joined with iron; the framed banana medallion between the beam and the cap on planks; the screen
  // between the posts, which shows the kiosk's attract screen (`kioskIdle`) or, while the cooker works, its thanks
  // (`kioskThanks`); and under it a timber base with a lit grille. Two lanterns hang on long chains from the cap's
  // ends, and crystal grows at its feet.
  // `KIOSK` places what the scene hangs (the screen and its lean) and, in the cave's frame, the lanterns' hooks, where a
  // visitor stands to use it, the point used, and the glass (`glass`: its size, its face in the screen's frame, and in
  // the cave's its middle, the normal out of it and its right and up), which the scene lays the kiosk's screen flow
  // (`factory-kiosk.js`) over.
  const KIOSK = (() => {
    const k = LAYOUT.kiosk, c = Math.cos(k.turn), s = Math.sin(k.turn), at = (x, z) => [k.x + x * c + z * s, k.z - x * s + z * c];
    const dir = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const lamps = [[-1.95, 3, 0.85], [1.95, 3, 0.85]], screen = [0, 1.84, 0.72], lean = -0.1, sn = Math.sin(lean), cs = Math.cos(lean);
    const w = 1.8, h = w * BL.factoryKiosk.H / BL.factoryKiosk.W, z = 0.07, [mx, mz] = at(0, screen[2] + z * cs);
    return {
      screen, lean, lamps, hooks: lamps.map(([x, y, z]) => { const [wx, wz] = at(x, z); return [wx, k.y + y, wz]; }),
      stand: at(0, 2.1), use: at(0, 1.1),
      glass: { w, h, z, at: [mx, k.y + screen[1] - z * sn, mz], normal: dir(0, -sn, cs), up: dir(0, cs, sn), right: dir(1, 0, 0) }
    };
  })();

  // The donations board on the right wall between the study hall and the kiosk, over the walkway, as its concept draws
  // it: a timber frame bolted with iron round a dark board, standing in a niche of the rock, a lantern on a chain from
  // each end of its top beam, candles on the rock ledge under it and ivy over it. The board's face
  // (`boardFace(note)`) carries its title, icons and labels, painted once for each corner note (simulated, test or
  // real tips); its figures (`boardValues`) are a picture of their
  // own laid over its right-hand column, repainted when they change. `BOARD` places the face and the figures in the
  // board's frame and, in the cave's, the lanterns' hooks.
  const BOARD_FACE = { w: 3, h: 1.875, px: 400 };
  const BOARD_VALUES = { x: 640, y: 150, w: 530, h: 540 };
  const BOARD = (() => {
    const b = LAYOUT.board, c = Math.cos(b.turn), s = Math.sin(b.turn), at = (x, z) => [b.x + x * c + z * s, b.z - x * s + z * c];
    const lamps = [[-2.1, 3.5, 0.75], [2.1, 3.5, 0.75]], face = [0, 2.6875, 0.752], P = BOARD_FACE.px, V = BOARD_VALUES;
    return {
      face, lamps, hooks: lamps.map(([x, y, z]) => { const [wx, wz] = at(x, z); return [wx, b.y + y, wz]; }),
      values: [(V.x + V.w / 2) / P - BOARD_FACE.w / 2, BOARD_FACE.h / 2 - (V.y + V.h / 2) / P, 0.002]
    };
  })();
  const LOOKOUT_BEAM = { range: 48, inner: 7 * Math.PI / 180, outer: 11 * Math.PI / 180, pitch: -0.2 };

  // The study hall, as the concept builds its entrance: a round arch of cut stone set in the rock, and in front of
  // it a timber portal whose header carries the framed sign between two lit bolts, with a striped rope slung over
  // the sign, vines down the rock, the cave's black banner on an arm off the right post and a lesson on an easel by
  // the left. Through the arch, the hall: shelves of books either side of the bolt on the back wall, a desk with a
  // globe and an open book, a lantern over it and a rug, lit warm. Two chains cross the doorway to a padlock with a
  // monkey's face. It opens in a later change; here it is only locked. In the hall's frame: x along the wall, +z out
  // into the cave, the sill at y 0. `STUDY` is where the scene hangs the pictures (the sign on the header, the note
  // on the right post, the lesson on the easel, each [x, y, z, lean]) and the lanterns from the header's ends.
  const STUDY = {
    post: 2.95, z: 1, header: 5.55, sign: [0, 6.55, 1.36], note: [2.45, 2.25, 1.34, 0.16], board: [-4.35, 1.95, 1.3, -0.12],
    lamps: [[-3.55, 5.3, 1.38], [3.55, 5.3, 1.38]], crate: [3.75, 1.2], easel: [-4.35, 1.25]
  };

  // A peer tunnel, as the concept builds its entrance: an arch of voussoirs in two rings with a keystone, a neon
  // strip of the peer's colour round its inside and glowing studs set in its stones, inside a timber frame whose
  // header carries the tunnel's sign. Behind it a walled and roofed passage with rails running in, beside it a
  // console box with the bolt on it, and through it the peer's place: a far cavern lit in the peer's colours, with
  // crystals and a few houses with lit windows. The themes are the concept's peers: beach, volcano, jungle and
  // harbour. `TUNNEL_SIGN` is where the scene hangs the sign, on the header's front.
  const TUNNEL_THEMES = [
    { ring: "#5fd6ff", sky: "#1f5a8a", ground: "#c8b07a", accent: "#2f9f6a" },
    { ring: "#ff7a3a", sky: "#6a2414", ground: "#3a2320", accent: "#ff5a1e" },
    { ring: "#6fff9a", sky: "#1f5a3a", ground: "#2f5a2a", accent: "#1f4a24" },
    { ring: "#6fb8ff", sky: "#1f3a6a", ground: "#4a6a8a", accent: "#e8e0d0" }
  ];
  // Crossing reverses the lateral offset, so keep both sides of the aperture clear of consoles.
  const TUNNEL_SIGN = { y: 6.15, z: 0.7 };
  const TUNNEL_POST = 3.95;
  // The Lightning Jet Hangar's door (`hangarDoor`, in factory-scene-models.js): where the scene hangs the sign, the
  // bolts' x, the lamps from the header's ends, the opening's half-width and top, and the shield's plane.
  const HANGAR_DOOR = { post: TUNNEL_POST, sign: [0, 6.95, 0.86], bolts: 3.25, lamps: [[-3.3, 5.9, 0.8], [3.3, 5.9, 0.8]], half: 2.1, top: 4.65, plane: 0.45 };
  const TUNNEL_BOX = [-3.5, 0.95];
  // Where the lanterns hang, and what holds them: [kind, x, y, z, turn] with y the floor they stand on, and
  // strings [ax, ay, az, bx, by, bz, sag, at] with lanterns hung at the fractions `at` along them.
  //   hang:  a lantern on a short chain from a hook at (x, y, z)
  //   post:  a timber post with an arm out along +x turned by `turn`, the lantern hanging from its end
  //   top:   a heavy post with a big lantern standing on it, for the head of the stairway
  //   rail:  a small lantern standing on a rail post
  //   chain: a lantern at height y on a chain down from the vault
  const lanterns = (lamps, strings) => {
    const frame = [], glass = [], lights = [];
    const light = (x, y, z) => lights.push(x, y, z, 6);
    for (const [kind, x, y, z, turn = 0] of lamps) {
      if (kind === "hang") {
        frame.push(...chain(x, y, z, x, y - 0.3, z, 0.05, IRON_DK));
        lanternParts(1.05, x, y - 0.3 - 0.84 * 1.05, z, frame, glass);
        light(x, y - 0.75, z);
      } else if (kind === "post") {
        const ax = Math.cos(turn), az = -Math.sin(turn), tx = x + ax * 0.8, tz = z + az * 0.8;
        frame.push(bevelBox({ w: 0.22, h: 2.95, d: 0.22, color: TIMBER_DK, bevel: 0.04, offset: { x, y: y + 1.47, z } }));
        frame.push(beam(x - ax * 0.1, y + 2.82, z - az * 0.1, x + ax * 0.95, y + 2.82, z + az * 0.95, 0.14, TIMBER_DK), beam(x, y + 2.25, z, x + ax * 0.55, y + 2.78, z + az * 0.55, 0.09, TIMBER));
        frame.push(...chain(tx, y + 2.76, tz, tx, y + 2.46, tz, 0.05, IRON_DK));
        lanternParts(1.3, tx, y + 1.36, tz, frame, glass);
        light(tx, y + 1.8, tz);
      } else if (kind === "top") {
        frame.push(bevelBox({ w: 0.36, h: 1.7, d: 0.36, color: TIMBER_DK, bevel: 0.06, offset: { x, y: y + 0.85, z } }), bevelBox({ w: 0.56, h: 0.14, d: 0.56, color: IRON_DK, bevel: 0.03, offset: { x, y: y + 1.75, z } }));
        lanternParts(1.7, x, y + 1.82, z, frame, glass);
        light(x, y + 2.4, z);
      } else if (kind === "rail") {
        lanternParts(0.85, x, y + 1.06, z, frame, glass);
        light(x, y + 1.4, z);
      } else {
        frame.push(...chain(x, HALL.h, z, x, y + 1.5, z, 0.14, IRON_DK));
        lanternParts(1.75, x, y, z, frame, glass);
        light(x, y + 0.7, z);
      }
    }
    for (const [ax, ay, az, bx, by, bz, sag, at] of strings) {
      const at_ = (t) => ({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t - Math.sin(Math.PI * t) * sag, z: az + (bz - az) * t });
      frame.push(tube({ path: at_, radius: () => 0.03, rings: 20, segments: 5, colorFn: () => "#1b1714" }));
      for (const t of at) {
        const p = at_(t);
        frame.push(...chain(p.x, p.y, p.z, p.x, p.y - 0.36, p.z, 0.05, IRON_DK));
        lanternParts(1.2, p.x, p.y - 0.36 - 0.84 * 1.2, p.z, frame, glass);
        light(p.x, p.y - 0.8, p.z);
      }
    }
    return { frame: merge(...frame), glass: noShadow(merge(...glass)), lights };
  };

  // ---- the tunnel between the island and the hall ------------------------------------------------------

  // One tunnel with two ends: the hub dresses the 2 o'clock mouth with it, and the factory builds it again behind
  // its balcony, so looking back from inside shows the same tunnel running on to daylight. Both work in the
  // mouth's frame: x across, y up from the floor, +z out of the cave, the rim at z 0 and the shield at SHIELD_Z.
  // In the hall that frame stands at EXIT_Z with the balcony's floor, so the shield is the balcony's back edge.
  const SHIELD_Z = -3.8;
  const EXIT_Z = HALL.front - 0.6 - SHIELD_Z;

  // The part both ends share: three timber sets, the track running in (out to `reach`, since the factory's end
  // stops at the rim), and the shield's emitters, iron posts with cyan coils just outside the phase plane, which
  // is as wide as the mouth's opening (about ±2.5 m).
  const tunnelFrame = (reach) => {
    const geos = [], glow = [];
    for (const z of [0.2, -1.6, -3.2]) {
      const front = z > -2.5, postHeight = front ? 3 : 3.3;
      for (const x of [-2.15, 2.15]) geos.push(bevelBox({ w: 0.34, h: postHeight, d: 0.34, color: TIMBER_DK, bevel: 0.06, offset: { x, y: postHeight * 0.5, z } }));
      // The front passage has a 3 m stone ceiling; tuck its crossbeams beneath it.
      geos.push(bevelBox({ w: 4.8, h: 0.36, d: 0.42, color: TIMBER, bevel: 0.06, offset: { y: front ? 2.84 : 3.4, z } }));
      for (const s of [-1, 1]) geos.push(beam(s * 2.1, front ? 2.25 : 2.6, z, s * 1.4, front ? 2.85 : 3.3, z, 0.14, TIMBER_DK));
    }
    for (const x of [-0.5, 0.5]) geos.push(box({ w: 0.07, h: 0.07, d: reach + 4.6, color: IRON_LT, offset: { x, y: 0.1, z: (reach - 4.6) / 2 } }));
    for (let z = reach - 0.2; z > -4.5; z -= 0.5) geos.push(box({ w: 1.3, h: 0.06, d: 0.18, color: TIMBER_DK, offset: { y: 0.04, z } }));
    for (const x of [-2.72, 2.72]) {
      geos.push(bevelBox({ w: 0.4, h: 3.4, d: 0.4, color: IRON_DK, bevel: 0.05, offset: { x, y: 1.7, z: SHIELD_Z } }));
      for (let y = 0.5; y < 3.2; y += 0.45) glow.push(box({ w: 0.5, h: 0.12, d: 0.5, color: CYAN, emissive: 0.95, offset: { x, y, z: SHIELD_Z } }));
    }
    glow.push(box({ w: 5.8, h: 0.14, d: 0.3, color: CYAN, emissive: 0.9, offset: { y: 3.35, z: SHIELD_Z } }));
    return { geos, glow };
  };

  // The hub's end. Beyond the shield, the factory's bolt glows at the end of the tunnel against a dark wall, so the
  // path pulls people in: the smooth bolt, not the voxel one. A plain start, to be dressed further later.
  const ROOF_TUBE = { x: 0, z: -2, height: 1.6, radius: 0.29 };
  const outletShaft = (depth) => lathe({ profile: [[0.35, -depth], [0.35, 0], [0.29, 0], [0.29, -depth], [0.35, -depth]], segments: 16, color: IRON_DK });
  const bananaOutlet = cached(() => {
    const h = ROOF_TUBE.height;
    return shaded([
      lathe({ profile: [[0.4, 0], [0.35, 0.15], [0.35, h - 0.25], [0.46, h - 0.1], [0.46, h], [0.4, h], [0.29, h - 0.25], [0.29, 0], [0.4, 0]], segments: 16, color: IRON_DK }),
      moved(torus(0.37, 0.04, ORANGE, 0, 16, 6), 0, 0.45, 0),
      moved(torus(0.37, 0.04, ORANGE, 0, 16, 6), 0, h - 0.45, 0),
      moved(torus(0.46, 0.035, BRASS, 0, 16, 6), 0, h - 0.04, 0)
    ]);
  });
  const hubTunnel = cached(() => {
    const { geos, glow } = tunnelFrame(1);
    geos.push(box({ w: 4.6, h: 3.6, d: 0.2, color: "#1f140e", offset: { y: 1.8, z: SHIELD_Z - 2.9 } }));
    glow.push(moved(smoothBolt(2.2, 0.24, "#ffd84a", 1), 0, 1.6, SHIELD_Z - 2.3));
    for (const x of [-1.5, 1.5]) glow.push(box({ w: 0.26, h: 0.34, d: 0.26, color: "#ffd27a", emissive: 1, offset: { x, y: 2.7, z: SHIELD_Z - 1.5 } }));
    return { timber: merge(...geos), glow: noShadow(merge(...glow)) };
  });

  // ---- the hall through the island's shield -------------------------------------------------------------

  // The hall as the island sees it through the shield at the 2 o'clock mouth. The hub's window pulls every point of
  // this stand-in along its own sight line into a band just behind the shield, so it is built at full size in the
  // hall's frame from the same table and helpers as the hall, and kept light: the core slimmed to its turned shapes,
  // decks as slabs, lanterns as their glass, the cavern as a gridded shell. Every face glows with the hall's light at
  // rest baked into its colour, so the island's sun and clock never touch it, and stone and timber stay dark, so the
  // island's bloom, which every glowing face feeds, picks out only the lights. `front` is the balcony's last half
  // metre before the shield at true size, where an Ooga walks through; `hall` is everything else that stands still,
  // cut off where `front` begins; `chamber`, the `tank` variants standing at `tanks`, `fire`, `sat` and `satRed` are
  // what the window lights and moves; and `paths` are the conduits the sats ride, sampled as `conduits` samples them.
  const WINDOW_CUT = HALL.front - 1.1;
  const WINDOW_SHIELD = EXIT_Z + SHIELD_Z;
  // The factory's light at rest, as `scene-factory.js` sets it: ambient by a face's slope over its floor, the sun and
  // the violet fill in its shade, and fog judged from an eye ten metres out from the shield. Stone and timber are
  // dimmed by `dim` for the bloom they feed, then eased from `knee` to under `cap`.
  const WINDOW_MOOD = {
    sky: [0.42, 0.3, 0.2], ground: [0.16, 0.11, 0.08], floor: 0.34, sun: [0.25, 0.9, 0.3], direct: [0.6, 0.45, 0.32], strength: 0.35, fill: [0.05, 0.04, 0.11],
    fog: [0.1, 0.07, 0.05], near: 40, far: 110, eye: [0, LEVEL.main + 2.5, WINDOW_SHIELD + 10], dim: 0.55, knee: 0.08, cap: 0.22
  };
  // Winds a face's vertex ids so its normal, taken as the renderer takes it (Newell's), points along (ox, oy, oz).
  const orient = (geo, ids, ox, oy, oz) => {
    const v = geo.verts;
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < ids.length; k++) {
      const p = ids[k] * 3, q = ids[(k + 1) % ids.length] * 3;
      nx += (v[p + 1] - v[q + 1]) * (v[p + 2] + v[q + 2]);
      ny += (v[p + 2] - v[q + 2]) * (v[p] + v[q]);
      nz += (v[p] - v[q]) * (v[p + 1] + v[q + 1]);
    }
    return nx * ox + ny * oy + nz * oz < 0 ? ids.reverse() : ids;
  };
  // A set of point lights, [x, y, z, radius, r, g, b] each, sorted once into the cells, WINDOW_CELL metres on a side,
  // that their reach touches, so a face weighs only those in its own cell.
  const WINDOW_CELL = 8;
  const windowCell = (x, y, z) => ((Math.floor(x / WINDOW_CELL) + 512) * 1024 + Math.floor(y / WINDOW_CELL) + 512) * 1024 + Math.floor(z / WINDOW_CELL) + 512;
  const windowLights = (list) => {
    const P = Float64Array.from(list.flat()), C = WINDOW_CELL, cells = new Map();
    for (let o = 0; o < P.length; o += 7) {
      const r = P[o + 3];
      for (let x = P[o] - r; x < P[o] + r + C; x += C) for (let y = P[o + 1] - r; y < P[o + 1] + r + C; y += C) for (let z = P[o + 2] - r; z < P[o + 2] + r + C; z += C) {
        const key = windowCell(Math.min(x, P[o] + r), Math.min(y, P[o + 1] + r), Math.min(z, P[o + 2] + r)), near = cells.get(key);
        if (!near) cells.set(key, [o]);
        else if (near[near.length - 1] !== o) near.push(o);
      }
    }
    return { P, cells };
  };
  // Lights every face as the factory's shader would under WINDOW_MOOD (or another place's `mood`) and a `windowLights`
  // set, and sets it glowing in that colour, so it draws the same wherever it stands. `at` is added to each face's
  // middle before it is lit, for a part built at the origin. A face that glows fully takes no light.
  const bakeWindow = (geo, { P, cells }, at = [0, 0, 0], mood = WINDOW_MOOD) => {
    const { sky, ground, floor, sun, direct, strength, fill, fog: haze, near: fogNear, far: fogFar, eye, dim, knee, cap } = mood;
    const v = geo.verts, faces = geo.faces, sl = Math.hypot(...sun), ux = sun[0] / sl, uy = sun[1] / sl, uz = sun[2] / sl, none = [];
    const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const light = [0, 0, 0], rgb = [0, 0, 0];
    for (let j = 0; j < faces.length; j++) {
      const f = faces[j], ids = f.i, n = ids.length, e = f.emissive || 0;
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let k = 0, p = ids[n - 1] * 3; k < n; k++) {
        const q = ids[k] * 3;
        nx += (v[p + 1] - v[q + 1]) * (v[p + 2] + v[q + 2]);
        ny += (v[p + 2] - v[q + 2]) * (v[p] + v[q]);
        nz += (v[p] - v[q]) * (v[p + 1] + v[q + 1]);
        cx += v[q]; cy += v[q + 1]; cz += v[q + 2];
        p = q;
      }
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      cx = cx / n + at[0]; cy = cy / n + at[1]; cz = cz / n + at[2];
      const lam = nx * ux + ny * uy + nz * uz, toon = Math.max(lam, 0) * 0.55 + ease(-0.05, 0.45, lam) * 0.45, up = ny * 0.5 + 0.5;
      for (let k = 0; k < 3; k++) light[k] = Math.max(ground[k] + (sky[k] - ground[k]) * up, floor) + (direct[k] * toon + fill[k] * (1 - toon)) * strength;
      const near = e < 1 ? cells.get(windowCell(cx, cy, cz)) || none : none;
      for (let q = 0; q < near.length; q++) {
        const o = near[q], dx = P[o] - cx, dy = P[o + 1] - cy, dz = P[o + 2] - cz, r = P[o + 3], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2), a = 1 - d / r, k = a * a * Math.max(0, nx * dx + ny * dy + nz * dz) / Math.max(d, 1e-4);
        light[0] += P[o + 4] * k; light[1] += P[o + 5] * k; light[2] += P[o + 6] * k;
      }
      const ex = cx - eye[0], ey = cy - eye[1], ez = cz - eye[2], fog = ease(fogNear, fogFar, Math.sqrt(ex * ex + ey * ey + ez * ez)), keep = e < 0.5 ? dim / 1.15 : 1 / 1.15;
      let top = 0;
      for (let k = 0; k < 3; k++) {
        const shown = f.color[k] / 255 * (light[k] * (1 - e) + 1.15 * e);
        rgb[k] = (shown + (haze[k] - shown) * fog) * keep;
        top = Math.max(top, rgb[k]);
      }
      const eased = e < 0.5 && top > knee ? (knee + (cap - knee) * (1 - Math.exp(-(top - knee) / (cap - knee)))) / top * 255 : 255;
      f.color = [Math.round(Math.min(255, rgb[0] * eased)), Math.round(Math.min(255, rgb[1] * eased)), Math.round(Math.min(255, rgb[2] * eased))];
      f.emissive = 1;
    }
    geo.castShadow = false;
    geo.cutawayHide = true;
    return geo;
  };
  // A box between two corners, and a board from one point to another, `w` wide and 0.2 thick with its top on the
  // line: a flight of stairs or a bridge, seen from across the hall.
  const span = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), d: Math.abs(z1 - z0), color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const board = (ax, ay, az, bx, by, bz, w, color) => {
    const run = Math.hypot(bx - ax, bz - az);
    return moved(turnedY(turnedX(box({ w, h: 0.2, d: Math.hypot(run, by - ay), color }), -Math.atan2(by - ay, run)), Math.atan2(bx - ax, bz - az)), (ax + bx) / 2, (ay + by) / 2 - 0.1, (az + bz) / 2);
  };
  // A flat polygon of [x, y, z] points facing (ox, oy, oz).
  const plate = (points, [ox, oy, oz], color, emissive = 0) => {
    const geo = geometry();
    face(geo, orient(geo, points.map(([x, y, z]) => pushVert(geo, x, y, z)), ox, oy, oz), hexToRgb(color), { emissive });
    return geo;
  };
  // A sheet of `nu` by `nv` quads over the unit square, laid by `at(u, v)` and facing along `out`, each in the stone
  // `tone(i, j)` gives it: the cavern's floor, walls and vault.
  const sheet = (nu, nv, at, [ox, oy, oz], tone) => {
    const geo = geometry(), row = nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pushVert(geo, ...at(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      face(geo, orient(geo, [a, a + 1, a + row + 1, a + row], ox, oy, oz), hexToRgb(tone(i, j)));
    }
    return geo;
  };
  // A half ring of stone round (0, cy), from radius r0 to r1 and depth z0 to z1, in `n` pieces: its face, its
  // underside and its back.
  const archBand = (r0, r1, cy, z0, z1, n, color) => {
    const geo = geometry(), rgb = hexToRgb(color), P = [];
    for (let k = 0; k <= n; k++) {
      const a = Math.PI * k / n;
      P.push([r0, r1].map((r) => [z0, z1].map((z) => pushVert(geo, Math.cos(a) * r, cy + Math.sin(a) * r, z))));
    }
    for (let k = 0; k < n; k++) {
      const a = P[k], b = P[k + 1], m = Math.PI * (k + 0.5) / n, mx = Math.cos(m), my = Math.sin(m);
      face(geo, orient(geo, [a[0][1], a[1][1], b[1][1], b[0][1]], 0, 0, 1), rgb);
      face(geo, orient(geo, [a[0][0], a[0][1], b[0][1], b[0][0]], -mx, -my, 0), rgb);
      face(geo, orient(geo, [a[1][0], a[1][1], b[1][1], b[1][0]], mx, my, 0), rgb);
    }
    return geo;
  };
  // The part of the segment a to b whose depth z lies between lo and hi, as [a, b], or null.
  const within = (a, b, lo, hi) => {
    const dz = b[2] - a[2];
    let t0 = 0, t1 = 1;
    if (Math.abs(dz) < 1e-9) { if (a[2] < lo || a[2] > hi) return null; } else {
      const ta = (lo - a[2]) / dz, tb = (hi - a[2]) / dz;
      t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
    }
    if (t1 - t0 < 1e-6) return null;
    const at = (t) => a.map((c, k) => c + (b[k] - c) * t);
    return [at(t0), at(t1)];
  };
  // A rail as `railParts` builds it, lighter: its posts, the handrail, the bottom rail and, with `braces`, the cross in
  // each bay, on a deck whose top is at y, keeping only what lies at depths within `keep`: a slanting brace's cut end
  // is pressed flat into the cut, so the two sides of it meet exactly there.
  const railLite = (x0, z0, x1, z1, y, { ends = [true, true], braces = false, step = 1.5, keep = [-Infinity, Infinity] } = {}) => {
    const geos = [], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)), [lo, hi] = keep;
    const at = (t, h) => [x0 + (x1 - x0) * t, y + h, z0 + (z1 - z0) * t];
    const put = (a, b, w, color) => {
      const s = within(a, b, lo, hi);
      if (!s) return;
      const g = beam(...s[0], ...s[1], w, color), gv = g.verts;
      for (let k = 2; k < gv.length; k += 3) gv[k] = Math.min(hi, Math.max(lo, gv[k]));
      geos.push(g);
    };
    for (let i = 0; i <= n; i++) {
      if (i === 0 && !ends[0] || i === n && !ends[1]) continue;
      const [x, , z] = at(i / n, 0);
      if (z >= lo && z <= hi) geos.push(span(x - 0.085, x + 0.085, y, y + 1.06, z - 0.085, z + 0.085, TIMBER_DK));
    }
    put(at(0, 1.02), at(1, 1.02), 0.12, TIMBER_LT);
    put(at(0, 0.2), at(1, 0.2), 0.1, TIMBER);
    if (braces) for (let i = 0; i < n; i++) {
      put(at(i / n, 0.25), at((i + 1) / n, 0.97), 0.055, TIMBER);
      put(at(i / n, 0.97), at((i + 1) / n, 0.25), 0.055, TIMBER);
    }
    return geos;
  };
  // A point in Kortik's Switchboard's frame ([along, up, out] from the middle of its face) in the hall's, into `into`
  // (a fresh array when none is given), and a hall point back in the station's frame. The station turns its +out
  // (+z) to the hall's +x.
  const kortikAt = (along, up, out, into = []) => {
    const d = LAYOUT.kortik;
    into[0] = d.x - d.w / 2 + KORTIK.face + out; into[1] = d.y + up; into[2] = d.z - along;
    return into;
  };
  const kortikFrom = (x, y, z, into = []) => {
    const d = LAYOUT.kortik;
    into[0] = d.z - z; into[1] = y - d.y; into[2] = x - (d.x - d.w / 2 + KORTIK.face);
    return into;
  };
  // Kortik's Switchboard's lanterns, as the hall and the window hang them: one from each end of the beam over its sign,
  // and a post lamp at the deck's two corners on the hall's side, clear of the bridge and the stair. And where the
  // station's own two lanterns stand, as lights.
  const kortikLamps = () => {
    const d = LAYOUT.kortik;
    return [...KORTIK.hooks.map(([along, up, out]) => ["hang", ...kortikAt(along, up, out)]),
      ["post", d.x + 1.9, d.y, d.z - d.d / 2 + 0.25, Math.PI], ["post", d.x + d.w / 2 - 0.25, d.y, d.z + d.d / 2 - 0.25, 0]];
  };
  const kortikLights = () => KORTIK.lanterns.map(([along, foot, out, scale]) => kortikAt(along, foot + 0.4 * scale, out));
  // While the hangar is open: the lamps from its door's header, those on its walkway's hall-side rail, which take the
  // place of the balcony's left rail lamp where the walkway opens it, standing on that rail's posts, and a lantern post
  // at each of the landing's outer corners, its arm out over the landing. `lighting()` in `scene-factory.js` and the
  // hall's window hang the same.
  const hangarLamps = () => {
    if (!hangarEntry()) return [];
    const L = LAYOUT, h = L.hangar, hl = L.hangarLanding, e = L.entrance, c = Math.cos(h.turn), sn = Math.sin(h.turn), [[, , z0]] = L.walkLeft, out = [];
    for (const [lx, ly, lz] of HANGAR_DOOR.lamps) out.push(["hang", h.x + lx * c + lz * sn, h.y + ly, h.z - lx * sn + lz * c]);
    const rx0 = e.x - e.w / 2 + 0.1, rx1 = hl.x + hl.w / 2 - 0.1, n = Math.max(1, Math.round(Math.abs(rx1 - rx0) / 1.5));
    for (const f of [0.2, 0.5, 0.8]) out.push(["rail", rx0 + (rx1 - rx0) * Math.round(f * n) / n, e.y, z0 + 0.1]);
    for (const s of [-1, 1]) out.push(["post", hl.x + hl.w / 2 - 0.45, hl.y, hl.z + s * (hl.d / 2 - 0.45), s * Math.PI / 2]);
    return out;
  };
  // The landing's dressing in the hall's frame (`hangarLanding`): the hazard stripes across the door's opening, the
  // crate stack by the door on the hall side and the cable drum on the far side, [x, z] each, and what of them stands
  // in a walker's way, [x, z, radius].
  const HANGAR_LANDING = { stripes: 10, crates: [-19.5, 21.6], drum: [-19.55, 28.45], blocks: [[-19.5, 21.6, 0.7], [-19.55, 28.45, 0.55]] };
  const hangarLanding = cached(() => {
    const hl = LAYOUT.hangarLanding, h = LAYOUT.hangar, D = HANGAR_DOOR, H = HANGAR_LANDING, y = hl.y, geos = [], lit = [];
    // Hazard stripes across the threshold, yellow and black as along the hangar's runway.
    const step = 2 * D.half / H.stripes, sx = hl.x - hl.w / 2 + 0.24;
    for (let i = 0; i < H.stripes; i++) geos.push(box({ w: 0.36, h: 0.02, d: step, color: i % 2 ? "#1d1d20" : "#f2c230", offset: { x: sx, y: y + 0.01, z: h.z - D.half + (i + 0.5) * step } }));
    // The hangar's crates, banded in iron, a small one set askew on a big one, the bolt lit on its face to the walkway.
    const [cx, cz] = H.crates;
    const crate = (w, ch, d, x, cy, z, a) => {
      const parts = [bevelBox({ w, h: ch, d, color: TIMBER_LT, bevel: 0.04, offset: { y: ch / 2 } })];
      for (const t of [0.15, 0.85]) parts.push(box({ w: w + 0.02, h: 0.05, d: d + 0.02, color: IRON_DK, offset: { y: ch * t } }));
      geos.push(moved(turnedY(merge(...parts), a), x, cy, z));
    };
    crate(1, 0.8, 0.9, cx, y, cz, 0);
    crate(0.7, 0.6, 0.65, cx + 0.05, y + 0.8, cz + 0.02, 0.3);
    lit.push(moved(turnedY(smoothBolt(0.42, 0.05, "#ffd23a", 1), Math.PI / 2), cx + 0.52, y + 0.42, cz));
    // A drum of the hangar's orange cable on its side, its flanges either end.
    const [dx, dz] = H.drum, ring = (r) => Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * TAU) * r, Math.sin(k / 16 * TAU) * r]);
    for (const s of [-1, 1]) geos.push(moved(prism(ring(0.5), 0.07, TIMBER_DK), dx, y + 0.5, dz + s * 0.27));
    geos.push(moved(prism(ring(0.36), 0.48, "#d8661e"), dx, y + 0.5, dz), moved(prism(ring(0.12), 0.62, IRON_DK), dx, y + 0.5, dz));
    return { body: merge(...geos), glow: noShadow(merge(...lit)) };
  });
  // Where the lanterns hang, by the rules `lighting()` in `scene-factory.js` hangs them: [kind, x, y, z, turn] each,
  // and the strings across the hall [ax, ay, az, bx, by, bz, sag, at]. The mouth's own string is past the shield.
  const windowLamps = () => {
    const L = LAYOUT, e = L.entrance, lamps = [];
    const onRail = (x0, z0, x1, z1, y, fractions) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.4) + 1);
      for (const f of fractions) { const k = Math.round(f * (n - 1)) / (n - 1); lamps.push(["rail", x0 + (x1 - x0) * k, y, z0 + (z1 - z0) * k]); }
    };
    const [sx, , foot, , , head, sw] = L.stairway;
    lamps.push(["top", -2.3, e.y, head + 0.5], ["top", 2.3, e.y, head + 0.5], ["post", -2.4, 0, foot - 0.7, 0], ["post", 2.4, 0, foot - 0.7, Math.PI]);
    for (let z = foot + 0.1 + 3; z < head - 1; z += 3) for (const s of [-1, 1]) lamps.push(["rail", sx + s * (sw / 2 + 0.1), e.y * (z - foot) / (head - foot), z]);
    for (const b of L.bays) for (const s of [-1, 1]) lamps.push(["hang", stationX(b) + s * 3.05, b.y + 3.88, stationZ(b) - 0.6]);
    for (const s of [-1, 1]) lamps.push(["hang", L.forge.x + s * 3.05, 4.05, L.forge.z + 1.2]);
    for (const t of L.tunnels) for (const s of [-1, 1]) {
      const lx = s * 3.3, lz = 0.8, c = Math.cos(t.turn), sn = Math.sin(t.turn);
      lamps.push(["hang", t.x + lx * c + lz * sn, t.y + 5.9, t.z - lx * sn + lz * c]);
    }
    for (const [lx, ly, lz] of STUDY.lamps) lamps.push(["hang", L.study.x - lz, L.study.y + ly, L.study.z + lx]);
    lamps.push(["post", L.switchboard.x + 3.1, L.switchboard.y, L.switchboard.z - 1.9, Math.PI], ...kortikLamps());
    for (const [x, z] of SHAFTS) for (const s of [-1, 1]) lamps.push(["hang", x + s * 1.7, 2.76, z - 0.2]);
    for (const [d, spots] of [[L.rebalancer, REB.lamps], [L.treasury, TRE.lamps], [L.cooker, COOK.lamps]]) for (const [x, y, z] of spots) lamps.push(["hang", d.x + x, d.y + y, d.z + z]);
    const [[w0, w1, a0], [s0, , s1]] = L.walk;
    onRail(w0, a0 + 0.1, w1, a0 + 0.1, e.y, [0.2, 0.5, 0.8]);
    onRail(s0 + 0.1, a0, s0 + 0.1, s1, e.y, [0.1, 0.3, 0.5, 0.7, 0.9]);
    if (hangarEntry()) lamps.push(...hangarLamps());
    else onRail(-e.w / 2 + 0.1, e.z - e.d / 2 + 0.1, -e.w / 2 + 0.1, e.z + e.d / 2 - 0.1, e.y, [0.5]);
    const r = L.ring;
    for (const i of [5, 9, 16, 19, 23, 26]) { const a = i / 28 * TAU; lamps.push(["rail", r.x + Math.cos(a) * (r.outer - 0.15), r.y - 0.05, r.z + Math.sin(a) * (r.outer - 0.15)]); }
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = porchOf(t);
      if (t.turn) onRail(x0, z0 + 0.1, x1, z0 + 0.1, t.y, [0.5]);
      else onRail(x0 + 0.1, z0, x0 + 0.1, z1, t.y, [0.5]);
    }
    for (const s of [-1, 1]) lamps.push(["chain", s * 6, 12.5, 8], ["chain", s * 13, 16.5, 3]);
    return {
      lamps,
      strings: [[-14, 16, -12, 14, 16, -12, 1.6, [0.2, 0.4, 0.6, 0.8]], [-18, 13.5, -8, 18, 13.5, -8, 1.4, [0.2, 0.35, 0.65, 0.8]], [20, 9.5, 5, 13.5, 9, 7, 0.6, [0.5]]]
    };
  };
  const hubWindow = cached(() => {
    const L = LAYOUT, e = L.entrance, c = L.core, f = L.forge, r = L.ring, [lo, hi] = c.chamber, M = LEVEL.main, H = HALL.h, B = HALL.back, W = HALL.halfW, CUT = WINDOW_CUT;
    const parts = [], front = [];
    // The hall's lights at rest, as `lightUp` and `lightPool` set them: the core, the forge, the lines, the
    // switchboard, rebalancer, treasury and watchtower, then the study, the tunnels, the balcony, the galleries, the
    // daylight at the rim and every lantern, which the lanterns below add as they hang.
    const lights = [
      [c.x, 8.3, c.z + 3.4, 26, 0.97, 0.6, 0.24], [f.x, 1.9, f.z + 1.6, 12, 0.7, 0.32, 0.1],
      ...L.bays.map((b) => [stationX(b), b.y + 2.2, b.z + 1.6, 9, 0.33, 0.45, 0.6]),
      [L.switchboard.x, L.switchboard.y + 2.2, L.switchboard.z + 0.8, 9, 0.35, 0.6, 1], [L.rebalancer.x, L.rebalancer.y + 1.6, L.rebalancer.z + 0.6, 9, 0.18, 0.45, 0.5],
      [L.treasury.x, L.treasury.y + 2, L.treasury.z + 1, 9, 1, 0.8, 0.35], [L.lookout.x, L.lookout.y + L.lookout.tower + 1, L.lookout.z, 14, 1, 0.82, 0.45],
      [L.study.x + 1, L.study.y + 2.8, L.study.z, 6, 1, 0.75, 0.4], ...kortikLights().map(([x, y, z]) => [x, y, z, 6, 1, 0.66, 0.3]),
      ...L.tunnels.map((t, i) => [t.x + Math.sin(t.turn) * 2, t.y + 2.4, t.z + Math.cos(t.turn) * 2, 8, ...hexToRgb(TUNNEL_THEMES[i].ring).map((k) => k / 255)]),
      ...hangarEntry() ? [[L.hangar.x + Math.sin(L.hangar.turn) * 2, L.hangar.y + 2.4, L.hangar.z + Math.cos(L.hangar.turn) * 2, 8, ...hexToRgb(CYAN).map((k) => k / 255)]] : [],
      [0, e.y + 2.2, e.z - 4, 12, 1, 0.66, 0.3], ...L.galleries.map((g) => [g.x, g.y + 2, g.z + 1, 10, 1, 0.66, 0.3]), [0, e.y + 2.2, EXIT_Z - 0.6, 9, 1.15, 1.1, 1]
    ];

    // The cavern: the pit's floor, the walls leaning in as they rise (at their smoothest, where the water runs) and the
    // vault, in tiles of the hall's stone so the baked light grades across them, closed all round but for the front.
    const lean = (y) => 0.5 + y / H * WALL_LEAN, tone = (k) => (i, j) => STONE[(i * 7 + j * 13 + k * 5) & 3];
    parts.push(sheet(12, 13, (u, v) => [-W + 2 * W * u, 0, B + (CUT - B) * v], [0, 1, 0], tone(0)));
    parts.push(sheet(12, 7, (u, v) => [(2 * u - 1) * (W - lean(H * v)), H * v, B + lean(H * v)], [0, 0, 1], tone(1)));
    for (const s of [-1, 1]) parts.push(sheet(13, 7, (u, v) => [s * (W - lean(H * v)), H * v, B + lean(H * v) + (CUT - B - lean(H * v)) * u], [-s, 0, 0], tone(s + 3)));
    parts.push(models.cutCylinder(sheet(8, 10, (u, v) => [(2 * u - 1) * (W - lean(H)), H, B + lean(H) + (CUT - B - lean(H)) * v], [0, -1, 0], tone(5)), L.cooker.x + COOK.lip[0], L.cooker.z + COOK.lip[2], ROOF_TUBE.radius));
    // The falls of glowing water down the back wall, the pools they land in, and the crystal at the walls' feet, on
    // the ledges by the tunnels and by the outcrops framing the pit, which stand here as stacked stone.
    for (const fx of FALLS) {
      const strip = geometry(), ids = [];
      for (let k = 0; k <= 10; k++) {
        const y = k * 1.58, z = B + 1.55 + y / H * WALL_LEAN;
        ids.push([pushVert(strip, fx - 0.65, y, z), pushVert(strip, fx + 0.65, y, z)]);
      }
      for (let k = 0; k < 10; k++) face(strip, orient(strip, [ids[k][0], ids[k][1], ids[k + 1][1], ids[k + 1][0]], 0, 0, 1), hexToRgb(k % 2 ? "#6ab8ff" : "#3f8fe0"), { emissive: 0.65 });
      parts.push(strip, moved(lathe({ profile: [[1.6, 0.15], [0, 0.15]], segments: 10, color: "#4a9bff", emissive: 0.5 }), fx, 0, B + 2.6));
    }
    const rand = mulberry32(2113);
    const crystal = (x, y, z, s) => {
      for (let k = 0; k < 2; k++) {
        const a = rand() * TAU, h = s * (1.2 + rand() * 1.2), w = s * 0.22, g = lathe({ profile: [[w, 0], [w * 0.9, h * 0.8], [0, h]], segments: 4, color: k ? "#7fc4ff" : CRYSTAL, emissive: 0.75 });
        const cl = Math.cos(a) * 0.35, sl = Math.sin(a) * 0.35, gv = g.verts;
        for (let i = 0; i < gv.length; i += 3) { gv[i] += gv[i + 1] * cl; gv[i + 2] += gv[i + 1] * sl; }
        parts.push(moved(g, x + Math.cos(a) * s * 0.3, y, z + Math.sin(a) * s * 0.3));
      }
    };
    for (let i = 0; i < 12; i++) {
      const side = i % 3, t = rand(), s = 0.8 + rand() * 0.9;
      if (side === 2) crystal(-W + 4 + t * (2 * W - 8), 0, B + 1.8, s);
      else crystal((side ? 1 : -1) * (W - 1.5 - rand()), 0, B + 3 + t * (HALL.front - B - 8), s);
    }
    for (const t of L.tunnels) crystal(t.x + (t.turn ? 0 : 3.6), t.y, t.z + (t.turn ? 3.4 : 1.4), 0.7);
    for (const [x, z, s, tiers, th] of outcrops()) {
      for (let k = 0; k < tiers; k++) {
        const w = (3.6 - k * 0.7) * s, h = 1.4 * s * th;
        parts.push(box({ w, h, d: w * 0.9, color: STONE[(k + 2) % 4], offset: { x, y: h * (k + 0.5), z } }));
      }
      crystal(x + 1.4 * s, 0, z - 1.2 * s, 0.9 * s);
    }

    // The balcony, its planks as the scaffold lays them with their tops a hair over the floor the island's mouth
    // carves, so the planks at the shield lie on it; its rails, open to the stairway and the walkway; and the track in
    // from the tunnel. `front` takes the last half metre of each, from where the hall is cut to the shield.
    {
      const n = Math.max(2, Math.round(e.w / 0.9)), prand = mulberry32(Math.round(e.x * 7 + e.z)), top = e.y + 0.02, z0 = e.z - e.d / 2 + 0.02;
      for (let i = 0; i < n; i++) {
        const x = e.x + ((i + 0.5) / n - 0.5) * e.w, hw = e.w / n / 2 - 0.025, color = [TIMBER, TIMBER_LT, "#946236"][Math.floor(prand() * 3)];
        parts.push(span(x - hw, x + hw, top - 0.2, top, z0, CUT, color));
        front.push(span(x - hw, x + hw, e.y, top, CUT, WINDOW_SHIELD - 0.02, color));
      }
      const ex = e.w / 2 - 0.1, ez0 = e.z - e.d / 2 + 0.1, ez1 = e.z + e.d / 2 - 0.1, [[, , a0, a1]] = L.walk, cz = (a0 + a1) / 2, ch = (a1 - a0) / 2 - 0.1, sh = L.stairway[6] / 2 + 0.1;
      // The left rail opens to the hangar's walkway while the hangar is open, as the right one does to the kiosk's.
      const [[, , b0, b1]] = L.walkLeft, lz = (b0 + b1) / 2, lh = (b1 - b0) / 2 - 0.1;
      const rails = (keep) => [
        ...railLite(e.x - ex, ez0, e.x - sh, ez0, e.y, { keep, braces: true }), ...railLite(e.x + sh, ez0, e.x + ex, ez0, e.y, { keep, braces: true }),
        ...hangarEntry() ? [...railLite(e.x - ex, ez0, e.x - ex, lz - lh, e.y, { ends: [false, true], keep, braces: true }), ...railLite(e.x - ex, lz + lh, e.x - ex, ez1, e.y, { keep, braces: true })]
          : railLite(e.x - ex, ez0, e.x - ex, ez1, e.y, { ends: [false, true], keep, braces: true }),
        ...railLite(e.x + ex, ez0, e.x + ex, cz - ch, e.y, { ends: [false, true], keep, braces: true }), ...railLite(e.x + ex, cz + ch, e.x + ex, ez1, e.y, { keep, braces: true })
      ];
      parts.push(...rails([-Infinity, CUT]));
      front.push(...rails([CUT, WINDOW_SHIELD - 0.02]));
      // The track's rails run on 0.8 m past the shield, as `tunnelFrame` lays them. At the shield they lie over the
      // island's own rails and last sleeper, laid as `hubTunnel` lays them, so `front` draws them a little fuller.
      for (const x of [-0.5, 0.5]) {
        parts.push(span(x - 0.035, x + 0.035, e.y + 0.065, e.y + 0.135, EXIT_Z - 4.6, CUT, IRON_LT));
        front.push(span(x - 0.04, x + 0.04, e.y + 0.06, e.y + 0.14, CUT, WINDOW_SHIELD - 0.02, IRON_LT));
      }
      for (let z = 1 - 0.2; z > -4.5; z -= 0.5) if (z + EXIT_Z > CUT && z + EXIT_Z < WINDOW_SHIELD) front.push(span(-0.66, 0.66, e.y + 0.005, e.y + 0.075, z + EXIT_Z - 0.1, z + EXIT_Z + 0.1, TIMBER_DK));
    }
    // The grand stairway down to the forge: treads, stringers, and its rails on their posts.
    {
      const [x, y0, z0, , y1, z1, w] = L.stairway, steps = Math.round((y1 - y0) / 0.32), run = (z1 - z0) / steps, rise = (y1 - y0) / steps;
      const heightAt = (z) => y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      for (let i = 0; i < steps; i++) parts.push(span(x - w / 2 + 0.05, x + w / 2 - 0.05, y0 + rise * (i + 1) - 0.12, y0 + rise * (i + 1), z0 + run * i - 0.015, z0 + run * (i + 1) + 0.015, i % 2 ? TIMBER : TIMBER_LT));
      for (const s of [-1, 1]) {
        const sx = x + s * (w / 2 + 0.1);
        parts.push(beam(sx, y0 - 0.1, z0, sx, y1 - 0.1, z1, 0.3, TIMBER_DK), beam(sx, y0 + 1.05, z0 - 0.2, sx, heightAt(z1 + 0.1) + 1.02, z1 + 0.1, 0.14, TIMBER_LT), beam(sx, y0 + 0.6, z0 - 0.2, sx, heightAt(z1 + 0.1) + 0.6, z1 + 0.1, 0.09, TIMBER));
        for (let z = z0 + 0.1; z < z1 - 0.5; z += 1.5) parts.push(span(sx - 0.085, sx + 0.085, heightAt(z) - 0.05, heightAt(z) + 1.05, z - 0.085, z + 0.085, TIMBER_DK));
      }
    }
    // Level 2's walkway along the right wall and its rails, and every other flight, bridge, deck and porch as slabs.
    {
      const [[, , a0, a1], [s1x0, s1x1, s1z0]] = L.walk, ex = e.x + e.w / 2 - 0.1, wx = s1x0 + 0.1;
      for (const [p0, p1, q0, q1] of L.walk) parts.push(span(p0, p1, e.y - 0.2, e.y, q0, q1, TIMBER));
      parts.push(...railLite(ex, a0 + 0.1, wx, a0 + 0.1, e.y, { ends: [false, true] }), ...railLite(ex, a1 - 0.1, s1x1 - 0.1, a1 - 0.1, e.y, { ends: [false, true] }), ...railLite(wx, a0 + 0.1, wx, s1z0 - 0.1, e.y, { ends: [false, true] }));
      // And the hangar's walkway on the left, its mirror, while the hangar is open.
      if (hangarEntry()) {
        const [[x0, x1, z0, z1]] = L.walkLeft, hl = L.hangarLanding, lx = e.x - e.w / 2 + 0.1, rx = hl.x + hl.w / 2 - 0.1;
        parts.push(span(x0, x1, e.y - 0.2, e.y, z0, z1, TIMBER));
        for (const z of [z0 + 0.1, z1 - 0.1]) parts.push(...railLite(lx, z, rx, z, e.y, { ends: [false, false] }));
        // And the landing before the door, its rails and its dressing.
        parts.push(span(hl.x - hl.w / 2, hl.x + hl.w / 2, hl.y - 0.2, hl.y, hl.z - hl.d / 2, hl.z + hl.d / 2, TIMBER));
        for (const [ax, az, bx, bz, from, to] of models.deckRailSpans(hl.w, hl.d, "nse", railPlan().cutsFor(hl))) parts.push(...railLite(hl.x + ax, hl.z + az, hl.x + bx, hl.z + bz, hl.y, { ends: [from, to] }));
        const dress = hangarLanding();
        parts.push(dress.body, dress.glow);
      }
      for (const [ax, ay, az, bx, by, bz, w] of L.stairs) parts.push(board(ax, ay, az, bx, by, bz, w - 0.1, TIMBER));
      for (const [bx0, bz0, bx1, bz1] of RING_BRIDGES) parts.push(board(bx0, M, bz0, bx1, M, bz1, 2, TIMBER));
      for (const [bx0, bz0, bx1, bz1, w] of L.bridges) parts.push(board(bx0 - 0.3, LEVEL.top, bz0, bx1 + 0.3, LEVEL.top, bz1, w, TIMBER));
      for (const d of [L.switchboard, L.kortik, L.platform, L.landing, ...L.galleries]) parts.push(span(d.x - d.w / 2, d.x + d.w / 2, d.y - 0.3, d.y, d.z - d.d / 2, d.z + d.d / 2, TIMBER));
      for (const t of L.tunnels) { const [p0, p1, q0, q1] = porchOf(t); parts.push(span(p0, p1, t.y - 0.3, t.y, q0, q1, TIMBER)); }
    }

    // The core, slimmed to its turned shapes: the stone plinth and its buttresses, the walkway ring round it with its
    // lamps and rail, the bronze drum with its lava seam and blue lamps, the brass rings and bronze ribs round the
    // chamber, the copper crown with its lit windows and blue lip, the lantern's base, bars and dome, and its chains.
    // Every lit band stands a tenth of a metre proud, so the window's squeeze never folds it into what it lies on.
    {
      const core = [], radial = (geo, a, rad, y) => moved(turnedY(geo, -a + Math.PI / 2), Math.cos(a) * rad, y, Math.sin(a) * rad);
      const band = (rad, y0, y1, color, segments = 16) => lathe({ profile: [[rad, y0], [rad, y1]], segments, color, emissive: 1 });
      core.push(lathe({ profile: [[4.2, 0], [4.2, 0.5], [3.9, 0.7], [3.4, 0.9], [3.3, M - 0.6], [3.65, M - 0.35], [3.65, M - 0.2], [0, M - 0.2]], segments: 16, color: (t) => t < 0.3 ? STONE[3] : STONE[2] }));
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) / 8 * TAU;
        if (Math.abs(Math.sin(a) - 1) > 0.1) core.push(radial(box({ w: 0.9, h: M - 1.2, d: 0.6, color: STONE_DK }), a, 3.5, (M - 1.2) / 2 + 0.6));
      }
      core.push(lathe({ profile: [[r.inner, r.y - 0.2], [r.outer, r.y - 0.2], [r.outer, r.y], [r.inner, r.y], [r.inner, r.y - 0.2]], segments: 24, color: TIMBER }));
      for (let k = 0; k < 40; k++) core.push(radial(plate([[-0.07, -0.06, 0], [0.07, -0.06, 0], [0.07, 0.06, 0], [-0.07, 0.06, 0]], [0, 0, 1], "#5fc0ff", 1), (k + 0.5) / 40 * TAU, r.outer + 0.1, r.y - 0.12));
      const R = r.outer - 0.15;
      core.push(lathe({ profile: [[R - 0.06, r.y + 0.98], [R + 0.06, r.y + 0.98], [R + 0.06, r.y + 1.07], [R - 0.06, r.y + 1.07], [R - 0.06, r.y + 0.98]], segments: 24, color: TIMBER_LT }));
      for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * TAU; core.push(span(Math.cos(a) * R - 0.085, Math.cos(a) * R + 0.085, r.y, r.y + 1.02, Math.sin(a) * R - 0.085, Math.sin(a) * R + 0.085, TIMBER_DK)); }
      core.push(lathe({ profile: [[3.25, M - 0.2], [3.3, M + 0.1], [3.08, M + 0.22], [3.08, lo - 0.34], [3.24, lo - 0.22], [3.24, lo], [0, lo]], segments: 16, color: BRONZE_DK }));
      core.push(band(3.18, M + 0.34, M + 0.5, "#ff8a2a"), band(3.18, lo - 0.6, lo - 0.5, "#5fc0ff"));
      for (const y of [lo, hi]) core.push(lathe({ profile: [[2.5, y - 0.2], [2.9, y - 0.2], [2.9, y + 0.2], [2.5, y + 0.2]], segments: 12, color: BRASS }));
      for (let k = 0; k < 8; k++) core.push(radial(box({ w: 0.42, h: hi - lo + 0.2, d: 0.36, color: BRONZE }), (k + 0.5) / 8 * TAU, 2.72, (lo + hi) / 2));
      core.push(lathe({ profile: [[2.95, hi], [3.12, hi + 0.25], [3.12, hi + 0.6], [2.72, hi + 0.8], [2.72, hi + 1.35], [2.24, hi + 1.55], [2.24, hi + 2.05], [1.64, hi + 2.25], [1.64, hi + 2.75], [1.0, hi + 2.95], [0.75, hi + 3.1], [0, hi + 3.1]], segments: 16, color: (t) => t < 0.3 ? COPPER : t < 0.6 ? COPPER_DK : COPPER }));
      for (const [rad, y, n, h] of [[2.72, hi + 1.07, 14, 0.42], [2.24, hi + 1.8, 12, 0.38], [1.64, hi + 2.5, 9, 0.36]]) {
        for (let k = 0; k < n; k++) core.push(radial(plate([[-0.1, -h / 2, 0], [0.1, -h / 2, 0], [0.1, h / 2, 0], [-0.1, h / 2, 0]], [0, 0, 1], "#ffb347", 1), (k + 0.5) / n * TAU, rad + 0.1, y));
      }
      core.push(band(3.22, hi + 0.36, hi + 0.48, "#5fc0ff"));
      core.push(lathe({ profile: [[0.82, hi + 3.1], [0.82, hi + 3.28], [0.66, hi + 3.36], [0, hi + 3.36]], segments: 8, color: BRASS }));
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; core.push(beam(Math.cos(a) * 0.62, hi + 3.36, Math.sin(a) * 0.62, Math.cos(a) * 0.62, hi + 4.56, Math.sin(a) * 0.62, 0.1, BRASS)); }
      core.push(lathe({ profile: [[0.86, hi + 4.52], [0.86, hi + 4.64], [0.34, hi + 5.1], [0.14, hi + 5.5], [0, hi + 5.56]], segments: 8, color: COPPER_DK }));
      for (let k = 0; k < 4; k++) { const a = (k + 0.5) / 4 * TAU, x = Math.cos(a) * 1.9, z = Math.sin(a) * 1.9; core.push(beam(x, hi + 2.1, z, x * 1.4, H, z * 1.4, 0.14, IRON_DK)); }
      parts.push(moved(merge(...core), c.x, 0, c.z));
    }
    // The Tesla coils on the core's walkway: foot, wound column, toroid and a spark.
    for (const [x, z] of COILS) {
      parts.push(moved(lathe({ profile: [[0.42, 0], [0.42, 0.18], [0.3, 0.26], [0.3, 0.4], [0, 0.4]], segments: 8, color: BRONZE }), x, M, z));
      parts.push(moved(lathe({ profile: [[0.21, 0.4], [0.21, 2.1], [0, 2.1]], segments: 8, color: COPPER }), x, M, z), moved(torus(0.34, 0.12, BRASS, 0, 12, 5), x, M + 2.22, z));
      parts.push(moved(smoothBolt(0.8, 0.05, "#fff4b0", 1), x + 0.4, M + 2.62, z));
    }
    // The featured lines: each deck on its corner posts with its front rail and porch, and the station's frame, a plate
    // between bronze posts under a beam with its bulbs, and the status lantern between the tanks, lit blue for a line
    // that runs. The tanks themselves are `tank`, and the conduits from them to the chamber thin glowing rails on the
    // conduits' own paths.
    const paths = [];
    L.bays.forEach((b) => {
      parts.push(span(b.x - b.w / 2, b.x + b.w / 2, b.y - 0.3, b.y, b.z - b.d / 2, b.z + b.d / 2, TIMBER));
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = b.x + sx * (b.w / 2 - 0.2), pz = b.z + sz * (b.d / 2 - 0.2);
        parts.push(span(px - 0.19, px + 0.19, groundUnder(px, pz, b.y), b.y - 0.3, pz - 0.19, pz + 0.19, TIMBER_DK));
      }
      parts.push(...railLite(b.x - b.w / 2 + 0.1, b.z + b.d / 2 - 0.1, b.x + b.w / 2 - 0.1, b.z + b.d / 2 - 0.1, b.y));
      const frame = [
        span(-2.2, 2.2, 0.15, 3.85, -1.03, -0.87, "#7c4424"), span(-2.58, -2.22, 0, 4.3, -0.78, -0.42, BRONZE), span(2.22, 2.58, 0, 4.3, -0.78, -0.42, BRONZE),
        span(-2.6, 2.6, 3.98, 4.32, -0.82, -0.38, BRONZE_DK), span(-2.1, 2.1, 4.32, 4.42, -0.36, -0.26, "#ffb040", 1),
        box({ w: 0.374, h: 0.484, d: 0.374, color: "#3fa7ff", emissive: 1, offset: { y: 4.0 - 0.3 - 0.84 * 1.1 + 0.33, z: -0.3 } })
      ];
      parts.push(moved(merge(...frame), stationX(b), b.y, stationZ(b)));
      const path = conduitPath(b), samples = new Float32Array((CONDUIT_SAMPLES + 1) * 3);
      for (let i = 0; i <= CONDUIT_SAMPLES; i++) {
        const p = path(i / CONDUIT_SAMPLES);
        samples[i * 3] = p.x; samples[i * 3 + 1] = p.y; samples[i * 3 + 2] = p.z;
      }
      paths.push(samples);
      parts.push(tube({ path, radius: () => 0.1, rings: 24, segments: 6, colorFn: (t) => Math.round(t * 24) % 2 ? "#ff9a30" : "#6a3212", emissive: 1 }));
    });
    // The forge's arch under the walkway: its two rings of stone on their piers, the dark mouth, and the timber frame
    // with its glowing vents. Its fire and sign are `fire`.
    {
      const arch = [archBand(1.93, 2.57, FORGE_CY, -0.65, 0.65, 8, STONE[2]), archBand(2.63, 3.27, FORGE_CY, -0.65, 0.35, 8, STONE[0]), span(-1.9, 1.9, 0, 3.4, -0.8, -0.4, "#1e120c")];
      for (const s of [-1, 1]) {
        arch.push(span(s * 1.93, s * 2.57, 0, FORGE_CY, -0.65, 0.65, STONE[1]), span(s * 2.63, s * 3.27, 0, FORGE_CY, -0.65, 0.35, STONE[3]));
        arch.push(span(s * 3.7 - 0.23, s * 3.7 + 0.23, 0, 4.3, 0.52, 0.98, TIMBER_DK));
        for (const y of [0.85, 1.5]) arch.push(span(s * 3.7 - 0.13, s * 3.7 + 0.13, y - 0.2, y + 0.2, 0.95, 1.08, "#ff8a2a", 1));
      }
      arch.push(span(-4.15, 4.15, 4.05, 4.55, 0.47, 1.03, TIMBER));
      parts.push(moved(merge(...arch), f.x, 0, f.z));
    }
    // The forge's two shafts: the mounds of stone their lines come up out of.
    for (const [x, z] of SHAFTS) parts.push(moved(lathe({ profile: [[2.8, 0], [2.2, 1.4], [1.2, 2.5], [0, 2.8]], segments: 8, color: STONE[1] }), x, 0, z + 1.6));
    // The low decks' machines, each reduced to its glow: the switchboard's desk and its rows of screens and board, each
    // row as wide as its arc, the rebalancer's platform and its ring of light, and the treasury's vault with the gold
    // under its glass.
    {
      const sw = L.switchboard, rb = L.rebalancer, tr = L.treasury, cz = sw.z + CONSOLE.z;
      parts.push(span(sw.x - 1.9, sw.x + 1.9, sw.y, sw.y + CONSOLE.top, cz - CONSOLE.desk - 0.45, cz - CONSOLE.desk + 0.45, TIMBER_DK));
      for (const [bearing, reach, y, w, h] of [MONITORS[0], MONITORS[5], MONITORS[9]]) {
        const half = -Math.sin(bearing) * reach + Math.cos(bearing) * w / 2, z = cz - reach + 0.1;
        parts.push(span(sw.x - half, sw.x + half, sw.y + y - h / 2, sw.y + y + h / 2, z - 0.03, z + 0.03, "#1f4a70", 0.7));
      }
      parts.push(moved(lathe({ profile: [[1.85, 0], [1.85, 0.56], [0, 0.56]], segments: 12, color: IRON_DK }), rb.x, rb.y, rb.z + REB.cz), moved(lathe({ profile: [[1.95, 0.42], [1.95, 0.52]], segments: 12, color: "#5fe3ff", emissive: 0.95 }), rb.x, rb.y, rb.z + REB.cz));
      parts.push(span(tr.x - 1.4, tr.x + 1.4, tr.y, tr.y + 1.5, tr.z + TRE.vz - TRE.deep / 2, tr.z + TRE.vz + TRE.deep / 2, "#5a3a22"));
      // Kortik's Switchboard: its case and cornice, the desk at its foot, a band of lit lamps for each row of jacks,
      // and the dark sign over it with its light rim.
      const [fx, fy, fz] = kortikAt(0, 0, 0), half = KORTIK.wall;
      parts.push(span(fx - 0.45, fx, fy + 0.74, fy + 3.4, fz - half - 0.12, fz + half + 0.12, "#4a2c16"), span(fx - 0.5, fx + 0.12, fy + 3.4, fy + 3.65, fz - half - 0.25, fz + half + 0.25, "#7a4a26"));
      parts.push(span(fx, fx + 0.95, fy, fy + 0.78, fz - half, fz + half, "#9a6234"));
      for (let r = 0; r < 10; r++) parts.push(span(fx + 0.08, fx + 0.12, fy + 1.04 + r * 0.22, fy + 1.1 + r * 0.22, fz - 2.5, fz + 2.5, "#ffb21c", 0.8));
      parts.push(span(fx - 0.05, fx + 0.03, fy + 3.8, fy + 4.9, fz - 1.75, fz + 1.75, "#ffe6b0", 0.7), span(fx + 0.03, fx + 0.13, fy + 3.86, fy + 4.84, fz - 1.69, fz + 1.69, "#1a1410"));
      parts.push(moved(lathe({ profile: [[TRE.dome[0], 0], [0.9, 0.7], [0.5, 1.2], [0, TRE.dome[1]]], segments: 8, color: "#d9a52a", emissive: 0.6 }), tr.x, tr.y + TRE.top, tr.z + TRE.vz));
      // The cooker: its black chest in the orange frame with the jaw shut, the porthole's dim glow on the hall side and
      // the stack behind it.
      const ck = L.cooker;
      parts.push(span(ck.x - COOK.w / 2, ck.x + COOK.w / 2, ck.y, ck.y + COOK.h + 0.14, ck.z - COOK.d / 2, ck.z + COOK.d / 2, IRON_BK));
      parts.push(span(ck.x - COOK.w / 2 - 0.03, ck.x + COOK.w / 2 + 0.03, ck.y + COOK.h - 0.1, ck.y + COOK.h + 0.14, ck.z - COOK.d / 2 - 0.03, ck.z + COOK.d / 2 + 0.03, ORANGE));
      parts.push(moved(turnedY(forwardLathe(lathe({ profile: [[0.36, 0], [0, 0.04]], segments: 10, color: "#ff9a2a", emissive: 0.5 })), -Math.PI / 2), ck.x + COOK.port[0] - 0.03, ck.y + COOK.port[1], ck.z + COOK.port[2]));
      parts.push(moved(lathe({ profile: [[0.2, 0], [0.2, COOK.stackTop], [0, COOK.stackTop]], segments: 8, color: IRON_BK }), ck.x + COOK.stack[0], ck.y, ck.z + COOK.stack[1]));
    }
    // The galleries under the vault, each stand's pair of tanks as dim glass on its plate, with their front rails.
    for (const g of L.galleries) {
      parts.push(...railLite(g.x - g.w / 2 + 0.1, g.z + g.d / 2 - 0.1, g.x + g.w / 2 - 0.1, g.z + g.d / 2 - 0.1, g.y, { step: 2 }));
      for (let i = 0; i < g.stations; i++) {
        const x = g.x - g.w / 2 + (i + 0.5) * g.w / g.stations, z = g.z - 0.3;
        parts.push(span(x - 0.85, x + 0.85, g.y, g.y + 0.18, z - 0.3, z + 0.3, IRON_DK));
        parts.push(span(x - 0.69, x - 0.11, g.y + 0.36, g.y + 1.6, z - 0.29, z + 0.29, CAP_BLUE.dim[1], 0.65), span(x + 0.11, x + 0.69, g.y + 0.36, g.y + 1.6, z - 0.29, z + 0.29, CAP_ORANGE.dim[1], 0.65));
      }
    }
    // The watchtower on its deck: posts, four legs, the lantern room's floor, its lamp lit and its dome, and the banner.
    {
      const lk = L.lookout, h = lk.tower, tower = [span(-lk.w / 2, lk.w / 2, -0.3, 0, -lk.d / 2, lk.d / 2, TIMBER)];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = sx * (lk.w / 2 - 0.2), pz = sz * (lk.d / 2 - 0.2);
        tower.push(span(px - 0.19, px + 0.19, groundUnder(lk.x + px, lk.z + pz, lk.y) - lk.y, -0.3, pz - 0.19, pz + 0.19, TIMBER_DK));
        tower.push(beam(sx * 1.1, 0, sz * 1.1, sx * 0.77, h, sz * 0.77, 0.26, TIMBER_DK));
      }
      tower.push(span(-1.2, 1.2, h - 0.15, h + 0.15, -1.2, 1.2, TIMBER_LT));
      tower.push(lathe({ profile: [[0.62, h + 0.34], [0.72, h + 0.9], [0.62, h + 1.72], [0, h + 1.8]], segments: 8, color: "#ffe29a", emissive: 1 }));
      tower.push(lathe({ profile: [[1.12, h + 1.8], [1.12, h + 1.92], [0.7, h + 2.45], [0.3, h + 2.8], [0, h + 2.86]], segments: 8, color: COPPER_DK }));
      tower.push(span(-0.65, 0.65, h - 2.6, h - 0.4, 1.175, 1.225, "#2b52b8"), moved(smoothBolt(1.4, 0.06, "#8fd0ff", 0.9), 0, h - 1.45, 1.32));
      parts.push(moved(merge(...tower), lk.x, lk.y, lk.z));
    }
    // The peer tunnels, each its neon arch in the peer's colour round a glimpse of the peer's place, under its frame,
    // turned into the wall it is cut into; and while the hangar is open, its door, in the hall's cyan round its dark.
    const doors = L.tunnels.map((t, i) => [t, TUNNEL_THEMES[i]]);
    if (hangarEntry()) doors.push([L.hangar, { ring: CYAN, sky: "#0b1530", ground: "#1a2236" }]);
    doors.forEach(([t, T]) => {
      const R = 2.08, cy = 2.6, legs = cy - 0.15, total = 2 * legs + Math.PI * R;
      const neon = (u) => {
        const d = u * total;
        if (d < legs) return { x: -R, y: 0.15 + d, z: 0.52 };
        if (d > legs + Math.PI * R) return { x: R, y: cy - (d - legs - Math.PI * R), z: 0.52 };
        const a = Math.PI - (d - legs) / R;
        return { x: Math.cos(a) * R, y: cy + Math.sin(a) * R, z: 0.52 };
      };
      const sky = [[-R, 0.9, 0.4], [R, 0.9, 0.4]];
      for (let k = 0; k <= 8; k++) sky.push([Math.cos(Math.PI * k / 8) * R, cy + Math.sin(Math.PI * k / 8) * R, 0.4]);
      const tn = [
        tube({ path: neon, radius: () => 0.09, rings: 20, segments: 4, colorFn: () => T.ring, emissive: 1 }),
        plate(sky, [0, 0, 1], T.sky, 0.8), plate([[-R, 0.15, 0.4], [R, 0.15, 0.4], [R, 0.9, 0.4], [-R, 0.9, 0.4]], [0, 0, 1], T.ground, 0.45),
        span(-TUNNEL_POST - 0.22, -TUNNEL_POST + 0.22, 0, 6.2, 0.12, 0.58, TIMBER_DK), span(TUNNEL_POST - 0.22, TUNNEL_POST + 0.22, 0, 6.2, 0.12, 0.58, TIMBER_DK),
        span(-4.3, 4.3, 5.89, 6.41, 0.09, 0.61, TIMBER)
      ];
      parts.push(moved(turnedY(merge(...tn), t.turn), t.x, t.y, t.z));
    });
    // The bolt banners either side of the core, hung from the high lines' decks.
    for (const x of [-12.5, 12.5]) parts.push(moved(merge(banner(2.2)), x, LEVEL.high - 0.45, L.bays[0].z + L.bays[0].d / 2 + 0.1));
    // The lanterns, as their lit glass, with the posts and arms that carry them and the chains and cords they hang
    // from; each throws its pool of light into the bake.
    {
      const { lamps, strings } = windowLamps(), glass = (s, x, y, z) => parts.push(box({ w: 0.34 * s, h: 0.44 * s, d: 0.34 * s, color: LANTERN_GLASS, emissive: 1, offset: { x, y: y + 0.3 * s, z } }));
      const pool = (x, y, z) => lights.push([x, y, z, 7.5, 1.17, 0.72, 0.32]);
      for (const [kind, x, y, z, turn = 0] of lamps) {
        if (kind === "hang") {
          glass(1.05, x, y - 0.3 - 0.84 * 1.05, z);
          pool(x, y - 0.75, z);
        } else if (kind === "post") {
          const ax = Math.cos(turn), az = -Math.sin(turn), tx = x + ax * 0.8, tz = z + az * 0.8;
          parts.push(span(x - 0.11, x + 0.11, y, y + 2.95, z - 0.11, z + 0.11, TIMBER_DK), beam(x - ax * 0.1, y + 2.82, z - az * 0.1, x + ax * 0.95, y + 2.82, z + az * 0.95, 0.14, TIMBER_DK));
          glass(1.3, tx, y + 1.36, tz);
          pool(tx, y + 1.8, tz);
        } else if (kind === "top") {
          parts.push(span(x - 0.18, x + 0.18, y, y + 1.7, z - 0.18, z + 0.18, TIMBER_DK), span(x - 0.28, x + 0.28, y + 1.68, y + 1.82, z - 0.28, z + 0.28, IRON_DK));
          parts.push(moved(turnedY(lathe({ profile: [[0.3, 0.5], [0.3, 0.56], [0.14, 0.72], [0.05, 0.76], [0, 0.77]].map(([rr, hh]) => [rr * 1.7, hh * 1.7]), segments: 4, color: IRON_DK }), Math.PI / 4), x, y + 1.82, z));
          glass(1.7, x, y + 1.82, z);
          pool(x, y + 2.4, z);
        } else if (kind === "rail") {
          glass(0.85, x, y + 1.06, z);
          pool(x, y + 1.4, z);
        } else {
          parts.push(beam(x, H, z, x, y + 1.5, z, 0.1, IRON_DK));
          glass(1.75, x, y, z);
          pool(x, y + 0.7, z);
        }
      }
      for (const [ax, ay, az, bx, by, bz, sag, at] of strings) {
        const on = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(Math.PI * t) * sag, az + (bz - az) * t];
        for (let k = 0; k < 6; k++) parts.push(beam(...on(k / 6), ...on((k + 1) / 6), 0.05, "#1b1714"));
        for (const t of at) {
          const [px, py, pz] = on(t);
          glass(1.2, px, py - 0.36 - 0.84 * 1.2, pz);
          pool(px, py - 0.8, pz);
        }
      }
    }
    const hallLight = windowLights(lights), still = bakeWindow(merge(...parts), hallLight);

    // The glass chamber lit, in its three bands of orange, with its four bolts and the lantern's flame.
    const ribs = [[2.44, lo], [2.5, lo + 0.45], [2.53, lo + 1.5], [2.53, hi - 1.5], [2.5, hi - 0.45], [2.44, hi]];
    const radiusAt = (y) => {
      let k = 0;
      while (k < ribs.length - 2 && ribs[k + 1][1] < y) k++;
      const [[r0, y0], [r1, y1]] = [ribs[k], ribs[k + 1]];
      return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    };
    const chamber = bakeWindow(moved(merge(
      lathe({ profile: Array.from({ length: 11 }, (_, k) => [radiusAt(lo + (hi - lo) * k / 10), lo + (hi - lo) * k / 10]), segments: 16, color: (t) => t < 0.15 || t > 0.8 ? "#d65a1a" : t < 0.35 || t > 0.6 ? "#f5822c" : "#ffa640", emissive: 0.8 }),
      lathe({ profile: [[0.3, hi + 3.36], [0.42, hi + 3.8], [0.36, hi + 4.25], [0, hi + 4.5]], segments: 8, color: "#ffe08a", emissive: 1 }),
      ...[0, 1, 2, 3].map((k) => turnedY(moved(smoothBolt(3.6, 0.3, "#fff4c0", 1), 0, (lo + hi) / 2, 2.66), k * Math.PI / 2))
    ), c.x, 0, c.z), hallLight);

    // A line's tank, built at the origin standing on its deck: the bronze foot, the glass dim or lit with its halo, the
    // bronze cap ringed in bulbs, and the white sign facing the balcony, the network on the blue, the bolt on the
    // orange. Lit as standing under its line's light.
    const bayLight = windowLights([[0, 2.2, 2.2, 9, 0.33, 0.45, 0.6]]);
    const tankOf = (tone, lit) => {
      const [edge, core] = lit ? tone.lit : tone.dim, mid = (CAP.foot + CAP.top) / 2, sign = tone === CAP_BLUE ? networkGlyph : smoothBolt;
      return bakeWindow(merge(
        lathe({ profile: [[0.86, 0], [0.86, 0.3], [0.72, CAP.foot], [0, CAP.foot]], segments: 12, color: BRONZE }),
        lathe({ profile: [[CAP.r - 0.02, CAP.foot], [CAP.r + 0.01, CAP.foot + 0.3], [CAP.r + 0.02, mid], [CAP.r + 0.01, CAP.top - 0.3], [CAP.r - 0.02, CAP.top]], segments: 12, color: (t) => t > 0.2 && t < 0.75 ? core : edge, emissive: lit ? 1 : 0.8 }),
        lathe({ profile: [[CAP.r + 0.1, CAP.foot + 0.04], [CAP.r + 0.1, CAP.foot + 0.16]], segments: 12, color: tone.halo, emissive: 1 }),
        lathe({ profile: [[CAP.r + 0.02, CAP.top], [0.86, CAP.top + 0.05], [0.86, CAP.top + 0.4], [0.5, CAP.top + 0.56], [0, CAP.top + 0.58]], segments: 12, color: BRONZE }),
        lathe({ profile: [[0.87, CAP.top + 0.41], [0.87, CAP.top + 0.49]], segments: 12, color: "#ffb040", emissive: 1 }),
        moved(sign(1.75, 0.12, lit ? "#ffffff" : "#fbf6ea", 1), 0, mid, CAP.r + 0.14)
      ), bayLight);
    };
    // The eight tanks as the factory stands them: the blue toward the line's tunnel, the orange toward the core.
    const tanks = [];
    L.bays.forEach((b, bay) => {
      const out = Math.sign(b.x);
      tanks.push({ bay, blue: true, x: stationX(b) + out * 1.2, y: b.y, z: stationZ(b) }, { bay, blue: false, x: stationX(b) - out * 1.2, y: b.y, z: stationZ(b) });
    });

    // The forge's fire, warm: its glowing face, the ring of heat round it, the floor's glow, its flames and its sign.
    const fire = bakeWindow(moved(merge(
      moved(forwardLathe(lathe({ profile: [[1.66, 0], [1.66, 0.12], [1.3, 0.28], [0.7, 0.36], [0, 0.38]], segments: 12, color: (t) => t < 0.3 ? "#9a360c" : t < 0.6 ? "#c84a12" : "#dc5a16", emissive: 0.85 })), 0, FORGE_CY, -0.36),
      moved(forwardLathe(torus(1.76, 0.1, "#ff9a38", 1, 16, 5)), 0, FORGE_CY, -0.2),
      moved(lathe({ profile: [[1.5, 0.03], [0, 0.04]], segments: 12, color: "#c84a12", emissive: 0.6 }), 0, 0, 1.4),
      ...[[-1.05, 0.55], [-0.55, 0.75], [0, 0.62], [0.55, 0.78], [1.05, 0.52]].flatMap(([x, h]) => flame(h, x, 0.22, 0.32, false)),
      moved(smoothBitcoin(2.3, 0.24, "#ffd98a", 1), 0, FORGE_CY, 0.14)
    ), f.x, 0, f.z), hallLight);

    // The sats: copies of the factory's gems of their own, so no record of theirs is shared with the factory's.
    const unlit = windowLights([]), gem = (geo) => bakeWindow({ verts: geo.verts.slice(), faces: geo.faces.map((g) => ({ ...g, i: g.i.slice() })), lines: [] }, unlit);
    return {
      front: bakeWindow(merge(...front), hallLight), hall: still, chamber,
      tank: { blueDim: tankOf(CAP_BLUE, false), blueLit: tankOf(CAP_BLUE, true), orangeDim: tankOf(CAP_ORANGE, false), orangeLit: tankOf(CAP_ORANGE, true) },
      tanks, fire, sat: gem(sat()), satRed: gem(satFailed()), paths
    };
  });

  // The picture the hub takes of the island on the way in (`world.factoryView`): taken from the shield looking out,
  // `eye` above the floor, spanning `across` either side and `up` and `down` as slopes. Hung `distance` past where
  // it was taken and square to the tunnel, it lines up with the island seen through the rim from anywhere behind
  // the shield. A plain quad facing +z with the image over it; the scene turns it round to face the hall.
  const outsideView = (view, distance) => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false };
    const x = view.across * distance, y0 = view.eye - view.down * distance, y1 = view.eye + view.up * distance;
    geo.verts.push(-x, y0, 0, x, y0, 0, x, y1, 0, -x, y1, 0);
    geo.faces.push({ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 });
    geo.imageSurface = { asset: view, rect: [-x, y0, 2 * x, y1 - y0] };
    return geo;
  };
  BL.factoryModels = {
    LAYOUT, LEVEL, HALL, WALL_LEAN, STATION_BACK, KORTIK, kortikAt, kortikFrom, kortikLamps, kortikLights, stationX, stationZ, SHIELD_Z, porchOf, FORGE_TRACKS, FORGE_STORES, FORGE_CY, SHAFTS, LINE_STEP, COIN_R, forgeWave, COILS, banner, TUNNEL_SIGN, TUNNEL_POST, EXIT_Z, CONDUIT_SAMPLES, TUNNEL_THEMES, STEP, sat, satFailed, REB, TRE, COOK, ROOF_TUBE, bananaOutlet, outletShaft, KIOSK, donationCorner, BOARD, LOOKOUT_BEAM, STUDY, label, lanterns, hubTunnel, hubWindow, bakeWindow, windowLights, outsideView, hangarEntry, HANGAR_DOOR, hangarLamps, hangarLanding, beam, moved, turnedY, smoothBolt, smoothBitcoin
  };
  // Private lexical bindings used by the scene-only extension; read once when that group evaluates.
  BL.factoryModelsSceneKit = { BL, BOARD, BOARD_FACE, BOARD_VALUES, BRASS, BRONZE, BRONZE_DK, CAP, CAP_BLUE, CAP_ORANGE, COILS, COIN_R, CONDUIT_SAMPLES, CONSOLE, COOK, COPPER, COPPER_DK, CRYSTAL, CYAN, FALLS, FLOOR, FORGE_CONSOLE, FORGE_CY, FORGE_TRACKS, GOLD, HALL, HANGAR_DOOR, HANGAR_SET_BACK, IRON_BK, IRON_DK, IRON_LT, KIOSK, LABEL_FONT, LAYOUT, LEVEL, LINE_STEP, LOOKOUT_BEAM, MONITORS, ORANGE, PORCH_HALF, REB, RING_BRIDGES, SHAFTS, STEP, STONE, STONE_DK, STUDY, TAU, TIMBER, TIMBER_DK, TIMBER_LT, TRE, TUNNEL_BOX, TUNNEL_POST, TUNNEL_THEMES, WALL_LEAN, along, banner, beam, bevelBox, box, cached, chain, columnParts, conduitPath, deckParts, donationCorner, face, flame, forwardLathe, gem, geometry, groundUnder, hangarEntry, hexToRgb, label, labelCache, lanternParts, lathe, makeVox, merge, models, moved, mulberry32, networkGlyph, noShadow, outcropTop, outcrops, plate, porchOf, prism, pushVert, railParts, railPlan, deckRailing, walkRails, ringLanding, shaded, smoothBitcoin, smoothBolt, span, stairParts, stationX, stationZ, torus, tube, tunnelFrame, turn, turnedX, turnedY, turnedZ, voxelGeometry };
})();
