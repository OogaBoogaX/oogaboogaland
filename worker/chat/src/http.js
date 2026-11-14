// Ooga Chat's edge: the response helpers and request checks every route shares. The island Worker's own helpers
// (worker/src/http.js) read its sessions and cast, which this Worker never sees, so the few pure ones are kept here.

const BASE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", ...headers } });

export const text = (body, status, headers = {}) =>
  new Response(body, { status, headers: { ...BASE_HEADERS, "content-type": "text/plain; charset=utf-8", ...headers } });

/** A stable, bounded refusal: `{ error: { code, retryable } }`, with Retry-After when there is a wait to tell. */
export const refusal = (code, status, { retryable = false, retryAfter = 0 } = {}) =>
  json({ error: { code, retryable, ...(retryAfter ? { retryAfter } : {}) } }, status, retryAfter ? { "retry-after": String(retryAfter) } : {});

export const redirect = (location, cookies = [], status = 303) => {
  const headers = new Headers(BASE_HEADERS);
  headers.set("location", location);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status, headers });
};

/** A request's body as text, read no further than `max` bytes; null past that. */
export const readBody = async (request, max) => {
  if (Number(request.headers.get("content-length") || 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), bytes = new Uint8Array(max);
  let used = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.byteLength > max) { await reader.cancel(); return null; }
      bytes.set(value, used); used += value.byteLength;
    }
    return new TextDecoder().decode(bytes.subarray(0, used));
  } finally { reader.releaseLock(); }
};

/** State-changing requests and sockets come from the app's own page: a matching Origin, or same-origin fetch metadata. */
export const fromSite = (request, siteOrigin) => {
  const origin = request.headers.get("origin");
  if (origin) return origin === siteOrigin;
  return request.headers.get("sec-fetch-site") === "same-origin";
};

export const clientIp = (request) => request.headers.get("cf-connecting-ip") || "local";

/** A rate limiter binding answers `{ success }`; an unbound one (tests, local dev) never limits. */
export const allowed = async (limiter, key) => !limiter || (await limiter.limit({ key })).success;

// Headers no caller may set: identity is decided here and handed on only by this Worker, never passed through.
const IDENTITY = /^(x-ooga-chat-|x-player-|x-room-token$|x-game-name$|x-client$)/i;
export const scrubbed = (headers) => {
  const out = new Headers(headers);
  for (const name of [...out.keys()]) if (IDENTITY.test(name)) out.delete(name);
  return out;
};
