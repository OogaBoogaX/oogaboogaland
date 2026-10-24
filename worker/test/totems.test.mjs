import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

const fixture = (fetcher, env = {}) => {
  let now = Date.parse("2026-10-22T12:00:00Z");
  const entries = new Map(), calls = [];
  const cache = {
    async match(key) { const row = entries.get(key.url); return row && row.until > now ? row.response.clone() : undefined; },
    async put(key, response) { const seconds = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control"))[1]); entries.set(key.url, { response: response.clone(), until: now + seconds * 1000 }); }
  };
  const source = readFileSync(new URL("../src/totems.js", import.meta.url), "utf8")
    .replace('import { json } from "./http.js";', "").replace("export const handleTotems", "const handleTotems");
  const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
  class Clock extends Date { static now() { return now; } }
  const { handleTotems } = compileFunction(`${source}\nreturn { handleTotems };`, ["fetch", "caches", "Date", "json"], { filename: "totems.js" })(async (...args) => { calls.push(args); return fetcher(...args); }, { default: cache }, Clock, json);
  return { calls, entries, advance: ms => { now += ms; }, request: (path = "/api/totems/0", headers = {}, method = "GET") => {
    const request = new Request(`https://island.example${path}`, { headers, method });
    return handleTotems(request, new URL(request.url), env);
  } };
};
const pull = (number, at = "2026-10-22T11:00:00Z", overrides = {}) => ({ number, html_url: `https://github.com/bitcoin/bitcoin/pull/${number}`,
  updated_at: at, merged_at: at, base: { ref: "master" }, ...overrides });

test("totem summaries discard full PR payloads and share/cache concurrent scans", async () => {
  const payload = [pull(42, undefined, { body: "discarded metadata".repeat(150000) }), pull(41)];
  const f = fixture(async () => new Response(JSON.stringify(payload), { headers: { etag: '"upstream-a"' } }));
  const [a, b] = await Promise.all([f.request(), f.request()]);
  assert.equal(f.calls.length, 1);
  const body = await a.text();
  assert.deepEqual(JSON.parse(body), { repo: "bitcoin/bitcoin", number: 42, mergedAt: Date.parse("2026-10-22T11:00:00Z") });
  assert.ok(Buffer.byteLength(body) < 200);
  assert.deepEqual(await b.json(), JSON.parse(body));
  await f.request(); assert.equal(f.calls.length, 1);
  const etag = a.headers.get("etag"), unchanged = await f.request(undefined, { "if-none-match": etag });
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), "");
  assert.equal((await f.request(undefined, { "if-none-match": `"other", W/${etag}` })).status, 304);
  assert.equal((await f.request(undefined, { "if-none-match": '"other"' })).status, 200);
});

test("totems reuse upstream validators and expire the last-day result", async () => {
  const f = fixture(async (_url, options) => options.headers["if-none-match"]
    ? new Response(null, { status: 304 })
    : new Response(JSON.stringify([pull(42)]), { headers: { etag: '"a"' } }));
  await f.request(); f.advance(361000);
  const second = await f.request(); assert.equal((await second.json()).number, 42);
  assert.equal(f.calls[1][1].headers["if-none-match"], '"a"');
  f.advance(24 * 3600000);
  const expired = await f.request(); assert.equal((await expired.json()).number, 0);
});

test("totems keep updated-order pagination while choosing the newest main/master merge", async () => {
  const first = Array.from({ length: 100 }, (_, i) => pull(1000 + i, "2026-10-22T11:55:00Z", { merged_at: null }));
  first[0] = pull(12, "2026-10-22T11:30:00Z", { base: { ref: "feature" } });
  const f = fixture(async url => new Response(JSON.stringify(new URL(url).searchParams.get("page") === "1" ? first : [pull(7), pull(6, "2026-10-20T12:00:00Z")])));
  const response = await f.request(); assert.equal((await response.json()).number, 7); assert.equal(f.calls.length, 2);
});

test("a spent GitHub limit is shared across repositories until reset", async () => {
  const reset = Date.parse("2026-10-22T13:00:00Z") / 1000;
  const f = fixture(async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }));
  const first = await f.request(); assert.equal(first.status, 403); assert.equal(first.headers.get("x-ratelimit-reset"), String(reset));
  const second = await f.request("/api/totems/1"); assert.equal(second.status, 403); assert.equal(f.calls.length, 1);
  assert.ok((await first.text()).length < 200);
});

test("totem routes accept only the four fixed repositories and GET", async () => {
  const f = fixture(async () => { throw new Error("No network expected"); });
  assert.equal((await f.request("/api/totems/https://attacker.example")).status, 404);
  assert.equal((await f.request(undefined, {}, "POST")).status, 405);
  assert.equal(f.calls.length, 0);
});

test("an optional GITHUB_TOKEN authorizes the GitHub scans and never leaves the Worker", async () => {
  const token = "github_pat_test_only_0123456789";
  const reset = Date.parse("2026-10-22T13:00:00Z") / 1000;
  const leaked = async (response) => [...response.headers].some(([, value]) => value.includes(token)) || (await response.text()).includes(token);
  const f = fixture(async () => new Response(JSON.stringify([pull(42)]), { headers: { etag: '"a"' } }), { GITHUB_TOKEN: token });
  const ok = await f.request(); assert.equal(ok.status, 200);
  const limited = fixture(async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }), { GITHUB_TOKEN: token });
  const refused = await limited.request(); assert.equal(refused.status, 403);
  for (const call of [...f.calls, ...limited.calls]) assert.equal(call[1].headers.authorization, `Bearer ${token}`);
  assert.equal(await leaked(ok), false); assert.equal(await leaked(refused), false);
  for (const env of [{}, { GITHUB_TOKEN: "" }]) {
    const plain = fixture(async () => new Response(JSON.stringify([pull(42)])), env);
    assert.equal((await plain.request()).status, 200);
    assert.equal("authorization" in plain.calls[0][1].headers, false);
  }
});

test("an authorized scan asks only api.github.com, refuses redirects and caches only summaries and page records", async () => {
  const token = "github_pat_test_only_0123456789";
  const f = fixture(async () => new Response(JSON.stringify([pull(42, undefined, { body: "x", user: { login: "someone" } })]), { headers: { etag: '"a"' } }), { GITHUB_TOKEN: token });
  assert.equal((await f.request()).status, 200);
  const [address, options] = f.calls[0], target = new URL(address);
  assert.equal(target.origin, "https://api.github.com");
  assert.equal(target.pathname, "/repos/bitcoin/bitcoin/pulls");
  assert.equal(options.redirect, "error");
  const cached = await Promise.all([...f.entries].map(async ([key, row]) => [new URL(key).pathname, await row.response.clone().text()]));
  assert.deepEqual(cached.map(([path]) => path).sort(), ["/__totem-cache/v1/0", "/__totem-cache/v1/0/page/1"]);
  for (const [, body] of cached) assert.equal(body.includes(token) || body.includes("someone"), false);
  assert.deepEqual(JSON.parse(cached.find(([path]) => path.endsWith("/page/1"))[1]),
    { etag: '"a"', records: [{ updated: Date.parse("2026-10-22T11:00:00Z"), merged: Date.parse("2026-10-22T11:00:00Z"), base: "master", number: 42, url: "https://github.com/bitcoin/bitcoin/pull/42" }] });
});

test("an expired or revoked token falls back to an unauthenticated scan instead of a cached failure", async () => {
  const token = "github_pat_expired_0123456789";
  const f = fixture(async (_url, options) => options.headers.authorization ? new Response("", { status: 401 }) : new Response(JSON.stringify([pull(42)])), { GITHUB_TOKEN: token });
  const response = await f.request();
  assert.equal(response.status, 200); assert.equal((await response.json()).number, 42);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][1].headers.authorization, `Bearer ${token}`);
  assert.equal("authorization" in f.calls[1][1].headers, false);
  assert.equal(f.calls[1][0], f.calls[0][0]);
});

test("a fetch that throws is a 503 the edge holds for a minute, then scans again", async () => {
  let up = false;
  const f = fixture(async () => { if (!up) throw new TypeError("network"); return new Response(JSON.stringify([pull(42)])); });
  const first = await f.request();
  assert.equal(first.status, 503); assert.equal(first.headers.get("retry-after"), "60");
  assert.deepEqual(await first.json(), { error: "feed unavailable" });
  up = true;
  assert.equal((await f.request()).status, 503); assert.equal(f.calls.length, 1);
  f.advance(61000);
  const later = await f.request();
  assert.equal(later.status, 200); assert.equal(f.calls.length, 2);
});
