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
  const LANDS = { outside: "The Island", repos: "Merge Rock", sphere: "Timechain Exterior", rainforest: "Mempool Rainforest", "rainforest-under": "Mempool Cave", bifrost: "₿IFRÖST", lab: "EntropyLab", factory: "Lightning Factory", arcade: "Ooga Arcade", "block-frenzy": "Block Frenzy", "ghost-arena": "Ghost Hunter's Arena", "arcade-hunt": "Ghost Hunter's Arena", hq: "HQ", "hq-basement": "Basement", "ember-den": "Ember Den", between: "Between lands", none: "Between lands", "scene-transition": "Between lands" };
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
  // page loaded earlier still reports (`arcade-hunt`, `arcade.arena`).
  // The land between (the island's bridges and the air off its edge) is listed with anyone between scenes.
  const JOINED = { "arcade.haunt": "arcade.hall", "ghost-arena.haunt": "ghost-arena", "arcade-hunt": "ghost-arena", "arcade.arena": "ghost-arena", between: "none", lab: ROOT, bca: ROOT, factory: ROOT, arcade: ROOT, mirror: ROOT };
  const groupOf = (zone) => zone === "scene-transition" ? "none" : Object.hasOwn(JOINED, zone) ? JOINED[zone] : zone.startsWith("cave-") ? ROOT : zone.startsWith("scene-") ? "arcade.hall" : zone;
  // A heading names its own zone where one land holds several, each with coordinates of its own.
  const HEADINGS = {
    "lab.hall": "EntropyLab hall",
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
    "bifrost.chamber": "bifrost", "ember-den": "bifrost.chamber", "dsb-outside": "bifrost.chamber", "dsb-transit": "bifrost.chamber"
  };
  // A zone is whatever a page reports, so the tables are read by their own keys alone, never their prototype's.
  const parentOf = (zone) => Object.hasOwn(PARENTS, zone) ? PARENTS[zone] : (zone.startsWith("cave-") ? ROOT : /^sphere-[0-9]$/.test(zone) ? "sphere"
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
    ? (b.self ? 1 : 0) - (a.self ? 1 : 0) || COLLATE.compare(a.name, b.name) || a.id - b.id
    : a.group === mine ? -1 : b.group === mine ? 1 : COLLATE.compare(heading(a.group), heading(b.group)) || (a.group < b.group ? -1 : 1));
  BL.zoneMap = { ROOT, landOf, groupOf, heading, line, parentOf, routeFrom, next, arrange };
})();
