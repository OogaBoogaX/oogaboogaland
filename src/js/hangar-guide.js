// Tess in the Lightning Jet Hangar, on the island guide's machinery (`hub-guide.js`, handed the hangar's own tables as
// `guide`): she works the hangar's machines with her beam, notices a visitor walking in once a page and offers the
// hangar's tour, a stop at each of its sights, until this browser has answered it; a tap on her brings it at any time.
// Under her offer she answers questions about the Jet: what it was and what Jet 2.0 is; from the repository's own
// reading (`jetFeed.reading()`, as the boards show it) who builds it, when it began, its releases, stars, forks, commits
// and issues; and what rebalancing, HTLCs and routing fees are to it, which nodes it runs on, where its code is, and
// Jet v2. A place in the hangar is a trip there and back. What the page can't answer goes to the Worker as on the island, as a question
// about the Lightning Factory, whose room the hangar is.
//
// When Kortik's Sis starts smashing the Jet, the scene lends Tess to a `distraction` (the guide's `lend`): she drops
// whatever she was doing, a tour too, flies to Sis and buzzes round her head, flaring and calling to her, and Sis,
// distracted (`sis.distract`), swings slower and turns on her now and then. When the rampage ends Tess says her piece
// and goes back to work.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const H = BL.hubGuide, { fold, has } = H;
  const LINES = {
    greeting: "Hi! I'm Tess. Welcome to the Jet Hangar! Want a look round?",
    again: "Want a look round the hangar? Or ask me about the Jet.",
    declined: "No problem! Tap me any time for a tour.",
    done: "That's the hangar! Ask me anything about the Jet.",
    cancelled: "All good. Back to work!",
    more: "Anything else about the Jet? Ask away.",
    later: "I'll be round the Jet. Tap me any time!",
    unknown: "I don't know that one yet. Ask me about the Jet, or for a tour.",
    thinking: "Good question! Let me think...",
    refused: "That one's not for me. Ask me about the Jet!",
    resting: "I'm resting my voice until tomorrow. Ask me about the Jet!",
    slowDown: "One at a time! Ask me again in a minute.",
    hello: "Hi! Ask me about the Jet, or for a tour.",
    thanks: "Any time!",
    whoAmI: "I'm Tess, the Factory's guide. I help out in the hangar too.",
    takeThere: "Ask me to take you there!",
    jet: "This is Lightning Jet v2, still being built.",
    jetWhat: "Lightning Jet began as a rebalancer for Lightning nodes.",
    jetV2: "Jet 2.0 is much more: an autonomous economic engine for LND routing nodes.",
    jetV2How: "It sets fees and refills channels from one model of what each channel's liquidity earns and costs.",
    jetV2Why: "It records why it does everything, and when the evidence is thin, it does nothing.",
    jetStair: "Its stair goes up to the cockpit. You can even run along its top!",
    sis: "That's Kortik's Sis, the hangar's chief engineer.",
    sisPoke: "You can poke her. I really, really wouldn't.",
    booth: "The engine static fire test. Whatever you do, don't press the big red button.",
    boothMore: "Seriously. It never ends well.",
    terminals: "The terminals show the crew's work, and the chief engineer's mood.",
    terminalsShow: "Walk up to one and press DISPLAY: the projector runs the Jet's whole story on the big screen!",
    boards: "The boards read the Jet's repository on GitHub.",
    boardsStats: "Stars, forks, commits and the latest release, and its timeline from the very start.",
    tunnel: "The launch tunnel. Its shield stays sealed until Jet v2 flies.",
    door: "Back through the door: the Lightning Factory, and Kortik's switchboard.",
    v2: "Jet v2 is being rebuilt from the ground up, right here.",
    v2Shield: "It flies when it's ready. Until then the launch shield stays sealed!",
    rebalance: "Rebalancing moves a channel's liquidity to the side where payments need it.",
    rebalanceJet: "Jet 2.0 refills a channel only when what it earns is worth more than the refill costs.",
    htlc: "An HTLC is a payment hopping through a channel.",
    htlcMissed: "A missed one may be a payment your node could have routed. Jet counts it as a hint of demand, not proof.",
    fees: "Routing earns a node fees, a few sats a payment.",
    feesJet: "Jet 2.0 nudges fees up on drained channels in demand and down on full, idle ones, a small step at a time.",
    nodes: "Jet works with LND nodes.",
    nodesMore: "Its releases added Docker, Voltage and Embassy along the way.",
    code: "Its code and its README are on GitHub.",
    codeBoards: "Tap either board on the left wall for the link!",
    historyShow: "For the whole story, walk up to a terminal and press DISPLAY!",
    kortik: "Kortik is Sis's brother. He routes Lightning by hand at his switchboard next door."
  };
  // The hangar's tour, one stop a sight, as the island's: where the view looks from and at, and her lines there.
  const STOPS = [
    { id: "jet", title: "Lightning Jet v2", eye: [-2, 7.5, 14], look: [15, 3, -12], lines: ["jet", "jetWhat", "jetV2", "jetStair"] },
    { id: "sis", title: "Kortik's Sis", eye: [2, 5.5, 20], look: [13, 1.5, 6], lines: ["sis", "sisPoke"] },
    { id: "booth", title: "Engine static fire test", eye: [-1.5, 4, 17.5], look: [8, 1.4, 11], lines: ["booth", "boothMore"] },
    { id: "terminals", title: "Terminals and projector", eye: [-2, 3.4, 18], look: [-6.9, 1.2, 12.5], lines: ["terminals", "terminalsShow"] },
    { id: "boards", title: "The repository's boards", eye: [-7.5, 5.2, 10], look: [-18.8, 4.3, 7], lines: ["boards", "boardsStats"] },
    { id: "tunnel", title: "Launch tunnel", eye: [0, 6, -16], look: [0, 5, -70], lines: ["tunnel"] },
    { id: "door", title: "The way back", eye: [0, 4.5, 15], look: [0, 3.5, 30], lines: ["door"] }
  ];
  // Where she works with nobody to guide, as the island's: the booth first, in sight of the door, then the engines,
  // the stats board, the cockpit and a wingtip.
  const WORK = [
    { at: [6.2, 3.4, 13.2], aim: [8, 1.5, 11.2] },
    { at: [13, 4.4, 7.2], aim: [13, 3.2, 4.8] },
    { at: [-15.5, 5.6, 13], aim: [-18.6, 4.6, 15] },
    { at: [11.5, 7.6, -14.5], aim: [13, 6.4, -16.5] },
    { at: [20.5, 3.4, -3.5], aim: [19.6, 1.4, -0.8] }
  ];
  // Lines about something that moves or stands apart: Sis wherever she is, and the projector and its screen.
  const POINT_AT = { sis: "sis", sisPoke: "sis", terminalsShow: "show" };
  const SUGGESTIONS = ["What is Lightning Jet?", "When does Jet v2 fly?", "Show me the static fire test"];

  // A question's words, matched whole after folding, as the island's are: the hangar's places, and what she knows of
  // the Jet. The Jet's own names name a place too, but a question about it is answered before a place is.
  const PLACES = {
    jet: ["jet", "the jet", "lightning jet", "plane", "aircraft", "cockpit", "gangway", "canopy"],
    sis: ["sis", "kortik s sis", "kortiks sis", "chief engineer", "engineer", "hammer"],
    booth: ["booth", "static fire", "fire test", "test fire", "engine test", "red button", "big red button", "button"],
    terminals: ["terminal", "terminals", "projector", "big screen", "screen", "film", "movie", "display", "cinema"],
    boards: ["board", "boards", "stats board", "timeline", "github board"],
    tunnel: ["tunnel", "launch tunnel", "runway", "launch shield", "shield"],
    door: ["door", "exit", "way out", "factory", "lightning factory", "switchboard"]
  };
  const WORDS = {
    greet: ["hi", "hello", "hey", "hiya", "howdy", "yo", "gm", "good morning", "good evening"],
    thanks: ["thanks", "thank you", "thx", "ty", "cheers"],
    who: ["who are you", "what are you", "your name", "who is tess", "who s tess", "whos tess", "what is tess"],
    tour: ["tour", "show me around", "show me round", "look around", "look round", "new here"],
    trip: ["take me", "go to", "go there", "show me", "where", "how do i get", "how to get", "find", "bring me", "fly me",
      "fly to", "lead me", "get to", "head to", "walk to", "visit"],
    there: ["there", "it"],
    v2: ["v2", "version 2", "jet 2", "2 0", "next version", "fly", "flies", "take off", "launch", "launches", "coming soon"],
    what: ["what is", "what s", "whats", "what does", "what do", "tell me about", "explain", "what for", "describe"],
    builder: ["who made", "who built", "who builds", "who wrote", "who created", "who makes", "who is behind", "who develops", "author", "creator", "developer", "maintainer", "drneski", "neski"],
    began: ["when did", "how old", "when was", "started", "begin", "began", "born", "first commit"],
    history: ["history", "story"],
    releases: ["release", "releases", "version", "versions", "latest", "newest", "changelog", "update", "updates"],
    stars: ["stars", "star", "forks", "fork", "popular"],
    commits: ["commit", "commits", "activity", "active", "development"],
    issues: ["issue", "issues", "bug", "bugs", "pull request", "pull requests", "pr", "prs"],
    rebalance: ["rebalance", "rebalances", "rebalancing", "rebalancer", "liquidity", "balance", "balanced"],
    htlc: ["htlc", "htlcs", "missed", "routing", "route", "routes", "forward", "forwards", "forwarding"],
    fees: ["fee", "fees", "ppm", "profit", "profitable", "profitability", "earn", "earns"],
    nodes: ["lnd", "cln", "core lightning", "c lightning", "eclair", "ldk", "node", "nodes", "umbrel", "start9", "embassy", "voltage", "docker", "raspberry pi"],
    code: ["install", "download", "set up", "setup", "github", "repo", "repository", "source", "code", "open source"],
    kortik: ["kortik", "brother"]
  };
  const placeIn = (q) => {
    let best = -1, length = 0;
    STOPS.forEach((stop, i) => {
      for (const alias of PLACES[stop.id]) if (alias.length > length && q.includes(` ${alias} `)) { best = i; length = alias.length; }
    });
    return best;
  };
  const number = (n) => n >= 1000 ? BL.game.formatLarge(n) : String(n);
  const month = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  // What she knows from the reading, as she says it; null for what it doesn't hold.
  const KNOWN = {
    builder: (r) => `${r.repo.split("/")[0]} builds it, out in the open on GitHub.\nIts repository is ${r.repo}.`,
    began: (r) => {
      const years = Math.floor((Date.now() - Date.parse(r.createdAt)) / (365.25 * 864e5)), first = r.releases[r.releases.length - 1];
      return `Jet's repository began in ${month(r.createdAt)}, ${COUNT[years] || years} year${years === 1 ? "" : "s"} ago.${first ? `\nIts first release, ${first.tag}, came out in ${month(first.at)}.` : ""}`;
    },
    releases: (r) => r.releases.length ? `${number(r.releases.length)} releases so far.\nThe latest is ${r.releases[0].tag}, from ${day(r.releases[0].at)}.` : null,
    stars: (r) => `${number(r.stars)} stars and ${number(r.forks)} forks on GitHub, at the last look.`,
    commits: (r) => `${number(r.commits)} commits so far, ${number(r.commitsWeek)} of them in the last week.`,
    issues: (r) => `${number(r.openIssues)} open issues and ${number(r.openPRs)} open pull requests, at the last look.`
  };
  // A typed question, answered as the island's are: the lines she says (`lines`, or `say` for what the reading says), a
  // trip to a stop (`go`), the place it was about (`place`) or the tour (`tour`); null when the page can't answer it.
  const answer = (question, last = null) => {
    const q = fold(question), words = q.trim() ? q.trim().split(" ").length : 0;
    if (!words) return null;
    const reply = (lines, go = null, place = null) => ({ lines, say: null, go, place, tour: false });
    const known = (key, lines = []) => {
      const r = BL.jetFeed.reading(), text = r ? KNOWN[key](r) : null;
      return text ? { lines: [], say: [text, ...lines.map((id) => LINES[id])].join("\n"), go: null, place: null, tour: false } : null;
    };
    if (words <= 3 && has(q, WORDS.greet)) return reply(["hello"]);
    if (words <= 4 && has(q, WORDS.thanks)) return reply(["thanks"]);
    if (has(q, WORDS.who)) return reply(["whoAmI"]);
    if (has(q, WORDS.tour)) return { lines: [], say: null, go: null, place: null, tour: true };
    const place = placeIn(q), trip = place >= 0 ? place : last !== null && has(q, WORDS.there) ? last : -1;
    if (trip >= 0 && has(q, WORDS.trip)) return reply(STOPS[trip].lines, trip, trip);
    if (has(q, WORDS.v2)) return reply(["v2", "jetV2", "jetV2How", "v2Shield"], null, 0);
    if (has(q, WORDS.builder)) return known("builder");
    if (has(q, WORDS.history)) return known("began", ["historyShow"]) || reply(["historyShow"]);
    if (has(q, WORDS.began)) return known("began");
    if (has(q, WORDS.releases)) return known("releases");
    if (has(q, WORDS.stars)) return known("stars");
    if (has(q, WORDS.commits)) return known("commits");
    if (has(q, WORDS.issues)) return known("issues");
    if (has(q, WORDS.rebalance)) return reply(["rebalance", "rebalanceJet"]);
    if (has(q, WORDS.htlc)) return reply(["htlc", "htlcMissed"]);
    if (has(q, WORDS.fees)) return reply(["fees", "feesJet"]);
    if (has(q, WORDS.nodes)) return reply(["nodes", "nodesMore"]);
    if (has(q, WORDS.code)) return reply(["code", "codeBoards"], null, 4);
    if (has(q, WORDS.kortik)) return reply(["kortik"], null, 6);
    if (has(q, WORDS.what) && (place < 0 || place === 0)) return reply(["jetWhat", "jetV2", "jetV2How", "jetV2Why"]);
    if (place >= 0) return reply([...STOPS[place].lines.slice(0, 2), "takeThere"], null, place);
    return null;
  };

  const GUIDE = {
    stops: STOPS, lines: LINES, work: WORK, answer, suggestions: SUGGESTIONS, pointAt: POINT_AT, news: false,
    title: "hangar guide", tour: "Hangar tour", ask: "Ask me about the Jet", greeted: "tessHangarGreeted", toured: "ooga-tess-hangar-tour",
    about: () => "factory"
  };
  const create = (options) => H.create({ ...options, guide: GUIDE });

  // Lent while Kortik's Sis smashes the Jet: she flies over fast and buzzes round Sis's head, high enough over it that
  // their bubbles stand apart, looking at her, her rings flaring with each line; `done` says her piece once it is over.
  // `sis` is Sis's rig, read live.
  const DISTRACT = { speed: 14, radius: 1.4, turn: 1.5, rise: 2.1, every: [3.2, 4.6] };
  const CALLS = ["Sis! Sis! Over here!", "Hey! The Jet didn't do anything to you!", "Deep breaths, Sis. In... and out...", "Ooh, look! A shiny bolt!",
    "Put the hammer down, nice and slow...", "Somebody poke her, quick! Again and again!"];
  const distraction = (sis) => {
    let rig = null, t = 0, callIn = 0;
    const drive = (r, dt) => {
      const p = sis.node.position;
      t += dt;
      const a = t * DISTRACT.turn, x = p.x + Math.cos(a) * DISTRACT.radius, y = p.y + DISTRACT.rise + Math.sin(t * 3.1) * 0.15, z = p.z + Math.sin(a) * DISTRACT.radius;
      if (r !== rig) {
        rig = r; t = 0; callIn = 0.5;
        r.clearPath(DISTRACT.speed, 1.5); r.push(x, y, z); r.track();
        r.flare();
      }
      r.setLast(x, y, z);
      r.steer(dt);
      r.mode = 0; r.aims = null; r.steady = false; r.calm = false;
      r.watching = true; r.watch.x = p.x; r.watch.y = p.y + 0.9; r.watch.z = p.z;
      if ((callIn -= dt) <= 0) {
        callIn = DISTRACT.every[0] + Math.random() * (DISTRACT.every[1] - DISTRACT.every[0]);
        r.say(CALLS[Math.floor(Math.random() * CALLS.length)]);
        r.flare();
      }
    };
    const done = () => { if (rig) rig.say("Phew! The Jet lives to fly another day."); rig = null; };
    return { drive, done };
  };

  BL.hangarGuide = { create, distraction, LINES, STOPS, answer, SUGGESTIONS };
})();
