// Ooga Chat's offline fixture adapter, for development and review only. fixture.html loads it; index.html never
// does, and scripts/ooga-chat.mjs refuses an index.html that would, so production cannot fall back to it. It speaks
// the production adapter's interface (ooga-chat-http.js) with canned answers chosen by `?state=` (`STATES`). Each
// account state answers the session as the server would for that account: signed in already, and signing in with
// GitHub again lands on the same kind of account, while X always lands on the X listener, whose handle looks like a
// contributor's and whose answer claims to speak, so a review shows that neither counts. `provider-disabled` turns X
// sign-in off, `expiring` ends its session 20 s after load, and `signout-fails` never confirms a sign-out.
// `?roster=` picks the audience a signed-in account hears (`ROSTERS`): `mixed` (the default: world and app speakers,
// listeners, a duplicate and a missing total, then a join, a rename, a gap the page must resync over and a leave, one
// every 4 s), `empty`, `crowd` (300 listeners), `reconnecting` (drops after 6 s and comes back in a new epoch), `full`
// and `none` (no audience address). Accounts and participants are named samples with no picture, never real people.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_VERSION, PROTOCOLS, parseBootstrap, parseSession } = BL.oogaChatConfig;
  const STATES = ["signed-out", "listener", "contributor", "ineligible", "unknown", "revoked", "provider-disabled", "expiring", "signout-fails",
    "demo-payment", "unavailable"];
  const protocols = Object.fromEntries(Object.entries(PROTOCOLS).map(([name, version]) => [name, [version]]));
  const answer = (feed, x) => ({ version: BOOTSTRAP_VERSION, protocols,
    features: { github: true, x, voice: false, feed },
    paths: { session: "/fixture/session", logout: "/fixture/logout", login: { github: "/fixture/login/github", x: "/fixture/login/x" } } });
  const github = (n, login, state, capabilities = {}) => ({ identity: { principal: `fixture:github:${n}`, provider: "github", providerUserId: String(n), login, display: login },
    capabilities, eligibility: { state } });
  const ACCOUNTS = {
    listener: { identity: { principal: "fixture:x:1", provider: "x", providerUserId: "1790000000000000001", login: "sample_contributor", display: "sample contributor" },
      capabilities: { speak: true, contributor: true }, eligibility: { state: "eligible" } },
    contributor: github(1, "sample-contributor", "eligible", { speak: true, contributor: true }),
    ineligible: github(2, "sample-visitor", "ineligible"),
    unknown: github(3, "sample-unchecked", "unknown", { speak: true, contributor: true }),
    revoked: github(4, "sample-revoked", "revoked", { speak: true, contributor: true })
  };
  // The account a state starts signed in as, and the one its GitHub button signs in as.
  const SIGNED_IN = { listener: "listener", contributor: "contributor", ineligible: "ineligible", unknown: "unknown", revoked: "revoked", expiring: "contributor", "signout-fails": "contributor" };
  const ROSTERS = ["mixed", "empty", "crowd", "reconnecting", "full", "none"];
  const person = (id, source, role, login, extra = {}) => ({ id: `fixture:${id}`, generation: 1, source, role, login, display: login, ...extra });
  const CAST = {
    main: [
      person("world-oak", "world", "speaker", "sample-oak", { contributions: 412 }),
      person("world-fern", "world", "speaker", "Sample-Fern", { contributions: 412 }),
      person("world-reed", "world", "speaker", "sample-reed"),
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
  const create = ({ state = "signed-out", roster = "mixed", now = () => Date.now() } = {}) => {
    if (!STATES.includes(state)) throw new Error(`Unknown fixture state "${state}" (${STATES.join(", ")})`);
    if (!ROSTERS.includes(roster)) throw new Error(`Unknown fixture roster "${roster}" (${ROSTERS.join(", ")})`);
    const expiresAt = state === "expiring" ? now() + 20000 : null;
    const asked = (name) => name && { ...ACCOUNTS[name], expiresAt };
    let account = asked(SIGNED_IN[state]), disposed = false;
    const bootstrap = async () => state === "unavailable" ? { ok: false, mode: "unavailable", reason: "fixture" }
      : parseBootstrap(answer(state === "demo-payment" ? "demo" : false, state !== "provider-disabled"), null, { fixture: true });
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
    // The audience: a snapshot a moment after each join, then the roster's script. The signed-in account listens.
    const feeds = new Set();
    const audience = (boot, { message, status }) => {
      let zone = null, epoch = 0, revision = 0, people = [], step = 0, closed = false;
      const timers = new Set();
      const after = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, ms); timers.add(id); };
      const clear = () => { for (const id of timers) clearTimeout(id); timers.clear(); };
      const snapshot = () => message({ type: "snapshot", zone, epoch, revision, participants: people });
      // A delta changes the fixture's own list too, so a resync's snapshot matches it; `skip` leaves a gap.
      const delta = (upsert, remove = [], skip = 0) => {
        const gone = new Set([...remove, ...upsert].map((p) => p.id));
        people = [...people.filter((p) => !gone.has(p.id)), ...upsert];
        message({ type: "delta", zone, epoch, revision: (revision += 1 + skip), upsert, remove });
      };
      const self = () => {
        const who = account && parseSession(account, now());
        return who ? [person("self", "app", "listener", who.identity.login, { id: who.identity.principal, display: who.identity.display })] : [];
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
          if (roster === "mixed" && zone === "main") script();
          if (roster === "reconnecting") after(6000, () => { status("reconnecting"); after(3000, join); });
        });
      };
      const feed = {
        zone(next) {
          if (next === zone || closed) return;
          zone = next;
          join();
        },
        // A resync answers with the list as the script has it now, a revision on.
        resync: () => after(300, () => {
          revision++;
          snapshot();
        }),
        dispose() {
          closed = true;
          clear();
          feeds.delete(feed);
        }
      };
      if (roster === "none") {
        status("unavailable");
        return { zone() {}, resync() {}, dispose() {} };
      }
      feeds.add(feed);
      return feed;
    };
    const dispose = () => {
      disposed = true;
      for (const feed of [...feeds]) feed.dispose();
    };
    return { kind: "fixture", state, bootstrap, session, signIn, signOut, audience, dispose, pending: 0 };
  };
  BL.oogaChatFixtures = { create, STATES, ROSTERS };
})();
