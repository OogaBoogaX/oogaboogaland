// Bounded public-data adapter. The DSB scene starts feeds on entry and disposes them on exit.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const CAP = 48;
  const validPrice = (n) => Number.isFinite(n) && n > 0 && n < 1e9;
  const create = () => {
    const candles = new Float64Array(CAP * 5);
    const state = { candles, count: CAP, revision: 0, price: 60000, priceStatus: "Demo prices", skyStatus: "Demo sky", backlog: 0.35, fee: 4, height: 0, live: false, lastTickAt: 0 };
    let controller = null, socket = null, timer = 0, reconnect = 0, epoch = 0, disposed = false, lastTick = 0, havePrice = false, haveSky = false;
    const demo = () => {
      for (let i = 0; i < CAP; i++) {
        const o = i * 5, p = 60000 + Math.sin(i * 0.35) * 900 + Math.cos(i * 0.81) * 260;
        candles[o] = i * 60; candles[o + 1] = p - 110; candles[o + 2] = p + 180; candles[o + 3] = i ? candles[o - 1] : p; candles[o + 4] = p;
      }
      state.price = candles[(CAP - 1) * 5 + 4]; state.count = CAP; state.revision++;
    };
    const ingestCandles = (rows) => {
      if (!Array.isArray(rows) || rows.length < 2 || rows.length > 300) return false;
      const sorted = rows.filter((r) => Array.isArray(r) && r.length >= 5 && Number.isFinite(r[0]) && r[0] > 0 && r.slice(1, 5).every(validPrice) && r[1] <= Math.min(r[3], r[4]) && r[2] >= Math.max(r[3], r[4])).sort((a, b) => a[0] - b[0]);
      if (sorted.length < 2 || sorted.some((r, i) => i && r[0] <= sorted[i - 1][0])) return false;
      state.count = Math.min(CAP, sorted.length);
      for (let i = 0; i < state.count; i++) for (let j = 0; j < 5; j++) candles[i * 5 + j] = sorted[sorted.length - state.count + i][j];
      state.price = candles[(state.count - 1) * 5 + 4]; havePrice = true; state.revision++; return true;
    };
    const ingestTick = (price, time) => {
      if (!validPrice(price) || !Number.isFinite(time) || time <= 0 || time < lastTick) return false;
      const minute = Math.floor(time / 60) * 60, prev = (state.count - 1) * 5;
      if (minute < candles[prev]) return false;
      lastTick = time;
      if (minute > candles[prev]) {
        if (state.count === CAP) candles.copyWithin(0, 5); else state.count++;
        const o = (state.count - 1) * 5;
        candles[o] = minute; candles[o + 1] = candles[o + 2] = candles[o + 3] = candles[o + 4] = price;
      } else {
        candles[prev + 1] = Math.min(candles[prev + 1], price); candles[prev + 2] = Math.max(candles[prev + 2], price); candles[prev + 4] = price;
      }
      state.price = price; havePrice = true; state.revision++; return true;
    };
    const disconnect = () => {
      epoch++; clearTimeout(timer); clearTimeout(reconnect);
      if (controller) controller.abort(); controller = null;
      if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); socket = null; }
    };
    const connectTicker = (visit) => {
      if (disposed || !state.live || visit !== epoch) return;
      socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      socket.onopen = () => socket.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] }));
      socket.onmessage = (event) => {
        if (visit !== epoch) return;
        try {
          if (event.data.length > 65536) return;
          const message = JSON.parse(event.data);
          if (message.type === "ticker" && message.product_id === "BTC-USD" && ingestTick(Number(message.price), Date.parse(message.time) / 1000)) { state.priceStatus = "Live BTC-USD · Coinbase"; state.lastTickAt = Date.now(); }
        } catch { state.priceStatus = "Price feed unavailable"; }
      };
      socket.onerror = () => { state.priceStatus = "Price feed unavailable · last data retained"; };
      socket.onclose = () => {
        socket = null;
        if (!disposed && state.live && visit === epoch) { state.priceStatus = "Reconnecting · last data retained"; reconnect = setTimeout(() => connectTicker(visit), 15000); }
      };
    };
    const start = async () => {
      disconnect(); state.live = true; state.lastTickAt = 0; lastTick = 0;
      const visit = epoch; controller = new AbortController(); const signal = controller.signal;
      state.priceStatus = havePrice ? "Connecting · last prices retained" : "Connecting · demo prices until connected"; state.skyStatus = haveSky ? "Connecting · last sky retained" : "Connecting · demo sky until connected";
      const json = async (url) => {
        const request = new AbortController(), abort = () => request.abort(), timeout = setTimeout(abort, 10000);
        signal.addEventListener("abort", abort, { once: true });
        try { const response = await fetch(url, { signal: request.signal, credentials: "omit" }); if (!response.ok) throw new Error("Feed unavailable"); return await response.json(); }
        finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
      };
      const sky = async () => {
        try {
          const [mempool, fees, height] = await Promise.all([json("https://mempool.space/api/mempool"), json("https://mempool.space/api/v1/fees/recommended"), json("https://mempool.space/api/blocks/tip/height")]);
          if (disposed || visit !== epoch) return;
          if (!Number.isFinite(mempool.vsize) || mempool.vsize < 0 || !Number.isFinite(fees.fastestFee) || fees.fastestFee < 0 || !Number.isInteger(height) || height <= 0) throw new Error("Invalid sky data");
          state.backlog = Math.min(1, mempool.vsize / 1e8); state.fee = fees.fastestFee; state.height = height; haveSky = true; state.skyStatus = "Live sky · mempool.space";
        } catch { if (visit === epoch) state.skyStatus = haveSky ? "Sky offline · last display retained" : "Sky offline · demo sky"; }
        if (!disposed && state.live && visit === epoch) timer = setTimeout(sky, 30000);
      };
      sky();
      const prices = async () => {
        try {
          const rows = await json("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60");
          if (disposed || visit !== epoch) return;
          if (!ingestCandles(rows)) throw new Error("Invalid candles");
          state.priceStatus = "Recent BTC-USD · connecting live feed"; connectTicker(visit);
        } catch {
          if (!disposed && state.live && visit === epoch) {
            state.priceStatus = havePrice ? "Price feed offline · last prices retained" : "Price feed offline · demo prices";
            reconnect = setTimeout(prices, 15000);
          }
        }
      };
      await prices();
    };
    const stop = () => { disconnect(); state.live = false; havePrice = haveSky = false; state.priceStatus = "Demo prices"; state.skyStatus = "Demo sky"; state.backlog = 0.35; state.fee = 4; state.height = 0; demo(); };
    demo();
    return { state, start, stop, ingestCandles, ingestTick, dispose: () => { disposed = true; state.live = false; disconnect(); } };
  };
  BL.dsbData = { create, CAP };
})();
