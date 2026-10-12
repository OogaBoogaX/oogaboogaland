// Each of the four totems' repositories' recent merges, from GitHub's public REST API: one poller for the
// page life. The four are asked one after another on start, then one every STEP_MS in turn while the tab is visible,
// so each repository is asked every six minutes. Closed pull requests are read newest-updated first until their
// updates predate the last day; only a PR merged into main or master in that day can light a totem. A refused poll
// (403 or 429 with the limit spent) waits for GitHub's reset.
//
// Each repository's `word` is what its totem carries, in runes down its back and sides and on its name board, and its
// `importance` to Bitcoin sizes it: its totem stands that share of Bitcoin Core's height (`totem-models.js`).
// `state.repos[i]` keeps `REPOS[i]`'s latest recent merge's PR number, URL and merge time (`changedAt`, in ms).
// Subscribers get { type: "change", index, changedAt, fresh } when that merge changes; `fresh` marks a merge first
// seen during the page life, never the first reading, so a page load does not count as a change. Network errors
// are silent (counted in state). Like the other feeds this stays off under nosim and can be disabled with totems=0. Exports REPOS, start,
// subscribe, dispose and state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const REPOS = [
    { name: "Bitcoin Core", word: "CORE", repo: "bitcoin/bitcoin", importance: 1 },
    { name: "BTCPay Server", word: "BTCPAY", repo: "btcpayserver/btcpayserver", importance: 0.52 },
    { name: "LND", word: "LND", repo: "lightningnetwork/lnd", importance: 0.7 },
    { name: "CLN", word: "CLN", repo: "ElementsProject/lightning", importance: 0.62 }
  ];
  const API = "https://api.github.com/repos/";
  const STEP_MS = 90000, RECENT = 24 * 3600000;
  const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const subscribers = new Set();
  const state = { enabled: false, polls: 0, failures: 0, lastError: "", limitedUntil: 0, repos: REPOS.map(() => ({ number: 0, url: "", changedAt: 0, seen: false })) };
  let timer = 0, turn = 0, inFlight = false, dueAt = 0;

  const emit = (event) => {
    for (const fn of subscribers) fn(event);
  };

  const poll = async (index) => {
    const now = Date.now(), cutoff = now - RECENT;
    let latest = null, mergedAt = 0;
    for (let page = 1; ; page++) {
      const res = await fetch(`${API}${REPOS[index].repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        if (res.headers.get("x-ratelimit-remaining") === "0" && reset > 0) state.limitedUntil = reset * 1000;
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pulls = await res.json();
      if (!Array.isArray(pulls)) throw new Error("unexpected pulls shape");
      let older = false;
      for (const pr of pulls) {
        if (typeof pr.updated_at !== "string" || !ISO_TIME.test(pr.updated_at)) throw new Error("unexpected pull time");
        const updated = Date.parse(pr.updated_at);
        if (!Number.isFinite(updated)) throw new Error("unexpected pull time");
        if (updated < cutoff) { older = true; break; }
        const at = pr.merged_at;
        if ((pr.base?.ref !== "main" && pr.base?.ref !== "master") || typeof at !== "string" || !ISO_TIME.test(at)) continue;
        const when = Date.parse(at);
        if (!Number.isFinite(when)) throw new Error("unexpected merge time");
        if (when <= cutoff || when > now || when <= mergedAt) continue;
        if (!Number.isSafeInteger(pr.number) || pr.number < 1 || pr.html_url !== `https://github.com/${REPOS[index].repo}/pull/${pr.number}`) throw new Error("unexpected pull URL");
        latest = pr;
        mergedAt = when;
      }
      if (older || pulls.length < 100) break;
    }
    state.polls++;
    state.lastError = "";
    const entry = state.repos[index], previous = entry.number, seen = entry.seen;
    entry.seen = true;
    if ((latest?.number || 0) === previous) return;
    entry.number = latest?.number || 0;
    entry.url = latest?.html_url || "";
    entry.changedAt = mergedAt;
    emit({ type: "change", index, changedAt: mergedAt, fresh: seen && !!latest && Date.now() - mergedAt < RECENT });
  };

  // One repository a call, or every one in turn when `all`; at most one call runs at a time.
  const run = async (all) => {
    if (inFlight || Date.now() < state.limitedUntil) return;
    inFlight = true;
    dueAt = Date.now() + STEP_MS;
    try {
      for (let n = all ? REPOS.length : 1; n > 0; n--) {
        const index = turn;
        turn = (turn + 1) % REPOS.length;
        try {
          await poll(index);
        } catch (e) {
          state.failures++;
          state.lastError = e && e.message || String(e);
          if (Date.now() < state.limitedUntil) break;
        }
      }
    } finally {
      inFlight = false;
    }
  };

  // Background tabs skip their turn; coming back asks at once when one was missed.
  const tick = () => {
    if (!document.hidden) run(false);
  };
  const onVisibility = () => {
    if (!document.hidden && state.enabled && Date.now() >= dueAt) run(false);
  };

  const start = () => {
    if (state.enabled) return;
    state.enabled = true;
    run(true);
    timer = window.setInterval(tick, STEP_MS);
    document.addEventListener("visibilitychange", onVisibility);
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const dispose = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    state.enabled = false;
    subscribers.clear();
  };

  BL.totemFeed = { REPOS, start, subscribe, dispose, state };
})();
