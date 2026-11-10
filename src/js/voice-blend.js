// Voice across levels and crossings (#392), shared unchanged by the classic page and the Worker.
// The main world is every zone the island scene reports (`WORLD`: the island with its cave entrances, the land between,
// that is its bridges and the air round it, the Mempool rainforest and its cave, the Timechain Sphere's outside, the
// ₿IFRÖST isle, and HQ and its basement), all in that scene's coordinates and all shown to each other. Its voice goes
// by height, not by zone: everything on or over the island's plane is one place, the surface (`outside`), and below it lie its levels, HQ (`hq`) and HQ's
// basement (`hq-basement`) under the island, and the rainforest's tunnels and chamber (`rainforest-under`) under its own
// top. Each level hangs from the one over it (`ABOVE`), so a player in the world reports only the level below it is
// heading toward (`to`) and how far down (`t`): between the surface and HQ, or HQ and its basement, wherever they stand,
// over the island or off its edge on a jetpack, and between the rainforest's top and its chamber inside its rock. Their
// zone says only where they are for the panels; it never changes what they hear.
// Elsewhere a crossing joins two places of one scene (`PAIRS`): Ooga Arcade and Ghost Hunter's Arena (#422), joined by the
// haunted hallway, each a group of zones in the arcade scene's coordinates (the hall and the hallway's near half,
// `arcade.hall` and `arcade.haunt`; the arena and the hallway's far half, `ghost-arena` and `ghost-arena.haunt`), so
// `place` folds each of their zones to its group and a crossing between them weighs a whole group at each end. The arena
// is one voice region whether a hunt runs or not; its older names (`arcade-hunt`, a hunt under way, and `arcade.arena`,
// the arena before #422, both still sent by a page loaded before it) are the same region (`ALIASES`), never the Arcade's.
// A crossing is reported as the place it leads to (`to`) and the progress toward it, which the page keeps exact and the
// room and other pages get in STEPS steps.
// Weights: a player crossing from place A (`near`) `t` of the way to place B (`far`) has weight cos(πt/2) in A and
// sin(πt/2) in B; a player crossing nothing has weight 1 in its own place. How loud a speaker plays to a listener is the
// sum over the listener's places of the two players' weights there (`gain`): 1 for two players side by side anywhere,
// cos(πt/2) for a listener `t` across to one at the near end, 0 across a whole crossing. The room lets a listener hear
// exactly the speakers that is above zero for (`shares`), and takes only the crossings `crossable` allows.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const STEPS = 20;
  const WORLD = ["outside", "between", "rainforest", "rainforest-under", "sphere", "bifrost", "hq", "hq-basement"];
  const SURFACE = "outside";
  // The levels below the world's surface, each with the level over it.
  const ABOVE = Object.freeze({ hq: SURFACE, "hq-basement": "hq", "rainforest-under": SURFACE });
  // Places outside the world whose voices blend across the crossing between them, in one scene's coordinates.
  const PAIRS = [["arcade", "ghost-arena"], ["arcade", "block-frenzy"]];
  const GROUPED = ["arcade", "ghost-arena", "block-frenzy"];
  const ALIASES = Object.freeze({ "arcade-hunt": "ghost-arena", "arcade.arena": "ghost-arena" });
  // Whether a zone is in the main world. Allocates nothing.
  const world = (zone) => {
    for (let i = 0; i < WORLD.length; i++) if (WORLD[i] === zone) return true;
    return false;
  };
  // A zone's place for blending: the surface for the world's zones, its alias's, its group where GROUPED names it, else
  // the zone itself. Allocates nothing.
  const place = (zone) => {
    if (typeof zone !== "string") return zone;
    if (world(zone)) return SURFACE;
    if (Object.hasOwn(ALIASES, zone)) return ALIASES[zone];
    for (let i = 0; i < GROUPED.length; i++) {
      const g = GROUPED[i];
      if (zone.startsWith(g) && (zone.length === g.length || zone.charCodeAt(g.length) === 46)) return g;
    }
    return zone;
  };
  // A zone's voice group: its alias's, else the part before its `.place`.
  const group = (zone) => {
    if (typeof zone !== "string") return zone;
    if (Object.hasOwn(ALIASES, zone)) return ALIASES[zone];
    const dot = zone.indexOf(".");
    return dot < 0 ? zone : zone.slice(0, dot);
  };
  const adjacent = (a, b) => {
    a = place(a); b = place(b);
    for (const [x, y] of PAIRS) if (x === a && y === b || x === b && y === a) return true;
    return false;
  };
  // Whether a player in `zone` may report a crossing toward `to`: in the world, any level below another, whatever its
  // zone (a jetpack takes a body down off the island's edge as a ramp does into HQ); elsewhere a place next to its own.
  const crossable = (zone, to) => world(zone) ? typeof to === "string" && Object.hasOwn(ABOVE, to) : adjacent(zone, to);
  // The place a player is in, or crosses from (in the world, the level over the one it heads toward), and the one it
  // crosses toward.
  const near = (zone, to) => to && world(zone) ? ABOVE[to] : place(zone);
  const far = (zone, to) => world(zone) ? to : place(to);
  // Whether two zones report positions in one scene's coordinates, so a distance between them means something: the same
  // zone, two of the world, or both inside the arcade scene (its hall, hallway, arena and hunt).
  const arcadeScene = (zone) => zone.startsWith("arcade.") || zone === "arcade-hunt" || place(zone) === "ghost-arena";
  const sameFrame = (a, b) => typeof a === "string" && typeof b === "string" && (a === b || world(a) && world(b) || arcadeScene(a) && arcadeScene(b));
  const QUARTER = Math.PI / 2;
  // A player's weight in place `at` (a place, as `place`, `near` and `far` name them): in zone `zone`, `t` of the way to
  // `to` (null when crossing nothing).
  const weight = (at, zone, to, t) => {
    const from = near(zone, to);
    return to ? at === from ? Math.cos(QUARTER * t) : at === far(zone, to) ? Math.sin(QUARTER * t) : 0 : at === from ? 1 : 0;
  };
  // How loud a speaker plays to a listener, 0 to 1: the sum over the listener's places of both players' weights.
  const gain = (zone, to, t, speakerZone, speakerTo, speakerT) => {
    const a = near(zone, to);
    let sum = weight(a, zone, to, t) * weight(a, speakerZone, speakerTo, speakerT);
    if (to) {
      const b = far(zone, to);
      sum += weight(b, zone, to, t) * weight(b, speakerZone, speakerTo, speakerT);
    }
    return Math.min(1, sum);
  };
  // Whether a player has weight in place `at`, from the room's steps (`k` of STEPS toward `to`).
  const has = (at, zone, to, k) => {
    const from = near(zone, to);
    return to ? at === from ? k < STEPS : at === far(zone, to) && k > 0 : at === from;
  };
  // Whether two players share a place where both have weight, so the room lets them hear each other.
  const shares = (zone, to, k, otherZone, otherTo, otherK) => {
    const a = near(zone, to);
    if (has(a, zone, to, k) && has(a, otherZone, otherTo, otherK)) return true;
    if (!to) return false;
    const b = far(zone, to);
    return has(b, zone, to, k) && has(b, otherZone, otherTo, otherK);
  };
  BL.voiceBlend = Object.freeze({ STEPS, WORLD, ABOVE, PAIRS, ALIASES, world, place, group, adjacent, crossable, near, far, sameFrame, weight, gain, shares });
})();
