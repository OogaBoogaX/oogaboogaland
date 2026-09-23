// Runtime-neutral foundation: no listener, deployment entry point or provider credentials.
import { LIMITS, validateRequest, validateResponse } from "./validation.mjs";
import { SYSTEM_PROMPT } from "./personality.mjs";
import { mockProvider } from "./providers/mock.mjs";
const jsonType = value => /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value || "");
class HttpError extends Error { constructor(status) { super("request_failed"); this.status = status; } }
const readBody = async (request, signal) => {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.requestBytes)) throw new HttpError(413);
  if (!request.body) throw new HttpError(400);
  const reader = request.body.getReader(), bytes = new Uint8Array(LIMITS.requestBytes);
  let count = 0, complete = false;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      if (count + value.byteLength > bytes.length) throw new HttpError(413);
      bytes.set(value, count); count += value.byteLength;
    }
    signal.throwIfAborted();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count)); }
    catch { throw new HttpError(400); }
  } finally {
    signal.removeEventListener("abort", cancel); if (!complete) cancel(); reader.releaseLock();
  }
};
export const createHandler = ({ provider = mockProvider, allowedOrigins = [], timeoutMs = 6000, maxConcurrent = 4, perClientPerMinute = 8, totalPerMinute = 60 } = {}) => {
  if (!provider || typeof provider.generate !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 7000 || ![maxConcurrent, perClientPerMinute, totalPerMinute].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("invalid_server_configuration");
  const origins = new Set(allowedOrigins.map(origin => {
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) throw new Error("invalid_origin_configuration");
    return origin;
  }));
  // Local safeguards only. Deployment needs a shared, trusted-client limiter/budget.
  const clients = new Map(); let active = 0, minute = 0, total = 0;
  const admit = key => {
    const now = Date.now();
    if (now - minute >= 60000) { minute = now; total = 0; }
    if (total >= totalPerMinute) return false;
    for (const [id, row] of clients) if (now - row.at >= 60000) clients.delete(id);
    let row = clients.get(key);
    if (!row) { if (clients.size >= 1024) return false; row = { at: now, count: 0 }; clients.set(key, row); }
    if (row.count >= perClientPerMinute) return false;
    row.count++; total++; return true;
  };
  return async (request, { clientKey = "anonymous" } = {}) => {
    const origin = request.headers.get("origin"), permitted = origins.has(origin);
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
    if (permitted) headers["Access-Control-Allow-Origin"] = origin;
    const error = status => new Response(JSON.stringify({ error: "Zuzu is unavailable. Please try again later." }), { status, headers });
    const url = new URL(request.url);
    if (url.pathname !== "/api/zuzu/chat" || url.search) return error(404);
    if (!permitted) return error(403);
    if (request.method === "OPTIONS") {
      if (request.headers.get("access-control-request-method") !== "POST" || (request.headers.get("access-control-request-headers") || "").split(",").some(h => h.trim() && !["content-type", "accept"].includes(h.trim().toLowerCase()))) return error(403);
      return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Accept" } });
    }
    if (request.method !== "POST") { headers.Allow = "POST, OPTIONS"; return error(405); }
    if (!jsonType(request.headers.get("content-type")) || request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity") return error(415);
    if (typeof clientKey !== "string" || !clientKey || clientKey.length > 128) return error(400);
    if (request.signal.aborted) return error(408);
    if (!admit(clientKey)) return error(429);
    if (active >= maxConcurrent) return error(503);
    active++;
    const controller = new AbortController();
    const disconnect = () => controller.abort(new HttpError(408));
    request.signal.addEventListener("abort", disconnect, { once: true });
    let abortListener;
    const aborted = new Promise((resolve, reject) => { abortListener = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", abortListener, { once: true }); });
    const timer = setTimeout(() => controller.abort(new HttpError(504)), timeoutMs);
    const work = (async () => {
      const raw = await readBody(request, controller.signal);
      let body;
      try { body = validateRequest(raw); } catch { throw new HttpError(400); }
      controller.signal.throwIfAborted();
      // Provider selection/system prompt/output budget are never supplied by the client.
      const reply = await provider.generate({ systemPrompt: SYSTEM_PROMPT, message: body.message, history: body.history, session: body.session, signal: controller.signal, maxOutputChars: LIMITS.response });
      controller.signal.throwIfAborted();
      return validateResponse({ version: 1, text: reply });
    })();
    // Retain the slot if a broken provider ignores cancellation, rather than overbook it.
    work.then(() => { active--; }, () => { active--; });
    try { return new Response(JSON.stringify(await Promise.race([work, aborted])), { status: 200, headers }); }
    catch (e) { return error(e instanceof HttpError ? e.status : 502); }
    finally { clearTimeout(timer); request.signal.removeEventListener("abort", disconnect); controller.signal.removeEventListener("abort", abortListener); }
  };
};
