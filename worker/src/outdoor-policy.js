// Which public Ooga Chat audience an island player may be admitted to (#667): the server's own reading, from what the
// Room itself holds about the player (its zone, its body, a level crossing, a cabinet seat), never the page's claim
// alone. The page's own classifier (src/js/outdoor-scope.js, #658) decides first and finer, from the body's geometry
// (a cave's doorway plane, the Sphere's shell), and asks with `enter`; the Room admits only a scope this registry
// agrees with, and takes it back the moment the Room's own view stops agreeing, whatever the page says next.
// Default deny: a zone is public only if it is named here, one by one. A new interior, a new scene or a new outdoor is
// excluded until it is added here with a check, never through a prefix or a substring. Pure; loaded in Node.

export const POLICY_VERSION = 1;

// The island's outdoor zones (scene-hub.js `zoneOf`; voice-blend.js WORLD minus every level and Merge Rock) and DSB
// Land's open air (scene-dsb.js, outside any room). Everything else is excluded.
export const OUTDOOR_ZONES = Object.freeze({
  outside: "main",       // the island's surface, its cave aprons and outdoor cabinets
  between: "main",       // its bridges and the air between lands
  sphere: "main",        // the Timechain Sphere's outside and bridge (its rooms are sphere-0..9)
  rainforest: "main",    // the Mempool rainforest's top
  bifrost: "main",       // the Bifrost islet (its chamber is bifrost.chamber)
  "dsb-outside": "dsb",  // DSB Land's outdoors, no room active
});

/**
 * `{ scope, reason }` for a player as the Room holds it: `scope` `main`, `dsb` or null. Reasons for null: `no-body`
 * (driving nothing), `descending` (crossing to or between levels), `cabinet` (seated at a hall cabinet), `interior` (any
 * other zone, known or not).
 */
export const scopeOf = (p, cabinets = null) => {
  if (!p || !p.body) return { scope: null, reason: "no-body" };
  if (p.blendTo) return { scope: null, reason: "descending" };
  if (p.cabinet && !(cabinets && cabinets.get(p.cabinet.id) && cabinets.get(p.cabinet.id).outdoor)) return { scope: null, reason: "cabinet" };
  const scope = Object.hasOwn(OUTDOOR_ZONES, p.zone) ? OUTDOOR_ZONES[p.zone] : null;
  return scope ? { scope, reason: "outdoor" } : { scope: null, reason: "interior" };
};
