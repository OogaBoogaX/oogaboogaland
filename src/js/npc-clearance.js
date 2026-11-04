// The hub's existing voluntary-walker clearance policy. World rules and mesh
// queries stay explicit; this is not the complete walk/search/jump controller.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ walkable, playerSupportAt, npcRampRoofAt, npcClosedCaveClear,
    npcWorkZoneClear, npcFireClear, npcPileAt, island, PLAYER_RADIUS, lerp }) => {
    const npcWalkable = (fromX, fromZ, toX, toZ, y, height, actor) => {
      if (!walkable(fromX, fromZ, toX, toZ, y, height, actor)) return false;
      // Sweep to the actual downhill support too.
      // Checking at the previous, higher floor can clear a move whose lowered torso intersects the wall.
      const feet = playerSupportAt(toX, toZ, y, y, actor);
      if (npcRampRoofAt(toX, feet, toZ) && !npcRampRoofAt(fromX, y, fromZ)) return false;
      if (!npcClosedCaveClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
      if (!npcWorkZoneClear(actor, fromX, y, fromZ, toX, feet, toZ)) return false;
      if (!npcFireClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
      // Voluntary walkers go around fruit, but a growing pile or a landing may put one inside.
      // Keep their way out passable rather than trapping them.
      if (!npcPileAt(fromX, y, fromZ, height)) {
        const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / 0.15));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          if (npcPileAt(lerp(fromX, toX, t), lerp(y, feet, t), lerp(fromZ, toZ, t), height)) return false;
        }
      }
      // Supported ascent lifts onto a tread before moving across it. A diagonal
      // torso sweep from the old floor would falsely hit a legal half-metre
      // riser at its outer corner. Descents still sweep the actual falling edge.
      const sweepY = Math.max(y, feet);
      return island.clearAt(toX, feet + 1e-5, toZ, 0, 0.01) && island.clearAt(toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3)
        && (feet <= y || island.clearAt(fromX, sweepY + 0.3, fromZ, PLAYER_RADIUS, height - 0.3))
        && island.voxelSegmentClearAt(fromX, sweepY + 0.3, fromZ, toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3);
    };
    return npcWalkable;
  };
  BL.npcClearance = { create };
})();
