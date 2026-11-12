// Repo Island's merges (repo-island.js), from the site's Worker: one poller for the page life asking `/api/repo-totems`
// for every repository's newest pull request merged into its default branch in the last day, all in one reply
// (worker/src/repo-totems.js), so the island's totems cost one small request every STEP_MS however many there are.
// The first asks FIRST_MS after `start`, behind the page's own loading; later ones go only while the tab is visible
// (a tab coming back asks at once when one was missed) and are revalidated by ETag. A refusal (403, 429 or 503) is
// waited out as its `retry-after` asks. A page with no Worker (a 404, a 405 or a reply that is not JSON: a static host
// or a file page) stops for good, and its totems stay dark: asking GitHub for each of them would spend a visitor's
// own limit many times over.
//
// `state.repos[i]` keeps `repoIslandData.REPOS[i]`'s merge: its PR number, URL and merge time (`changedAt`, in ms, 0
// when none in the day). `state.version` counts every change, for the island's lit sets. Subscribers get
// { type: "change", index, changedAt, fresh } per repository whose merge changed, `fresh` only for a merge first seen
// during the page life, never on the first reading, so a page load is not a celebration. Network errors are silent
// (counted in state). Off under nosim and with repos=0. Exports start, subscribe, dispose, apply and state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const REPOS = BL.repoIslandData.REPOS, INDEX = new Map(REPOS.map((r, i) => [r.repo, i]));
  const STEP_MS = 300000, FIRST_MS = 4000, RECENT = 24 * 3600000, SKEW = 120000;
  const subscribers = new Set();
  const state = { enabled: false, supported: /^https?:$/.test(location.protocol), polls: 0, failures: 0, lastError: "", retryAt: 0, version: 0, read: false,
    repos: REPOS.map(() => ({ number: 0, url: "", changedAt: 0 })) };
  let timer = 0, first = 0, inFlight = false, dueAt = 0, etag = "";
  const emit = (event) => { for (const fn of subscribers) fn(event); };

  // A reply's merges, checked at the boundary: unknown repositories are skipped, anything malformed refuses the reply.
  const apply = (reply, now = Date.now()) => {
    if (!reply || typeof reply !== "object" || !reply.merges || typeof reply.merges !== "object" || Array.isArray(reply.merges)) throw new Error("unexpected merges");
    const seen = new Map();
    for (const [repo, value] of Object.entries(reply.merges)) {
      if (!Array.isArray(value) || value.length !== 2) throw new Error("unexpected merge");
      const [at, number] = value;
      if (!Number.isSafeInteger(at) || !Number.isSafeInteger(number) || number < 1 || at > now + SKEW) throw new Error("unexpected merge");
      const index = INDEX.get(repo);
      if (index !== undefined && at > now - RECENT) seen.set(index, value);
    }
    const firstReading = !state.read;
    state.read = true;
    REPOS.forEach((repo, i) => {
      const entry = state.repos[i], value = seen.get(i), number = value ? value[1] : 0;
      if (number === entry.number && (!value || value[0] === entry.changedAt)) return;
      entry.number = number;
      entry.changedAt = value ? value[0] : 0;
      entry.url = number ? `https://github.com/${repo.repo}/pull/${number}` : "";
      state.version++;
      emit({ type: "change", index: i, changedAt: entry.changedAt, fresh: !firstReading && !!number && now - entry.changedAt < RECENT });
    });
  };

  const poll = async () => {
    if (inFlight || !state.supported || Date.now() < state.retryAt) return;
    inFlight = true;
    dueAt = Date.now() + STEP_MS;
    try {
      const res = await fetch("/api/repo-totems", { headers: etag ? { "if-none-match": etag } : {} });
      if (res.status === 404 || res.status === 405 || res.status !== 304 && !res.headers.get("content-type")?.includes("application/json")) {
        state.supported = false;
        return;
      }
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        state.retryAt = Date.now() + (Number(res.headers.get("retry-after")) || 60) * 1000;
        throw new Error(`HTTP ${res.status}`);
      }
      if (res.status !== 304) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        apply(await res.json());
        etag = res.headers.get("etag") || "";
      }
      state.polls++;
      state.lastError = "";
    } catch (e) {
      state.failures++;
      state.lastError = e && e.message || String(e);
    } finally {
      inFlight = false;
    }
  };
  // Background tabs skip their turn; coming back asks at once when one was missed.
  const tick = () => { if (!document.hidden) poll(); };
  const onVisibility = () => { if (!document.hidden && state.enabled && Date.now() >= dueAt) poll(); };

  const start = () => {
    if (state.enabled) return;
    state.enabled = true;
    first = window.setTimeout(() => { first = 0; poll(); timer = window.setInterval(tick, STEP_MS); }, FIRST_MS);
    document.addEventListener("visibilitychange", onVisibility);
  };
  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const dispose = () => {
    if (first) window.clearTimeout(first);
    if (timer) window.clearInterval(timer);
    first = timer = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    state.enabled = false;
    subscribers.clear();
  };

  BL.repoFeed = { start, subscribe, dispose, apply, state, RECENT };
})();
