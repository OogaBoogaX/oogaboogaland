// Ooga Chat's offline fixture adapter, for development and review only. fixture.html loads it; index.html never
// does, and scripts/ooga-chat.mjs refuses an index.html that would, so production cannot fall back to it. It speaks
// the production adapter's interface (ooga-chat-http.js) with canned answers chosen by `?state=` (`STATES`). Each
// account state answers the session as the server would for that account: signed in already, and signing in with
// GitHub again lands on the same kind of account, while X always lands on the X listener, whose handle looks like a
// contributor's and whose answer claims to speak, so a review shows that neither counts. `provider-disabled` turns X
// sign-in off, `expiring` ends its session 20 s after load, and `signout-fails` never confirms a sign-out.
// `demo-payment` answers the feed in demo mode, and `real-payment` answers it live as the service does: donations.js
// then speaks to this origin's /donations/* as it would to the edge's relay, which the fixture's own server answers
// with its 404, so the real kiosk shows its error and nothing more (the suite's server answers it as each check needs).
// `?roster=` picks the audience a signed-in account hears (`ROSTERS`): `mixed` (the default: world and app speakers,
// listeners, a duplicate and a missing total, then a join, a rename, a gap the page must resync over and a leave, one
// every 4 s), `empty`, `crowd` (300 listeners), `reconnecting` (drops after 6 s and comes back 3 s later to the same
// list, as a quiet zone does), `reauth` (closed as signed out, 4401, after 6 s: the app checks the session and opens a
// new feed), `full` and `none` (no audience address). Accounts and participants are named samples with no picture,
// never real people.
// `?voice=` picks how voice answers (`VOICES`, #654), through a fake broker (`media`) and fake WebRTC (`rtc`): no
// microphone is ever opened and nothing is heard. `ok` (the default) pulls each speaker of the zone, and Join Voice gets
// a lease, publishes and becomes a muted speaker; `denied` refuses the microphone; `blocked` holds playback until a
// gesture, as a browser's autoplay rule does; `refused` refuses the lease (the zone's speakers are full); `off` is a
// deployment that doesn't let anyone speak; `elsewhere` finds the account's voice on the island, on another device, until
// the visitor takes it (`setRole` with `takeover`, the voice switch prompt's answer). `BL.oogaChatFixtures.rtc` is the last fake's record, for the checks.
// `?chats=on` offers hosted chats (docs/ooga-chat-hosts.md) from an in-memory directory (`CHATS`, `chats`, `startChat`):
// two sample chats, one with a host, a co-host, a speaker, two requests waiting and an invite out, and the roles' rules
// on a feed opened for a chat (who outranks whom, the queue, invites, the stage, mute, removal, the end). Its sample hosts
// answer as a host would, so a review sees every state: the visitor's request is approved 1.5 s after it is made, and a
// microphone the visitor opens there is muted by the host 2.5 s later; on the open stage of Building DSB Land its host
// offers the visitor co-hosting 2.5 s after they first take it. A chat the visitor starts is theirs: two samples join and
// ask to speak, a third listens, a sample invited takes the stage a second later, a co-host offer is accepted by Sample
// Pebble, turned down by Sample Otter and left open by the rest, and End chat ends it. Two of Sample Oak's
// speakers walk the chat's island, so its island view shows: asked for (`view`), their places come twice a second. Off (the default), the
// fixture offers no chats and behaves as before.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_VERSION, PROTOCOLS, parseBootstrap, parseSession } = BL.oogaChatConfig;
  const STATES = ["signed-out", "listener", "contributor", "ineligible", "unknown", "revoked", "provider-disabled", "expiring", "signout-fails",
    "demo-payment", "real-payment", "unavailable"];
  const protocols = Object.fromEntries(Object.entries(PROTOCOLS).map(([name, version]) => [name, [version]]));
  const answer = (feed, x, speak, chats) => ({ version: BOOTSTRAP_VERSION, protocols: chats ? { ...protocols, audience: [...protocols.audience, 2] } : protocols,
    features: { github: true, x, voice: true, speak, feed, commons: true, chats },
    paths: { session: "/fixture/session", logout: "/fixture/logout", audience: "/fixture/audience", login: { github: "/fixture/login/github", x: "/fixture/login/x" }, ...(chats ? { chats: "/fixture/chats" } : {}) } });
  const github = (n, login, state, capabilities = {}) => ({ identity: { principal: `fixture:github:${n}`, participant: `gh:${n}`, provider: "github", providerUserId: String(n), login, display: login },
    capabilities, eligibility: { state } });
  const ACCOUNTS = {
    listener: { identity: { principal: "fixture:x:1", participant: "x:1790000000000000001", provider: "x", providerUserId: "1790000000000000001", login: "sample_contributor", display: "sample contributor" },
      capabilities: { speak: true, contributor: true }, eligibility: { state: "eligible" } },
    contributor: github(1, "sample-contributor", "eligible", { speak: true, contributor: true }),
    ineligible: github(2, "sample-visitor", "ineligible"),
    unknown: github(3, "sample-unchecked", "unknown", { speak: true, contributor: true }),
    revoked: github(4, "sample-revoked", "revoked", { speak: true, contributor: true })
  };
  // The account a state starts signed in as, and the one its GitHub button signs in as.
  const SIGNED_IN = { listener: "listener", contributor: "contributor", ineligible: "ineligible", unknown: "unknown", revoked: "revoked", expiring: "contributor", "signout-fails": "contributor" };
  const ROSTERS = ["mixed", "empty", "crowd", "reconnecting", "reauth", "full", "none"];
  const VOICES = ["ok", "denied", "blocked", "refused", "off", "elsewhere"];
  const CHATS = ["off", "on"];
  // Hosted chats' sample members, keyed as the server keys an account.
  const member = (n, login, role, extra = {}) => ({ id: `gh:${9000 + n}`, generation: 1, source: "app", role, login, display: login, muted: role === "speaker" ? false : undefined, ...extra });
  const person = (id, source, role, login, extra = {}) => ({ id: `fixture:${id}`, generation: 1, source, role, login, display: login, ...extra });
  const CAST = {
    main: [
      person("world-oak", "world", "speaker", "sample-oak", { contributions: 412 }),
      person("world-fern", "world", "speaker", "Sample-Fern", { contributions: 412 }),
      person("world-reed", "world", "speaker", "sample-reed", { hand: "✋🏽" }),
      person("world-moss", "world", "speaker", "sample-moss", { contributions: 97, muted: true }),
      person("app-brook", "app", "speaker", "sample-brook"),
      person("app-ash", "app", "speaker", "sample-ash", { muted: true }),
      ...["wren", "a-very-long-sample-listener-name", "kite", "pebble", "otter", "lark", "heron"].map((name) => person(`listener-${name}`, "app", "listener", `sample-${name}`)),
      person("listener-kite", "app", "listener", "sample-kite")
    ],
    dsb: [
      person("world-dune", "world", "speaker", "sample-dune", { contributions: 33 }),
      person("listener-gull", "app", "listener", "sample-gull")
    ]
  };
  // The Bananas panel's demo for `demo-payment` (banana-panel.js `create` options): a simulated tally of named samples,
  // never real donors, labelled Demo by the panel, at a fixed demo price, and nothing that reaches /donations. A tip
  // paid on Feed the Oogas' simulated kiosk joins it (`receive`, the popup's demo payment), so its receipt shows, and
  // `subscribe` hears each one.
  const DEMO_DONORS = [["sample-oak", 2500, 2.5], ["sample-fern", 1200, 1.2], ["", 420, 0.42], ["sample-reed", 69, 0.07]];
  const demoStats = { donations: DEMO_DONORS.length, totalSats: DEMO_DONORS.reduce((sum, [, sats]) => sum + sats, 0),
    donors: DEMO_DONORS.filter(([handle]) => handle).map(([handle, sats, bananas]) => ({ handle, sats, bananas })),
    recentDonations: DEMO_DONORS.map(([handle, sats, bananas], i) => ({ id: `fixture-${i}`, handle, sats, bananas, at: 0, message: sats >= 1000 ? "Ooga!" : "" })) };
  const demoHeard = new Set();
  const demo = Object.freeze({
    donations: { real: false, testNetwork: "", messageMinSats: 1000, RECENT_MAX: 20, state: { tally: null, board: null, boardSats: null, recent: null, open: null },
      carried: (sats, message) => sats >= 1000 ? message : "", subscribeState: () => () => {} },
    demo: () => demoStats,
    rate: () => ({ usdPerBtc: 100000, satsPerBanana: 1000, at: 0, stale: false }),
    // Counted as the kiosk quoted it (the demo's count, ooga-chat-donor.js `bananasFor`), so the receipt matches the quote.
    receive({ id, sats, handle, message, at }) {
      const bananas = BL.oogaChatDonor.bananasFor(sats), name = handle || "";
      demoStats.donations++;
      demoStats.totalSats += sats;
      const donor = name && demoStats.donors.find((d) => d.handle.toLowerCase() === name.toLowerCase());
      if (donor) { donor.sats += sats; donor.bananas += bananas; } else if (name) demoStats.donors.push({ handle: name, sats, bananas });
      demoStats.donors.sort((a, b) => b.bananas - a.bananas);
      demoStats.recentDonations.unshift({ id, handle: name, sats, bananas, at, message: sats >= 1000 ? message : "" });
      for (const fn of demoHeard) fn();
    },
    subscribe(fn) { demoHeard.add(fn); return () => demoHeard.delete(fn); }
  });
  // The Commons for review (#670): named samples on the island in a few places, one with a hand up and two in voice,
  // and a short history; a line sent comes back as the Room would echo it, then its acknowledgement.
  const TOWN = [
    { id: 1, login: "sample-contributor", display: "sample-contributor", zone: "outside", voice: true, muted: false, hand: false },
    { id: 11, login: "sample-oak", display: "Sample Oak", zone: "outside", voice: true, muted: true, hand: true, handTone: 3 },
    { id: 12, login: "Sample-Fern", display: "Sample-Fern", zone: "arcade.hall", voice: false, muted: false, hand: false },
    { id: 13, login: "sample-reed", display: "sample-reed", zone: "dsb-studio", voice: false, muted: false, hand: true, handEmoji: "🍌" }
  ];
  const HISTORY = [
    { id: 1, at: 1_800_000_000_000, login: "sample-oak", name: "Sample Oak", text: "Ooga! Who's at the pile?" },
    { id: 2, at: 1_800_000_060_000, login: "Sample-Fern", name: "Sample-Fern", text: "Playing Cloud Hopper in the arcade 🍌" }
  ];
  // The public panel data for review (#664's shape): named samples, never real people, with a schema-3 reading.
  const PUBLIC = (now) => {
    const ago = (minutes) => new Date(now - minutes * 60000).toISOString();
    // The most contributions and the latest differ in order (sample-fern leads the one, sample-oak the other), so
    // the sort shows.
    const people = [["sample-oak", 20, 412, 30], ["sample-fern", 300, 520, 12], ["sample-reed", 3000, 33, 4], ["sample-moss", 60000, 5, 1], ["sample-dune", 90, 140, 9]];
    const board = (kind, share) => people.map(([login, , total]) => ({ login, count: Math.round(total * share) })).filter((e) => e.count);
    return { schema: 1, revision: "fixture", generatedAt: now, stale: false,
      sources: { cast: { state: "ok", revision: "fixture", count: people.length }, stats: { state: "ok", generatedAt: now, source: "oogatron" } },
      cast: people.map(([handle], i) => ({ handle, github: handle, display: null, joinedAt: Date.UTC(2026, 3 + i, 1), lastCommitAt: now - 86400000 * (i + 2) })),
      stats: { meta: { schema_version: 3, org: "OogaBoogaX", generated_at: new Date(now).toISOString() },
        contributors: people.map(([login, minutes]) => ({ login, last_seen_at: ago(minutes) })),
        leaderboards: { commits: board("commits", 0.6), prs: board("prs", 0.15), reviews: board("reviews", 0.1), issues: board("issues", 0.05), comments: board("comments", 0.1) },
        repos: [{ name: "oogaboogaland", contributors: people.map(([login, minutes]) => ({ login, last_seen_at: ago(minutes) })), leaderboards: { commits: board("commits", 0.5) } },
          { name: "entropylab", contributors: people.slice(0, 2).map(([login, minutes]) => ({ login, last_seen_at: ago(minutes + 5) })), leaderboards: { commits: board("commits", 0.1).slice(0, 2) } }] } };
  };
  // Fake WebRTC for the fixture (`?voice=`): peer connections that "connect" as soon as they are answered, a receiver that
  // reports a track for each mid the fake broker's offer names (its `mids`), a microphone that is a record and never a
  // device, and audio elements that play nothing. `stats` counts what a check needs to see.
  const fakeRtc = (voice) => {
    const stats = { captures: 0, live: 0, elements: 0, playing: 0, stopped: 0, peers: 0, closed: 0 };
    const events = (obj) => {
      const on = new Map();
      obj.addEventListener = (type, fn) => { if (!on.has(type)) on.set(type, new Set()); on.get(type).add(fn); };
      obj.removeEventListener = (type, fn) => on.get(type)?.delete(fn);
      obj.dispatch = (type, event = {}) => { for (const fn of [...(on.get(type) || [])]) fn(event); };
      return obj;
    };
    const track = () => events({ kind: "audio", enabled: true, readyState: "live",
      stop() { if (this.readyState === "ended") return; this.readyState = "ended"; stats.live--; stats.stopped++; } });
    class PeerConnection {
      constructor() {
        events(this);
        Object.assign(this, { connectionState: "new", iceGatheringState: "complete", localDescription: null, transceivers: [], mids: 0 });
        stats.peers++;
      }
      getTransceivers() { return this.transceivers; }
      addTransceiver(sending) {
        const tx = { mid: null, sending, stopped: false, stop() { this.stopped = true; } };
        this.transceivers.push(tx);
        return tx;
      }
      async createOffer() { return { type: "offer", sdp: "v=0 fixture offer" }; }
      async createAnswer() { return { type: "answer", sdp: "v=0 fixture answer" }; }
      async setLocalDescription(desc) {
        for (const tx of this.transceivers) if (tx.mid === null) tx.mid = String(this.mids++);
        this.localDescription = desc;
      }
      async setRemoteDescription(desc) {
        const fresh = (desc.mids || []).map((mid) => { const tx = { mid, stopped: false, stop() { this.stopped = true; } }; this.transceivers.push(tx); return tx; });
        setTimeout(() => {
          if (this.connectionState === "closed") return;
          if (this.connectionState !== "connected") { this.connectionState = "connected"; this.dispatch("connectionstatechange"); }
          for (const transceiver of fresh) this.dispatch("track", { transceiver, track: track() });
        }, 40);
      }
      close() { if (this.connectionState === "closed") return; this.connectionState = "closed"; stats.closed++; }
    }
    const blocked = () => voice === "blocked" && !(navigator.userActivation && navigator.userActivation.hasBeenActive);
    const rtc = {
      PeerConnection,
      // Synthetic tracks are records, not browser MediaStreams; exercise the element playback path here.
      AudioContext: null,
      async getUserMedia() {
        if (voice === "denied") throw new DOMException("Permission denied", "NotAllowedError");
        const mic = track();
        stats.captures++;
        stats.live++;
        return { getAudioTracks: () => [mic], getTracks: () => [mic] };
      },
      stream: (t) => ({ getTracks: () => [t] }),
      audio: () => {
        stats.elements++;
        const el = { autoplay: false, srcObject: null, muted: false, playing: false,
          play() {
            if (blocked()) return Promise.reject(new DOMException("Autoplay held", "NotAllowedError"));
            if (!this.playing) { this.playing = true; stats.playing++; }
            return Promise.resolve();
          },
          pause() { if (this.playing) { this.playing = false; stats.playing--; } } };
        return el;
      },
      stats
    };
    BL.oogaChatFixtures.rtc = rtc;
    return rtc;
  };
  // `chats` defaults to the page's own `?chats=`, so the app needs no word of it.
  const pageChats = () => typeof location === "object" && new URLSearchParams(location.search).get("chats") || "off";
  const create = ({ state = "signed-out", roster = "mixed", voice = "ok", chats: offered = pageChats(), now = () => Date.now() } = {}) => {
    if (!STATES.includes(state)) throw new Error(`Unknown fixture state "${state}" (${STATES.join(", ")})`);
    if (!ROSTERS.includes(roster)) throw new Error(`Unknown fixture roster "${roster}" (${ROSTERS.join(", ")})`);
    if (!VOICES.includes(voice)) throw new Error(`Unknown fixture voice "${voice}" (${VOICES.join(", ")})`);
    if (!CHATS.includes(offered)) throw new Error(`Unknown fixture chats "${offered}" (${CHATS.join(", ")})`);
    // The directory: each chat's roles as chat-roles.js keeps them, its members, and the feeds open on it.
    const rooms = new Map();
    const room = (id, title, zone, ago, cast, roles = {}) => rooms.set(id, { id, title, zone, startedAt: now() - ago, cast, host: roles.host, cohosts: new Map((roles.cohosts || []).map((c) => [c, now() - 500000])),
      queue: new Map(roles.queue || []), invites: new Map(roles.invites || []), offers: new Map(), stage: new Set(), removed: new Set(), removedInfo: new Map(), cooldown: new Map(), ended: false, sample: true, feeds: new Set() });
    if (offered === "on") {
      // Listening and speaking from both apps (`via`), each here or on the stage since a different moment (`since`).
      const ago = (s) => now() - s * 1000;
      room("fixtureChatOak01", "Sample Oak's chat", "main", 600000, [member(1, "sample-oak", "speaker", { via: "island", since: ago(590), walking: true }),
        member(2, "sample-fern", "speaker", { via: "app", reconnecting: true, since: ago(400) }), member(3, "sample-reed", "speaker", { via: "island", muted: true, since: ago(300), walking: true }),
        member(4, "sample-wren", "listener", { via: "island", since: ago(500) }), member(5, "sample-kite", "listener", { via: "app", since: ago(200) }),
        member(6, "sample-lark", "listener", { via: "app", since: ago(100) }), member(7, "sample-heron", "listener", { via: "island", since: ago(550) })],
      { host: "gh:9001", cohosts: ["gh:9002"], queue: [["gh:9004", now() - 30000], ["gh:9005", now() - 10000]], invites: [["gh:9006", now() + 60000]] });
      room("fixtureChatDune1", "Building DSB Land", "dsb", 120000, [member(11, "sample-dune", "speaker", { via: "island", since: ago(110) }),
        member(12, "sample-gull", "listener", { via: "app", since: ago(60) })], { host: "gh:9011" });
      // Its stage is open: a request there is approved the moment it is made.
      rooms.get("fixtureChatDune1").open = true;
    }
    const level = (r, id) => id === r.host ? 2 : r.cohosts.has(id) ? 1 : 0;
    const invitedUntil = (r, id) => (r.invites.get(id) || 0) > now() ? r.invites.get(id) : 0;
    const mayLease = (r, id) => !r.ended && !r.removed.has(id) && (level(r, id) > 0 || !!invitedUntil(r, id) || r.stage.has(id));
    const requestOf = (r, id) => r.offers.has(id) ? "cohost" : invitedUntil(r, id) ? "invited" : r.queue.has(id) ? "asked" : "";
    // A row as the chat draws it: its rank and open request.
    const standing = (r, p) => {
      const { rank: _r, request: _q, askedAt: _a, ...row } = p, rank = level(r, p.id), request = requestOf(r, p.id);
      return { ...row, ...(rank ? { rank: rank === 2 ? "host" : "cohost", ...(rank === 1 ? { rankSince: r.cohosts.get(p.id) } : {}) } : {}), ...(request ? { request, ...(request === "asked" ? { askedAt: r.queue.get(p.id) } : {}) } : {}) };
    };
    const listing = () => [...rooms.values()].filter((r) => !r.ended).map((r) => {
      const host = r.cast.find((p) => p.id === r.host) || { login: account?.identity.login || "sample-host", display: account?.identity.display };
      const speakers = r.cast.filter((p) => p.role === "speaker").length + [...r.feeds].filter((f) => f.speaking()).length;
      return { id: r.id, title: r.title, zone: r.zone, startedAt: r.startedAt, host: { login: host.login, display: host.display || host.login, character: null }, speakers, listeners: r.cast.length + r.feeds.size - speakers, open: !!r.open };
    }).sort((a, b) => b.speakers + b.listeners - a.speakers - a.listeners || b.startedAt - a.startedAt);
    const chats = async () => ({ chats: listing() });
    const chatInfo = (r) => ({ id: r.id, title: r.title, zone: r.zone, startedAt: r.startedAt, host: r.host, cohosts: [...r.cohosts.keys()], offers: [...r.offers.keys()], open: !!r.open });
    // How a sample answers a co-host offer, a moment after it is made: Sample Pebble accepts, Sample Otter says not now,
    // and everyone else leaves it open, so a host sees every state (docs/ooga-chat-hosts.md, Roles).
    const COHOST_ANSWERS = { "sample-pebble": true, "sample-otter": false };
    // A chat's preview from its own state: its stage (the host, co-hosts and speakers), how many listen and wait; a chat
    // gone answers as the server's 404 does.
    const chatPreview = async (boot, id) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const r = rooms.get(id);
      if (!r || r.ended) return { code: "ended", retryable: false };
      const rows = r.cast.map((p) => standing(r, p)), stage = rows.filter((p) => p.rank || p.role === "speaker").map(({ request: _q, askedAt: _a, ...p }) => p);
      return { chat: chatInfo(r), stage, listeners: rows.length - stage.length + r.feeds.size, requests: r.queue.size };
    };
    let started = 0;
    const startChat = async (boot, { title, zone }) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const who = account && parseSession(account, now()), id = who && `gh:${who.identity.providerUserId}`;
      if (!who) return { code: "auth_required", retryable: false, retryAfter: 0 };
      if (who.identity.provider !== "github" || who.eligibility.state !== "eligible") return { code: "capability_required", retryable: false, retryAfter: 0 };
      const text = String(title).trim();
      if (!text || text.length > 60) return { code: "bad_title", retryable: false, retryAfter: 0 };
      if (![...BL.oogaChatConfig.ZONES, "none"].includes(zone)) return { code: "zone_unavailable", retryable: false, retryAfter: 0 };
      if ([...rooms.values()].some((r) => !r.ended && r.host === id)) return { code: "already_hosting", retryable: false, retryAfter: 0 };
      const chat = `fixtureStarted${String(++started).padStart(2, "0")}`;
      room(chat, text, zone, 0, [], { host: id });
      rooms.get(chat).sample = false;
      return { chat: { id: chat, title: text, zone } };
    };
    const expiresAt = state === "expiring" ? now() + 20000 : null;
    const asked = (name) => name && { ...ACCOUNTS[name], expiresAt };
    let account = asked(SIGNED_IN[state]), disposed = false;
    const bootstrap = async () => state === "unavailable" ? { ok: false, mode: "unavailable", reason: "fixture" }
      : parseBootstrap(answer(state === "demo-payment" ? "demo" : state === "real-payment", state !== "provider-disabled", voice !== "off", offered === "on"), null, { fixture: true });
    const session = async () => disposed || !account ? null : parseSession(account, now());
    const signIn = (boot, provider) => {
      account = asked(provider === "x" ? "listener" : ["ineligible", "unknown", "revoked"].includes(state) ? state : "contributor");
      return parseSession(account, now());
    };
    const signOut = async () => {
      account = null;
      if (state === "signout-fails") throw new Error("fixture: sign-out not confirmed");
      return null;
    };
    // The audience: a snapshot a moment after each join, then the roster's script. The signed-in account listens, and a
    // contributor may speak (`?voice=`): the feed keeps its connection's lease and the voices its receiver pulled, which
    // the fake broker (`media`) reads and changes by that connection.
    const feeds = new Set(), links = new Map();
    let opened = 0, connections = 0, generations = 0;
    const audience = (boot, { message, status }, chat = null) => {
      const r = chat ? rooms.get(chat) : null;
      let zone = null, epoch = 0, revision = 0, people = [], step = 0, closed = false, requests = 0;
      let connection = `fixture-conn-${++connections}`, lease = 0, active = false, mic = "muted", mids = 0, activeAt = 0, offeredHere = false;
      // The island view (`view`): while this connection asks, the chat's walkers' places twice a second, as the copy
      // relays them (audience.js `walk`), each walking a ring round the island's middle.
      let viewing = false, walkSeq = 0, chain = false;
      const walkFrame = () => {
        if (!viewing || !r) { chain = false; return; }
        const p = [], t = now() / 1000;
        r.cast.filter((w) => w.walking && w.role === "speaker").forEach((w, i) => {
          const a = (t * (0.3 - i * 0.12) + i * 2.4) % (Math.PI * 2), reach = 8 + i * 10;
          p.push(w.id, Math.round(Math.cos(a) * reach * 10) / 10, 0.4, Math.round(Math.sin(a) * reach * 10) / 10, Math.round(-a * 100) / 100);
        });
        walkSeq = Math.max(now(), walkSeq + 1);
        if (p.length) message({ type: "walk", seq: walkSeq, p });
        after(500, walkFrame);
      };
      const joinedAt = now();
      const held = new Map();
      const contributor = () => !!account && account.identity.provider === "github" && account.eligibility.state === "eligible";
      // `?voice=elsewhere`: the island holds the account's voice until the visitor takes it.
      let elsewhere = voice === "elsewhere";
      const you = () => {
        const id = self()[0]?.id || null;
        if (r) {
          const until = invitedUntil(r, id), rank = level(r, id);
          return { id, speak: lease ? active ? "active" : "pending" : mayLease(r, id) ? "eligible" : "none", ...(lease ? { lease } : {}),
            rank: rank === 2 ? "host" : rank ? "cohost" : "", request: requestOf(r, id), ...(until ? { inviteUntil: until } : {}) };
        }
        if (lease) return { id, speak: active ? "active" : "pending", lease };
        return contributor() && elsewhere ? { id, speak: "denied", elsewhere: "island" } : { id, speak: contributor() ? "eligible" : "none" };
      };
      // The visitor's row as the server would draw it: a muted app speaker once its microphone is up.
      const ownRow = () => {
        const mine = self()[0], row = mine && (active ? { ...mine, role: "speaker", source: "app", muted: mic === "muted", ...(r ? { since: activeAt } : {}) } : mine);
        return row && r ? standing(r, row) : row;
      };
      const endLease = (voluntary = true) => {
        if (!lease) return;
        const was = active;
        lease = 0; active = false; mic = "muted";
        const id = self()[0]?.id;
        // Once let on the stage they keep their way back to it (`stage`, the server's `cleared`) until a host moves them
        // off or removes them. A co-host leaving the stage on their own word is a listener with the offer back, their slot kept.
        const reinstated = !!r && voluntary && r.cohosts.has(id);
        if (reinstated) { r.cohosts.delete(id); r.offers.set(id, now()); }
        if (was || reinstated) delta([ownRow()]);
        message({ type: "you", zone, you: you() });
        if (reinstated) { notice({ kind: "cohost_offer", again: true }); message({ type: "chat", chat: chatInfo(r) }); }
      };
      const timers = new Set();
      const after = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, ms); timers.add(id); };
      const clear = () => { for (const id of timers) clearTimeout(id); timers.clear(); };
      const snapshot = () => message({ type: "snapshot", zone, epoch, revision, participants: people, you: you(), connection });
      // A delta changes the fixture's own list too, so a resync's snapshot matches it; `skip` leaves a gap.
      const delta = (upsert, remove = [], skip = 0) => {
        const gone = new Set([...remove, ...upsert].map((p) => p.id));
        people = [...people.filter((p) => !gone.has(p.id)), ...upsert];
        message({ type: "delta", zone, epoch, revision: (revision += 1 + skip), upsert, remove });
      };
      // The visitor's row is keyed as the edge keys it, by provider id, not by the session's principal.
      const self = () => {
        const who = account && parseSession(account, now());
        const id = who && `${who.identity.provider === "github" ? "gh" : "x"}:${who.identity.providerUserId}`;
        return who ? [person("self", "app", "listener", who.identity.login, { id, display: who.identity.display, ...(r ? { via: "app", since: joinedAt } : {}) })] : [];
      };
      const script = () => after(4000, () => {
        const visitor = person("listener-visitor", "app", "listener", "sample-visitor");
        [() => delta([visitor]),
          () => delta([{ ...people.find((p) => p.login === "sample-wren"), display: "sample wren, renamed" }]),
          () => delta([], [{ id: "fixture:listener-otter", generation: 1 }], 1),
          () => delta([], [{ id: visitor.id, generation: 1 }])][step++ % 4]();
        script();
      });
      // Who was removed, to a host or co-host (the server's `removed` list, earliest first).
      const removedList = () => message({ type: "removed", list: [...r.removedInfo.values()].map(({ id, at, login, display }) => ({ id, at, login, display })) });
      // In a chat: a member's row redrawn with their standing; a notice to the visitor; and the chat's end.
      const touch = (...ids) => delta(ids.map((id) => id === self()[0]?.id ? ownRow() : people.find((p) => p.id === id)).filter(Boolean).map((p) => standing(r, p)));
      const notice = (fields) => message({ type: "notice", ...fields });
      const ended = (reason = "ended") => {
        r.ended = true;
        for (const f of [...r.feeds]) f.end(reason);
      };
      // A sample member takes up an invite a moment later, unmuted, as a person would.
      const takeUp = (id) => after(1000, () => {
        const p = people.find((q) => q.id === id);
        if (!p || !invitedUntil(r, id)) return;
        r.invites.delete(id);
        r.stage.add(id);
        const row = { ...p, role: "speaker", muted: false, since: now() };
        r.cast = r.cast.map((q) => q.id === id ? row : q);
        delta([standing(r, row)]);
      });
      // An invite an open stage gives: the visitor hears it, and a sample takes it up.
      const openInvite = (id, by) => {
        r.queue.delete(id);
        r.invites.set(id, now() + 60000);
        touch(id);
        if (id !== self()[0]?.id) return takeUp(id);
        notice({ kind: "invited", by, until: r.invites.get(id), open: true });
        after(0, () => message({ type: "you", zone, you: you() }));
      };
      // A request in a chat (docs/ooga-chat-hosts.md, Requests), checked as chat-roles.js checks it.
      const chatOp = (type, fields) => {
        const me = self()[0]?.id, target = fields.id, mine = level(r, me), row = people.find((p) => p.id === target);
        const no = (code, extra = {}) => ({ ok: false, error: { code, retryable: !!extra.retryAfter, ...extra } });
        if (r.ended) return no("ended");
        if (type === "ask") {
          if (lease || mayLease(r, me)) return no("already_allowed");
          const until = r.cooldown.get(me) || 0;
          if (until > now()) return no("cooldown", { retryAfter: Math.ceil((until - now()) / 1000) });
          // An open stage approves it at once: an invite, said with `open`, and nothing for the hosts to answer.
          if (r.open) { openInvite(me, r.host); return { ok: true }; }
          r.queue.set(me, now());
          touch(me);
          if (r.sample) after(1500, () => {
            if (!r.queue.has(me)) return;
            r.queue.delete(me);
            r.invites.set(me, now() + 60000);
            touch(me);
            notice({ kind: "invited", by: r.host, until: r.invites.get(me) });
            message({ type: "you", zone, you: you() });
          });
          return { ok: true };
        }
        if (type === "cancel") { r.queue.delete(me); touch(me); return { ok: true }; }
        if (type === "decline") { r.invites.delete(me); touch(me); return { ok: true }; }
        // The visitor answers a co-host offer: Accept makes them a co-host, free to take the stage; Not now frees the slot.
        if (type === "cohostAnswer") {
          if (!r.offers.delete(me)) return no("not_offered");
          if (fields.accept === true) { r.cohosts.set(me, now()); r.queue.delete(me); r.invites.delete(me); }
          touch(me);
          if (fields.accept === true) { notice({ kind: "cohost", id: me }); removedList(); }
          message({ type: "chat", chat: chatInfo(r) });
          after(0, () => message({ type: "you", zone, you: you() }));
          return { ok: true };
        }
        // The host's open stage: switching it on approves everyone waiting, and everyone hears the chat's new word.
        if (type === "open") {
          if (mine !== 2) return no("not_host");
          if (r.open !== (fields.on === true)) {
            r.open = fields.on === true;
            if (r.open) for (const id of [...r.queue.keys()]) openInvite(id, me);
            message({ type: "chat", chat: chatInfo(r) });
          }
          return { ok: true };
        }
        if (type === "end") {
          if (mine !== 2) return no("not_host");
          after(50, () => ended("ended"));
          return { ok: true };
        }
        if (!mine) return no("not_host");
        // Allow back: someone removed may come in again, as a listener; a sample comes back a moment later.
        if (type === "allow") {
          const info = r.removedInfo.get(target);
          if (!info) return no("not_removed");
          r.removed.delete(target);
          r.removedInfo.delete(target);
          removedList();
          after(1000, () => {
            const back = { ...info.row, role: "listener", muted: undefined, since: now() };
            r.cast = [...r.cast, back];
            delta([standing(r, back)]);
          });
          return { ok: true };
        }
        if (!row || target === me || mine <= level(r, target)) return no("not_allowed");
        switch (type) {
          case "invite":
          case "answer":
            if (type === "answer" && !r.queue.has(target)) return no("not_asked");
            r.queue.delete(target);
            if (type === "answer" && !fields.approve) { r.cooldown.set(target, now() + 60000); touch(target); return { ok: true }; }
            r.invites.set(target, now() + 60000);
            touch(target);
            takeUp(target);
            return { ok: true };
          case "mute":
            if (row.role !== "speaker") return no("not_speaking");
            r.cast = r.cast.map((p) => p.id === target ? { ...p, muted: true } : p);
            delta([standing(r, { ...row, muted: true })]);
            return { ok: true };
          case "demote":
            r.stage.delete(target);
            r.cast = r.cast.map((p) => p.id === target ? { ...p, role: "listener", muted: undefined, since: now() } : p);
            delta([standing(r, { ...row, role: "listener", muted: undefined, since: now() })]);
            return { ok: true };
          case "cohost":
            // On offers co-hosting (co-hosts and open offers share three slots); off withdraws an offer, or makes a
            // co-host a plain speaker who keeps the stage. A sample answers its offer a moment later (`COHOST_ANSWERS`).
            if (mine !== 2) return no("not_host");
            if (!fields.on) {
              if (!r.offers.delete(target) && !r.cohosts.delete(target)) return { ok: true };
            } else {
              if (r.cohosts.has(target) || r.offers.has(target)) return { ok: true };
              if (r.cohosts.size + r.offers.size >= 3) return no("cohosts_full");
              r.offers.set(target, now());
              const answer = COHOST_ANSWERS[row.login];
              if (answer !== undefined) after(1000, () => {
                if (!r.offers.delete(target)) return;
                if (answer) { r.cohosts.set(target, now()); r.queue.delete(target); r.invites.delete(target); }
                touch(target);
                notice(answer ? { kind: "cohost", id: target } : { kind: "cohost_declined", id: target });
                message({ type: "chat", chat: chatInfo(r) });
              });
            }
            touch(target);
            message({ type: "chat", chat: chatInfo(r) });
            return { ok: true };
          case "handover":
            if (mine !== 2 || !r.cohosts.has(target)) return no("not_allowed");
            r.cohosts.delete(target);
            r.host = target;
            r.cohosts.set(me, now());
            touch(me, target);
            notice({ kind: "host", id: target, by: me });
            after(0, () => message({ type: "you", zone, you: you() }));
            return { ok: true };
          case "remove":
            r.queue.delete(target); r.invites.delete(target); r.stage.delete(target); r.cohosts.delete(target); r.offers.delete(target); r.removed.add(target);
            r.removedInfo.set(target, { id: target, at: now(), login: row.login, display: row.display, row });
            r.cast = r.cast.filter((p) => p.id !== target);
            delta([], [{ id: target, generation: row.generation }]);
            removedList();
            return { ok: true };
          default: return no("malformed");
        }
      };
      const join = () => {
        clear();
        viewing = chain = false;
        status("connecting");
        if (roster === "full") return after(500, () => status("full"));
        if (r) return after(500, () => {
          if (r.ended) return feed.end("ended");
          epoch++;
          revision = 0;
          people = [...r.cast, ...self()].map((p) => standing(r, p));
          message({ type: "snapshot", zone, epoch, revision, participants: people, you: you(), connection,
            chat: chatInfo(r) });
          if (level(r, self()[0]?.id)) removedList();
          // A chat the visitor started fills up: one sample listening from the island, then two who ask to speak, one
          // from each app, a moment apart, and later one more listening from Ooga Chat (a fourth to offer co-hosting to).
          if (!r.sample && !r.cast.length) [[23, "sample-heron", "island", false, 1000], [21, "sample-pebble", "app", true, 2000], [22, "sample-otter", "island", true, 3200], [24, "sample-moss", "app", false, 5500]]
            .forEach(([n, login, via, asks, at]) => after(at, () => {
              const p = member(n, login, "listener", { via, since: now() });
              r.cast = [...r.cast, p];
              if (asks) r.queue.set(p.id, now());
              delta([standing(r, p)]);
              if (asks) notice({ kind: "asked", id: p.id });
            }));
        });
        after(500, () => {
          epoch++;
          revision = 0;
          people = roster === "empty" ? self() : roster === "crowd"
            ? [...self(), ...Array.from({ length: 300 }, (_, i) => person(`crowd-${i}`, "app", "listener", `sample-listener-${String(i + 1).padStart(3, "0")}`))]
            : [...CAST[zone], ...self()];
          snapshot();
          if (roster === "mixed" && zone === "main") {
            script();
            // A reaction from the cast, as the server sends each one to the zone (#668).
            after(2500, () => { const at = now(); message({ type: "reaction", eventId: "fixture-oak", participantId: "fixture:world-oak", zone, epoch, emoji: "🔥", at, expiresAt: at + 2600 }); });
          }
          // Back to an unchanged zone: the same epoch and revision, so the snapshot only confirms the list. A new socket is a
          // new connection, holding nothing the old one did.
          if (roster === "reconnecting") after(6000, () => {
            status("reconnecting");
            links.delete(connection);
            lease = 0; active = false; held.clear();
            connection = `fixture-conn-${++connections}`;
            links.set(connection, link);
            after(3000, () => { status("connecting"); after(500, snapshot); });
          });
          if (roster === "reauth" && opened++ === 0) after(6000, () => status("signed-out"));
        });
      };
      // What the fake broker reaches by this feed's connection: the voices to pull, a lease's steps and its end.
      const link = {
        sync() {
          const speakers = new Set(people.filter((p) => p.role === "speaker" && p.id !== self()[0]?.id).map((p) => p.id));
          const closedMids = [];
          for (const [participant, mid] of held) if (!speakers.has(participant)) { held.delete(participant); closedMids.push(mid); }
          const tracks = [...speakers].filter((id) => !held.has(id)).map((participant) => ({ participant, mid: `r${mids++}` }));
          for (const t of tracks) held.set(t.participant, t.mid);
          return tracks.length ? { tracks, closed: closedMids, sessionDescription: { type: "offer", sdp: "v=0 fixture", mids: tracks.map((t) => t.mid) }, requiresImmediateRenegotiation: true }
            : { tracks: [], closed: closedMids, requiresImmediateRenegotiation: false };
        },
        lease: (generation) => !!lease && lease === generation,
        ready() {
          active = true; mic = "muted"; activeAt = now();
          const id = self()[0]?.id;
          if (r) { r.invites.delete(id); r.queue.delete(id); r.stage.add(id); }
          delta([ownRow()]);
          message({ type: "you", zone, you: you() });
          // A sample chat's open stage: its host offers the visitor co-hosting a moment after they first take it.
          if (r && r.sample && r.open && !offeredHere && !level(r, id) && !r.offers.has(id)) {
            offeredHere = true;
            after(2500, () => {
              if (!active || level(r, id) || r.offers.has(id) || r.cohosts.size + r.offers.size >= 3) return;
              r.offers.set(id, now());
              delta([ownRow()]);
              message({ type: "you", zone, you: you() });
              notice({ kind: "cohost_offer", by: r.host });
              message({ type: "chat", chat: chatInfo(r) });
            });
          }
        },
        endLease
      };
      links.set(connection, link);
      const feed = {
        zone(next) {
          if (next === zone || closed) return;
          // A real change of zone: the lease ends there, and the old zone's pulls are closed, as the server does.
          if (zone) {
            lease = 0; active = false; mic = "muted";
            const gone = [...held.values()];
            held.clear();
            if (gone.length) message({ type: "media", op: "sync", closed: gone });
          }
          zone = next;
          join();
        },
        // A resync answers with the list as the script has it now, a revision on.
        resync: () => after(300, () => {
          revision++;
          snapshot();
        }),
        // A reaction comes back to the zone as the server's event; a hand is a speaker's alone, so the visitor's, a
        // listener here, is refused as the server refuses it (#668).
        request(type, fields) {
          if (closed || !zone) return 0;
          const requestId = ++requests, mine = self()[0], me = mine && people.find((p) => p.id === mine.id);
          after(120, () => {
            // Speaking (#654): a lease for an eligible contributor (`refused` fills the zone), a speaker's microphone
            // state, and back to listening.
            if (type === "setRole") {
              if (fields.role === "listener") { endLease(); return message({ type: "result", requestId, ok: true, you: you() }); }
              if (r ? !mayLease(r, self()[0]?.id) : !contributor()) return message({ type: "result", requestId, ok: false, error: { code: r ? "not_allowed" : "capability_required", retryable: false }, you: you() });
              if (voice === "refused") return message({ type: "result", requestId, ok: false, error: { code: "speaker_capacity", retryable: true }, you: you() });
              if (elsewhere && fields.takeover !== true) return message({ type: "result", requestId, ok: false, error: { code: "source_in_use", retryable: false }, you: you() });
              elsewhere = false;
              if (!lease) lease = ++generations;
              return message({ type: "result", requestId, ok: true, you: you() });
            }
            if (type === "setMic") {
              if (!active) return message({ type: "result", requestId, ok: false, error: { code: "capability_required", retryable: false }, you: you() });
              mic = fields.muted ? "muted" : "on";
              delta([ownRow()]);
              // A sample host mutes a microphone opened in their chat a moment later, as a host may.
              if (r && r.sample && mic === "on") after(2500, () => {
                if (!active || mic !== "on") return;
                mic = "muted";
                delta([ownRow()]);
                notice({ kind: "muted", by: r.host });
              });
              return message({ type: "result", requestId, ok: true, you: you() });
            }
            // The island view asked for or let go: no answer, as the server gives none.
            if (type === "view") {
              viewing = !!r && fields.on === true;
              if (viewing && !chain) { chain = true; walkFrame(); }
              return;
            }
            if (r && !["setRole", "setMic", "reaction", "hand"].includes(type)) return message({ type: "result", requestId, ...chatOp(type, fields), you: you() });
            if (type === "reaction" && me) {
              const at = now();
              message({ type: "reaction", eventId: `fixture-${requestId}`, participantId: me.id, zone, epoch, emoji: fields.emoji, at, expiresAt: at + 2600 });
              message({ type: "result", requestId, ok: true });
            } else if (type === "hand" && me && me.role === "speaker") {
              delta([{ ...me, hand: fields.on ? fields.emoji || "✋" : "" }]);
              message({ type: "result", requestId, ok: true });
            } else message({ type: "result", requestId, ok: false, error: { code: "not_speaker", retryable: false } });
          });
          return requestId;
        },
        dispose() {
          closed = true;
          clear();
          feeds.delete(feed);
          r?.feeds.delete(feed);
          // Leaving the chat frees an open offer's slot.
          if (r && account) r.offers.delete(self()[0]?.id);
          links.delete(connection);
        },
        // The chat ended: the notice, then the socket closes as 4404 does.
        end(reason) {
          if (closed) return;
          message({ type: "notice", kind: "ended", reason });
          clear();
          closed = true;
          r?.feeds.delete(feed);
          links.delete(connection);
          setTimeout(() => status("ended"), 50);
        },
        speaking: () => active,
        // A sample member's connection dropped or back: their row reconnecting, as the server's quiet hold shows it.
        drop(login, on) {
          const p = people.find((q) => q.login === login);
          if (p && !closed) delta([{ ...p, reconnecting: on }]);
        }
      };
      if (r) {
        if (r.ended) { setTimeout(() => status("ended"), 50); return { zone() {}, resync() {}, request: () => 0, wake() {}, dispose() {} }; }
        r.feeds.add(feed);
      }
      if (roster === "none") {
        status("unavailable");
        return { zone() {}, resync() {}, request: () => 0, dispose() {} };
      }
      feeds.add(feed);
      return feed;
    };
    const dispose = () => {
      disposed = true;
      for (const feed of [...feeds]) feed.dispose();
    };
    // The fake broker: each operation a moment later, by the page's own connection, as the server's answers it.
    const media = () => ({
      call: (op, body) => new Promise((resolve, reject) => setTimeout(() => {
        const link = links.get(body && body.connection), refuse = (code) => reject(Object.assign(new Error(code), { code, retryable: false }));
        if (disposed || !link) return refuse("stale_epoch");
        if (op === "ice") return resolve({});
        if (op === "receive/sync") return resolve(link.sync());
        if (op === "publish/open" || op === "publish/offer" || op === "publish/ready") {
          if (!link.lease(body.generation)) return refuse("capability_required");
          if (op === "publish/offer") return resolve({ sessionDescription: { type: "answer", sdp: "v=0 fixture answer" } });
          if (op === "publish/ready") link.ready();
          return resolve({ ok: true });
        }
        if (op === "publish/close" || op === "leave") link.endLease();
        resolve({ ok: true });
      }, 60))
    });
    const rtc = fakeRtc(voice);
    // For the checks: a sample member's connection drops (`on`) or comes back in every open feed.
    BL.oogaChatFixtures.drop = (login, on = true) => { for (const f of feeds) f.drop?.(login, on); };
    const commons = (boot, { message, status }) => {
      // Voice links as the island keeps them: linked with Sample Oak, an ask waiting on Sample-Fern, who asked back.
      let closed = false, next = HISTORY.length + 1;
      const wants = new Set([11, 12]), asking = new Set([11]);
      const links = () => ({ wants: [...wants], linked: [...wants].filter((id) => asking.has(id)) });
      const timers = new Set();
      const later = (ms, fn) => { const timer = setTimeout(() => { timers.delete(timer); if (!closed) fn(); }, ms); timers.add(timer); };
      const you = { id: 1, login: account?.identity.login || "sample-contributor", display: named || account?.identity.display || "sample-contributor" };
      status("connecting");
      later(300, () => {
        status("live");
        message({ t: "community", v: 1, op: "welcome", epoch: 1, send: true, you, players: TOWN, links: links(), features: ["chat-unicode-v1", "commons-v1"] });
        message({ t: "chat-history", messages: HISTORY });
      });
      return {
        send(data) {
          if (!closed && data.t === "link") {
            if (data.on) wants.add(data.to); else wants.delete(data.to);
            later(150, () => message({ t: "links", ...links() }));
            return true;
          }
          if (closed || data.t !== "chat") return false;
          const id = next++;
          later(250, () => {
            message({ t: "chat", id, at: now(), login: you.login, name: you.display, text: data.text });
            message({ t: "chat-ack", clientId: data.clientId });
          });
          return true;
        },
        dispose() {
          closed = true;
          for (const timer of timers) clearTimeout(timer);
          timers.clear();
        }
      };
    };
    // The Commons' name field, answered as the island's rules would after a short wait; the next welcome carries it.
    let named = null;
    const commonsName = (display) => new Promise((resolve) => setTimeout(() => {
      const clean = String(display).replace(/\s+/g, " ").trim();
      if (clean.length < 3 || clean.length > 24 || /[^\w .,!?'@#:-]/.test(clean)) return resolve({ ok: false, error: "Use 3–24 letters A–Z, digits, spaces or _ . , ! ? ' @ # : -" });
      named = clean;
      resolve({ ok: true, display: clean });
    }, 300));
    const contributors = async () => state === "unavailable" ? null : PUBLIC(now());
    return { kind: "fixture", state, bootstrap, session, signIn, signOut, audience, commons, commonsName, media, chats, startChat, chatPreview, rtc, contributors, dispose, pending: 0, demo };
  };
  BL.oogaChatFixtures = { create, STATES, ROSTERS, VOICES, CHATS, rtc: null };
})();
