// The World Map's tree: every place a player can walk into, from the island down to the rooms inside its lands, how
// each is reached, its address and the zones its players report, for the page at /map (src/map/, staged by
// scripts/site.mjs) and the live layer /api/world answers (worker/src/world.js).
//
//   node scripts/world-map.mjs    the tree as JSON on stdout
//
// Names, addresses and lists come from the game's own data, read in a vm as the page builds them: the zones
// (zone-map.js), the routes, the caves, the Timechain Sphere's rooms, ₿IFRÖST's windows and its directory, DSB Land's
// venues and the Arcade's cabinets. How one place leads to another is not data anywhere, so it is written here, keyed
// by place. `check` fails the build when a zone the game names is neither on the map nor dropped by name, when a place
// stands under a parent its zone does not have, or when a route is missing: a new place shows up as a failure here
// until it is placed.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (name) => readFileSync(join(root, "src", "js", `${name}.js`), "utf8");

// Zones the map leaves off: nowhere, between scenes, and the lab's debug-only hall.
export const DROPPED = Object.freeze(["none", "scene-transition", "lab.hall"]);
// A zone the game reports with no parent in zone-map.js, and the zone it is reached from.
export const ORPHANS = Object.freeze({ "block-frenzy": "arcade.hall" });
// DSB Land's venue zones, by venue (scene-dsb.js `VOICE_ZONES`, which is not exported).
const VENUE_ZONES = { "dsb-studio": "dsb-studio", "maxis-club": "dsb-maxis", "without-rulers": "dsb-without-rulers", "proof-of-ink": "dsb-proof-of-ink",
  "big-bitcoin": "dsb-big-bitcoin", "meme-factory": "dsb-meme-factory", "stackchain-magazine": "dsb-stackchain", "svrn-society": "dsb-svrn",
  "puppy-rescue": "dsb-puppy-rescue", "free-wallets": "dsb-free-wallets" };
// The ₿IFRÖST windows the map knows how to draw, by window id: their colour on the map, their zones and what else
// serves them. A travel window not here fails the build.
const WINDOW_PLACES = {
  dsb: { land: "dsb", zones: ["dsb-outside", "dsb-transit"] },
  poker: { land: "ember", zones: ["ember-den"], blurb: "A poker room of ten tables by the fire, reached through ₿IFRÖST.",
    objects: [{ cls: "Service", name: "poker service", note: "its tables run on a service of their own, not a Durable Object" }] }
};
// The carnival machines' names (arcade-games.js keeps them inside each game's code).
const CARNIVAL = ["Thro-ball", "Hoop Shot", "Coconut Toss", "Claw Machine", "Air Hockey", "Pool", "Darts", "Pinball", "Kiddie rides"];
// The Lightning Jet Hangar's rooms on its catwalks and front wall (scene-hangar.js), each behind a door keypad.
const HANGAR_ROOMS = ["Control room", "Crew room 1", "Crew room 2", "Crew room 3", "Command & Observation"];
// A zone the game makes up as it goes (zone-map.js's wildcards), and the place a player in one stands at.
export const PREFIXES = Object.freeze([["scene-", "arcade-hall"], ["cave-", "island"], ["dsb-", "dsb"], ["sphere-", "sphere"]]);

// The game's data as the page builds it. Three files read other modules' builders at load; behind a stub that answers
// anything they reach for, they still hand over their plain data.
export const load = () => {
  const plain = { window: { BL: {} }, URL };
  plain.globalThis = plain.window;
  for (const name of ["zone-map", "routes", "caves", "timechain-rooms", "voice-blend", "cave-directory", "arcade-cabinets"]) runInNewContext(source(name), plain);
  const BL = plain.window.BL;
  if (!BL.arcadeCabinets) BL.arcadeCabinets = plain.BL ? plain.BL.arcadeCabinets : null;
  const stub = () => {
    const p = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === "length" ? 0 : p, apply: () => p, construct: () => p });
    return p;
  };
  for (const [file, key] of [["bifrost-models", "bifrostModels"], ["dsb-interiors", "dsbInteriors"], ["arcade-models", "arcadeModels"]]) {
    const held = {};
    const stubbed = new Proxy(held, { get: (t, k) => Object.hasOwn(t, k) ? t[k] : (t[k] = stub()), set: (t, k, v) => { t[k] = v; return true; } });
    runInNewContext(source(file), { window: { BL: stubbed }, Math });
    BL[key] = held[key];
  }
  return BL;
};

const node = (id, name, fields = {}) => ({ id, name, kind: "place", land: "island", via: null, where: null, zones: [], href: null, external: false,
  blurb: "", items: [], objects: [], open: false, ...fields, children: fields.children || [] });

export const buildTree = (BL = load()) => {
  const { zoneMap, routes, caves, timechainRooms, bifrostModels, dsbInteriors, arcadeModels, arcadeCabinets, caveDirectory } = BL;
  const route = (path) => {
    const entry = routes.list.find((r) => r.path === path);
    if (!entry) throw new Error(`World Map: no route /${path}`);
    return entry;
  };
  const at = (path) => ({ href: `/${path}`, blurb: route(path).description });
  const slot = (id) => {
    const s = caves.slots.find((c) => c.id === id);
    if (!s) throw new Error(`World Map: no cave slot ${id}`);
    return s;
  };
  const clock = (hours) => {
    const h = Math.floor(hours), m = Math.round((hours - h) * 60);
    return m ? `${h}:${String(m).padStart(2, "0")} o'clock` : `${h} o'clock`;
  };

  // ₿IFRÖST's windows, as the chamber lists them.
  const windows = bifrostModels.WINDOWS.filter((w) => w.kind === "travel").map((w) => {
    const place = WINDOW_PLACES[w.id];
    if (!place) throw new Error(`World Map: ₿IFRÖST's window "${w.id}" is not on the map`);
    const fields = { via: "window", land: place.land, zones: place.zones, objects: place.objects || [], blurb: place.blurb || "" };
    if (w.scene === "dsb") {
      const venues = dsbInteriors.definitions.map((d) => {
        const zone = VENUE_ZONES[d.id];
        if (!zone) throw new Error(`World Map: DSB Land's venue "${d.id}" has no zone here`);
        return node(`dsb-${d.id}`, d.label || d.building, { kind: "room", land: "dsb", via: "door", zones: [zone], blurb: zoneMap.heading(zone).replace(/^DSB · /, "In DSB Land: ") });
      });
      return node("dsb", w.name, { ...fields, ...at("dsb"), open: true, tint: w.tint, children: venues });
    }
    return node(w.id, w.name, fields);
  });
  const directory = caveDirectory.registry.entries.filter((e) => e.status === "open")
    .map((e) => node(`site-${e.id}`, e.name, { kind: "external", land: "external", via: "link", href: e.url, external: true, blurb: e.description }));

  const games = arcadeModels.GAMES.map((g) => {
    const entry = routes.list.find((r) => r.scene === g.id);
    return { id: g.id, name: g.name, href: entry ? `/${entry.path}` : null, note: g.unavailable ? "out of order" : null };
  });
  const rooms = timechainRooms.OPEN.map((id) => {
    const room = timechainRooms.ROOMS[id], path = `sphere-${id}`;
    return node(path, room.name, { kind: "room", land: "sphere", via: "keypad", zones: [room.zone], href: routes.list.some((r) => r.path === path) ? `/${path}` : null,
      blurb: `Room ${id}. ${room.tag}.${room.lockable ? " Locks with a PIN." : ""}` });
  });

  const lab = slot("c11"), bca = slot("c10"), mirror = slot("c1"), factory = slot("c2"), arcade = slot("c3"), hq = slot("c730");
  return node("island", zoneMap.landOf(zoneMap.ROOT), {
    kind: "island", zones: [zoneMap.ROOT, "between"], href: "/", open: true,
    blurb: "A floating island whose cliff caves are projects, round the banana pile at its heart.",
    children: [
      node("bifrost-arch", "North pass arch", { land: "bifrost", via: "north pass", where: "12 o'clock", open: true,
        blurb: `₿IFRÖST's arch, standing where ${caves.gate.name.toLowerCase()} was, over the north pass.`,
        children: [node("bifrost", zoneMap.landOf("bifrost"), { land: "bifrost", via: "crystal bridge", zones: ["bifrost"], open: true,
          blurb: "A gateway islet past the arch, its chamber's field at the end of the bridge.",
          children: [node("bifrost-chamber", zoneMap.landOf("bifrost.chamber"), { land: "bifrost", via: "arch field", zones: ["bifrost.chamber"], ...at("bifrost"), open: true,
            blurb: "A round hall of stone and bronze with a ring of windows onto other worlds, and mirrors for the worlds still to come.",
            children: [...windows, ...directory] })] })] }),
      node("mirror", "The Observatory", { via: "walk through the mirror", where: clock(mirror.clock), zones: ["mirror"], blurb: "A circular chamber with live camera screens on black walls around a central chair. Walk through its return mirror to reach the island." }),
      node("factory", factory.name, { land: "factory", via: "tunnel & shield", where: clock(factory.clock), zones: ["factory", "factory.hall"], ...at("lightning"),
        children: [node("hangar", zoneMap.landOf("factory.hangar"), { land: "factory", via: "door", zones: ["factory.hangar"], ...at("jet"),
          children: HANGAR_ROOMS.map((name, i) => node(`hangar-room-${i}`, name, { kind: "room", land: "factory", via: "keypad", blurb: "A room off the hangar floor, behind a door keypad." })) })] }),
      node("arcade", arcade.name, { land: "arcade", via: "cave mouth", where: clock(arcade.clock), zones: ["arcade"], ...at("oogaarcade"),
        children: [
          node("arcade-outdoor", "Outdoor cabinets", { kind: "games", land: "arcade", via: "alcoves", blurb: `The ${arcadeCabinets.slots.length} most played cabinets, in the cave's alcoves before the doors.` }),
          node("arcade-hall", "Arcade hall", { land: "arcade", via: "double doors", zones: ["arcade.hall"], blurb: "A torchlit cave arcade the Oogas built and run.",
            children: [
              node("arcade-stage", "Stage cabinets", { kind: "games", land: "arcade", via: "stage", zones: games.filter((g) => g.href).map((g) => `scene-${g.id}`),
                items: games.map(({ name, href, note }) => ({ name, href, note })), blurb: "The Ooga games, on the round stage. Cloud Hopper rises from the island itself." }),
              node("arcade-mezzanine", "Mezzanine cabinets", { kind: "games", land: "arcade", via: "stairs", items: arcadeModels.RETRO.map((g) => ({ name: g.name, href: null, note: null })),
                blurb: "Eight retro games along the mezzanine." }),
              node("arcade-carnival", "Carnival machines", { kind: "games", land: "arcade", via: "hall floor", items: CARNIVAL.map((name) => ({ name, href: null, note: null })),
                blurb: "Tickets to win at the prize counter." }),
              node("arcade-haunt", "Haunted hallway", { land: "haunt", via: "hallway", zones: ["arcade.haunt", "ghost-arena.haunt"], blurb: "Off the mezzanine's end, out to the arena.",
                children: [node("ghost-arena", zoneMap.landOf("ghost-arena"), { land: "haunt", via: "hallway's end", zones: ["ghost-arena", "arcade-hunt", "arcade.arena"],
                  objects: [{ cls: "GameHost", prefix: "ghost-hunt:" }], blurb: "A round of dark stone under the stars, where the ghost hunt is played." })] }),
              node("arcade-block-hall", "Block Frenzy hall", { land: "arcade", via: "upper hall", blurb: "An open-air ledge and the zipline out into the sky.",
                children: [node("block-frenzy", zoneMap.landOf("block-frenzy"), { land: "block", via: "zipline", zones: ["block-frenzy"], ...at("blockfrenzy") })] }),
              node("arcade-raid", route("oogaraid").title, { land: "arcade", via: "back door", zones: ["scene-raid"], ...at("oogaraid") })
            ] })
        ] }),
      node("rainforest", zoneMap.landOf("rainforest"), { land: "rainforest", via: "vine bridge", where: "between 3 and 4 o'clock", zones: ["rainforest"],
        blurb: "A rainforest round a lake as deep as the transaction backlog.",
        children: [node("rainforest-under", route("mempool").title, { land: "rainforest", via: "tunnel", zones: ["rainforest-under"], ...at("mempool") })] }),
      node("hq", hq.name, { land: "hq", via: "ramps", where: `${clock(hq.clock)} and ${clock(slot("c5").clock)}`, zones: ["hq"], blurb: "Under the island, where the Oogas sleep.",
        children: [node("hq-basement", zoneMap.landOf("hq-basement"), { land: "hq", via: "stairs", zones: ["hq-basement"], blurb: "The rooms beneath headquarters." })] }),
      node("repos", zoneMap.landOf("repos"), { land: "repos", via: "stone bridge", where: "off the south stairs", zones: ["repos"], ...at("repos") }),
      node("sphere", route("sphere").title, { land: "sphere", via: "bridge", where: "off the southwest rim", zones: ["sphere"], ...at("sphere"), children: rooms }),
      node("bca", bca.name, { land: "bca", via: "veil", where: clock(bca.clock), zones: ["bca"], ...at("bca") }),
      node("lab", lab.name, { land: "lab", via: "cave mouth", where: clock(lab.clock), zones: ["lab"], ...at("entropylab") }),
      node("library", "Library nook", { land: "island", via: "stair terrace", blurb: "Shelves of books beside the Timechain stairs: Learn Me A Bitcoin, Bitcoin.org and the whitepaper." })
    ]
  });
};

// Every node, depth first, with its parent.
const walk = (tree, fn, parent = null) => { fn(tree, parent); for (const child of tree.children) walk(child, fn, tree); };

// Throws when the map has drifted from the game.
export const check = (tree, BL) => {
  const { zoneMap, routes } = BL;
  const holder = new Map(), parentOf = new Map(), ids = new Set();
  walk(tree, (n, parent) => {
    if (ids.has(n.id)) throw new Error(`World Map: two places are "${n.id}"`);
    ids.add(n.id);
    parentOf.set(n.id, parent);
    for (const zone of n.zones) {
      if (holder.has(zone)) throw new Error(`World Map: zone ${zone} is at both ${holder.get(zone).id} and ${n.id}`);
      holder.set(zone, n);
    }
  });
  const known = (zone) => zoneMap.zones.includes(zone) || zoneMap.parentOf(zone) !== null;
  for (const zone of zoneMap.zones) if (!DROPPED.includes(zone) && !holder.has(zone)) throw new Error(`World Map: zone ${zone} is not on the map; place it in scripts/world-map.mjs or drop it there`);
  for (const [zone, n] of holder) {
    if (!known(zone) && !Object.hasOwn(ORPHANS, zone)) throw new Error(`World Map: ${n.id} holds ${zone}, which the game never reports`);
    if (zone === zoneMap.ROOT) continue;
    const up = Object.hasOwn(ORPHANS, zone) ? ORPHANS[zone] : zoneMap.parentOf(zone), at = holder.get(up);
    if (!at) throw new Error(`World Map: ${zone}'s parent ${up} is not on the map`);
    let ancestor = n;
    while (ancestor && ancestor !== at) ancestor = parentOf.get(ancestor.id);
    if (!ancestor) throw new Error(`World Map: ${n.id} holds ${zone}, but ${up} (${at.id}) is not above it`);
  }
  for (const [, id] of PREFIXES) if (!ids.has(id)) throw new Error(`World Map: no place ${id} for a made-up zone`);
  const hrefs = [];
  walk(tree, (n) => { if (n.href && !n.external) hrefs.push(n.href); for (const item of n.items) if (item.href) hrefs.push(item.href); });
  for (const entry of routes.list) {
    if (entry.path === "donate") continue;
    const count = hrefs.filter((h) => h === `/${entry.path}`).length;
    if (count !== 1) throw new Error(`World Map: /${entry.path} is on the map ${count} times`);
  }
  return tree;
};

export const worldMap = () => {
  const BL = load();
  return { tree: check(buildTree(BL), BL), prefixes: PREFIXES };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(worldMap(), null, 1));
