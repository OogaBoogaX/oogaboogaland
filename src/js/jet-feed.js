// Lightning Jet's repository as the Lightning Jet Hangar's two boards read it: drneski/lightning-jet from GitHub's
// public REST API, unauthenticated, read once a page life when the visitor first walks into the hangar and never
// again, so the boards are a snapshot, not live. A reading younger than CACHE_MS in localStorage is used as it is and
// nothing is sent; otherwise the six calls go one after another and stop at the first refusal. A spent limit (403 or
// 429 with none left) is written into the totems' poller's `limitedUntil`, which this reads before it starts too, so
// the two share an address's sixty requests an hour. Until a reading lands the boards show the last cached one at any
// age, else the snapshot `scripts/jet-data.mjs` baked into `jet-data.js`.
//
// `reading()` is the best reading there is, its `source` saying which: "fetch" (taken this page, or within CACHE_MS),
// "cache" (an older one) or "bake"; `state` says whether a fetch is under way (`loading`) or failed (`failed`).
// `parse(bodies, at)` turns the six responses into a reading, checking every field at that boundary; it loads in Node,
// where the bake runs the same calls through it. Subscribers hear when the reading or the state changes. The hangar
// calls `load` on entry, except under nosim and jet=0, where the boards show the cache or the bake. Exports REPO,
// parse, load, reading, subscribe and state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const REPO = "drneski/lightning-jet", API = `https://api.github.com/repos/${REPO}`;
  const CACHE_KEY = "ooga-jet-reading", CACHE_MS = 30 * 60000, WEEK_MS = 7 * 86400000, SCHEMA = 1;
  const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const subscribers = new Set();
  const state = { started: false, loading: false, failed: false, failures: 0, lastError: "", fetched: null };
  let cached = null;

  // Text from the API as a board may show it: NFC, without control characters or anything outside the Basic
  // Multilingual Plane (emoji), trimmed and capped.
  const clean = (s, cap) => String(s).normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/g, "").trim().slice(0, cap);
  const count = (n, what) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`unexpected ${what}`);
    return n;
  };
  const time = (s, what) => {
    if (typeof s !== "string" || !ISO_TIME.test(s) || !Number.isFinite(Date.parse(s))) throw new Error(`unexpected ${what}`);
    return new Date(Date.parse(s)).toISOString().replace(".000Z", "Z");
  };
  const list = (a, what) => {
    if (!Array.isArray(a)) throw new Error(`unexpected ${what}`);
    return a;
  };

  // The six responses' bodies, and the commits call's `Link` header, as a reading taken at `at` (ms):
  // `{ repo, pulls, commits, commitsLink, week, releases, milestones }`.
  const parse = (b, at) => {
    const repo = b.repo;
    if (!repo || typeof repo !== "object" || repo.full_name !== REPO) throw new Error("unexpected repository");
    const pulls = list(b.pulls, "pulls"), week = list(b.week, "week");
    // The default branch's commits, one a page: the last page's number is the total.
    const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(b.commitsLink || "");
    const commits = last ? count(Number(last[1]), "commit count") : list(b.commits, "commits").length;
    const open = count(repo.open_issues_count, "open issues");
    const readyPRs = pulls.filter((p) => {
      if (!p || typeof p.draft !== "boolean") throw new Error("unexpected pull");
      return !p.draft;
    }).length;
    const releases = list(b.releases, "releases").filter((r) => r && !r.draft && !r.prerelease)
      .map((r) => ({ tag: clean(r.tag_name, 32), at: time(r.published_at, "release time") }))
      .filter((r) => r.tag).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
    const milestones = list(b.milestones, "milestones").map((m) => ({
      title: clean(m.title, 40), open: count(m.open_issues, "milestone issues"), closed: count(m.closed_issues, "milestone issues"),
      dueOn: m.due_on ? time(m.due_on, "milestone due date") : ""
    }));
    return {
      schema: SCHEMA, repo: REPO, at: new Date(at).toISOString().replace(/\.\d+Z$/, "Z"), source: "fetch",
      description: repo.description ? clean(repo.description, 200) : "",
      createdAt: time(repo.created_at, "creation time"), pushedAt: time(repo.pushed_at, "push time"),
      stars: count(repo.stargazers_count, "stars"), forks: count(repo.forks_count, "forks"),
      commits, commitsWeek: week.length,
      openPRs: pulls.length, readyPRs, openIssues: Math.max(0, open - pulls.length),
      releases, milestones
    };
  };

  // A reading kept in localStorage, as it was written: anything else there is ignored.
  const sane = (r) => {
    if (!r || r.schema !== SCHEMA || r.repo !== REPO) return null;
    try {
      for (const k of ["at", "createdAt", "pushedAt"]) time(r[k], k);
      for (const k of ["stars", "forks", "commits", "commitsWeek", "openPRs", "readyPRs", "openIssues"]) count(r[k], k);
      if (typeof r.description !== "string") return null;
      for (const x of list(r.releases, "releases")) {
        if (typeof x.tag !== "string" || !x.tag) return null;
        time(x.at, "release time");
      }
      for (const m of list(r.milestones, "milestones")) {
        if (typeof m.title !== "string") return null;
        count(m.open, "milestone"); count(m.closed, "milestone");
        if (m.dueOn) time(m.dueOn, "milestone due date");
      }
    } catch {
      return null;
    }
    return r;
  };
  const readCache = () => {
    try {
      return sane(JSON.parse(localStorage.getItem(CACHE_KEY)));
    } catch {
      return null;
    }
  };

  const emit = () => {
    for (const fn of subscribers) fn();
  };
  const limit = () => BL.totemFeed ? BL.totemFeed.state : null;
  const get = async (path) => {
    const res = await fetch(API + path);
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")), shared = limit();
      if (res.headers.get("x-ratelimit-remaining") === "0" && reset > 0 && shared) shared.limitedUntil = Math.max(shared.limitedUntil, reset * 1000);
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  };
  const fetchAll = async () => {
    const at = Date.now(), since = new Date(at - WEEK_MS).toISOString();
    const body = async (path) => (await get(path)).json();
    const repo = await body("");
    const pulls = await body("/pulls?state=open&per_page=100");
    const first = await get("/commits?per_page=1");
    const commitsLink = first.headers.get("link") || "", commits = await first.json();
    const week = await body(`/commits?since=${since}&per_page=100`);
    const releases = await body("/releases?per_page=100");
    const milestones = await body("/milestones?state=open&per_page=10");
    return parse({ repo, pulls, commits, commitsLink, week, releases, milestones }, at);
  };

  // The first call a page life reads GitHub, unless a fresh reading is in the cache or the shared limit is spent; any
  // later call does nothing.
  const load = () => {
    if (state.started) return;
    state.started = true;
    cached = readCache();
    if (cached && Date.now() - Date.parse(cached.at) < CACHE_MS) {
      state.fetched = cached;
      emit();
      return;
    }
    const shared = limit();
    if (shared && Date.now() < shared.limitedUntil) {
      state.failed = true;
      state.lastError = "rate limited";
      emit();
      return;
    }
    state.loading = true;
    emit();
    fetchAll().then((r) => {
      state.fetched = r;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(r)); } catch {}
    }, (e) => {
      state.failed = true;
      state.failures++;
      state.lastError = e && e.message || String(e);
    }).finally(() => {
      state.loading = false;
      emit();
    });
  };

  // The best reading there is: this page's, a cached one, or the bake, as a copy naming its source.
  const reading = () => {
    if (state.fetched) return state.fetched;
    if (!cached && !state.started) cached = readCache();
    if (cached) return Object.assign({}, cached, { source: "cache" });
    return BL.jetData || null;
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  BL.jetFeed = { REPO, CACHE_MS, parse, load, reading, subscribe, state };
})();
