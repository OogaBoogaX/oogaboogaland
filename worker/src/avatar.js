// GitHub profile pictures on the island's own origin, so the page keeps `img-src 'self' data:` and never contacts GitHub
// itself: GET /api/avatar/<GitHub numeric id> (the island's Ooga Chat panel draws Ooga Chat's speakers and listeners
// with them). The Worker fetches that account's public picture from GitHub's image host by its id alone, never an
// address from the request, with redirects refused, a time limit, a size limit and an image type allowlist (no SVG),
// and keeps it at the edge (Cache API) and in the browser for a day. No cookie or token goes to GitHub. Only an edge
// miss counts against AVATAR_LIMITER, by address. Public, like the face beside a name on GitHub (ooga.chat's own
// worker/chat/src/avatar.js does the same for its pages).

import { allowed, clientIp, json } from "./http.js";

const ID = /^[1-9][0-9]{0,15}$/;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const AVATAR_BYTES = 256 * 1024;
const MAX_AGE = 86400, SIZE = 96;
export const avatarSource = (id) => `https://avatars.githubusercontent.com/u/${id}?s=${SIZE}&v=4`;

const refuse = (status) => json({ error: status === 404 ? "not_found" : status === 429 ? "rate_limited" : status === 405 ? "method_not_allowed" : "unavailable" }, status,
  status === 429 ? { "retry-after": "60" } : {});

const readBounded = async (response, max) => {
  if (Number(response.headers.get("content-length") || 0) > max || !response.body) return null;
  const reader = response.body.getReader(), out = new Uint8Array(max);
  let used = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.byteLength > max) { await reader.cancel(); return null; }
      out.set(value, used); used += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  return out.slice(0, used);
};

export const handleAvatar = async (request, env, url, ctx, deps = { fetch: (...a) => fetch(...a), cache: globalThis.caches?.default }) => {
  const [, , , id, extra] = url.pathname.split("/");
  if (extra !== undefined || !ID.test(id || "")) return refuse(404);
  if (request.method !== "GET" && request.method !== "HEAD") return refuse(405);
  // Keyed by the path alone, so a query string never misses the cache.
  const cache = deps.cache, cacheKey = `${url.origin}${url.pathname}`;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;
  if (!(await allowed(env.AVATAR_LIMITER, clientIp(request)))) return refuse(429);
  let upstream;
  // "manual": a redirect is a 3xx, not `ok`, so it is no picture.
  try { upstream = await deps.fetch(avatarSource(id), { redirect: "manual", headers: { accept: "image/*", "user-agent": "oogaboogaland" }, signal: AbortSignal.timeout(5000) }); }
  catch { return refuse(502); }
  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!upstream.ok || !TYPES.has(type)) return refuse(404);
  const bytes = await readBounded(upstream, AVATAR_BYTES);
  if (!bytes) return refuse(404);
  const response = new Response(bytes, { headers: {
    "content-type": type, "cache-control": `public, max-age=${MAX_AGE}`, "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'", "cross-origin-resource-policy": "same-origin",
  } });
  if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
