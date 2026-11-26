// Every address the site answers. The router reads it in the page; scripts/site.mjs reads it in Node to
// write each route its own page (title, description, canonical address, preview card cards/<image>.jpg),
// since search engines and link crawlers judge a page by the HTML at its address. `scene` is a scene id;
// `place` is a spot inside it (one of the hub's `navigate` views), reached as `ctx.place` on arrival. A
// route without an `image` shows home's card until it has one.
// `zone` names the zone or zones (docs/auth-and-presence.md, Zones) a route stands for, as its scene reports them: the
// address follows the visitor from zone to zone inside a scene (router.js `follow`), to the first route listed for the
// zone they walk into. A place that only stands in a zone (EntropyLab's mouth, on the island) names it too, and keeps
// its address until the visitor leaves it. Every zone a scene reports gets a route, and its `place` (or the scene's
// own arrival) is where an Ooga opened at that address appears, inside that same zone.
// The first entry is home, the bare address.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  BL.routes = {
    site: "https://oogabooga.land",
    name: "Ooga Booga Land",
    // The tab, search and card title: a route leads with its own name, home with the site's.
    title(entry) {
      return entry.path ? `${entry.title} · ${this.name}` : `${this.name} · ${entry.title}`;
    },
    list: [
      { path: "", scene: "hub", zone: "outside", image: "home", title: "a virtual world for open-source contributors",
        description: "Ooga Booga Land is a virtual world where open-source contributors collaborate and track contributions across Team Ooga Booga’s repositories." },
      { path: "donate", scene: "hub", place: "donate", zone: "outside", title: "Feed the Oogas",
        description: "Feed the Oogas with a donation of bananas on Ooga Booga Land." },
      { path: "oogarally", scene: "race", image: "oogarally", title: "Ooga Rally",
        description: "Kart racing round a floating island. Three tracks, three laps: podium on all of them and take the Cup." },
      { path: "oogadrop", scene: "drop", image: "oogadrop", title: "Ooga Drop",
        description: "Jump from the plane, fall through every hoop and land on the banana pile." },
      { path: "oogaorbit", scene: "orbit", image: "oogaorbit", title: "Ooga Orbit",
        description: "Lash a rocket together, reach the Sky Top, touch the space rock and fall home shield first." },
      { path: "oogamine", scene: "mine", image: "oogamine", title: "Ooga Mine",
        description: "A mining tycoon about margin: power, heat and the halving. Mine 21 coin in an hour without going broke." },
      { path: "blockfrenzy", scene: "block", title: "Block Frenzy",
        description: "Capture the block: steal the rivals' glowing Bitcoin block, carry it home and splat their runners with paint. Nobody gets hurt." },
      { path: "rainforest", scene: "hub", place: "rainforest", zone: "rainforest", title: "Mempool Rainforest",
        description: "Over the vine bridge from Ooga Booga Land: a rainforest round a lake that stands as deep as the Bitcoin mempool's backlog, raining with every transaction that arrives." },
      { path: "mempool", scene: "hub", place: "mempool", zone: "rainforest-under", image: "mempool", title: "Mempool chamber",
        description: "The live Bitcoin mempool as a rainforest lake: the backlog fills it, new blocks fall from it, and the chamber under it reads the chain out in paint." },
      { path: "bifrost", scene: "bifrost", zone: "bifrost.chamber", title: "₿IFRÖST · Caves and lands",
        description: "Explore Ooga Booga Land's project caves, connected worlds and independent project sites from the Bifrost directory." },
      { path: "bifrost-isle", scene: "hub", place: "bifrost", zone: "bifrost", title: "₿IFRÖST islet",
        description: "Past the arch over the north pass, the islet where Heimdall keeps the gate into ₿IFRÖST's chamber of windows to other worlds." },
      { path: "repos", scene: "hub", place: "repos", zone: "repos", title: "Merge Rock",
        description: "An island of carved totems off Ooga Booga Land's south rim, one for each of 171 open-source Bitcoin projects, sized by how much Bitcoin leans on it and lit for a day after it merges a pull request." },
      { path: "dsb", scene: "dsb", zone: "dsb-outside", title: "DSB Land",
        description: "Walk through ₿IFRÖST to DSB Land: a river boat, the Bitcoin coaster riding the live price, the Meme Shop and NodeRunner TV." },
      // DSB Land's venues, each entered at its door from inside (`place` is the venue's id in dsb-interiors.js).
      ...[
        ["studio", "dsb-studio", "dsb-studio", "DSB Studio", "DSB Land's studio stage, where hosts take the seats and the audience watches and listens."],
        ["maxis-club", "maxis-club", "dsb-maxis", "Maxis Club", "A private screening club in DSB Land: a poster passage, tiered red seats, green side galleries and a bar at the back."],
        ["without-rulers", "without-rulers", "dsb-without-rulers", "Without Rulers", "The Without Rulers shop in DSB Land: five collection bays, a central kiosk and a print gallery."],
        ["proof-of-ink", "proof-of-ink", "dsb-proof-of-ink", "Proof of Ink", "Proof of Ink in DSB Land: a gallery, a shop and an open print workshop."],
        ["big-bitcoin", "big-bitcoin", "dsb-big-bitcoin", "Big Bitcoin", "Big Bitcoin's headquarters in DSB Land, institutional and satirical."],
        ["meme-factory", "meme-factory", "dsb-meme-factory", "Meme Factory", "DSB Land's Meme Factory: a charcoal media factory with a red laser installation and a warm working studio."],
        ["stackchain", "stackchain-magazine", "dsb-stackchain", "Stackchain Magazine", "Stackchain Magazine's warm industrial newsroom and library in DSB Land."],
        ["svrn", "svrn-society", "dsb-svrn", "SVRN Society", "The SVRN Society in DSB Land: a dark timber boutique and ideas lounge."],
        ["puppy-rescue", "puppy-rescue", "dsb-puppy-rescue", "Free Puppies Rescue", "Free Puppies Rescue in DSB Land: a kennel hall with a fenced yard, where puppies wait for an Ooga to adopt them."],
        ["free-wallets", "free-wallets", "dsb-free-wallets", "Free Hardware Wallets", "Free Hardware Wallets in DSB Land: a crammed, slightly dubious giveaway store round one vending machine."]
      ].map(([path, place, zone, name, description]) => ({ path: `dsb-${path}`, scene: "dsb", place, zone, title: `DSB Land · ${name}`, description })),
      { path: "emberden", scene: "poker", zone: "emberden", title: "Ember Den",
        description: "A firelit card room through ₿IFRÖST's window: ten tables of Ooga poker round a fountain." },
      { path: "entropylab", scene: "hub", place: "lab", zone: "outside", image: "entropylab", title: "EntropyLab",
        description: "The EntropyLab cave, where donated bananas feed the voxel cavemen who stand for its contributors." },
      { path: "bca", scene: "hub", place: "bca", zone: "outside", title: "B.C.A.",
        description: "Banana Certified Accounting: two suited gorillas at walnut desks count every banana on abacuses. Count bananas. Keep receipts. Build in public." },
      { path: "hq", scene: "hub", place: "underground", zone: "hq", title: "HQ",
        description: "Ooga Booga Land's headquarters under the island, where the Oogas sleep between contributions." },
      { path: "basement", scene: "hub", place: "basement", zone: "hq-basement", title: "HQ · Basement",
        description: "The basement under Ooga Booga Land's headquarters: ten more rooms of beds for sleeping Oogas." },
      { path: "observatory", scene: "hub", place: "observatory", zone: "mirror", title: "The Observatory",
        description: "Through the mirror, a round chamber deep under the island whose walls of screens watch every corner of Ooga Booga Land." },
      { path: "lightning", scene: "factory", zone: "factory.hall", image: "lightning", title: "Lightning Factory",
        description: "A Lightning node at work as a factory in a tiered cavern, run by gorillas in hard hats: forwards ride the conduits through the glowing core." },
      { path: "jet", scene: "hangar", zone: "factory.hangar", title: "Lightning Jet Hangar",
        description: "Behind the Lightning Factory, the hangar where Lightning Jet v2 is being built: the Jet in its dock, its crew at work and the project's progress on the wall." },
      { path: "oogaarcade", scene: "arcade", zone: ["arcade.hall", "arcade.haunt"], title: "Ooga Arcade",
        description: "A torchlit cave of arcade cabinets, one for every Ooga game: walk up to Ooga Rally, Drop, Orbit or Mine and play, or take the upper hall's zipline to Block Frenzy." },
      { path: "ghost-arena", scene: "arcade", place: "arena", zone: ["ghost-arena", "ghost-arena.haunt"], title: "Ghost Hunter's Arena",
        description: "Down Ooga Arcade's haunted hallway, a round of dark stone under the night sky where the Oogas hunt ghosts until dawn." },
      { path: "oogaraid", scene: "raid", image: "oogaraid", title: "Ooga Raid",
        description: "Play your own Ooga side-on through eight stages, from the jungle shore to the Chairman's Engine, and drive out the Fiat Legion." },
      { path: "sphere", scene: "hub", place: "timechain", zone: "sphere", image: "sphere", title: "Timechain Sphere",
        description: "The Timechain Sphere's doors: choose one of nine rooms at the keypad, from a planetarium and a conference room to a meditation temple, a block party, a mining museum and a movie theater." },
      // The rooms, each its own kind of place and its own address (timechain-rooms.js), at their keypad numbers; 9 is
      // empty and has none.
      ...[
        ["Conference Room", "A round table for eight under a dome of live block and mining charts from mempool.space, the latest blocks round its base and the next block at the crown. The one room that locks."],
        ["Lecture Hall", "Lounge chairs on broad terraces facing a stage, with lectures on Bitcoin given on the dome: slides, a hand-drawn board and captions."],
        ["The Mining Museum", "From Satoshi's CPU to today's ASICs: miners from every era round the room, under seventeen years of hashrate on the dome."],
        ["Satoshi's Temple", "A meditation temple under a dusk sky: a lantern path, a pagoda, a koi pond and a replica of Valentina Picozzi's Satoshi statue in the main hall."],
        ["Proof of Work-out", "Exercise bikes facing a mountain sunrise: pedal to find a fake block and climb the gym's leaderboard."],
        ["Movie Theater", "Recliners on a steep rake facing a dome that is all picture, the biggest room in the Sphere."],
        ["Block Party", "Live dance radio in a club of light: an LED floor and wall that move to the music, lasers on the walls, and EDM Sessions live from the DJ booth. The latest block lights the scoreboard as it lands."],
        ["Planetarium", "Tonight's sky over London on the whole dome, from reclining seats round the star projector."],
        ["Genesis Museum", "The road to Bitcoin, 1974 to 2009: the technologies and events before the genesis block on a ring of plinths, a hologram of Satoshi's statue in the middle that opens the whitepaper, Block 0 at the end of the walk, a glass floor over a living map of the network, and the timeline round the dome."]
      ].map(([name, what], i) => ({ path: `sphere-${i}`, scene: "timechain", place: String(i), zone: `sphere-${i}`, title: `Timechain Sphere · ${name}`, description: `${name}, room ${i} of the Timechain Sphere. ${what}` }))
    ]
  };
})();
