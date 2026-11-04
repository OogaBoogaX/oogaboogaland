import "../../src/js/math.js";
import "../../src/js/npc-clearance.js";

const callbacks = ["walkable", "playerSupportAt", "npcRampRoofAt", "npcClosedCaveClear",
  "npcWorkZoneClear", "npcFireClear", "npcPileAt"];

// A single bounded voluntary step, not a teleport or passive-body integrator.
// The production world adapter must implement every rule; no permissive defaults.
export function createNpcClearance(adapters) {
  if (!adapters || callbacks.some(k => typeof adapters[k] !== "function")
    || typeof adapters.island?.clearAt !== "function" || typeof adapters.island?.voxelSegmentClearAt !== "function"
    || !Number.isFinite(adapters.PLAYER_RADIUS) || adapters.PLAYER_RADIUS <= 0 || adapters.PLAYER_RADIUS > 2) {
    throw new Error("NPC clearance requires explicit world adapters");
  }
  const boolean = fn => (...args) => {
    const value = fn(...args);
    if (typeof value !== "boolean") throw new Error("invalid NPC clearance result");
    return value;
  };
  const rules = Object.fromEntries(callbacks.filter(k => k !== "playerSupportAt").map(k => [k, boolean(adapters[k])]));
  const support = adapters.playerSupportAt, unsupported = Symbol("unsupported NPC destination");
  const walk = globalThis.BL.npcClearance.create({ ...adapters, ...rules, lerp: globalThis.BL.math.lerp,
    island: { clearAt: boolean(adapters.island.clearAt), voxelSegmentClearAt: boolean(adapters.island.voxelSegmentClearAt) },
    playerSupportAt(...args) {
      const y = support(...args);
      if (y === -Infinity) throw unsupported;
      if (!Number.isFinite(y) || Math.abs(y) > 10000) throw new Error("invalid NPC support");
      return y;
    },
  });
  return (x, z, toX, toZ, y, height, actor) => {
    if (![x, z, toX, toZ, y].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)
      || !Number.isFinite(height) || height <= 0.3 || height > 10 || Math.hypot(toX - x, toZ - z) > 4) {
      throw new Error("invalid NPC clearance step");
    }
    try { return walk(x, z, toX, toZ, y, height, actor); }
    catch (error) { if (error === unsupported) return false; throw error; }
  };
}
