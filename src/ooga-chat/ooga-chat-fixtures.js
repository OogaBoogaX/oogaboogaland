// Ooga Chat's offline fixture adapter, for development and review only. fixture.html loads it; index.html never
// does, and scripts/ooga-chat.mjs refuses an index.html that would, so production cannot fall back to it. It speaks
// the production adapter's interface (ooga-chat-http.js) with canned answers chosen by `?state=` (`STATES`). Each
// account state answers the session as the server would for that account: signed in already, and signing in with
// GitHub again lands on the same kind of account, while X always lands on the X listener, whose handle looks like a
// contributor's and whose answer claims to speak, so a review shows that neither counts. `provider-disabled` turns X
// sign-in off, `expiring` ends its session 20 s after load, and `signout-fails` never confirms a sign-out.
// Accounts are named samples with no picture, never real people.
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
  const create = ({ state = "signed-out", now = () => Date.now() } = {}) => {
    if (!STATES.includes(state)) throw new Error(`Unknown fixture state "${state}" (${STATES.join(", ")})`);
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
    const dispose = () => { disposed = true; };
    return { kind: "fixture", state, bootstrap, session, signIn, signOut, dispose, pending: 0 };
  };
  BL.oogaChatFixtures = { create, STATES };
})();
