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
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_VERSION, PROTOCOLS, parseBootstrap, parseSession } = BL.oogaChatConfig;
  const STATES = ["signed-out", "listener", "contributor", "ineligible", "unknown", "revoked", "provider-disabled", "expiring", "signout-fails",
    "demo-payment", "real-payment", "unavailable"];
  const protocols = Object.fromEntries(Object.entries(PROTOCOLS).map(([name, version]) => [name, [version]]));
  const answer = (feed, x, speak) => ({ version: BOOTSTRAP_VERSION, protocols,
    features: { github: true, x, voice: true, speak, feed, commons: true },
    paths: { session: "/fixture/session", logout: "/fixture/logout", audience: "/fixture/audience", login: { github: "/fixture/login/github", x: "/fixture/login/x" } } });
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
  const create = ({ state = "signed-out", roster = "mixed", voice = "ok", now = () => Date.now() } = {}) => {
    if (!STATES.includes(state)) throw new Error(`Unknown fixture state "${state}" (${STATES.join(", ")})`);
    if (!ROSTERS.includes(roster)) throw new Error(`Unknown fixture roster "${roster}" (${ROSTERS.join(", ")})`);
    if (!VOICES.includes(voice)) throw new Error(`Unknown fixture voice "${voice}" (${VOICES.join(", ")})`);
    const expiresAt = state === "expiring" ? now() + 20000 : null;
    const asked = (name) => name && { ...ACCOUNTS[name], expiresAt };
    let account = asked(SIGNED_IN[state]), disposed = false;
    const bootstrap = async () => state === "unavailable" ? { ok: false, mode: "unavailable", reason: "fixture" }
      : parseBootstrap(answer(state === "demo-payment" ? "demo" : state === "real-payment", state !== "provider-disabled", voice !== "off"), null, { fixture: true });
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
    const audience = (boot, { message, status }) => {
      let zone = null, epoch = 0, revision = 0, people = [], step = 0, closed = false, requests = 0;
      let connection = `fixture-conn-${++connections}`, lease = 0, active = false, mic = "muted", mids = 0;
      const held = new Map();
      const contributor = () => !!account && account.identity.provider === "github" && account.eligibility.state === "eligible";
      // `?voice=elsewhere`: the island holds the account's voice until the visitor takes it.
      let elsewhere = voice === "elsewhere";
      const you = () => {
        const id = self()[0]?.id || null;
        if (lease) return { id, speak: active ? "active" : "pending", lease };
        return contributor() && elsewhere ? { id, speak: "denied", elsewhere: "island" } : { id, speak: contributor() ? "eligible" : "none" };
      };
      // The visitor's row as the server would draw it: a muted app speaker once its microphone is up.
      const ownRow = () => {
        const mine = self()[0];
        return mine && (active ? { ...mine, role: "speaker", source: "app", muted: mic === "muted" } : mine);
      };
      const endLease = () => {
        if (!lease) return;
        const was = active;
        lease = 0; active = false; mic = "muted";
        if (was) delta([ownRow()]);
        message({ type: "you", zone, you: you() });
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
        return who ? [person("self", "app", "listener", who.identity.login, { id, display: who.identity.display })] : [];
      };
      const script = () => after(4000, () => {
        const visitor = person("listener-visitor", "app", "listener", "sample-visitor");
        [() => delta([visitor]),
          () => delta([{ ...people.find((p) => p.login === "sample-wren"), display: "sample wren, renamed" }]),
          () => delta([], [{ id: "fixture:listener-otter", generation: 1 }], 1),
          () => delta([], [{ id: visitor.id, generation: 1 }])][step++ % 4]();
        script();
      });
      const join = () => {
        clear();
        status("connecting");
        if (roster === "full") return after(500, () => status("full"));
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
          active = true; mic = "muted";
          delta([ownRow()]);
          message({ type: "you", zone, you: you() });
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
              if (!contributor()) return message({ type: "result", requestId, ok: false, error: { code: "capability_required", retryable: false }, you: you() });
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
              return message({ type: "result", requestId, ok: true, you: you() });
            }
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
          links.delete(connection);
        }
      };
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
    const commons = (boot, { message, status }) => {
      let closed = false, next = HISTORY.length + 1;
      const timers = new Set();
      const later = (ms, fn) => { const timer = setTimeout(() => { timers.delete(timer); if (!closed) fn(); }, ms); timers.add(timer); };
      const you = { id: 1, login: account?.identity.login || "sample-contributor", display: named || account?.identity.display || "sample-contributor" };
      status("connecting");
      later(300, () => {
        status("live");
        message({ t: "community", v: 1, op: "welcome", epoch: 1, send: true, you, players: TOWN, features: ["chat-unicode-v1", "commons-v1"] });
        message({ t: "chat-history", messages: HISTORY });
      });
      return {
        send(data) {
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
    return { kind: "fixture", state, bootstrap, session, signIn, signOut, audience, commons, commonsName, media, rtc, contributors, dispose, pending: 0, demo };
  };
  BL.oogaChatFixtures = { create, STATES, ROSTERS, VOICES, rtc: null };
})();
