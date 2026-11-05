// Evaluator-only browser-free geometry context. The evaluator's bundle maps
// window to globalThis; no DOM, renderer, controls, auth or account config loads.
import "../../src/js/math.js";
import "../../src/js/scene.js";
import "../../src/js/models.js";
import "../../src/js/convex.js";
import "../../src/js/clanker-state.js";
const B = globalThis.BL;
// Authored fixture inputs, matching pilot.WALK and crew.JUMP_SPEED constants.
B.pilot = { WALK: { speed: 7.75, gravity: 9.8 } };
B.crew = { JUMP_SPEED: 4.8 };
