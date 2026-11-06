// Shared source rules for Ooga sleep trips between the island and rainforest.
// Geometry and collision providers are explicit; no renderer, input, clock or UI.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ island, paths, sleepNavigation, forestNavigation, bedSupportAt, walkIn, stepMax }) => {
    if (![island?.supportAt, island?.surfaceAt, paths?.route, sleepNavigation?.plan,
      sleepNavigation?.clearSegment, forestNavigation?.plan, forestNavigation?.contains,
      forestNavigation?.clearSegment, bedSupportAt].every(f => typeof f === "function")
      || !Number.isFinite(walkIn?.x) || !Number.isFinite(walkIn?.z)
      || !Number.isFinite(stepMax) || stepMax <= 0) throw Error("Hub NPC routing providers required");
    const sleepRouteFrom = { x: 0, y: 0, z: 0 };
    // An Ooga stood up on its mattress plans from the floor under it: the planner joins a start to its graph along the
    // island's floor both ways, and that floor never climbs back onto a bed, so a start on one would never join.
    const planFeet = (cave) => {
      const p = cave.root.position, feet = p.y - cave.baseY;
      return Math.abs(bedSupportAt(p.x, p.z, feet, 1e-4, 0) - feet) < 1e-4 ? island.supportAt(p.x, p.z, feet, stepMax, -120, sleepNavigation.radius) : feet;
    };
    const bedPlan = function* (cave, bed, toBed) {
      const p = cave.root.position, home = cave.slot || walkIn, from = { x: p.x, y: planFeet(cave), z: p.z };
      const entry = forestNavigation.entry, outside = forestNavigation.contains(p.x, p.z);
      // A sleeper can wake before reaching the bridge. Its former outdoor bed
      // must not send a mainland return through the forest's attachment search.
      if (!outside && (!bed?.outdoor || !toBed)) return yield* sleepNavigation.plan(from.x, from.y, from.z, bed, toBed, home.x, home.z, !toBed && cave.state === "chilling");
      if (toBed && bed.outdoor) {
        const approach = outside ? [from] : from.y < -0.1
          ? yield* sleepNavigation.plan(from.x, from.y, from.z, null, false, entry.x, entry.z)
          : paths.route(from, entry);
        if (!approach) return null;
        const forest = yield* forestNavigation.plan(outside ? from : entry, bed);
        return forest ? approach.concat(forest.slice(1)) : null;
      }
      const forest = yield* forestNavigation.plan(from, entry);
      if (!forest) return null;
      if (toBed) {
        const inside = yield* sleepNavigation.plan(entry.x, entry.y, entry.z, bed, true, home.x, home.z);
        return inside ? forest.concat(inside.slice(1)) : null;
      }
      // Positive forest elevations are not the home meadow. Retain the bridge
      // walk until its foot before handing a worker back to ordinary routing.
      const result = cave.state === "chilling" ? forest : forest.concat(paths.route(entry, { x: home.x, y: island.surfaceAt(home.x, home.z), z: home.z }).slice(1));
      result.surfaceStart = forest.length - 1;
      return result;
    };
    const bedRoute = (cave, bed, toBed) => {
      const plan = bedPlan(cave, bed, toBed);
      for (;;) { const step = plan.next(); if (step.done) return step.value; }
    };
    const bedRouteClear = (cave, to) => {
      const p = cave.root.position;
      sleepRouteFrom.x = p.x; sleepRouteFrom.y = p.y - cave.baseY; sleepRouteFrom.z = p.z;
      return forestNavigation.contains(p.x, p.z) || forestNavigation.contains(to.x, to.z)
        ? forestNavigation.clearSegment(sleepRouteFrom, to) : sleepNavigation.clearSegment(sleepRouteFrom, to, false, 0.3);
    };
    return { bedPlan, bedRoute, bedRouteClear };
  };
  BL.npcBedRouting = { create };
})();
