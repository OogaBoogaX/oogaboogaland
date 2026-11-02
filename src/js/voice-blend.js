// Voice across a crossing (#392), shared unchanged by the classic page and the Worker: where two zones of different
// voice groups meet in one scene's coordinates (a bridge between the island and a bridged land), a player on the
// crossing hears both, each by an equal-power share of how far along it they are. A crossing is reported as the zone it
// leads to (`to`) and the progress toward it, which the page keeps exact and the room and other pages get in STEPS steps.
// Places are zones, not groups, so a crossing reaches the land's outside and never another place of its group (the
// chamber behind ₿IFRÖST's arch).
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
  // Zones whose voices blend across the crossing between them, each pair in one scene's coordinates.
  const PAIRS = [["outside", "rainforest"], ["outside", "sphere"], ["outside", "bifrost"]];
  const adjacent = (a, b) => {
    for (const [x, y] of PAIRS) if (x === a && y === b || x === b && y === a) return true;
    return false;
  };
  const QUARTER = Math.PI / 2;
  // A player's weight in `place`: in zone `zone`, `t` of the way to zone `to` (null when crossing nothing).
  const weight = (place, zone, to, t) => to ? place === zone ? Math.cos(QUARTER * t) : place === to ? Math.sin(QUARTER * t) : 0 : place === zone ? 1 : 0;
  // How loud a speaker plays to a listener, 0 to 1: the sum over the listener's places of both players' weights.
  const gain = (zone, to, t, speakerZone, speakerTo, speakerT) => {
    let sum = weight(zone, zone, to, t) * weight(zone, speakerZone, speakerTo, speakerT);
    if (to) sum += weight(to, zone, to, t) * weight(to, speakerZone, speakerTo, speakerT);
    return Math.min(1, sum);
  };
  // Whether a player has weight in `place`, from the room's steps (`k` of STEPS toward `to`).
  const has = (place, zone, to, k) => to ? place === zone ? k < STEPS : place === to && k > 0 : place === zone;
  // Whether two players share a place where both have weight, so the room lets them hear each other.
  const shares = (zone, to, k, otherZone, otherTo, otherK) =>
    has(zone, zone, to, k) && has(zone, otherZone, otherTo, otherK) || !!to && has(to, zone, to, k) && has(to, otherZone, otherTo, otherK);
  BL.voiceBlend = Object.freeze({ STEPS, PAIRS, adjacent, weight, gain, shares });
})();
