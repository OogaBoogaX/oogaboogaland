// A page's socket to one instance of a server-hosted game (worker/src/game-host.js, `/game/<kind>/<venue>`), opened by
// a game's own code while its player needs it (ghost-entry.js, in the ghost arena or its hallway), only signed in and
// offered the kind (`offers`: /api/me's `games`, net.js `state.games`). `open` returns its link: it reconnects with
// net.js's backoff, lets go of the instance after five minutes hidden and comes back when shown, keeps its own clock
// from the server's stamps (the fastest trip's, as net.js does; `serverNow`, good once `synced`), hands each state
// message to `state` and each motion frame (game-wire.js) to `motion`, read into one frame it keeps, and sends JSON
// text (`send`, false while not open). A kick (`replaced` by a newer tab, the instance `full`) stops it for good and
// says why (`refused`). `close` lets it go.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const BACKOFF_MS = 500, BACKOFF_MAX_MS = 15000, PING_MS = 10000, HIDDEN_PAUSE_MS = 5 * 60000;
  /** Whether this page may follow a game of `kind` on the server: signed in, and the Worker offers it. */
  const offers = (kind) => !!BL.net && !!BL.net.state.me && BL.net.state.games.includes(kind);
  const open = (kind, venue, { state: onState = null, motion: onMotion = null } = {}) => {
    const W = BL.gameWire, frame = W.frame();
    let ws = null, retry = 0, retryTimer = 0, pingTimer = 0, hiddenTimer = 0, stopped = false, offset = 0, synced = false;
    const link = {
      state: "connecting", refused: "", id: 0, heardAt: 0,
      get synced() { return synced; },
      serverNow: () => Date.now() + offset,
      send: (msg) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || link.state !== "live") return false;
        ws.send(JSON.stringify(msg));
        return true;
      },
      close: () => {
        stopped = true;
        clearTimeout(hiddenTimer);
        document.removeEventListener("visibilitychange", onVisibility);
        teardown("closed");
      }
    };
    // The server's clock as this page's plus `offset`: the largest sample is the fastest trip, the least delayed.
    const sample = (serverMs) => {
      const s = serverMs - Date.now();
      if (!synced || s > offset) offset = s;
      synced = true;
    };
    const teardown = (state) => {
      clearTimeout(retryTimer); clearInterval(pingTimer);
      retryTimer = pingTimer = 0;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
        ws = null;
      }
      link.state = state;
    };
    const schedule = () => {
      if (stopped || retryTimer) return;
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 1.7 ** retry++) * (0.75 + Math.random() * 0.5);
      retryTimer = setTimeout(() => { retryTimer = 0; connect(); }, wait);
    };
    const onMessage = (e) => {
      if (typeof e.data !== "string") {
        if (!W.decode(e.data, frame)) return;
        sample(frame.serverMs);
        link.heardAt = Date.now();
        if (onMotion) onMotion(frame);
        return;
      }
      let msg = null;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      if (Number.isFinite(msg.now)) sample(msg.now);
      if (msg.t === "welcome") {
        link.id = Number.isSafeInteger(msg.you) ? msg.you : 0;
        link.state = "live";
        retry = 0;
      } else if (msg.t === "state") {
        link.heardAt = Date.now();
        if (onState) onState(msg);
      } else if (msg.t === "kick") {
        link.refused = typeof msg.reason === "string" ? msg.reason : "closed";
        stopped = true;
        teardown("refused");
      }
    };
    const connect = () => {
      if (stopped || ws) return;
      synced = false;
      link.state = "connecting";
      ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/game/${kind}/${venue}`);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => { pingTimer = setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping"); }, PING_MS); };
      ws.onmessage = onMessage;
      ws.onclose = () => { teardown(stopped ? link.state : "connecting"); schedule(); };
      ws.onerror = () => {};
    };
    // Hidden five minutes, the page lets go of the instance; shown again, it comes back.
    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      hiddenTimer = 0;
      if (document.hidden) {
        hiddenTimer = setTimeout(() => { hiddenTimer = 0; if (!stopped) { teardown("paused"); clearTimeout(retryTimer); retryTimer = 0; } }, HIDDEN_PAUSE_MS);
      } else if (link.state === "paused" && !stopped) connect();
    };
    document.addEventListener("visibilitychange", onVisibility);
    connect();
    return link;
  };

  BL.gameNet = { open, offers };
})();
