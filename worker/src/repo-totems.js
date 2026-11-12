// Repo Island's merges: for every repository `repo-island-data.js` lists, its newest pull request merged into its
// default branch within the last day, all in one compact reply at `/api/repo-totems`, so a page asks once for 170
// totems rather than 170 times. A scan asks GitHub's GraphQL API about `CHUNK` repositories a query: each one's
// default branch and its merged pull requests newest-updated first, read until their updates predate the day (any PR
// merged in the day was updated in it), a further page only for a repository whose first is all of the day, at most
// `MAX_PAGES` in all. A repository GitHub no longer knows is left out. GraphQL needs a token: the optional
// GITHUB_TOKEN secret (no repository permissions), the totems' own; without one the feed is closed and the island
// stays dark. The token goes only to api.github.com, never into a log, the cache or a reply.
//
// As `totems.js` does, one scan is shared through the edge cache for `TTL` seconds and between concurrent requests,
// the last good scan is kept for a day and answers while GitHub refuses (a spent limit waits for its reset), and a
// failed scan is retried no sooner than a minute later. The reply is `{ at, merges: { "owner/name": [mergedAt, number] } }`
// with only the repositories merged in the day, each `mergedAt` in milliseconds, revalidated by its ETag.
import "../../src/js/repo-island-data.js";
import { json } from "./http.js";

const REPOS = globalThis.BL.repoIslandData.REPOS.map((r) => r.repo);
const RECENT = 24 * 3600000, TTL = 360, CHUNK = 42, FIRST = 25, MAX_PAGES = 4, CLOSED_S = 3600;
const NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const running = new Map();
const cacheKey = (url, key) => new Request(new URL(`/__repo-totem-cache/v1/${key}`, url.origin));
const get = async (cache, key) => {
  const response = await cache.match(key);
  return response ? response.json() : null;
};
const put = (cache, key, value, seconds) => cache.put(key, json(value, 200, { "cache-control": `public, max-age=${Math.max(1, Math.ceil(seconds))}` }));
const readTime = (value) => {
  if (typeof value !== "string" || !ISO_TIME.test(value)) throw new Error("Unexpected GitHub time");
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new Error("Unexpected GitHub time");
  return at;
};
// One query over `asks` ([repo, cursor] pairs), aliased r0, r1, ... in their order.
const queryOf = (asks) => `query{${asks.map(([repo, cursor], k) => {
  const [owner, name] = repo.split("/");
  return `r${k}:repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){defaultBranchRef{name}pullRequests(states:MERGED,first:${FIRST},orderBy:{field:UPDATED_AT,direction:DESC}${cursor ? `,after:${JSON.stringify(cursor)}` : ""}){pageInfo{hasNextPage endCursor}nodes{number mergedAt updatedAt baseRefName}}}`;
}).join("")}}`;

const ask = async (asks, token) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/vnd.github+json", "user-agent": "OogaBoogaLand-RepoIsland" },
    body: JSON.stringify({ query: queryOf(asks) })
  });
  return response;
};

const scan = async (token) => {
  const now = Date.now(), cutoff = now - RECENT, best = new Map();
  if (typeof token !== "string" || !token) return { status: 503, until: now + CLOSED_S * 1000 };
  let pending = REPOS.filter((repo) => NAME.test(repo)).map((repo) => [repo, null]);
  for (let round = 0; pending.length && round < MAX_PAGES; round++) {
    const next = [];
    for (let at = 0; at < pending.length; at += CHUNK) {
      const asks = pending.slice(at, at + CHUNK), response = await ask(asks, token);
      if (response.status === 401) return { status: 503, until: now + CLOSED_S * 1000 };
      if (response.status === 403 || response.status === 429) {
        const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000, retry = Number(response.headers.get("retry-after")) * 1000;
        return { status: response.status, until: response.headers.get("x-ratelimit-remaining") === "0" && reset > now ? reset : now + Math.max(60000, retry || 0) };
      }
      if (!response.ok) throw new Error("GitHub unavailable");
      const body = await response.json();
      if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object") {
        if (Array.isArray(body?.errors) && body.errors.some((e) => e?.type === "RATE_LIMITED")) return { status: 429, until: now + 60000 };
        throw new Error("Unexpected GitHub reply");
      }
      asks.forEach(([repo], k) => {
        const found = body.data[`r${k}`];
        if (!found) return;
        const branch = found.defaultBranchRef?.name, pulls = found.pullRequests;
        if (typeof branch !== "string" || !pulls || !Array.isArray(pulls.nodes) || pulls.nodes.length > FIRST) return;
        let older = false;
        for (const pr of pulls.nodes) {
          if (readTime(pr.updatedAt) < cutoff) { older = true; break; }
          if (pr.baseRefName !== branch || !Number.isSafeInteger(pr.number) || pr.number < 1) continue;
          const merged = readTime(pr.mergedAt);
          if (merged <= cutoff || merged > now || merged <= (best.get(repo)?.[0] || 0)) continue;
          best.set(repo, [merged, pr.number]);
        }
        if (!older && pulls.pageInfo?.hasNextPage && typeof pulls.pageInfo.endCursor === "string") next.push([repo, pulls.pageInfo.endCursor]);
      });
    }
    pending = next;
  }
  // A repository still paging past the budget keeps the newest merge its pages found: the totem lights all the same.
  const merges = {};
  for (const repo of REPOS) if (best.has(repo)) merges[repo] = best.get(repo);
  return { at: now, merges };
};

// The reply's merges as of now: a cached one may have aged out of the day between scans.
const current = (summary) => {
  const cutoff = Date.now() - RECENT, merges = {};
  for (const [repo, value] of Object.entries(summary.merges)) if (value[0] > cutoff) merges[repo] = value;
  return { at: summary.at, merges };
};
const tagOf = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `"r-${(h >>> 0).toString(36)}-${text.length}"`;
};

export const handleRepoTotems = async (request, url, env, ctx) => {
  if (url.pathname !== "/api/repo-totems") return json({ error: "not found" }, 404);
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
  const cache = caches.default, key = cacheKey(url, "scan");
  let summary = await get(cache, key);
  if (!summary) {
    const id = url.origin;
    if (!running.has(id)) {
      const job = scan(env.GITHUB_TOKEN).catch(() => ({ status: 503, until: Date.now() + 60000 }))
        .then(async (result) => {
          await put(cache, key, result, result.status ? Math.max(1, (result.until - Date.now()) / 1000) : TTL);
          if (!result.status) await put(cache, cacheKey(url, "last"), result, RECENT / 1000);
          return result;
        }).finally(() => running.delete(id));
      running.set(id, job);
      // Other visitors wait on this scan: it must outlive the request that started it, which can be cancelled.
      if (ctx) ctx.waitUntil(job.catch(() => {}));
    }
    summary = await running.get(id);
  }
  if (summary.status) summary = await get(cache, cacheKey(url, "last")) || summary;
  if (summary.status) return json({ error: "feed unavailable" }, summary.status, { "retry-after": String(Math.max(1, Math.ceil((summary.until - Date.now()) / 1000))) });
  const reply = current(summary), etag = tagOf(JSON.stringify(reply));
  const headers = { "cache-control": "public, max-age=90", etag };
  // Weak comparison (RFC 9110): the edge may hand the page a W/ tag when it compresses the body.
  if ((request.headers.get("if-none-match") || "").split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)) return new Response(null, { status: 304, headers });
  return json(reply, 200, headers);
};
