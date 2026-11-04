// Voice across a crossing (#392), shared unchanged by the classic page and the Worker: where two places meet in one
// scene's coordinates, a player on the crossing hears both, each by an equal-power share of how far along it they are.
// The crossings are the bridges between the island and each bridged land, and the slopes between levels: the island
// down into HQ by its entrance ramps, HQ down into its basement, and the rainforest's surface down into its tunnels
// and chamber. A level below is a place of its own (`hq-basement`, `rainforest-under`) that no page reports as its
// zone: a player there stays in the zone above, all the way across to it, so who they see and how far away is
// unchanged and only what they hear is. A crossing is reported as the zone it
// leads to (`to`) and the progress toward it, which the page keeps exact and the room and other pages get in STEPS steps.
// Places are zones, not groups, so a crossing reaches the land's outside and never another place of its group (the
// chamber behind ₿IFRÖST's arch). The one exception is Ooga Arcade and Ghost Hunter's Arena (#422), joined by the
// haunted hallway: each is a group of zones in the arcade scene's coordinates (the hall and the hallway's near half,
// `arcade.hall` and `arcade.haunt`; the arena and the hallway's far half, `ghost-arena` and `ghost-arena.haunt`), so
// `place` folds each of their zones to its group and a crossing between them weighs a whole group at each end. The
// arena is one voice region whether a hunt runs or not, so the hallway's arena end hears its hunters; the arena's older
// names (`arcade-hunt`, a hunt under way, and `arcade.arena`, the arena before #422, both still sent by a page loaded
// before it) are the same region (`ALIASES`), never Ooga Arcade's.
// Weights: a player in zone A, `t` of the way to zone B, has weight cos(πt/2) in A and sin(πt/2) in B; a player crossing
// nothing has weight 1 in its own zone. How loud a speaker plays to a listener is the sum over places of the two players'
// weights there (`gain`): 1 for two players side by side anywhere, cos(πt/2) for a listener `t` across to one at the near
// end, 0 across a whole crossing. The room lets a listener hear exactly the speakers that is above zero for (`shares`),
// and a crossing only between the zones PAIRS names (`adjacent`).
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const STEPS = 20;
  // Places whose voices blend across the crossing between them, each pair in one scene's coordinates: the bridges, then
  // the levels, upper first, then the arcade's hallway.
  const PAIRS = [["outside", "rainforest"], ["outside", "sphere"], ["outside", "bifrost"],
    ["outside", "hq"], ["hq", "hq-basement"], ["rainforest", "rainforest-under"], ["arcade", "ghost-arena"]];
  const GROUPED = ["arcade", "ghost-arena"];
  const ALIASES = Object.freeze({ "arcade-hunt": "ghost-arena", "arcade.arena": "ghost-arena" });
  // A zone's place for blending: its alias's, its group where GROUPED names it, else the zone itself. Allocates nothing.
  const place = (zone) => {
    if (typeof zone !== "string") return zone;
    if (Object.hasOwn(ALIASES, zone)) return ALIASES[zone];
    for (let i = 0; i < GROUPED.length; i++) {
      const g = GROUPED[i];
      if (zone.startsWith(g) && (zone.length === g.length || zone.charCodeAt(g.length) === 46)) return g;
    }
    return zone;
  };
  const adjacent = (a, b) => {
    a = place(a); b = place(b);
    for (const [x, y] of PAIRS) if (x === a && y === b || x === b && y === a) return true;
    return false;
  };
  // Whether two zones report positions in one scene's coordinates, so a distance between them means something: the same
  // zone, or both inside the arcade scene (its hall, hallway, arena and hunt; never the island's tunnel, zone `arcade`).
  const arcadeScene = (zone) => zone.startsWith("arcade.") || zone === "arcade-hunt" || place(zone) === "ghost-arena";
  const sameFrame = (a, b) => typeof a === "string" && typeof b === "string" && (a === b || arcadeScene(a) && arcadeScene(b));
  const QUARTER = Math.PI / 2;
  // A player's weight in place `at`: in zone `zone`, `t` of the way to zone `to` (null when crossing nothing).
  const weight = (at, zone, to, t) => {
    at = place(at); zone = place(zone); to = place(to);
    return to ? at === zone ? Math.cos(QUARTER * t) : at === to ? Math.sin(QUARTER * t) : 0 : at === zone ? 1 : 0;
  };
  // How loud a speaker plays to a listener, 0 to 1: the sum over the listener's places of both players' weights.
  const gain = (zone, to, t, speakerZone, speakerTo, speakerT) => {
    let sum = weight(zone, zone, to, t) * weight(zone, speakerZone, speakerTo, speakerT);
    if (to) sum += weight(to, zone, to, t) * weight(to, speakerZone, speakerTo, speakerT);
    return Math.min(1, sum);
  };
  // Whether a player has weight in place `at`, from the room's steps (`k` of STEPS toward `to`).
  const has = (at, zone, to, k) => {
    at = place(at); zone = place(zone); to = place(to);
    return to ? at === zone ? k < STEPS : at === to && k > 0 : at === zone;
  };
  // Whether two players share a place where both have weight, so the room lets them hear each other.
  const shares = (zone, to, k, otherZone, otherTo, otherK) =>
    has(zone, zone, to, k) && has(zone, otherZone, otherTo, otherK) || !!to && has(to, zone, to, k) && has(to, otherZone, otherTo, otherK);
  BL.voiceBlend = Object.freeze({ STEPS, PAIRS, ALIASES, place, adjacent, sameFrame, weight, gain, shares });
})();
