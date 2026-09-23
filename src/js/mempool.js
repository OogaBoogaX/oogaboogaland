// Live Bitcoin feed from mempool.space: one socket for the page life, reconnecting with backoff.
// Subscribers get plain events, { type: "tx", vsize, weight, fee } for each transaction the
// mempool accepts, { type: "block", height, txCount } for each block mined after connect and
// { type: "fees", nextFee, blocks } whenever the projected next block's median fee moves.
// One of the page's two live feeds (the other polls the oogatron worker in oogatron-live.js).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ENDPOINT = "wss://mempool.space/api/v1/ws";
  const BACKOFF_MIN = 2000, BACKOFF_MAX = 60000;
  const subscribers = new Set();
  const state = { enabled: false, connected: false, attempts: 0, transactions: 0, blocks: 0, height: 0, nextFee: 0, projectedBlocks: 0, messages: 0, bytes: 0, lastKeys: "", lastAt: 0 };
  let socket = null, timer = 0, backoff = BACKOFF_MIN;

  const emit = (event) => {
    if (event.type === "tx") state.transactions++;
    else if (event.type === "block") state.blocks++;
    for (const fn of subscribers) fn(event);
  };
  const block = (b) => {
    if (!b || !(b.height > state.height)) return;
    state.height = b.height;
    emit({ type: "block", height: b.height, txCount: b.tx_count || 0 });
  };
  const onMessage = (text) => {
    state.messages++;
    state.bytes += text.length;
    state.lastAt = Date.now();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    state.lastKeys = Object.keys(data).join(", ");
    // The tip list arrives once per connection and only seeds the height; a later, taller one is news.
    if (Array.isArray(data.blocks)) {
      let top = 0;
      for (const b of data.blocks) if (b && b.height > top) top = b.height;
      if (state.height === 0) state.height = top;
      else if (top > state.height) block({ height: top });
    }
    if (data.block) block(data.block);
    // The projection is the fee pressure: the next block's median sat/vB, zero for an empty mempool.
    const projected = data["mempool-blocks"];
    if (Array.isArray(projected)) {
      const first = projected[0];
      state.nextFee = first && first.medianFee > 0 ? first.medianFee : 0;
      state.projectedBlocks = projected.length;
      emit({ type: "fees", nextFee: state.nextFee, blocks: projected.length });
    }
    const txs = data["mempool-transactions"];
    if (txs && Array.isArray(txs.added)) {
      for (const tx of txs.added) {
        if (!tx || !(tx.vsize > 0)) continue;
        emit({ type: "tx", vsize: tx.vsize, weight: tx.weight || tx.vsize * 4, fee: tx.fee || 0 });
      }
    }
  };
  const retry = () => {
    if (state.enabled && !timer) {
      timer = window.setTimeout(connect, backoff);
      backoff = Math.min(BACKOFF_MAX, backoff * 2);
    }
  };
  const connect = () => {
    timer = 0;
    if (!state.enabled || socket) return;
    state.attempts++;
    let ws;
    try {
      ws = new WebSocket(ENDPOINT);
    } catch {
      retry();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      state.connected = true;
      backoff = BACKOFF_MIN;
      ws.send(JSON.stringify({ action: "want", data: ["blocks", "mempool-blocks"] }));
      ws.send(JSON.stringify({ "track-mempool": true }));
    };
    ws.onmessage = (e) => onMessage(e.data);
    ws.onclose = () => {
      if (socket === ws) socket = null;
      state.connected = false;
      retry();
    };
    ws.onerror = () => {};
  };
  const start = () => {
    if (state.enabled || typeof WebSocket === "undefined") return;
    state.enabled = true;
    connect();
  };
  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const dispose = () => {
    state.enabled = false;
    window.clearTimeout(timer);
    timer = 0;
    if (socket) {
      const ws = socket;
      socket = null;
      ws.onclose = null;
      ws.close();
    }
    state.connected = false;
    subscribers.clear();
  };
  BL.mempool = { ENDPOINT, state, start, subscribe, dispose, emit, parse: onMessage };
})();
