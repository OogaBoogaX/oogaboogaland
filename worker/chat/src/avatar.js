// A principal's picture on the app's own origin (#663), so the page keeps `img-src 'self'`:
// GET /api/chat/avatar/<principal>/<key>. Only the address a sign-in stored is fetched (providers.js keeps it to the
// provider's own image host over https), never one from the request, with redirects refused, a time limit, a size limit
// and an image type allowlist (no SVG). The key is the hash of that address, so a picture that changed, or an account
// that was deleted, answers 404 here rather than an old face. Public, like the face beside a name on GitHub or X, and
// cached at the edge (Cache API) and in the browser for a day. No cookie or bearer token goes to the image host.

import { allowed, clientIp, refusal } from "./http.js";
import { PRINCIPAL } from "./session.js";

const KEY = /^[0-9a-f]{16}$/;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const AVATAR_BYTES = 512 * 1024;
const MAX_AGE = 86400;

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

export const handleAvatar = async (request, env, url, deps) => {
  const [, , , , id, key, extra] = url.pathname.split("/");
  if (extra !== undefined || !PRINCIPAL.test(id || "") || !KEY.test(key || "")) return refusal("not_found", 404);
  if (request.method !== "GET" && request.method !== "HEAD") return refusal("method_not_allowed", 405);
  if (!env.DB) return refusal("unavailable", 503);
  if (!(await allowed(env.CHAT_AVATAR_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  // The account first, every time: a deleted principal or a replaced picture is a 404 even while a copy is cached.
  const row = await env.DB.prepare("SELECT avatar_url, avatar_key FROM principals WHERE id = ?1").bind(id).first();
  if (!row || !row.avatar_url || row.avatar_key !== key) return refusal("not_found", 404);
  // Keyed by the path alone, so a query string never misses the cache.
  const cache = deps.cache, cacheKey = `${url.origin}${url.pathname}`;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;
  let upstream;
  // "manual": a redirect is a 3xx, not `ok`, so it is no face (Workers' fetch has no "error" mode).
  try { upstream = await deps.fetch(row.avatar_url, { redirect: "manual", headers: { accept: "image/*", "user-agent": "ooga-chat" }, signal: AbortSignal.timeout(5000) }); }
  catch { return refusal("unavailable", 502, { retryable: true }); }
  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!upstream.ok || !TYPES.has(type)) return refusal("not_found", 404);
  const bytes = await readBounded(upstream, AVATAR_BYTES);
  if (!bytes) return refusal("not_found", 404);
  const response = new Response(bytes, { headers: {
    "content-type": type, "cache-control": `public, max-age=${MAX_AGE}`, "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'", "cross-origin-resource-policy": "same-origin",
  } });
  if (cache && deps.waitUntil) deps.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
