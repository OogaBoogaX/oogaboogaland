// Ooga Chat's production adapter: the bootstrap, the session and sign-in through the same origin's server only.
// Every answer passes oogaChatConfig's parsers; a failure becomes an explicit unavailable mode, never mock data.
// The fixture adapter (ooga-chat-fixtures.js) keeps the same interface: `kind`, `bootstrap()`, `session(boot)`,
// `signIn(boot, provider)`, `signOut(boot)`, `dispose()`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_PATH, parseBootstrap, parseSession, appBuild } = BL.oogaChatConfig;
  const TIMEOUT_MS = 8000;
  const create = ({ fetch = window.fetch.bind(window), location = window.location, doc = document } = {}) => {
    const pending = new Set();
    let disposed = false;
    // One bounded request; the controller leaves `pending` however it ends.
    const ask = async (path, init = {}) => {
      if (disposed) throw new Error("Ooga Chat adapter disposed");
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      pending.add(controller);
      try {
        return await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error", ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
        pending.delete(controller);
      }
    };
    const json = async (response) => /^application\/json\b/.test(response.headers.get("content-type") || "") ? response.json() : null;
    const bootstrap = async () => {
      try {
        const response = await ask(BOOTSTRAP_PATH, { headers: { accept: "application/json" } });
        if (!response.ok) return { ok: false, mode: "unavailable", reason: `bootstrap ${response.status}` };
        return parseBootstrap(await json(response), appBuild(doc));
      } catch (error) {
        return { ok: false, mode: "unavailable", reason: disposed ? "disposed" : error.name === "AbortError" ? "bootstrap timed out" : "bootstrap unreachable" };
      }
    };
    // Signed out (401 or no session address) is null; any other failure throws for the app's recoverable error.
    const session = async (boot) => {
      if (!boot.paths.session) return null;
      const response = await ask(boot.paths.session, { headers: { accept: "application/json" } });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(`session ${response.status}`);
      return parseSession(await json(response));
    };
    // Sign-in is a top-level navigation to the server's provider path; the server owns OAuth and its return.
    const signIn = (boot, provider) => {
      const path = boot.paths.login[provider];
      if (!path) throw new Error(`No sign-in for ${provider}`);
      location.assign(path);
    };
    // Throws unless the server confirms, so the app can say so and offer a retry (it has already stopped capture).
    const signOut = async (boot) => {
      if (!boot.paths.logout) throw new Error("No sign-out address");
      const response = await ask(boot.paths.logout, { method: "POST" });
      if (!response.ok) throw new Error(`logout ${response.status}`);
      return null;
    };
    const dispose = () => {
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
    };
    return { kind: "http", bootstrap, session, signIn, signOut, dispose, get pending() { return pending.size; } };
  };
  BL.oogaChatHttp = { create, TIMEOUT_MS };
})();
