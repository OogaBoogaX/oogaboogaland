// The exact surface-route planner used by browser Oogas, loadable without DOM/rig shims.
// This is one extraction boundary, not a replacement AI or a production world adapter.
import "../../src/js/npc-paths.js";
export const createNpcNavigation = globalThis.BL.npcPaths.create;
