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
//
// When the faint shape in the hangar's air (`hangar-shimmer.js`) shows near her, in her sight, and she is free to notice
// it, the scene lends her to `unsettled`: most times she stops and glances at it a few seconds; otherwise she comes over
// unhurried to look it over from a few metres off; and rarely it puzzles her, and she keeps watching where it stood
// after it has gone; then she goes back to work.
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

  // Lent while the faint shape in the hangar's air shows (`hangar-shimmer.js`). A moment after it has formed she
  // notices it. Most times she only glances at it: she stops where she is, turns to face it, perhaps drifting a little
  // toward it or aside, watches it a few seconds and goes back to work. Otherwise, with time enough left, she looks it
  // over: she stops where she is, facing it, a beat; then comes over unhurried, in two moves rising over what stands
  // between and going round it rather than through it, the second slower, to hang a few metres off to its side (so
  // the view sees them both), facing it, her rings turning a little quicker; there she watches it, moving a little
  // round it once or twice. As it comes apart she
  // watches it start to go and eases back a touch, or, still on her way, stops where she is, and watches it go; a
  // moment after it has gone she goes back to work, or sooner if anything ended it early (a tap on her ends it at once,
  // the scene giving her back to answer it). Rarely it puzzles her: she
  // comes over or watches it from where she is, her rings quickening, and once makes a small, uncertain movement (a
  // tilt to one side, a tip back or her rings faltering); as it comes apart she hesitates, edging toward it, and once
  // it has gone she keeps watching where it stood a few seconds, looking about it, before she drifts back to work.
  // `shimmer` is the shape, read live, and `camera` the view, so she keeps to its side of it.
  const UNEASY = {
    // When she notices it, as a share of its forming, at random between; none if less than `least` s of it would be
    // left; and only within `reach` m of it, across the floor, with it in her sight, which she looks for every `look` s.
    notice: [0.5, 0.9], least: 3, reach: 14, look: 0.25,
    // How likely, of those she notices, it puzzles her (rarely) or she comes over to look it over; the rest she only
    // glances at, as she does when too little of it is left to come over.
    puzzle: 0.12, approach: 0.3,
    // Glancing: how long she watches it, s, at random between; how likely she drifts while she does, and how far, m,
    // toward it or up to `aside` rad off that, rising up to `climb` m, at `driftSpeed` m/s, where the air is open.
    glanceFor: [1.6, 3.4], drifts: 0.7, drift: [0.2, 0.7], aside: 0.7, climb: 0.25, driftSpeed: 0.35,
    // Otherwise, how long she holds still facing it before she comes over, s, at random between; she comes over only
    // with at least `stay` s of it left before it comes apart, and glances at it instead.
    stare: [0.4, 0.9], stay: 5,
    // Where she hangs: `dist` m from it, off to its side as the view sees it and turned `turn` rad toward the view,
    // `y` m up, each at random between; and `margin` m inside the hall's walls.
    dist: [3.8, 5], turn: [0.05, 0.5], y: [2, 2.7], margin: 1.5,
    // Her two moves in, unhurried: the first at `speed[0]` m/s (no faster than she flies about her work) to `last` m
    // short of where she hangs (or `first` of the way when that is nearer), on the line from where she came or `rise` m
    // over where she hangs if that is higher; a pause, s; and the last, slower, at `speed[1]` m/s; each at random
    // between.
    last: 1.5, first: 0.55, rise: 0.5, speed: [[2.2, 3], [0.8, 1.1]], pause: [0.4, 0.9],
    // On her way in she keeps `around` m from its middle below `over` m up: where the way would pass nearer, she goes
    // round it first, on the side the way passes (else the other side, else over it).
    around: 2.8, over: 4.8,
    // Once there, one to `shifts` small moves round it, `shiftGap` s apart at random between: each `shift` rad round it
    // either way at random between, up or down `bob` m at most, at `shiftSpeed` m/s, where the air is open.
    shifts: 2, shiftGap: [0.9, 1.8], shift: [0.2, 0.45], bob: 0.25, shiftSpeed: 0.5,
    // How fast her rings spin on top of their own in each stage, times, eased up (`up`, the share a second) and down
    // (`down`): a little quicker while she looks it over.
    whirl: { glance: 0, notice: 0, edge: 0.5, pause: 1, near: 1.5, study: 2, recoil: 1, settle: 0, over: 0 }, up: 0.8, down: 2,
    // As it comes apart, still on her way she stops where she is; there, she watches it start to go, `linger` of the
    // way through its coming apart, then eases back a touch: how far back and up, m, how fast, m/s.
    linger: 0.5, back: 0.4, lift: 0.15, backSpeed: 0.4,
    // Puzzled by it: how likely she comes over first (with time enough), else she watches it from where she is; how
    // fast her rings spin in each stage then (`puzzled`, as `whirl`), quickening as she watches; `odd` s after she
    // starts watching, at random between, one small, uncertain movement held about `oddFor` s: a tilt to one side,
    // `tilt` rad; a tip back, `tip` of a turn; or her rings faltering, `falter` (`uneasy`), as they slow; as it comes
    // apart she hesitates, edging `inch` m toward it at `inchSpeed` m/s; once it has gone she keeps watching where it
    // stood `lingerFor` s, looking up to `search` m to either side of it, now and then (`again`) tilting once more.
    // Under reduced motion her one movement is only half a tilt.
    comes: 0.5, odd: [0.8, 1.6], oddFor: [0.9, 1.4], tilt: 0.3, tip: [0.1, 0.16], falter: 0.5,
    inch: [0.3, 0.6], inchSpeed: 0.3, lingerFor: [2.5, 4], search: 0.9, again: 0.4,
    puzzled: { notice: 0, edge: 0.5, pause: 1, near: 2, study: 5, watch: 5, hesitate: 0.5, linger: 0, settle: 0, over: 0 },
    // After it has gone: how long she still hangs there, s, before she goes back to work (`cut` if it ended early).
    after: 0.6, done: 1, cut: 0.7
  };
  const unsettled = (shimmer, camera) => {
    const at = shimmer.at, spot = { x: 0, y: 0, z: 0 }, mid = { x: 0, y: 0, z: 0 }, back = { x: 0, y: 0, z: 0 }, still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The rig she is lent as; whether she glances at it or comes over (`kind`); her stage and how long she has been in
    // it, s; how long she glances, holds still before coming over and pauses on the way, s; the moves round it still to
    // make, how long until the next, s, and whether she is making one; the shape she is on (its `shows`) and the one
    // whose noticing is drawn, when, and when she next looks for it; and whether this one ended early. Puzzled: how
    // long she has watched it, s, when her one movement comes and how long it is held, s, which it is, how long into it
    // she is, s, which side she tilts to, and how long she lingers once it has gone, s.
    let rig = null, kind = "", stage = "idle", t = 0, glanceFor = 0, stareFor = 0, pauseFor = 0, shiftsLeft = 0, shiftIn = 0, moving = false;
    let puzzling = 0, oddAt = 0, oddLen = 0, odd = "", oddT = 0, side = 1, lingerLen = 0;
    let shape = -1, drawn = -1, noticeAt = 0, lookAt = 0, cut = false;
    const between = ([a, b]) => a + Math.random() * (b - a);
    // Whether (x, y, z) is open air for her: inside the hall and nothing standing there up to near her height.
    const open = (x, y, z) => {
      const HM = BL.hangarModels, H = HM.LAYOUT.HALL, m = UNEASY.margin;
      return x > H.x0 + m && x < H.x1 - m && z > H.back + m && z < HM.LAYOUT.runway.z0 - m && HM.supportAt(x, z, y) < y - 0.9 && HM.clearAt(x, z, y - 0.4, 0.5, x + 1e3, z, false);
    };
    // Where she hangs by it: a few metres off to its side as the view sees it, turned a little toward the view, the
    // side nearer her where both are open, else in front of it and a little aside.
    const place = (r) => {
      const c = camera.position, vx = at.x - c.x, vz = at.z - c.z, l = Math.hypot(vx, vz) || 1, ux = vx / l, uz = vz / l, U = UNEASY;
      const d = between(U.dist), q = between(U.turn), side = Math.cos(q) * d, toward = Math.sin(q) * d, y = between(U.y);
      const ax = at.x + uz * side - ux * toward, az = at.z - ux * side - uz * toward;
      const bx = at.x - uz * side - ux * toward, bz = at.z + ux * side - uz * toward, p = r.root.position;
      const aOk = open(ax, y, az), bOk = open(bx, y, bz);
      const useA = aOk && (!bOk || Math.hypot(ax - p.x, az - p.z) < Math.hypot(bx - p.x, bz - p.z));
      if (useA || bOk) { spot.x = useA ? ax : bx; spot.z = useA ? az : bz; }
      else { spot.x = at.x - ux * d + uz * 1.2; spot.z = at.z - uz * d - ux * 1.2; }
      spot.y = y;
    };
    const go = (r, x, y, z, speed, corner) => { r.clearPath(speed, corner); r.push(x, y, z); };
    // Her way from `from` to (x, y, z), never through it: true, with a point round it in `via`, if the straight way would
    // pass within `around` m of its middle below `over` m up anywhere along that stretch.
    const via = { x: 0, y: 0, z: 0 };
    const roundIt = (from, x, y, z) => {
      const U = UNEASY, sx = x - from.x, sz = z - from.z, l2 = sx * sx + sz * sz, dx = from.x - at.x, dz = from.z - at.z;
      // The stretch of the way within `around` of its middle, as shares of the way, and how low it is there.
      const half = dx * sx + dz * sz, disc = half * half - l2 * (dx * dx + dz * dz - U.around * U.around);
      if (l2 < 1e-6 || disc <= 0) return false;
      const f0 = Math.max(0, (-half - Math.sqrt(disc)) / l2), f1 = Math.min(1, (-half + Math.sqrt(disc)) / l2);
      if (f0 > f1 || Math.min(from.y + (y - from.y) * f0, from.y + (y - from.y) * f1) > U.over) return false;
      const f = Math.max(f0, Math.min(f1, -half / l2)), cx = from.x + sx * f, cz = from.z + sz * f, cy = from.y + (y - from.y) * f;
      let ox = cx - at.x, oz = cz - at.z, ol = Math.hypot(ox, oz);
      if (ol < 1e-3) { const l = Math.sqrt(l2) || 1; ox = -sz / l; oz = sx / l; ol = 1; }
      via.y = Math.max(cy, y);
      for (let side = 1; side >= -1; side -= 2) {
        via.x = at.x + ox / ol * side * (U.around + 0.4); via.z = at.z + oz / ol * side * (U.around + 0.4);
        if (open(via.x, via.y, via.z)) return true;
      }
      via.x = cx; via.z = cz; via.y = U.over + 0.4;
      return true;
    };
    // A move to (x, y, z) at `speed` m/s, round it where the straight way would pass through it: a point round it, and
    // from there another if the way on would still pass too near.
    const from = { x: 0, y: 0, z: 0 };
    const goRound = (r, x, y, z, speed, corner) => {
      r.clearPath(speed, corner);
      from.x = r.root.position.x; from.y = r.root.position.y; from.z = r.root.position.z;
      for (let k = 0; k < 2 && roundIt(from, x, y, z); k++) { r.push(via.x, via.y, via.z); from.x = via.x; from.y = via.y; from.z = via.z; }
      r.push(x, y, z);
    };
    // Easing back a touch from it, as it comes apart.
    const backOff = (r) => {
      const p = r.root.position, dx = p.x - at.x, dz = p.z - at.z, l = Math.hypot(dx, dz) || 1;
      back.x = p.x + dx / l * UNEASY.back; back.y = p.y + UNEASY.lift; back.z = p.z + dz / l * UNEASY.back;
      go(r, back.x, back.y, back.z, UNEASY.backSpeed, 0.3);
      enter("recoil");
    };
    // Whether she should be lent now, from where she is (`from`): the shape shows and has been formed a moment, she has
    // not had this one, enough of it is left to be worth it, and it is near her and in her sight, never across the hall.
    const due = (from) => {
      if (shimmer.state !== "show" || shimmer.fading || shimmer.shows === shape) return false;
      if (shimmer.shows !== drawn) { drawn = shimmer.shows; noticeAt = between(UNEASY.notice); lookAt = 0; }
      if (shimmer.t < at.formed * noticeAt) return false;
      if (shimmer.t > at.held - UNEASY.least) { shape = shimmer.shows; return false; }
      if (Math.hypot(from.x - at.x, from.z - at.z) > UNEASY.reach || shimmer.t < lookAt) return false;
      lookAt = shimmer.t + UNEASY.look;
      return shimmer.seen(from.x, from.y, from.z);
    };
    const enter = (next) => { stage = next; t = 0; };
    // Coming over to look it over.
    const comeOver = (r) => {
      stareFor = between(UNEASY.stare); pauseFor = between(UNEASY.pause); moving = false;
      place(r);
      enter("notice");
    };
    // Puzzled, as it comes apart: she hesitates, edging a little toward it.
    const hesitate = (r) => {
      const p = r.root.position, dx = at.x - p.x, dz = at.z - p.z, l = Math.hypot(dx, dz) || 1, d = between(UNEASY.inch);
      const x = p.x + dx / l * d, z = p.z + dz / l * d;
      if (open(x, p.y, z)) go(r, x, p.y, z, UNEASY.inchSpeed, 0.3); else r.clearPath(0, 0);
      enter("hesitate");
    };
    const ODD = ["tilt", "tip", "falter"];
    const drive = (r, dt) => {
      const U = UNEASY, p = r.root.position, gone = shimmer.state !== "show" || shimmer.fading || shimmer.shows !== shape && rig === r;
      if (r !== rig) {
        // Noticing it: she stops where she is, and either it puzzles her, she will come over, or she glances at it,
        // drifting a little or not.
        rig = r; shape = shimmer.shows; cut = false; r.whirl = 0; odd = "";
        r.clearPath(0, 0);
        r.hush();
        const roll = Math.random(), time = at.held - shimmer.t >= U.stay;
        if (roll < U.puzzle) {
          kind = "puzzle"; puzzling = 0; oddAt = between(U.odd); oddLen = between(U.oddFor); side = Math.random() < 0.5 ? -1 : 1;
          if (time && Math.random() < U.comes) comeOver(r); else enter("watch");
        } else if (roll < U.puzzle + U.approach && time) {
          kind = "approach";
          comeOver(r);
        } else {
          kind = "glance"; glanceFor = between(U.glanceFor);
          if (Math.random() < U.drifts) {
            const a = Math.atan2(at.x - p.x, at.z - p.z) + (Math.random() * 2 - 1) * U.aside, d = between(U.drift);
            const x = p.x + Math.sin(a) * d, y = p.y + Math.random() * U.climb, z = p.z + Math.cos(a) * d;
            if (open(x, y, z)) go(r, x, y, z, U.driftSpeed, 0.3);
          }
          enter("glance");
        }
      }
      t += dt;
      // Something ended it early: she goes back to work soon.
      if (gone && stage !== "settle" && stage !== "over") { cut = true; odd = ""; enter("settle"); }
      r.calm = false; r.steady = stage !== "settle" && stage !== "over";
      // Whom she watches: it, rising as it comes apart; once it has gone, where it stood, looking to either side of it.
      r.watching = true; r.watch.x = at.x; r.watch.z = at.z;
      r.watch.y = stage === "recoil" || stage === "hesitate" ? 2.2 + Math.min(1.4, (shimmer.t - at.held) * 0.6) : stage === "linger" ? 1.8 : 2.9;
      if (stage === "linger") {
        const dx = at.x - p.x, dz = at.z - p.z, l = Math.hypot(dx, dz) || 1, off = U.search * Math.sin(t / lingerLen * Math.PI * 2);
        r.watch.x += dz / l * off; r.watch.z -= dx / l * off;
      }
      r.mode = 0; r.aims = null;
      // It coming apart: still on her way in, she stops where she is (and, puzzled, hesitates there); puzzled, watching
      // it, she hesitates; looking it over, she watches it start to go, then eases back a touch.
      if ((stage === "edge" || stage === "pause" || stage === "near") && shimmer.t >= at.held) { r.clearPath(0, 0); enter(kind === "puzzle" ? "hesitate" : "recoil"); }
      else if (kind === "puzzle" && (stage === "watch" || stage === "study") && shimmer.t >= at.held) hesitate(r);
      else if (stage === "study" && shimmer.t >= at.held + (at.gone - at.held) * U.linger) backOff(r);
      switch (stage) {
        case "glance":
          r.steer(dt);
          if (t >= glanceFor) enter("over");
          break;
        case "notice":
          if (t >= stareFor) {
            const dx = p.x - spot.x, dy = p.y - spot.y, dz = p.z - spot.z, d = Math.hypot(dx, dy, dz), k = d > U.last / (1 - U.first) ? U.last / d : 1 - U.first;
            mid.x = spot.x + dx * k; mid.z = spot.z + dz * k; mid.y = Math.max(spot.y + U.rise, spot.y + dy * k);
            // Short of where she hangs, but never nearer it than `around`.
            const ml = Math.hypot(mid.x - at.x, mid.z - at.z);
            if (ml < U.around) { mid.x = at.x + (mid.x - at.x) / (ml || 1) * U.around; mid.z = at.z + (mid.z - at.z) / (ml || 1) * U.around; }
            goRound(r, mid.x, mid.y, mid.z, between(U.speed[0]), 0.5);
            enter("edge");
          }
          break;
        case "edge":
          if (r.steer(dt)) enter("pause");
          break;
        case "pause":
          if (t >= pauseFor) { goRound(r, spot.x, spot.y, spot.z, between(U.speed[1]), 0.4); enter("near"); }
          break;
        case "near":
          if (r.steer(dt)) { shiftsLeft = kind === "approach" ? 1 + Math.floor(Math.random() * U.shifts) : 0; shiftIn = between(U.shiftGap); enter("study"); }
          break;
        case "study":
          // Looking it over: a little move round it now and then.
          if (moving) { if (r.steer(dt)) { moving = false; shiftIn = between(U.shiftGap); } }
          else if (shiftsLeft > 0 && (shiftIn -= dt) <= 0) {
            shiftsLeft--;
            const d = Math.hypot(p.x - at.x, p.z - at.z), a = Math.atan2(p.x - at.x, p.z - at.z) + (Math.random() < 0.5 ? -1 : 1) * between(U.shift);
            const x = at.x + Math.sin(a) * d, y = p.y + (Math.random() * 2 - 1) * U.bob, z = at.z + Math.cos(a) * d;
            if (open(x, y, z)) { go(r, x, y, z, U.shiftSpeed, 0.3); moving = true; } else shiftIn = between(U.shiftGap);
          }
          break;
        case "recoil":
          r.steer(dt);
          if (shimmer.t >= at.gone + U.after) enter("settle");
          break;
        case "hesitate":
          r.steer(dt);
          if (shimmer.t >= at.gone) {
            lingerLen = between(U.lingerFor);
            // Now and then she tilts once more as she lingers, a while in.
            if (Math.random() < U.again) { odd = "tilt"; oddT = -lingerLen * 0.3; oddLen = between(U.oddFor); side = Math.random() < 0.5 ? -1 : 1; }
            enter("linger");
          }
          break;
        case "linger":
          if (t >= lingerLen) enter("over");
          break;
        case "settle":
          if (t >= (cut ? U.cut : U.done)) enter("over");
          break;
      }
      // Puzzled, watching it (not while she flies over): once, a moment after she starts, one small uncertain movement,
      // eased in and out.
      if (kind === "puzzle") {
        if (stage !== "notice" && stage !== "edge" && stage !== "linger" && stage !== "settle" && !odd && (puzzling += dt) >= oddAt) {
          odd = still.matches ? "tilt" : ODD[Math.floor(Math.random() * ODD.length)]; oddT = 0;
          if (odd === "tip") r.flip(between(U.tip));
        }
        if (odd) oddT += dt;
      }
      const hold = odd ? Math.max(0, Math.min(1, oddT / 0.35, (oddLen - oddT) / 0.45)) : 0;
      r.tilt = odd === "tilt" ? side * U.tilt * hold * (still.matches ? 0.5 : 1) : 0;
      const uneasy = odd === "falter" ? U.falter * hold : 0;
      r.uneasy += (uneasy - r.uneasy) * Math.min(1, dt * 4);
      // Her rings turning a little quicker as she looks it over (faster and faster, puzzled, slowing as they falter),
      // winding down as it goes.
      let spin = (kind === "puzzle" ? U.puzzled : U.whirl)[stage];
      if (odd === "falter" && hold > 0) spin = 0.5;
      if (still.matches) spin *= 0.25;
      r.whirl += (spin - r.whirl) * Math.min(1, dt * (spin > r.whirl ? U.up : U.down));
    };
    // Given back: her rings back to their own pace, upright and steady, ready for the next.
    const reset = () => { if (rig) { rig.whirl = 0; rig.tilt = 0; rig.uneasy = 0; rig.steady = false; } rig = null; stage = "idle"; odd = ""; };
    return { due, drive, reset, get over() { return stage === "over"; }, get stage() { return stage; }, get kind() { return kind; }, get odd() { return odd; } };
  };

  BL.hangarGuide = { create, distraction, unsettled, LINES, STOPS, answer, SUGGESTIONS };
})();
