// The zones signed-in players report (docs/auth-and-presence.md, Zones), as the panels read them: the land each
// stands in (the Ooga Boogas roster's drop-down), the heading its group goes under in the live players tab, and the
// way between them. Zones form a tree rooted at the island (`outside`): every other zone is reached through its
// parent, so the first step from one zone toward another is down toward it when it lies beneath, else up toward the
// island. `next` names that step as a zone; the scene the visitor is in knows where its door stands.
// Plain data and pure functions, loaded in Node by the suite.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ROOT = "outside";
  const LANDS = { outside: "The island", sphere: "Timechain Sphere", rainforest: "Mempool Island", bifrost: "₿IFRÖST", lab: "EntropyLab", bca: "B.C.A.", factory: "Lightning Factory", arcade: "Ooga Arcade", mirror: "The Mirror cave", hq: "HQ", "ember-den": "Ember Den", none: "Between lands", "scene-transition": "Between lands" };
  // A routed game's title, or null for the arcade's other games and anything else.
  const gameTitle = (zone) => {
    const route = BL.routes.list.find((r) => r.scene === zone.slice(6) && !r.place);
    return route ? route.title : null;
  };
  const landOf = (zone) => {
    if (zone === "factory.hangar") return "Lightning Jet Hangar";
    if (zone === "bifrost.chamber") return "₿IFRÖST chamber";
    const dot = zone.indexOf("."), group = dot < 0 ? zone : zone.slice(0, dot);
    if (Object.hasOwn(LANDS, group)) return LANDS[group];
    if (/^sphere-\d$/.test(zone)) return `Timechain Sphere · Room ${zone.slice(7)}`;
    if (zone.startsWith("dsb-")) return "DSB Land";
    if (zone.startsWith("cave-")) return "A cave on the island";
    if (zone.startsWith("scene-")) return gameTitle(zone) || "A game";
    return zone;
  };
  // The arcade's games without an address of their own share one group: nobody stands anywhere in them, so they have
  // no distances to keep apart. Between scenes is nowhere.
  const GAMES = "scene:games";
  const groupOf = (zone) => zone === "scene-transition" ? "none" : zone.startsWith("scene-") && !gameTitle(zone) ? GAMES : zone;
  // A heading names its own zone where one land holds several, each with coordinates of its own.
  const HEADINGS = {
    factory: "Lightning Factory tunnel", arcade: "Ooga Arcade entrance", "lab.hall": "EntropyLab hall", [GAMES]: "Ooga Arcade games",
    "dsb-transit": "DSB Land · Arriving", "dsb-studio": "DSB Land · DSB Studio", "dsb-maxis": "DSB Land · Maxis Club",
    "dsb-without-rulers": "DSB Land · Without Rulers", "dsb-proof-of-ink": "DSB Land · Proof of Ink", "dsb-big-bitcoin": "DSB Land · Big Bitcoin",
    "dsb-meme-factory": "DSB Land · Meme Factory", "dsb-stackchain": "DSB Land · Stackchain Magazine", "dsb-svrn": "DSB Land · SVRN Society",
    "dsb-puppy-rescue": "DSB Land · Puppy Rescue", "dsb-free-wallets": "DSB Land · Free Wallets"
  };
  const heading = (group) => Object.hasOwn(HEADINGS, group) ? HEADINGS[group] : landOf(group);
  // Each zone's way back toward the island. A bridge belongs to the island (`zoneOf` in scene-hub.js), so a bridged land
  // starts where its bridge ends. The games open from the arcade's hall; DSB Land and the Ember Den from the
  // ₿IFRÖST chamber's windows; the Sphere's rooms from its doorway. Nowhere, and anything unknown, has no way.
  const PARENTS = {
    lab: ROOT, bca: ROOT, mirror: ROOT, hq: ROOT, factory: ROOT, arcade: ROOT, sphere: ROOT, rainforest: ROOT, bifrost: ROOT,
    "lab.hall": "lab", "factory.hall": "factory", "factory.hangar": "factory.hall", "arcade.hall": "arcade",
    "bifrost.chamber": "bifrost", "ember-den": "bifrost.chamber", "dsb-outside": "bifrost.chamber", "dsb-transit": "bifrost.chamber"
  };
  // A zone is whatever a page reports, so the tables are read by their own keys alone, never their prototype's.
  const parentOf = (zone) => Object.hasOwn(PARENTS, zone) ? PARENTS[zone] : (zone.startsWith("cave-") ? ROOT : /^sphere-[1-9]$/.test(zone) ? "sphere"
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
  // The zone the route from `from` to `to` enters first, or null when they are the same or either has no way.
  const next = (from, to) => {
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
  BL.zoneMap = { ROOT, landOf, groupOf, heading, parentOf, next, arrange };
})();
