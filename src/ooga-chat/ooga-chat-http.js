// Ooga Chat's production adapter: the bootstrap, the session and sign-in through the same origin's server only.
// Every answer passes oogaChatConfig's parsers; a failure becomes an explicit unavailable mode, never mock data.
// The fixture adapter (ooga-chat-fixtures.js) keeps the same interface: `kind`, `bootstrap()`, `session(boot)`,
// `signIn(boot, provider)`, `signOut(boot)`, `audience(boot, { message, status }, chat)`, `commons(boot, { message, status })`,
// `commonsName(display)`, `media(boot, chat)`, `chats(boot)`, `startChat(boot, { title, zone })`, `contributors()`, `dispose()`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { BOOTSTRAP_PATH, PROTOCOLS, parseBootstrap, parseSession, appBuild } = BL.oogaChatConfig;
  const TIMEOUT_MS = 8000;
  // The audience feed's limits: the largest frame read, reconnect backoff, the wait after a full zone, and the wait
  // while listening is off.
  const FRAME_MAX = 1 << 20, BACKOFF_MS = [1000, 30000], FULL_WAIT_MS = 30000, OFF_WAIT_MS = 180000;
  // A socket the page was away from (a phone in another app) can read open long after it died: one silent for
  // SILENT_MS, or the one open as the page comes back (`wake`), is asked for a pong, and with no frame in PROBE_MS is
  // closed here and opened again at once.
  // A network change (`wake(true)`: the connection's type changed, or a voice connection dropped) is asked about
  // sooner, QUICK_PROBE_MS, since the page is awake and a speaker is waiting; a socket still opening on the old network
  // after OPENING_MS is opened afresh.
  const SILENT_MS = 75000, PROBE_MS = 4000, QUICK_PROBE_MS = 2500, OPENING_MS = 4000;
  // The Commons' fixed address (docs/ooga-chat-backend.md) and its heartbeat: the island's Room answers "ping" with
  // "pong" without waking, and closes a member silent past 90 s.
  const COMMONS_PATH = "/api/chat/commons", PING_MS = 30000;
  // The Commons' name, saved as the island's display name (the island's rules: 3 to 24 of these characters).
  const COMMONS_NAME_PATH = "/api/chat/commons/name", NAME_RULE = "Use 3–24 letters A–Z, digits, spaces or _ . , ! ? ' @ # : -";
  // The public panels' data (#664): the island's cast and Oogatron's reading, for anyone, signed in or not.
  const PUBLIC_PATH = "/api/chat/public/contributors";
  // Voice's signalling (#666, #654): `POST <MEDIA_PATH><op>`, a JSON body naming the audience connection, answered JSON
  // or `{ error: { code, retryable } }`. Longer than an ordinary read: the island's SFU calls have their own 5 s each.
  const MEDIA_PATH = "/api/chat/media/", MEDIA_TIMEOUT_MS = 12000;
  const create = ({ fetch = window.fetch.bind(window), location = window.location, doc = document, WebSocket = window.WebSocket } = {}) => {
    const pending = new Set();
    let disposed = false;
    // One bounded request; the controller leaves `pending` however it ends. With `read`, the body is read inside the
    // same bound (a body that stalls after its headers would otherwise never end) and `{ response, data }` comes back,
    // `data` null for a body that cannot be read as asked.
    const ask = async (path, init = {}, timeout = TIMEOUT_MS, read = null) => {
      if (disposed) throw new Error("Ooga Chat adapter disposed");
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      pending.add(controller);
      try {
        const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error", ...init, signal: controller.signal });
        if (!read) return response;
        const data = await read(response).catch((error) => { if (controller.signal.aborted) throw error; return null; });
        return { response, data };
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
    // time (`join`), asked for a fresh snapshot after a gap (`resync`), and asked things with an id (`request`: a
    // reaction or the hand, #668). Frames go to `message` as parsed JSON; the roster
    // checks them. `status` hears connecting, reconnecting, full, signed-out (close 4401: the app checks the session),
    // stale (4426: another protocol revision), closed (4503: listening is off, asked again after about 3 min) and
    // unavailable (no address); a hosted chat's (`chat`) joins without a zone, ending at 4403 or 4404. Reconnects back off from 1 s to 30 s. The edge refuses by accepting a socket and
    // closing it at once, so `open` proves nothing: only a frame from the zone resets the backoff.
    // The audience socket pings as the Commons' does (the Audience answers "pong" without waking): a quiet zone sends
    // nothing for minutes otherwise, and a connection a network or proxy drops on idle would take a speaker's lease.
    const audience = (boot, { message, status }, chat = null) => {
      let socket = null, zone = null, tries = 0, timer = null, closed = false, requests = 0, ping = null, heardAt = 0, probe = null, backing = false, openingAt = 0;
      const idle = { zone() {}, resync() {}, request: () => 0, wake() {}, dispose() {} };
      if (!boot.paths.audience) {
        status("unavailable");
        return idle;
      }
      const send = (data) => socket?.readyState === 1 && socket.send(JSON.stringify(data));
      const join = () => send(chat ? { type: "join", protocol: 2 } : { type: "join", zone, protocol: PROTOCOLS.audience });
      const later = (ms, backoff = false) => { backing = backoff; timer = setTimeout(() => { timer = null; backing = false; open(); }, ms); };
      // A socket that stopped answering: closed here and opened again now, as a reconnect.
      const dead = (own) => {
        if (own !== socket || closed) return;
        socket = null;
        clearInterval(ping);
        clearTimeout(probe);
        ping = probe = null;
        try { own.close(); } catch { /* already closed */ }
        tries++;
        open();
      };
      const check = (own, quick = false) => {
        if (probe) return;
        const at = heardAt;
        own.send("ping");
        probe = setTimeout(() => { probe = null; if (own === socket && heardAt === at) dead(own); }, quick ? QUICK_PROBE_MS : PROBE_MS);
      };
      const open = () => {
        if (closed || !zone) return;
        status(tries ? "reconnecting" : "connecting");
        openingAt = Date.now();
        const own = socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${boot.paths.audience}${chat ? `?chat=${chat}` : ""}`);
        own.addEventListener("open", () => {
          join();
          heardAt = Date.now();
          clearInterval(ping);
          ping = setInterval(() => {
            if (own.readyState !== 1) return;
            if (Date.now() - heardAt > SILENT_MS) check(own);
            else own.send("ping");
          }, PING_MS);
        });
        own.addEventListener("message", (event) => {
          if (own !== socket || typeof event.data !== "string") return;
          heardAt = Date.now();
          if (event.data === "pong" || event.data.length > FRAME_MAX) return;
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          tries = 0;
          message(data);
        });
        own.addEventListener("close", (event) => {
          if (own !== socket || closed) return;
          socket = null;
          clearInterval(ping);
          clearTimeout(probe);
          ping = probe = null;
          if (event.code === 4401) return status("signed-out");
          if (event.code === 4426) return status("stale");
          if (chat && (event.code === 4403 || event.code === 4404)) return status(event.code === 4403 ? "removed" : "ended");
          if (event.code === 4429) {
            status("full");
            return later(FULL_WAIT_MS);
          }
          if (event.code === 4503) {
            status("closed");
            return later(OFF_WAIT_MS * (0.75 + Math.random() * 0.5));
          }
          // Anything else, 1013 (the edge couldn't read the session or reach the island) included, backs off.
          tries++;
          status("reconnecting");
          later(Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * 2 ** Math.min(tries - 1, 5)) * (0.75 + Math.random() * 0.5), true);
        });
      };
      return {
        zone(next) {
          if (next === zone || closed) return;
          zone = next;
          if (socket?.readyState === 1) join();
          else if (!socket && timer === null) open();
        },
        resync: () => send({ type: "resync", zone }),
        // A request the server answers with a `result` of the same id (#668: `reaction`, `hand`): its id, 0 when the
        // socket is not open.
        request: (type, fields) => socket?.readyState === 1 && send({ type, requestId: ++requests, ...fields }) !== false ? requests : 0,
        // The page is back (shown again, or online again), or the network changed under it (`quick`): a reconnect
        // waiting out its backoff goes now, an open socket is asked for a pong, which a dead one never sends, and one
        // that has sat opening since before the change is opened afresh.
        wake(quick = false) {
          if (closed || !zone) return;
          if (!socket) {
            if (timer === null || !backing) return;
            clearTimeout(timer);
            timer = null; backing = false;
            return open();
          }
          if (socket.readyState === 1) check(socket, quick);
          else if (socket.readyState === 0 && Date.now() - openingAt > OPENING_MS) dead(socket);
        },
        dispose() {
          closed = true;
          clearTimeout(timer);
          clearTimeout(probe);
          clearInterval(ping);
          ping = probe = null;
          socket?.close(1000);
          socket = null;
        }
      };
    };
    // The Commons and Online Oogas (#670): one same-origin WebSocket at COMMONS_PATH while the server offers it to an
    // eligible contributor. Frames go to `message` as parsed JSON (ooga-chat-commons.js checks them); `send` hands one
    // line on, false while the socket is not open. `status` hears connecting, reconnecting, signed-out (4401: the app
    // checks the session), refused (4403: not a contributor now; nothing more is asked), full (4429, asked again after
    // 30 s), closed (4503: the Commons is off, asked again after about 3 min) and live (a frame has come). As with the
    // audience, the edge refuses by accepting and closing at once, so only a frame resets the backoff.
    const commons = (boot, { message, status }) => {
      let socket = null, tries = 0, timer = null, ping = null, closed = false, heard = false;
      if (!boot.features.commons) {
        status("closed");
        return { send: () => false, dispose() {} };
      }
      const later = (ms) => { timer = setTimeout(() => { timer = null; open(); }, ms); };
      const open = () => {
        if (closed) return;
        status(tries ? "reconnecting" : "connecting");
        heard = false;
        const own = socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${COMMONS_PATH}`);
        own.addEventListener("open", () => {
          clearInterval(ping);
          ping = setInterval(() => own.readyState === 1 && own.send("ping"), PING_MS);
        });
        own.addEventListener("message", (event) => {
          if (own !== socket || typeof event.data !== "string" || event.data === "pong" || event.data.length > FRAME_MAX) return;
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          tries = 0;
          if (!heard) {
            heard = true;
            status("live");
          }
          message(data);
        });
        own.addEventListener("close", (event) => {
          if (own !== socket || closed) return;
          socket = null;
          clearInterval(ping);
          ping = null;
          if (event.code === 4401) return status("signed-out");
          if (event.code === 4403) return status("refused");
          if (event.code === 4429) {
            status("full");
            return later(FULL_WAIT_MS);
          }
          if (event.code === 4503) {
            status("closed");
            return later(OFF_WAIT_MS * (0.75 + Math.random() * 0.5));
          }
          tries++;
          status("reconnecting");
          later(Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * 2 ** Math.min(tries - 1, 5)) * (0.75 + Math.random() * 0.5));
        });
      };
      open();
      return {
        send: (data) => socket?.readyState === 1 ? (socket.send(JSON.stringify(data)), true) : false,
        dispose() {
          closed = true;
          clearTimeout(timer);
          clearInterval(ping);
          socket?.close(1000);
          socket = null;
        }
      };
    };
    // Voice's broker (ooga-chat-media.js): one bounded POST an operation, a hosted chat's under `?chat=<id>`. A refusal
    // throws with the server's `code` and whether trying again may help; the body never carries anything but the page's
    // own connection and SDP.
    const media = (boot, chat = null) => ({
      async call(op, body) {
        let response, data;
        try {
          ({ response, data } = await ask(`${MEDIA_PATH}${op}${chat ? `?chat=${chat}` : ""}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) }, MEDIA_TIMEOUT_MS, json));
        } catch (error) {
          throw Object.assign(new Error("media unreachable"), { code: disposed ? "disposed" : "unreachable", retryable: !disposed });
        }
        if (response.ok && data && typeof data === "object") return data;
        const error = data && data.error && typeof data.error.code === "string" ? data.error : { code: `http_${response.status}`, retryable: response.status >= 500 };
        throw Object.assign(new Error(error.code), { code: error.code, retryable: !!error.retryable, status: response.status });
      }
    });
    // The public panel data as the server answers it, or null when it can't be read (the view says so, never zeros).
    const contributors = async () => {
      try {
        const { response, data } = await ask(PUBLIC_PATH, { headers: { accept: "application/json" } }, TIMEOUT_MS, json);
        const body = response.ok ? data : null;
        BL.oogaChatPortraits?.apply(body);
        return body;
      } catch {
        return null;
      }
    };
    // The Commons' name field (worker/chat/src/commons.js): the account's island display name, set as the island's own
    // field sets it. `{ ok: true, display }` with the name as the island kept it, or `{ ok: false, error }` in words.
    const commonsName = async (display) => {
      try {
        const response = await ask(COMMONS_NAME_PATH, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ display }) });
        const data = await json(response);
        if (response.ok && data && typeof data.display === "string") return { ok: true, display: data.display };
        return { ok: false, error: response.status === 400 ? NAME_RULE : response.status === 429 ? "Too many saves. Try again in a minute." : "Name could not be saved. Try again." };
      } catch {
        return { ok: false, error: "Name could not be saved. Try again." };
      }
    };
    const dispose = () => {
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
    };
    return { kind: "http", bootstrap, session, signIn, signOut, audience, commons, commonsName, media, ...Object.fromEntries(["chats", "startChat", "chatPreview"].map((n) => [n, (...a) => BL.oogaChatHosts[n](ask, json, ...a)])), contributors, dispose, get pending() { return pending.size; } };
  };
  BL.oogaChatHttp = { create, TIMEOUT_MS, MEDIA_PATH };
})();
