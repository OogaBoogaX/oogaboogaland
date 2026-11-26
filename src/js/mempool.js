// Live Bitcoin feed from mempool.space: one socket while the tab is visible, reconnecting with backoff.
// Subscribers get plain events, { type: "block", height, txCount } for each block mined after connect,
// { type: "fees", nextFee, blocks } with each mempool-blocks projection (the projected next block's
// median fee) and
// { type: "stats", count, vsize, totalFee, inflow, fees, da } with each mempool push (about once a
// second): the transaction count, the backlog in vB, its fees in sats, the inflow in vB/s, the
// recommended fee tiers and the difficulty epoch, in the shapes the REST endpoints serve them.
// One of the page's live feeds (chain.js polls REST and the price, oogatron-live.js the org stats).
//
// While a place shows the next block's own transactions (`track(true)`, the Genesis Museum's ceiling), the socket
// also tracks projected block 0 (`track-mempool-block`): a snapshot of its transactions on each connect and each
// block, about 335 KB, then deltas of a few KB a second, kept in `state.next` (txid → [fee rate, vsize]) and told
// with { type: "next" }; `track(false)` stops it. `state.projected` is the latest mempool-blocks projection.
// The socket `want`s blocks, stats and mempool-blocks, never `track-mempool`, which streams every
// transaction at ~225 MB an hour. The tip list on connect only seeds the height; `total_fee` arrives
// in BTC and leaves in sats. Backoff resets on the first message, not on open, and a link silent for
// STALL_MS is dropped and redialled. `setHidden` (the director's visibility pause) closes the socket
// while the tab is hidden and forgets the height, so the tip list on return seeds it silently rather
// than striking, toasting or paying the mine for blocks found while away. Exports start, setHidden,
// subscribe, track, dispose, parse, emit and state (with nextFee, projectedBlocks, projected, next and inflow); the director
// leaves it off under `nosim` and `mempool=0`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ENDPOINT = "wss://mempool.space/api/v1/ws";
  const BACKOFF_MIN = 2000, BACKOFF_MAX = 60000;
  // The socket pushes about once a second and never goes quiet for long, even round a block; a link
  // that has said nothing for this long is half-open and is dropped rather than trusted.
  const STALL_MS = 20000;
  const subscribers = new Set();
  const state = { enabled: false, hidden: false, connected: false, attempts: 0, stats: 0, blocks: 0, height: 0, tipHash: "", nextFee: 0, projectedBlocks: 0, inflow: 0, messages: 0, bytes: 0, lastKeys: "", lastAt: 0,
    projected: null, tracking: false, next: new Map(), nextSeq: -1, nextRev: 0 };
  let socket = null, timer = 0, watch = 0, backoff = BACKOFF_MIN;

  const emit = (event) => {
    if (event.type === "stats") state.stats++;
    else if (event.type === "block") state.blocks++;
    for (const fn of subscribers) fn(event);
  };
  const hashOf = b => typeof b.id === "string" && /^[0-9a-f]{64}$/.test(b.id) ? b.id : "";
  const block = (b) => {
    if (b && b.height === state.height && hashOf(b)) state.tipHash = b.id;
    if (!b || !(b.height > state.height)) return;
    state.height = b.height;
    state.tipHash = hashOf(b);
    emit({ type: "block", height: b.height, txCount: b.tx_count || 0 });
  };
  // One of the next block's transactions, [txid, fee, vsize, value, rate, flags, ...]: its effective fee rate and vsize.
  const putNext = (t) => { if (Array.isArray(t) && typeof t[0] === "string" && t[2] > 0) state.next.set(t[0], [Number(t[4]) > 0 ? Number(t[4]) : t[1] / t[2], t[2]]); };
  const askNext = () => { if (socket && state.connected) socket.send(JSON.stringify({ "track-mempool-block": state.tracking ? 0 : -1 })); };
  const track = (on) => {
    on = !!on;
    if (state.tracking === on) return;
    state.tracking = on; state.nextSeq = -1;
    if (!on) { state.next.clear(); state.nextRev++; }
    askNext();
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
    // A server that accepts and then drops the link must not be redialled every two seconds, so the
    // backoff only resets once the socket has actually said something.
    backoff = BACKOFF_MIN;
    state.lastKeys = Object.keys(data).join(", ");
    // The tip list arrives once per connection and only seeds the height; a later, taller one is news.
    if (Array.isArray(data.blocks)) {
      let top = null;
      for (const b of data.blocks) if (b && b.height > (top ? top.height : 0)) top = b;
      if (top && state.height === 0) { state.height = top.height; state.tipHash = hashOf(top); }
      else if (top) block(top);
    }
    if (data.block) block(data.block);
    // The projection is the fee pressure: the next block's median sat/vB, zero for an empty mempool.
    const projected = data["mempool-blocks"];
    if (Array.isArray(projected)) {
      const first = projected[0];
      state.nextFee = first && first.medianFee > 0 ? first.medianFee : 0;
      state.projectedBlocks = projected.length;
      state.projected = projected;
      emit({ type: "fees", nextFee: state.nextFee, blocks: projected.length });
    }
    // The next block's transactions: a whole snapshot, or a delta on the last one; a delta out of sequence asks
    // for a fresh snapshot.
    const pb = data["projected-block-transactions"];
    if (pb && pb.index === 0 && state.tracking) {
      if (Array.isArray(pb.blockTransactions)) { state.next.clear(); for (const t of pb.blockTransactions) putNext(t); state.nextSeq = pb.sequence; }
      else if (pb.delta && pb.sequence === state.nextSeq + 1) {
        const d = pb.delta;
        if (Array.isArray(d.removed)) for (const id of d.removed) state.next.delete(id);
        if (Array.isArray(d.added)) for (const t of d.added) putNext(t);
        if (Array.isArray(d.changed)) for (const c of d.changed) { const x = Array.isArray(c) && state.next.get(c[0]); if (x && Number(c[1]) > 0) x[0] = Number(c[1]); }
        state.nextSeq = pb.sequence;
      } else if (pb.delta) askNext();
      state.nextRev++;
      emit({ type: "next", count: state.next.size });
    }
    // The socket's `total_fee` is in BTC where REST `/mempool` gives sats; `bytes` is the vsize.
    const info = data.mempoolInfo;
    if (info && typeof info.size === "number" && typeof info.bytes === "number") {
      const inflow = Number(data.vBytesPerSecond);
      state.inflow = inflow >= 0 ? inflow : 0;
      emit({
        type: "stats", count: info.size, vsize: info.bytes, totalFee: Math.round((Number(info.total_fee) || 0) * 1e8),
        // A bounded sample already included in stats; its value is total outputs in satoshis.
        recent: Array.isArray(data.transactions) ? data.transactions.slice(0,10) : null,
        inflow: state.inflow, fees: data.fees && typeof data.fees === "object" ? data.fees : null, da: data.da && typeof data.da === "object" ? data.da : null
      });
    }
  };
  const retry = () => {
    if (state.enabled && !state.hidden && !timer) {
      timer = window.setTimeout(connect, backoff);
      backoff = Math.min(BACKOFF_MAX, backoff * 2);
    }
  };
  // Detaches before closing, so a deliberate close never reaches onclose and its retry.
  const drop = () => {
    window.clearTimeout(watch);
    watch = 0;
    if (!socket) return;
    const ws = socket;
    socket = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
    state.connected = false;
  };
  const check = () => {
    watch = 0;
    if (!socket) return;
    if (Date.now() - state.lastAt > STALL_MS) {
      drop();
      retry();
    } else watch = window.setTimeout(check, STALL_MS / 2);
  };
  const connect = () => {
    timer = 0;
    if (!state.enabled || state.hidden || socket) return;
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
      state.lastAt = Date.now();
      ws.send(JSON.stringify({ action: "want", data: ["blocks", "stats", "mempool-blocks"] }));
      if (state.tracking) ws.send(JSON.stringify({ "track-mempool-block": 0 }));
      watch = window.setTimeout(check, STALL_MS / 2);
    };
    ws.onmessage = (e) => onMessage(e.data);
    ws.onclose = () => {
      if (socket === ws) socket = null;
      window.clearTimeout(watch);
      watch = 0;
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
  // The director's visibility pause: a hidden tab holds no socket. The height is forgotten so the tip
  // list on the way back seeds it silently; blocks mined while away are not news, and must not strike,
  // toast or pay the mine as if they had just been found.
  const setHidden = (hidden) => {
    if (state.hidden === !!hidden) return;
    state.hidden = !!hidden;
    if (!state.enabled) return;
    window.clearTimeout(timer);
    timer = 0;
    if (state.hidden) {
      drop();
      return;
    }
    state.height = 0;
    state.tipHash = "";
    backoff = BACKOFF_MIN;
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
    drop();
    subscribers.clear();
  };
  BL.mempool = { ENDPOINT, state, start, setHidden, subscribe, dispose, emit, track, parse: onMessage };
})();
