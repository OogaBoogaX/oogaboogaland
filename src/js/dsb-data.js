// DSB consumes the page-owned chain after land entry; only minute OHLC history is fetched here.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const CAP = 48;
  // Allow the shared 30s backlog / 60s price cycles room to recover; height polls once a minute.
  const FRESH_MS = 90000, HEIGHT_MS = 180000;
  const validPrice = (n) => Number.isFinite(n) && n > 0 && n < 1e9;
  const create = () => {
    const candles = new Float64Array(CAP * 5);
    const state = { candles, count: CAP, revision: 0, price: 60000, priceStatus: "Demo prices", skyStatus: "Demo sky", backlog: 0.35, fee: 4, height: 0, live: false, lastTickAt: 0, backlogAt: 0, feesAt: 0, heightAt: 0, priceAt: 0, backlogFresh: false, feesFresh: false, heightFresh: false, priceFresh: false, historyStatus: "Demo candles" };
    let controller = null, unsubscribe = null, historyTimer = 0, epoch = 0, disposed = false, lastTick = 0, tickAt = 0, havePrice = false, haveHistory = false;
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
    const fresh = (at, now, limit) => at > 0 && at <= now && now - at < limit;
    // Called by the existing HUD cadence too: an idle or hidden feed must age without a new event.
    const refresh = () => {
      if (!state.live || disposed) return;
      const s = BL.chain?.snapshot, now = Date.now();
      if (s) {
        const observed = (at) => Number.isFinite(at) && at > 0 && at <= now;
        state.backlogAt = observed(s.backlogAt) && Number.isFinite(s.vsize) && s.vsize >= 0 ? s.backlogAt : 0;
        state.feesAt = observed(s.feesAt) && Number.isFinite(s.fastestFee) && s.fastestFee >= 0 ? s.feesAt : 0;
        state.heightAt = observed(s.heightAt) && Number.isInteger(s.height) && s.height > 0 ? s.heightAt : 0;
        state.priceAt = observed(s.priceAt) && validPrice(s.priceUsd) ? s.priceAt : 0;
        if (state.backlogAt) state.backlog = Math.min(1, s.vsize / 1e8);
        if (state.feesAt) state.fee = s.fastestFee;
        if (state.heightAt) state.height = s.height;
        if (state.priceAt) {
          state.price = s.priceUsd; havePrice = true;
          // A notification for height/fees must not fabricate another price candle observation.
          if (haveHistory && state.priceAt > tickAt) {
            ingestTick(s.priceUsd, state.priceAt / 1000); tickAt = state.priceAt;
          }
        }
      } else state.backlogAt = state.feesAt = state.heightAt = state.priceAt = 0;
      state.lastTickAt = state.priceAt;
      state.backlogFresh = fresh(state.backlogAt, now, FRESH_MS);
      state.feesFresh = fresh(state.feesAt, now, FRESH_MS);
      state.heightFresh = fresh(state.heightAt, now, HEIGHT_MS);
      state.priceFresh = fresh(state.priceAt, now, FRESH_MS);
      const label = (at, current) => current ? "live" : at ? "stale" : "unknown";
      state.skyStatus = state.backlogFresh && state.feesFresh && state.heightFresh ? "Live sky · shared chain" : `Shared sky · backlog ${label(state.backlogAt, state.backlogFresh)}, fees ${label(state.feesAt, state.feesFresh)}, height ${label(state.heightAt, state.heightFresh)}`;
      state.priceStatus = state.priceFresh ? `Live BTC-USD · ${s.priceSource || "shared chain"}` : state.priceAt ? "Price feed delayed · last data retained" : havePrice ? "Price freshness unknown · last prices retained" : "Price unavailable · demo prices";
    };
    const disconnect = () => {
      epoch++; clearTimeout(historyTimer); historyTimer = 0;
      if (unsubscribe) unsubscribe(); unsubscribe = null;
      if (controller) controller.abort(); controller = null;
    };
    const start = async () => {
      if (disposed || state.live) return;
      state.live = true;
      const visit = ++epoch;
      if (BL.chain) unsubscribe = BL.chain.subscribe(refresh);
      refresh();
      // Land's candle ride needs real OHLC, not a fabricated history of shared spot prices.
      // One bounded request per activation; retry is an explicit off/on, never background polling.
      state.historyStatus = "Loading minute candles";
      const request = controller = new AbortController(), timeout = historyTimer = setTimeout(() => request.abort(), 10000);
      try {
        const response = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60", { signal: request.signal, credentials: "omit" });
        if (!response.ok) throw new Error("History unavailable");
        const rows = await response.json();
        if (disposed || visit !== epoch || request.signal.aborted) return;
        if (!ingestCandles(rows)) throw new Error("Invalid candles");
        haveHistory = true; tickAt = 0; lastTick = 0;
        state.historyStatus = "Recent BTC-USD minute candles";
        refresh();
      } catch {
        if (!disposed && visit === epoch) state.historyStatus = haveHistory ? "History unavailable · last candles retained" : "History unavailable · demo candles";
      } finally {
        clearTimeout(timeout);
        if (controller === request) { controller = null; historyTimer = 0; }
      }
    };
    const stop = () => {
      disconnect(); state.live = false; havePrice = haveHistory = false; lastTick = tickAt = 0;
      state.lastTickAt = state.backlogAt = state.feesAt = state.heightAt = state.priceAt = 0;
      state.backlogFresh = state.feesFresh = state.heightFresh = state.priceFresh = false;
      state.priceStatus = "Demo prices"; state.skyStatus = "Demo sky"; state.historyStatus = "Demo candles";
      state.backlog = 0.35; state.fee = 4; state.height = 0; demo();
    };
    demo();
    return { state, start, stop, refresh, ingestCandles, ingestTick, dispose: () => { disposed = true; state.live = false; disconnect(); } };
  };
  BL.dsbData = { create, CAP };
})();
