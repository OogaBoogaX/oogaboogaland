// The native panels' public data (#664): `GET /api/chat/public/contributors`, everything the full Contributing Oogas
// panel needs, for anyone, signed in or not, with no game socket and no player slot. Two sources, each named with its
// state, never merged into a made-up number:
//   cast   the island's registered Oogas (the bridge's `cast`, chat-public.js): handle, GitHub login, display, dates
//   stats  Oogatron's contribution snapshot (schema 3), the same one the island's page reads, passed through whole so
//          the native panel's own code (contributors.js) applies it with its categories, sorting and identity rules
// The edge asks Oogatron at most once a minute per isolate and the bridge at most every five minutes, so browsers never
// fetch either themselves. When Oogatron cannot be read, the last good snapshot is served with `stale: true` for up to a
// day after it was generated, then `stats: null` with its state `unavailable`: an outage shows as one, never as zeros.
// The envelope is `{ schema, revision, generatedAt, stale, sources, cast, stats }`; `revision` and the ETag change only
// when the data does (a 304 answers a matching If-None-Match), and nothing private is in it.

import { bridgeCall } from "./bridge.js";
import { allowed, clientIp, json, refusal } from "./http.js";

export const PUBLIC_SCHEMA = 1;
export const STATS_URL = "https://oogatron.wickedsmartbitcoin.workers.dev/v2/stats";
const STATS_MAX = 2 * 1024 * 1024;
const STATS_EVERY_MS = 60 * 1000;
const CAST_EVERY_MS = 5 * 60 * 1000;
export const STATS_KEEP_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An Oogatron snapshot the panel may use, or null: schema 3, this org, a sane generation time, a bounded list. */
export const validStats = (stats, now) => {
  const meta = stats && stats.meta;
  const generated = meta && typeof meta.generated_at === "string" && ISO.test(meta.generated_at) ? Date.parse(meta.generated_at) : NaN;
  if (!meta || meta.schema_version !== 3 || typeof meta.org !== "string" || meta.org.toLowerCase() !== "oogaboogax") return null;
  if (!Number.isFinite(generated) || generated > now + 60000 || !Array.isArray(stats.contributors) || stats.contributors.length > 4096) return null;
  return { stats, generatedAt: generated };
};

const readStats = async (fetcher, now) => {
  // "manual": a redirect is a 3xx, not `ok`, so it reads as no snapshot (Workers' fetch has no "error" mode).
  const res = await fetcher(STATS_URL, { headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(4000) });
  if (!res.ok || !res.body) return null;
  if (Number(res.headers.get("content-length") || 0) > STATS_MAX) return null;
  const reader = res.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > STATS_MAX) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  try { return validStats(JSON.parse(new TextDecoder().decode(bytes)), now); } catch { return null; }
};

const hex = async (text) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let out = "";
  for (const b of digest) out += b.toString(16).padStart(2, "0");
  return out;
};

// Per isolate: the last good of each source and when it was last asked for, keyed to the env it was read for.
let memories = new WeakMap();
export const forgetPublic = () => { memories = new WeakMap(); };
/**
 * The public panels' data as this isolate last read it, for the health view (#669), without reading it again: `ok`,
 * `stale` (a kept copy after a failed look), `unavailable`, or `unknown` when this isolate has not read it yet.
 */
export const publicState = (env, now = Date.now()) => {
  const memory = memories.get(env);
  if (!memory) return "unknown";
  const stats = memory.stats && now - memory.stats.generatedAt < STATS_KEEP_MS ? memory.stats : null;
  if (!stats || !memory.cast) return "unavailable";
  return memory.statsOk && memory.castOk && now - stats.generatedAt < STALE_AFTER_MS ? "ok" : "stale";
};

export const contributorsSnapshot = async (env, { fetcher = fetch, now = Date.now() } = {}) => {
  let memory = memories.get(env);
  if (!memory) { memory = { cast: null, castAt: -Infinity, castOk: false, stats: null, statsAt: -Infinity, statsOk: false }; memories.set(env, memory); }
  if (now - memory.castAt >= CAST_EVERY_MS || !memory.cast) {
    memory.castAt = now;
    const reply = await bridgeCall(env, "cast");
    const rows = reply.ok && reply.result && Array.isArray(reply.result.rows) ? reply.result : null;
    memory.castOk = !!rows;
    if (rows) memory.cast = { rows: rows.rows, revision: String(rows.revision || "").slice(0, 32), portraits: rows.portraits || null,
      catalogRevision: rows.catalogRevision, catalogGeneration: rows.catalogGeneration };
  }
  if (now - memory.statsAt >= STATS_EVERY_MS) {
    memory.statsAt = now;
    const fresh = await readStats(fetcher, now).catch(() => null);
    memory.statsOk = !!fresh;
    if (fresh) memory.stats = fresh;
  }
  const stats = memory.stats && now - memory.stats.generatedAt < STATS_KEEP_MS ? memory.stats : null;
  // `ok` only when the last look succeeded and what it found is recent; a kept copy after a failed look is `stale`.
  const statsState = !stats ? "unavailable" : memory.statsOk && now - stats.generatedAt < STALE_AFTER_MS ? "ok" : "stale";
  const castState = !memory.cast ? "unavailable" : memory.castOk ? "ok" : "stale";
  const sources = {
    cast: { state: castState, revision: memory.cast ? memory.cast.revision : null, count: memory.cast ? memory.cast.rows.length : 0 },
    stats: { state: statsState, generatedAt: stats ? stats.generatedAt : null, source: "oogatron" },
  };
  const revision = (await hex(`${sources.cast.revision}|${sources.stats.generatedAt}|${statsState}|${castState}`)).slice(0, 16);
  return {
    schema: PUBLIC_SCHEMA, revision,
    generatedAt: stats ? stats.generatedAt : null,
    stale: statsState !== "ok" || castState !== "ok",
    sources,
    cast: memory.cast ? memory.cast.rows : null,
    ...(memory.cast?.portraits ? { portraits: memory.cast.portraits, catalogRevision: memory.cast.catalogRevision,
      catalogGeneration: memory.cast.catalogGeneration } : {}),
    stats: stats ? stats.stats : null,
  };
};

export const handlePublic = async (request, env, url, deps) => {
  if (url.pathname.startsWith("/api/chat/public/portraits/")) {
    if (!["GET", "HEAD"].includes(request.method)) return refusal("method_not_allowed", 405);
    const match = /^\/api\/chat\/public\/portraits\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/.exec(url.pathname);
    if (!match) return refusal("not_found", 404);
    if (!(await allowed(env.CHAT_PUBLIC_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
    if (!env.OBL || typeof env.OBL.fetch !== "function") return refusal("unavailable", 503, { retryable: true, retryAfter: 15 });
    const headers = new Headers({ "x-ooga-chat-environment": env.ENVIRONMENT });
    const etag = request.headers.get("if-none-match");
    if (etag) headers.set("if-none-match", etag);
    try { return await env.OBL.fetch(new Request(`https://island.invalid/portraits/${match[1]}/${match[2]}.png`, { method: request.method, headers })); }
    catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 15 }); }
  }
  // The island's published character catalog, passed through as it serves it (its own size bound, no-store and checks),
  // for the 3D view to dress the cast as the island does; a compatibility query only refuses, as on the island.
  if (url.pathname === "/api/chat/public/characters/catalog") {
    if (!["GET", "HEAD"].includes(request.method)) return refusal("method_not_allowed", 405);
    const baseline = url.searchParams.get("baseline"), engine = url.searchParams.get("engine");
    if (baseline !== null && !/^[a-f0-9]{40}$/.test(baseline) || engine !== null && !/^[a-z0-9-]{1,64}$/.test(engine)) return refusal("malformed", 400);
    if (!(await allowed(env.CHAT_PUBLIC_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
    if (!env.OBL || typeof env.OBL.fetch !== "function") return refusal("unavailable", 503, { retryable: true, retryAfter: 15 });
    const query = new URLSearchParams();
    if (baseline !== null) query.set("baseline", baseline);
    if (engine !== null) query.set("engine", engine);
    const search = query.size ? `?${query}` : "";
    try { return await env.OBL.fetch(new Request(`https://island.invalid/catalog${search}`, { method: request.method, headers: { "x-ooga-chat-environment": env.ENVIRONMENT } })); }
    catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 15 }); }
  }
  if (url.pathname !== "/api/chat/public/contributors") return refusal("not_found", 404);
  if (request.method !== "GET" && request.method !== "HEAD") return refusal("method_not_allowed", 405);
  if (!(await allowed(env.CHAT_PUBLIC_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  // Oogatron is another Worker in this account: Cloudflare refuses one Worker fetching another's workers.dev address,
  // so the edge reaches it through its service binding (`OOGATRON`), and the public address only without one.
  const fetcher = env.OOGATRON && typeof env.OOGATRON.fetch === "function" ? (input, init) => env.OOGATRON.fetch(input, init) : deps.fetch;
  const body = await contributorsSnapshot(env, { fetcher });
  const etag = `"${body.revision}"`;
  const headers = { etag, "cache-control": "public, max-age=30", vary: "accept-encoding" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...headers, "x-content-type-options": "nosniff" } });
  return json(body, 200, headers);
};
