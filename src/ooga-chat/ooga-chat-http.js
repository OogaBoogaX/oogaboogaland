// Ooga Chat's production adapter: the bootstrap, the session and sign-in through the same origin's server only.
// Every answer passes oogaChatConfig's parsers; a failure becomes an explicit unavailable mode, never mock data.
// The fixture adapter (ooga-chat-fixtures.js) keeps the same interface: `kind`, `bootstrap()`, `session(boot)`,
// `signIn(boot, provider)`, `signOut(boot)`, `audience(boot, { message, status })`, `dispose()`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_PATH, PROTOCOLS, parseBootstrap, parseSession, appBuild } = BL.oogaChatConfig;
  const TIMEOUT_MS = 8000;
  // The audience feed's limits: the largest frame read, reconnect backoff, and the wait after a full zone.
  const FRAME_MAX = 1 << 20, BACKOFF_MS = [1000, 30000], FULL_WAIT_MS = 30000;
  const create = ({ fetch = window.fetch.bind(window), location = window.location, doc = document, WebSocket = window.WebSocket } = {}) => {
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
    // The audience feed (audience protocol 1): one same-origin WebSocket at `paths.audience`, joined to one zone at a
    // time (`join`), asked for a fresh snapshot after a gap (`resync`). Frames go to `message` as parsed JSON; the roster
    // checks them. `status` hears connecting, reconnecting, full, signed-out (close 4401: the app checks the session),
    // stale (4426: another protocol revision) and unavailable (no address). Reconnects back off from 1 s to 30 s.
    const audience = (boot, { message, status }) => {
      let socket = null, zone = null, tries = 0, timer = null, closed = false;
      const idle = { zone() {}, resync() {}, dispose() {} };
      if (!boot.paths.audience) {
        status("unavailable");
        return idle;
      }
      const send = (data) => socket?.readyState === 1 && socket.send(JSON.stringify(data));
      const later = (ms) => { timer = setTimeout(() => { timer = null; open(); }, ms); };
      const open = () => {
        if (closed || !zone) return;
        status(tries ? "reconnecting" : "connecting");
        const own = socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${boot.paths.audience}`);
        own.addEventListener("open", () => {
          tries = 0;
          send({ type: "join", zone, protocol: PROTOCOLS.audience });
        });
        own.addEventListener("message", (event) => {
          if (own !== socket || typeof event.data !== "string" || event.data.length > FRAME_MAX) return;
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          message(data);
        });
        own.addEventListener("close", (event) => {
          if (own !== socket || closed) return;
          socket = null;
          if (event.code === 4401) return status("signed-out");
          if (event.code === 4426) return status("stale");
          if (event.code === 4429) {
            status("full");
            return later(FULL_WAIT_MS);
          }
          tries++;
          status("reconnecting");
          later(Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * 2 ** Math.min(tries - 1, 5)) * (0.75 + Math.random() * 0.5));
        });
      };
      return {
        zone(next) {
          if (next === zone || closed) return;
          zone = next;
          if (socket?.readyState === 1) send({ type: "join", zone, protocol: PROTOCOLS.audience });
          else if (!socket && timer === null) open();
        },
        resync: () => send({ type: "resync", zone }),
        dispose() {
          closed = true;
          clearTimeout(timer);
          socket?.close(1000);
          socket = null;
        }
      };
    };
    const dispose = () => {
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
    };
    return { kind: "http", bootstrap, session, signIn, signOut, audience, dispose, get pending() { return pending.size; } };
  };
  BL.oogaChatHttp = { create, TIMEOUT_MS };
})();
