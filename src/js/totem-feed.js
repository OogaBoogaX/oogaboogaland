// Each of the four totems' repositories' latest change, from GitHub's public REST API: one poller for the
// page life. The four are asked one after another on start, then one every STEP_MS in turn while the tab is visible,
// so each repository is asked every six minutes and the page stays well inside the unauthenticated limit of 60 an
// hour; the browser's cache revalidates by ETag, and a 304 costs no quota. A refused poll (403 or 429 with the limit
// spent) waits for GitHub's reset. The change is the newest commit on the default branch (a merge, for these projects),
// so a totem can link straight to it.
//
// Each repository's `word` is what its totem carries, in runes down its back and sides and on its name board.
// `state.repos[i]` keeps `REPOS[i]`'s `sha`, `url` (the commit's page) and `changedAt` (its committer time in ms; all
// empty or 0 until known). Subscribers get { type: "change", index, changedAt, fresh } whenever a repository's commit is
// first read or replaced; `fresh` marks a new commit seen during the page life, never the first reading, so a page load
// does not count as a change. Network errors are silent (counted in
// state). Like the other feeds this stays off under nosim and can be disabled with totems=0. Exports REPOS, start,
// subscribe, dispose and state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const REPOS = [
    { name: "Bitcoin Core", word: "CORE", repo: "bitcoin/bitcoin" },
    { name: "BTCPay Server", word: "BTCPAY", repo: "btcpayserver/btcpayserver" },
    { name: "LND", word: "LND", repo: "lightningnetwork/lnd" },
    { name: "CLN", word: "CLN", repo: "ElementsProject/lightning" }
  ];
  const API = "https://api.github.com/repos/";
  const STEP_MS = 90000;
  const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, SHA = /^[0-9a-f]{40}$/;
  const subscribers = new Set();
  const state = { enabled: false, polls: 0, failures: 0, lastError: "", limitedUntil: 0, repos: REPOS.map(() => ({ sha: "", url: "", changedAt: 0 })) };
  let timer = 0, turn = 0, inFlight = false, dueAt = 0;

  const emit = (event) => {
    for (const fn of subscribers) fn(event);
  };

  const poll = async (index) => {
    const res = await fetch(`${API}${REPOS[index].repo}/commits?per_page=1`);
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if (res.headers.get("x-ratelimit-remaining") === "0" && reset > 0) state.limitedUntil = reset * 1000;
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json(), commit = Array.isArray(body) ? body[0] : null, at = commit?.commit?.committer?.date;
    const url = `https://github.com/${REPOS[index].repo}/commit/${commit?.sha}`;
    if (!commit || !SHA.test(commit.sha) || commit.html_url !== url || typeof at !== "string" || !ISO_TIME.test(at)) throw new Error("unexpected commits shape");
    state.polls++;
    state.lastError = "";
    const entry = state.repos[index], previous = entry.sha;
    if (commit.sha === previous) return;
    entry.sha = commit.sha;
    entry.url = url;
    entry.changedAt = Date.parse(at);
    emit({ type: "change", index, changedAt: entry.changedAt, fresh: previous !== "" });
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
