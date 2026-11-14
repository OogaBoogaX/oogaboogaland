// Every address the site answers. The router reads it in the page; scripts/site.mjs reads it in Node to
// write each route its own page (title, description, canonical address, preview card cards/<image>.jpg),
// since search engines and link crawlers judge a page by the HTML at its address. `scene` is a scene id;
// `place` is a spot inside it (one of the hub's `navigate` views), reached as `ctx.place` on arrival. A
// route without an `image` shows home's card until it has one.
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
      { path: "", scene: "hub", image: "home", title: "a virtual world for open-source contributors",
        description: "Ooga Booga Land is a virtual world where open-source contributors collaborate and track contributions across Team Ooga Booga’s repositories." },
      { path: "donate", scene: "hub", place: "donate", title: "Feed the Oogas",
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
      { path: "mempool", scene: "hub", place: "mempool", image: "mempool", title: "Mempool chamber",
        description: "The live Bitcoin mempool as a rainforest lake: the backlog fills it, new blocks fall from it, and the chamber under it reads the chain out in paint." },
      { path: "bifrost", scene: "bifrost", title: "₿IFRÖST · Caves and lands",
        description: "Explore Ooga Booga Land's project caves, connected worlds and independent project sites from the Bifrost directory." },
      { path: "repos", scene: "hub", place: "repos", title: "Merge Rock",
        description: "An island of carved totems off Ooga Booga Land's south rim, one for each of 170 open-source Bitcoin projects, sized by how much Bitcoin leans on it and lit for a day after it merges a pull request." },
      { path: "dsb", scene: "dsb", title: "DSB Land",
        description: "Walk through ₿IFRÖST to DSB Land: a river boat, the Bitcoin coaster riding the live price, the Meme Shop and NodeRunner TV." },
      { path: "entropylab", scene: "hub", place: "lab", image: "entropylab", title: "EntropyLab",
        description: "The EntropyLab cave, where donated bananas feed the voxel cavemen who stand for its contributors." },
      { path: "bca", scene: "hub", place: "bca", title: "B.C.A.",
        description: "Banana Certified Accounting: two suited gorillas at walnut desks count every banana on abacuses. Count bananas. Keep receipts. Build in public." },
      { path: "lightning", scene: "factory", image: "lightning", title: "Lightning Factory",
        description: "A Lightning node at work as a factory in a tiered cavern, run by gorillas in hard hats: forwards ride the conduits through the glowing core." },
      { path: "jet", scene: "hangar", title: "Lightning Jet Hangar",
        description: "Behind the Lightning Factory, the hangar where Lightning Jet v2 is being built: the Jet in its dock, its crew at work and the project's progress on the wall." },
      { path: "oogaarcade", scene: "arcade", title: "Ooga Arcade",
        description: "A torchlit cave of arcade cabinets, one for every Ooga game: walk up to Ooga Rally, Drop, Orbit or Mine and play, or take the upper hall's zipline to Block Frenzy." },
      { path: "sphere", scene: "hub", place: "timechain", image: "sphere", title: "Timechain Sphere",
        description: "The Timechain Sphere's doors: choose one of ten rooms at the keypad, from a planetarium and a conference room to a meditation temple, a block party, a mining museum and a movie theater." },
      // The ten rooms, each its own kind of place and its own address (timechain-rooms.js), in keypad order's numbers.
      ...[
        ["Planetarium", "Tonight's sky over London on the whole dome, from reclining seats round the star projector."],
        ["Conference Room", "A round table for eight under a dome of live block and mining charts from mempool.space, the latest blocks round its base and the next block at the crown. The one room that locks."],
        ["Satoshi's Temple", "A meditation temple under a dusk sky: a lantern path, a pagoda, a koi pond and a replica of Valentina Picozzi's Satoshi statue in the main hall."],
        ["Block Party", "Live dance radio in a club of light: an LED floor and wall that move to the music, lasers on a truss, and a DJ booth to change the channel behind. The bass drops on every block."],
        ["Fireside Lounge", "Sofas round a fire pit in a forest clearing under the Milky Way, a small room for a fireside chat."],
        ["Proof of Work-out", "Exercise bikes facing a mountain sunrise: pedal to find a fake block and climb the gym's leaderboard."],
        ["The Observatory", "A telescope on its mount under the dome's slit to the night sky, with views of Saturn and the Moon."],
        ["The Mining Museum", "From Satoshi's CPU to today's ASICs: miners from every era round the room, under seventeen years of hashrate on the dome."],
        ["Lecture Hall", "Raked rows facing a stage with three whiteboards, a slide on the dome and live charts either side."],
        ["Movie Theater", "Recliners on a steep rake facing a dome that is all picture, the biggest room in the Sphere."]
      ].map(([name, what], i) => ({ path: `sphere-${i}`, scene: "timechain", place: String(i), title: `Timechain Sphere · ${name}`, description: `${name}, room ${i} of the Timechain Sphere. ${what}` }))
    ]
  };
})();
