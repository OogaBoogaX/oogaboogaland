// The zones signed-in players report (docs/auth-and-presence.md, Zones), as the panels read them: the land each
// stands in (the Ooga Boogas roster's drop-down), the heading its group goes under in the live players tab, the banner's
// line under its title, and the way between them. Zones form a tree rooted at the island (`outside`): every other zone is reached through its
// parent, so the first step from one zone toward another is down toward it when it lies beneath, else up toward the
// island. `next` names that step as a zone; the scene the visitor is in knows where its door stands.
// Plain data and pure functions, loaded in Node by the suite.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ROOT = "outside";
  const LANDS = { outside: "The Island", repos: "Merge Rock", sphere: "Timechain Exterior", rainforest: "Mempool Rainforest", "rainforest-under": "Mempool Cave", bifrost: "₿IFRÖST", lab: "EntropyLab", factory: "Lightning Factory", arcade: "Ooga Arcade", "block-frenzy": "Block Frenzy", "ghost-arena": "Ghost Hunter's Arena", "arcade-hunt": "Ghost Hunter's Arena", hq: "HQ", "hq-basement": "Basement", emberden: "Ember Den", "ember-den": "Ember Den", "byzantine-keep": "Valhodl", between: "Between lands", none: "Between lands", "scene-transition": "Between lands" };
  const landOf = (zone) => {
    if (zone === "factory.hangar") return "Lightning Jet Hangar";
    if (zone === "bifrost.chamber") return "₿IFRÖST chamber";
    if (zone === "arcade.arena") return LANDS["ghost-arena"];
    const dot = zone.indexOf("."), group = dot < 0 ? zone : zone.slice(0, dot);
    if (Object.hasOwn(LANDS, group)) return LANDS[group];
    if (/^sphere-\d$/.test(zone)) return `TCS · Room ${zone.slice(7)}`;
    if (zone.startsWith("dsb-")) return "DSB Land";
    return zone;
  };
  // Every game is listed with Ooga Arcade's hall, which it is played from; only the arena is apart. Between scenes is
  // nowhere. The cave entrances are the island, whichever name a page loaded earlier still reports for one.
  // The haunted hallway is listed with the end of it a player stands on (#422): its near half with Ooga Arcade's hall,
  // its far half with Ghost Hunter's Arena, so each land is one heading; so too the arena's names from before #422 that a
  // page loaded earlier still reports (`arcade-hunt`, `arcade.arena`), and the Ember Den's name before it was one word
  // (`ember-den`).
  // The land between (the island's bridges and the air off its edge) is listed with anyone between scenes.
  const JOINED = { "arcade.haunt": "arcade.hall", "ghost-arena.haunt": "ghost-arena", "arcade-hunt": "ghost-arena", "arcade.arena": "ghost-arena", "ember-den": "emberden", between: "none", lab: ROOT, bca: ROOT, factory: ROOT, arcade: ROOT, mirror: ROOT };
  const groupOf = (zone) => zone === "scene-transition" ? "none" : keepPlace(zone) ? keepPlace(zone) : Object.hasOwn(JOINED, zone) ? JOINED[zone] : zone.startsWith("cave-") ? ROOT : zone.startsWith("scene-") ? "arcade.hall" : zone;
  // A heading names its own zone where one land holds several, each with coordinates of its own.
  const HEADINGS = {
    "lab.hall": "EntropyLab hall", "byzantine-keep.halls": "Valhodl · The Keep",
    "dsb-transit": "DSB · Arriving", "dsb-studio": "DSB · DSB Studio", "dsb-maxis": "DSB · Maxis Club",
    "dsb-without-rulers": "DSB · Without Rulers", "dsb-proof-of-ink": "DSB · Proof of Ink", "dsb-big-bitcoin": "DSB · Big Bitcoin",
    "dsb-meme-factory": "DSB · Meme Factory", "dsb-stackchain": "DSB · Stackchain Magazine", "dsb-svrn": "DSB · SVRN Society",
    "dsb-puppy-rescue": "DSB · Puppy Rescue", "dsb-free-wallets": "DSB · Free Wallets"
  };
  const heading = (group) => Object.hasOwn(HEADINGS, group) ? HEADINGS[group] : landOf(group);
  // The banner's line under its title: where a player is, named as the tab's headings are, the main island's own line
  // at home and while nowhere has been reported yet.
  const line = (zone) => zone === "none" || groupOf(zone) === ROOT ? "The Island of Caves" : heading(groupOf(zone));
  // Each zone's way back toward the island. A bridge is the land between (`zoneOf` in scene-hub.js), so a bridged land
  // starts where its bridge ends, and the land between's routes start as the island's do (`next`). The games open from the arcade's hall; DSB Land and the Ember Den from the
  // ₿IFRÖST chamber's windows; the Sphere's rooms from its doorway; Ghost Hunter's Arena down the arcade's haunted
  // hallway, half by half. Nowhere, and anything unknown, has no way.
  const PARENTS = {
    between: ROOT, lab: ROOT, bca: ROOT, mirror: ROOT, hq: ROOT, factory: ROOT, arcade: ROOT, sphere: ROOT, rainforest: ROOT, bifrost: ROOT, repos: ROOT,
    "hq-basement": "hq", "rainforest-under": "rainforest", "lab.hall": "lab", "factory.hall": "factory", "factory.hangar": "factory.hall", "arcade.hall": "arcade",
    "arcade.haunt": "arcade.hall", "ghost-arena.haunt": "arcade.haunt", "ghost-arena": "ghost-arena.haunt", "arcade-hunt": "ghost-arena", "arcade.arena": "ghost-arena",
    "bifrost.chamber": "bifrost", emberden: "bifrost.chamber", "ember-den": "emberden", "byzantine-keep": "bifrost.chamber", "byzantine-keep.halls": "byzantine-keep", "dsb-outside": "bifrost.chamber", "dsb-transit": "bifrost.chamber"
  };
  // A zone is whatever a page reports, so the tables are read by their own keys alone, never their prototype's.
  const parentOf = (zone) => Object.hasOwn(PARENTS, zone) ? PARENTS[zone] : keepPlace(zone) && keepPlace(zone) !== zone ? (keepPlace(zone) === "byzantine-keep" ? PARENTS["byzantine-keep"] : "byzantine-keep") : (zone.startsWith("cave-") ? ROOT : /^sphere-[0-9]$/.test(zone) ? "sphere"
    : zone.startsWith("dsb-") ? "dsb-outside" : zone.startsWith("scene-") && zone !== "scene-transition" ? "arcade.hall" : null);
  // Steps up to the island, or -1 for a zone with no way there.
  const depthOf = (zone) => {
    let depth = 0;
    while (zone !== ROOT) {
      zone = parentOf(zone);
      if (!zone) return -1;
      depth++;
    }
    return depth;
  };
  // Where a zone's routes start: the land between's as the island's do, a level's as the land over it, whose doors it shares.
  const START = { between: ROOT, "hq-basement": "hq", "rainforest-under": "rainforest" };
  const routeFrom = (zone) => Object.hasOwn(START, zone) ? START[zone] : zone;
  // The zone the route from `from` to `to` enters first, or null when they are the same or either has no way.
  const next = (from, to) => {
    from = routeFrom(from);
    if (from === to) return null;
    const a = depthOf(from);
    let b = depthOf(to);
    if (a < 0 || b < 0) return null;
    let zone = to, child = null;
    while (b > a) { child = zone; zone = parentOf(zone); b--; }
    return zone === from ? child : parentOf(from);
  };
  // The live players tab's order, sorted in place: the visitor's own group (`mine`) first, then the others by heading;
  // within a group the visitor's own row first, then everyone by name. Rows carry `group`, `name`, `self` and `id`.
  const COLLATE = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const arrange = (rows, mine) => rows.sort((a, b) => a.group === b.group
    ? (b.self ? 1 : 0) - (a.self ? 1 : 0) || (a.listener ? 1 : 0) - (b.listener ? 1 : 0) || COLLATE.compare(a.name, b.name) || a.id - b.id
    : a.group === mine ? -1 : b.group === mine ? 1 : COLLATE.compare(heading(a.group), heading(b.group)) || (a.group < b.group ? -1 : 1));
  // Lands too big for the room's bounds on a position (±160 m about the middle, worker/src/protocol.js `BOUND_XZ`)
  // report each one from the middle of the area it is in, under that area's zone, and every page adds the area's
  // middle back (`originOf`). Valhodl's yard (scene-keep.js) is a grid of areas `FRAME_SPAN` across, its castle
  // island's the bare `byzantine-keep`; its halls (scene-keep-halls.js) are the keep's inside, each tower's inside
  // (keep-halls-layout.js `TOWER_SPAN` apart from x 200), the volcano's cave past them and Shards' caves past that.
  // An area is kept until its walker is `FRAME_HOLD` past its own edge, so nobody flickers between two at a boundary.
  const FRAME_SPAN = 300, FRAME_HOLD = 4;
  const FRAME_SETS = (() => {
    const yard = [];
    for (let c = 0; c < 9; c++) for (let r = 0; r < 4; r++) {
      const x = (c - 5) * FRAME_SPAN, z = (r - 1) * FRAME_SPAN;
      yard.push(Object.freeze({ zone: x === 0 && z === 0 ? "byzantine-keep" : `byzantine-keep.y${c}r${r}`, x, z }));
    }
    const halls = [Object.freeze({ zone: "byzantine-keep.halls", x: 0, z: 0 })];
    for (let i = 0; i < 6; i++) halls.push(Object.freeze({ zone: `byzantine-keep.h${i}`, x: 200 + i * 160, z: 0 }));
    halls.push(Object.freeze({ zone: "byzantine-keep.hcave", x: 1195, z: 0 }));
    halls.push(Object.freeze({ zone: "byzantine-keep.hshards", x: 1356, z: 0 }));
    // Outpost Island's eight towers' insides, past the caves (keep-halls-layout.js `OUTPOST_X`).
    for (let i = 6; i < 14; i++) halls.push(Object.freeze({ zone: `byzantine-keep.h${i}`, x: 1600 + (i - 6) * 160, z: 0 }));
    return Object.freeze({ "keep-yard": Object.freeze(yard), "keep-halls": Object.freeze(halls) });
  })();
  const ORIGINS = new Map();
  for (const set of Object.values(FRAME_SETS)) for (const f of set) ORIGINS.set(f.zone, f);
  /** The middle a zone's positions are reported from (`{ x, z }`), or null for a zone that reports its own. */
  const originOf = (zone) => ORIGINS.get(zone) || null;
  const NO_OFFSET = Object.freeze({ x: 0, z: 0 });
  /** What to add to a position reported in `zone` for the scene's own coordinates (nothing for most zones). */
  const offsetOf = (zone) => ORIGINS.get(zone) || NO_OFFSET;
  /** Whether two zones are areas of one scene (one set of `FRAME_SETS`), so positions in them, each with its area's
   *  middle added back (`offsetOf`), are in one set of coordinates. */
  const sharedFrame = (a, b) => {
    const fa = ORIGINS.get(a), fb = ORIGINS.get(b);
    return !!fa && !!fb && (keepPlace(a) || a) === (keepPlace(b) || b);
  };
  /** The zone of the area in `set` that (x, z) reports from: `current` while it is still within its own area. */
  const frameZone = (set, x, z, current) => {
    const list = FRAME_SETS[set], half = set === "keep-halls" ? 80 : FRAME_SPAN / 2, held = ORIGINS.get(current);
    if (held && list.includes(held) && Math.max(Math.abs(x - held.x), Math.abs(z - held.z)) <= half + FRAME_HOLD) return current;
    let best = list[0], d = Infinity;
    for (let i = 0; i < list.length; i++) { const f = list[i], e = Math.max(Math.abs(x - f.x), Math.abs(z - f.z)); if (e < d) { d = e; best = f; } }
    return best.zone;
  };
  // Valhodl's areas, as a place of their own: the yard's are all `byzantine-keep`, the halls' `byzantine-keep.halls`.
  const keepPlace = (zone) => {
    if (zone.length < 16 || !zone.startsWith("byzantine-keep.")) return null;
    const c = zone.charCodeAt(15);
    return c === 121 ? "byzantine-keep" : c === 104 ? "byzantine-keep.halls" : null;
  };
  // Every zone the tables name, for the World Map (scripts/world-map.mjs), which places each one or drops it by name.
  const zones = Object.freeze([...new Set([ROOT, ...Object.keys(LANDS), ...Object.keys(PARENTS), ...Object.keys(HEADINGS), ...ORIGINS.keys()])]);
  BL.zoneMap = { ROOT, zones, landOf, groupOf, heading, line, parentOf, routeFrom, next, arrange, FRAME_SETS, originOf, offsetOf, sharedFrame, frameZone, keepPlace };
})();
