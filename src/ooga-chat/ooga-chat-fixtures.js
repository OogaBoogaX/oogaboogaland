// Ooga Chat's offline fixture adapter, for development and review only. fixture.html loads it; index.html never
// does, and scripts/ooga-chat.mjs refuses an index.html that would, so production cannot fall back to it. It speaks
// the production adapter's interface (ooga-chat-http.js) with canned answers chosen by `?state=`: signed-out,
// listener (an X account), contributor (a GitHub contributor who may speak), demo-payment (feed answered in demo
// mode) and unavailable. Accounts are named samples with no avatar, never real people.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_VERSION, PROTOCOLS, parseBootstrap, parseSession } = BL.oogaChatConfig;
  const STATES = ["signed-out", "listener", "contributor", "demo-payment", "unavailable"];
  const protocols = Object.fromEntries(Object.entries(PROTOCOLS).map(([name, version]) => [name, [version]]));
  const answer = (feed) => ({ version: BOOTSTRAP_VERSION, protocols,
    features: { github: true, x: true, voice: false, feed },
    paths: { session: "/fixture/session", logout: "/fixture/logout", login: { github: "/fixture/login/github", x: "/fixture/login/x" } } });
  const ACCOUNTS = {
    listener: { identity: { provider: "x", login: "sample_listener", display: "sample listener" }, capabilities: {} },
    contributor: { identity: { provider: "github", login: "sample-contributor", display: "sample-contributor" }, capabilities: { speak: true, contributor: true } }
  };
  const create = ({ state = "signed-out" } = {}) => {
    if (!STATES.includes(state)) throw new Error(`Unknown fixture state "${state}" (${STATES.join(", ")})`);
    let account = state === "listener" || state === "contributor" ? ACCOUNTS[state] : null, disposed = false;
    const bootstrap = async () => state === "unavailable" ? { ok: false, mode: "unavailable", reason: "fixture" }
      : parseBootstrap(answer(state === "demo-payment" ? "demo" : false), null, { fixture: true });
    const session = async () => disposed ? null : account && parseSession(account);
    // Signing in picks the sample account for that provider; a GitHub sample may speak, an X one only listens.
    const signIn = (boot, provider) => {
      account = provider === "github" ? ACCOUNTS.contributor : ACCOUNTS.listener;
      return parseSession(account);
    };
    const signOut = async () => (account = null);
    const dispose = () => { disposed = true; };
    return { kind: "fixture", state, bootstrap, session, signIn, signOut, dispose, pending: 0 };
  };
  BL.oogaChatFixtures = { create, STATES };
})();
