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
  return { calls, advance: ms => { now += ms; }, request: (path = "/api/totems/0", headers = {}, method = "GET") => {
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
