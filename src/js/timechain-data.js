// Public Timechain Index readings; each endpoint owns its refresh and backoff.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const BASE = "https://api.timechainindex.com/OogaBooga/";
  const ENDPOINTS = ["bitcoin_distribution", "addresses_distribution", "utxos_distribution", "etf_history", "cex_history", "top10holders"];
  const SOURCES = ["https://timechainindex.com/bitcoindistribution", "https://timechainindex.com/addcounttovaluebar", "https://timechainindex.com/?resource=utxocounttovaluebar", "https://timechainindex.com/tagsoverviewver", "https://timechainindex.com/tagsoverviewver", "https://timechainindex.com/holdingsbyentityver"];
  const TITLES = ["BITCOIN DISTRIBUTION", "ADDRESS BALANCES (BTC)", "UTXO SIZES (BTC)", "ETF/ETP HOLDINGS", "EXCHANGE HOLDINGS", "TOP 10 HOLDERS"];
  const number = v => {
    if (typeof v !== "number" && (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v))) throw new Error("Invalid number");
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error("Invalid number");
    return n;
  };
  const positive = v => { const n = number(v); if (n < 0) throw new Error("Negative balance"); return n; };
  const label = v => { if (typeof v !== "string" || !v.trim() || v.length > 160) throw new Error("Invalid label"); return v; };
  const fmt = n => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const signed = n => (n > 0 ? "+" : "") + fmt(n);
  const date = v => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error("Invalid date");
    return v;
  };
  const stampDate = stamp => date(stamp.slice(0, 4) + "-" + stamp.slice(4, 6) + "-" + stamp.slice(6, 8));
  const snapshotLabel = (day, height) => [day, height === null ? "" : "BLOCK " + height].filter(Boolean).join(" / ");
  const parse = (index, rows) => {
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error("Invalid response");
    let snapshotDate = "", blockHeight = null;
    for (const row of rows) {
      if (row.blocktime != null) {
        const day = date(row.blocktime);
        if (snapshotDate && day !== snapshotDate) throw new Error("Mixed dates");
        snapshotDate = day;
      }
      if (row.blockheight != null) {
        const height = positive(row.blockheight);
        if (!Number.isSafeInteger(height) || blockHeight !== null && height !== blockHeight) throw new Error("Mixed blocks");
        blockHeight = height;
      }
    }
    let lines = [], bars = [], table = [], asof = "", note = "";
    if (index === 0) {
      const items = rows.map(r => ({ name: label(r.tag), value: positive(r.total) })).sort((a, b) => b.value - a.value);
      const mined = items.filter(r => r.name !== "To Be Mined"), total = mined.reduce((s, r) => s + r.value, 0);
      if (!total) throw new Error("Empty supply");
      const detail = mined.map(r => r.name + ": " + fmt(r.value) + " BTC (" + (r.value / total * 100).toFixed(1) + "%)");
      lines = [fmt(total) + " BTC CLASSIFIED", ...mined.slice(0, 5).map(r => r.name + " " + (r.value / total * 100).toFixed(1) + "%")];
      bars = mined.map(r => r.value);
      table = ["CATEGORY                  BTC       SHARE", ...mined.map(r => r.name.padEnd(22) + fmt(r.value).padStart(13) + "  " + (r.value / total * 100).toFixed(1) + "%")];
      note = "Shares of reported mined categories. API attributions, including Individuals, are estimates, not proof of ownership.\n" + detail.join("\n");
      const unmined = items.find(r => r.name === "To Be Mined");
      if (unmined) table.push("", "TO BE MINED  " + fmt(unmined.value) + " BTC");
      if (unmined) note += "\nTo Be Mined: " + fmt(unmined.value) + " BTC (excluded from percentages).";
    } else if (index === 1 || index === 2) {
      const field = index === 1 ? "TotalAddresses" : "TotalUTXOS", unit = index === 1 ? "ADDRESSES" : "UTXOS";
      const items = rows.map(r => {
        const count = positive(r[field]), sats = positive(r.TotalSats);
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(sats)) throw new Error("Invalid count");
        return { name: label(r.Bracket), count, btc: sats / 1e8 };
      });
      const total = items.reduce((s, r) => s + r.count, 0);
      if (!total) throw new Error("Empty distribution");
      const ranked = items.slice().sort((a, b) => b.count - a.count);
      lines = [fmt(total) + " " + unit, ...ranked.slice(0, 5).map(r => r.name.replace(" BTC", "") + " " + (r.count / total * 100).toFixed(1) + "%")];
      bars = items.map(r => r.count);
      table = items.flatMap(r => [r.name, "  " + fmt(r.count) + " " + unit + " / " + (r.count / total * 100).toFixed(1) + "%", "  " + fmt(r.btc) + " BTC", ""]);
      note = "Distribution by " + unit.toLowerCase() + " count, not BTC share. Addresses and UTXOs are not people. All balance brackets below:\n" + items.map(r => r.name + ": " + fmt(r.count) + " " + unit.toLowerCase() + " (" + (r.count / total * 100).toFixed(1) + "%), " + fmt(r.btc) + " BTC").join("\n");
    } else if (index === 3 || index === 4) {
      const tag = index === 3 ? "ETFs/ETPs" : "CEXs", r = rows.find(r => r.tag === tag);
      if (!r) throw new Error("Missing category");
      const key = Object.keys(r).filter(k => /^total_\d{14}$/.test(k)).sort().pop();
      if (!key) throw new Error("Missing holdings date");
      asof = stampDate(key.slice(6));
      if (snapshotDate && snapshotDate !== asof) throw new Error("Mixed dates");
      snapshotDate = asof;
      const changes = Object.keys(r).filter(k => /^diff_total_\d{14}$/.test(k)).map(k => ({ date: stampDate(k.slice(11)), value: number(r[k]) })).sort((a, b) => b.date.localeCompare(a.date));
      const at = new Date(asof), prior = days => new Date(at.getTime() - days * 86400000).toISOString().slice(0, 10);
      const monthsAgo = months => {
        const d = new Date(at); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - months);
        const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(at.getUTCDate(), last)); return d.toISOString().slice(0, 10);
      };
      lines = [fmt(positive(r[key])) + " BTC HELD", ...[["1D", prior(1)], ["7D", prior(7)], ["1M", monthsAgo(1)], ["90D", prior(90)], ["1Y", monthsAgo(12)]].map(([name, target]) => {
        const c = changes.find(c => c.date === target); return name + " " + (c ? signed(c.value) + " BTC" : "UNAVAILABLE");
      })];
      table = ["BALANCE CHANGE SINCE", ...changes.map(c => c.date + "   " + signed(c.value) + " BTC")];
      note = "Aggregate " + tag + " on-chain balances, not investment inflows. Each change compares the holdings date to the stated earlier snapshot. Missing exact comparisons stay unavailable.\n" + changes.map(c => "Since " + c.date + ": " + signed(c.value) + " BTC").join("\n");
    } else if (index === 5) {
      const items = rows.map(r => ({ name: label(r.entity), tag: label(r.tag), value: positive(r.total), addresses: positive(r.addcount), utxos: positive(r.utxos) })).sort((a, b) => b.value - a.value).slice(0, 10);
      lines = ["TOP HOLDERS / BTC", ...items.slice(0, 5).map((r, i) => (i + 1) + ". " + r.name.split(" (")[0].slice(0, 21) + " " + fmt(r.value))];
      bars = items.map(r => r.value);
      table = items.flatMap((r, i) => [(i + 1) + ". " + r.name, "   " + fmt(r.value) + " BTC / " + r.tag, "   " + fmt(r.addresses) + " ADDRESSES / " + fmt(r.utxos) + " UTXOS", ""]);
      note = "Balances in BTC. Labels are API attributions, not proof of ownership; categories can include groups.\n" + items.map((r, i) => (i + 1) + ". " + r.name + " [" + r.tag + "]: " + fmt(r.value) + " BTC; " + fmt(r.addresses) + " addresses; " + fmt(r.utxos) + " UTXOs").join("\n");
    } else throw new Error("Unknown view");
    return { title: TITLES[index], lines, bars, table, asof: snapshotLabel(snapshotDate, blockHeight), snapshotDate, blockHeight, note };
  };
  const create = onChange => {
    const boards = TITLES.map((title, i) => ({ title, lines: [], bars: [], asof: "", note: "", status: "LOADING", checked: 0, source: SOURCES[i] }));
    const states = boards.map(() => ({ timer: 0, controller: null, failures: 0, due: 0, pending: null }));
    let disposed = false, started = false, enabled = false;
    let sharedDate = "", sharedHeight = null;
    const shareSnapshot = index => {
      // The endpoints describe one snapshot; fill omissions as sibling responses arrive.
      // Failed views retain both their last reading and its previous snapshot label.
      boards.forEach((board, i) => {
        if (board.status !== "LIVE API") return;
        const asof = snapshotLabel(board.snapshotDate || sharedDate, board.blockHeight ?? sharedHeight);
        if (asof === board.asof) return;
        board.asof = asof;
        if (i !== index && onChange) onChange(i);
      });
    };
    const poll = index => {
      const s = states[index], board = boards[index];
      if (disposed || document.hidden) return Promise.resolve();
      if (s.pending) return s.pending;
      clearTimeout(s.timer); s.timer = 0;
      const controller = new AbortController(); s.controller = controller;
      s.pending = (async () => {
        const timeout = setTimeout(() => controller.abort(), 15000);
        let retry = 0;
        try {
          const response = await fetch(BASE + ENDPOINTS[index], { signal: controller.signal, credentials: "omit", cache: "no-store" });
          if (!response.ok) {
            const value = response.headers.get("Retry-After");
            retry = value ? (/^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()) : 0;
            throw new Error("Request failed");
          }
          const result = parse(index, await response.json());
          if (disposed || controller.signal.aborted) return;
          Object.assign(board, result, { status: "LIVE API", checked: Date.now() }); s.failures = 0;
          if (result.snapshotDate) sharedDate = result.snapshotDate;
          if (result.blockHeight !== null) sharedHeight = result.blockHeight;
        } catch {
          if (disposed || document.hidden) return;
          s.failures++;
          board.status = board.checked ? "STALE / RETRYING" : "API UNAVAILABLE";
        } finally {
          clearTimeout(timeout); s.controller = null; s.pending = null;
          if (!disposed) {
            if (document.hidden && controller.signal.aborted) { s.due = 0; return; }
            const delay = Math.max(Number.isFinite(retry) ? Math.max(0, retry) : 0, s.failures ? Math.min(1800000, 30000 * 2 ** Math.min(s.failures - 1, 6)) : 300000);
            s.due = Date.now() + Math.min(delay, 2147483647);
            if (enabled && !document.hidden) s.timer = setTimeout(() => poll(index), Math.min(delay, 2147483647));
            shareSnapshot(index);
            if (onChange) onChange(index);
          }
        }
      })();
      return s.pending;
    };
    const visibility = () => {
      states.forEach((s, i) => {
        clearTimeout(s.timer); s.timer = 0;
        if (document.hidden) { if (s.controller) s.controller.abort(); }
        else if (enabled) s.timer = setTimeout(() => poll(i), Math.max(0, s.due - Date.now()));
      });
    };
    return { boards, refresh: () => Promise.all(states.map((s, i) => poll(i))), start() {
      if (started || disposed) return;
      started = true;
      const q = new URLSearchParams(location.search);
      enabled = q.get("timechain") !== "0" && (!q.has("nosim") || q.get("timechain") === "1");
      if (enabled) { document.addEventListener("visibilitychange", visibility); states.forEach((s, i) => poll(i)); }
      else boards.forEach(b => { b.status = "LIVE DATA PAUSED"; });
    }, dispose() {
      disposed = true; enabled = false;
      document.removeEventListener("visibilitychange", visibility);
      states.forEach(s => { clearTimeout(s.timer); if (s.controller) s.controller.abort(); });
    } };
  };
  BL.timechainData = { parse, create, TITLES, ENDPOINTS };
})();
