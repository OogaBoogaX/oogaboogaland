// Public, compact recent-merge summaries. A six-minute edge cache shares each GitHub scan between visitors.
// Page validators retain only fields used here; unchanged upstream pages reuse their normalized records.
// An optional GITHUB_TOKEN secret (no repository permissions) authorizes the scans: 5,000 requests an hour instead of
// 60 per shared address, and 304s free. It goes only to api.github.com, never into a log, the cache or a reply, and never
// follows a redirect. An expired or revoked token (401) is dropped for the rest of that scan, which carries on
// unauthenticated, so a stale secret costs the shared limit rather than the feed.
import { json } from "./http.js";

const REPOS = ["bitcoin/bitcoin", "btcpayserver/btcpayserver", "lightningnetwork/lnd", "ElementsProject/lightning"];
const RECENT = 24 * 3600000, TTL = 360, PAGE_TTL = 7200, MAX_PAGES = 20;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const running = new Map();
const cacheKey = (url, key) => new Request(new URL(`/__totem-cache/v1/${key}`, url.origin));
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
const scan = async (index, url, cache, token) => {
  const now = Date.now(), cutoff = now - RECENT, repo = REPOS[index];
  const limited = await get(cache, cacheKey(url, "limit"));
  if (limited && limited.until > now) return limited;
  let number = 0, mergedAt = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const key = cacheKey(url, `${index}/page/${page}`), previous = await get(cache, key);
    const headers = { accept: "application/vnd.github+json", "user-agent": "OogaBoogaLand-Totems", "x-github-api-version": "2022-11-28" };
    if (previous?.etag) headers["if-none-match"] = previous.etag;
    const address = `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`;
    let response;
    if (typeof token === "string" && token) {
      response = await fetch(address, { headers: { ...headers, authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(10000) });
      if (response.status === 401) token = null;
    }
    if (!response || response.status === 401) response = await fetch(address, { headers, signal: AbortSignal.timeout(10000) });
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      const retry = Number(response.headers.get("retry-after")) * 1000;
      const until = response.headers.get("x-ratelimit-remaining") === "0" && reset > now ? reset : now + Math.max(60000, retry || 0);
      const failure = { status: response.status, until };
      await put(cache, cacheKey(url, "limit"), failure, (until - now) / 1000);
      return failure;
    }
    let records;
    if (response.status === 304 && previous) records = previous.records;
    else {
      if (!response.ok) throw new Error("GitHub unavailable");
      const pulls = await response.json();
      if (!Array.isArray(pulls) || pulls.length > 100) throw new Error("Unexpected GitHub page");
      records = pulls.map(pr => ({ updated: readTime(pr.updated_at), merged: typeof pr.merged_at === "string" && ISO_TIME.test(pr.merged_at) ? readTime(pr.merged_at) : 0,
        base: pr.base?.ref, number: pr.number, url: pr.html_url }));
      await put(cache, key, { etag: response.headers.get("etag") || "", records }, PAGE_TTL);
    }
    let older = false;
    for (const pr of records) {
      if (pr.updated < cutoff) { older = true; break; }
      if (pr.base !== "main" && pr.base !== "master" || pr.merged <= cutoff || pr.merged > now || pr.merged <= mergedAt) continue;
      if (!Number.isSafeInteger(pr.number) || pr.number < 1 || pr.url !== `https://github.com/${repo}/pull/${pr.number}`) throw new Error("Unexpected GitHub pull");
      number = pr.number; mergedAt = pr.merged;
    }
    if (older || records.length < 100) return { repo, number, mergedAt };
  }
  // Refuse an incomplete scan rather than publish the wrong latest merge; retry later through the bounded error cache.
  throw new Error("GitHub scan exceeded its page budget");
};

export const handleTotems = async (request, url, env) => {
  const match = /^\/api\/totems\/([0-3])$/.exec(url.pathname);
  if (!match) return json({ error: "not found" }, 404);
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
  const index = Number(match[1]), cache = caches.default, key = cacheKey(url, index);
  let summary = await get(cache, key);
  if (!summary) {
    const id = `${url.origin}/${index}`;
    if (!running.has(id)) {
      const job = scan(index, url, cache, env.GITHUB_TOKEN).catch(() => ({ status: 503, until: Date.now() + 60000 }))
        .then(async result => {
          await put(cache, key, result, result.status ? Math.max(1, (result.until - Date.now()) / 1000) : TTL);
          return result;
        }).finally(() => running.delete(id));
      running.set(id, job);
    }
    summary = await running.get(id);
  }
  if (summary.status) return json({ error: "feed unavailable" }, summary.status, {
    "retry-after": String(Math.max(1, Math.ceil((summary.until - Date.now()) / 1000))),
    ...(summary.status === 403 || summary.status === 429 ? { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil(summary.until / 1000)) } : {})
  });
  // A cached merge may age out between edge refreshes. Preserve the page's exact 24-hour meaning.
  if (summary.mergedAt <= Date.now() - RECENT) summary = { repo: REPOS[index], number: 0, mergedAt: 0 };
  const etag = `"${index}-${summary.number}-${summary.mergedAt}"`;
  const headers = { "cache-control": "public, max-age=90", etag };
  // Weak comparison (RFC 9110): the edge may hand the page a W/ tag when it compresses the body.
  if ((request.headers.get("if-none-match") || "").split(",").some(tag => tag.trim().replace(/^W\//, "") === etag)) return new Response(null, { status: 304, headers });
  return json(summary, 200, headers);
};
