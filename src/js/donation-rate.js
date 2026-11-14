// Live estimates only. The server independently prices each full receipt; the browser never
// submits a price. One socket is shared by open kiosks and the Bananas panel, and closed when
// hidden or unused: Coinbase Exchange's BTC-USD `ticker_batch`, the price chain.js reads too, and
// 2140data's weighted price only while Coinbase is not delivering.
(() => {
  "use strict";
  const BL = window.BL;
  const STALL = 30000, RETRY_MAX = 30000;
  // Coinbase drops a socket not subscribed within five seconds and then pushes a ticker every five
  // seconds while BTC-USD trades; a refused subscription leaves the socket open, so an error or an
  // empty channel list counts as a failure. 2140data pushes its price unasked, once a second.
  const SOURCES = [
    { name: "coinbase", url: "wss://ws-feed.exchange.coinbase.com",
      hello: JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker_batch"] }),
      refused: (data) => data.type === "error" || data.type === "subscriptions" && !(Array.isArray(data.channels) && data.channels.length),
      read: (data) => data.type === "ticker" && data.product_id === "BTC-USD" ? data.price : null },
    { name: "2140data", url: "wss://2140data.io/", hello: null, refused: () => false, read: (data) => data.weightedPrice }
  ];
  let users = 0, socket = null, source = 0, heard = false, retry = 0, watchTimer = 0, backoff = 1000, rate = null, off = false;
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const drop = (immediate = false) => {
    window.clearTimeout(watchTimer); watchTimer = 0;
    if (rate && !rate.stale) { rate.stale = true; emit(); }
    if (!socket) return;
    // Closing during the handshake makes Chrome report a failed connection. Keep
    // one pending socket for a returning watcher, or close it as soon as it opens.
    if (!immediate && socket.readyState === 0) return;
    const ws = socket; socket = null;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* The connection may still be opening. */ }
  };
  // Coinbase is asked again after a drop once it has delivered. Otherwise a failed source hands
  // over to the next at once, and the last back to Coinbase after a wait.
  const reconnect = () => {
    drop(true);
    if (!users || document.hidden || retry) return;
    if (source || !heard) source = (source + 1) % SOURCES.length;
    if (source) return connect();
    retry = window.setTimeout(connect, backoff);
    backoff = Math.min(RETRY_MAX, backoff * 2);
  };
  const watchdog = () => {
    window.clearTimeout(watchTimer);
    watchTimer = window.setTimeout(reconnect, STALL);
  };
  const connect = () => {
    retry = 0;
    if (off || !users || document.hidden || typeof WebSocket === "undefined") return;
    if (socket) { watchdog(); return; }
    const from = SOURCES[source];
    heard = false;
    try { socket = new WebSocket(from.url); } catch { return reconnect(); }
    const ws = socket;
    watchdog();
    ws.onopen = () => {
      if (socket !== ws) return;
      if (!users || document.hidden) drop();
      else if (from.hello) ws.send(from.hello);
    };
    ws.onmessage = (event) => {
      if (socket !== ws || !users || document.hidden || typeof event.data !== "string" || event.data.length > 8192) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || typeof data !== "object") return;
      if (from.refused(data)) return reconnect();
      const text = String(from.read(data) ?? "");
      if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(text)) return;
      const cents = Math.round(Number(text) * 100);
      if (!(cents > 0)) return;
      rate = { usdPerBtc: cents / 100, satsPerBanana: 1e10 / cents, at: Date.now(), stale: false, live: true, source: from.name };
      heard = true;
      backoff = 1000;
      watchdog();
      emit();
    };
    ws.onclose = ws.onerror = reconnect;
  };
  // A socket still pending keeps its source; a fresh one starts with Coinbase again.
  const visibility = () => {
    window.clearTimeout(retry); retry = 0;
    if (document.hidden) drop();
    else {
      if (!socket) source = 0;
      connect();
    }
  };
  const watch = (onRate) => {
    const listener = typeof onRate === "function" ? () => onRate(rate) : null;
    if (listener) listeners.add(listener);
    if (++users === 1) {
      document.addEventListener("visibilitychange", visibility);
      if (!socket) source = 0;
      connect();
    }
    if (listener) listener();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (listener) listeners.delete(listener);
      if (--users) return;
      document.removeEventListener("visibilitychange", visibility);
      window.clearTimeout(retry); retry = 0;
      drop();
    };
  };
  // Like the page's other live feeds it stays off under `nosim` (the suite) and `rate=0` (director.js `stop`).
  const stop = () => { off = true; window.clearTimeout(retry); retry = 0; drop(true); };
  BL.donationRate = { watch, stop, get current() { return rate; } };
})();
