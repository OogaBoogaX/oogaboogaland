import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import "../../src/js/repo-island-data.js";

const REPOS = globalThis.BL.repoIslandData.REPOS.map((r) => r.repo);
const NOW = Date.parse("2026-11-11T12:00:00Z");
const fixture = (answer, env = { GITHUB_TOKEN: "test-token" }) => {
  let now = NOW;
  const entries = new Map(), calls = [];
  const cache = {
    async match(key) { const row = entries.get(key.url); return row && row.until > now ? row.response.clone() : undefined; },
    async put(key, response) { const seconds = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control"))[1]); entries.set(key.url, { response: response.clone(), until: now + seconds * 1000 }); }
  };
  const source = readFileSync(new URL("../src/repo-totems.js", import.meta.url), "utf8")
    .replace('import "../../src/js/repo-island-data.js";', "").replace('import { json } from "./http.js";', "").replace("export const handleRepoTotems", "const handleRepoTotems");
  const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
  class Clock extends Date { static now() { return now; } }
  const { handleRepoTotems } = compileFunction(`${source}\nreturn { handleRepoTotems };`, ["fetch", "caches", "Date", "json", "globalThis"], { filename: "repo-totems.js" })(async (url, options) => {
    const query = JSON.parse(options.body).query;
    calls.push({ url, auth: options.headers.authorization, query });
    return answer(query, calls.length);
  }, { default: cache }, Clock, json, globalThis);
  return { calls, advance: (ms) => { now += ms; }, request: (headers = {}, method = "GET", path = "/api/repo-totems") => {
    const request = new Request(`https://island.example${path}`, { headers, method });
    return handleRepoTotems(request, new URL(request.url), env);
  } };
};
// The aliases a query asks about, in order: [repo, cursor].
const asked = (query) => [...query.matchAll(/r(\d+):repository\(owner:("[^"]+"),name:("[^"]+")\)\{defaultBranchRef\{name\}pullRequests\([^)]*?(?:after:("[^"]+"))?\)/g)]
  .map((m) => [`${JSON.parse(m[2])}/${JSON.parse(m[3])}`, m[4] ? JSON.parse(m[4]) : null]);
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const pr = (number, mergedAgo, updatedAgo = mergedAgo, base = "master") => ({ number, mergedAt: iso(NOW - mergedAgo), updatedAt: iso(NOW - updatedAgo), baseRefName: base });
const reply = (query, repos) => new Response(JSON.stringify({ data: Object.fromEntries(asked(query).map(([repo, cursor], k) => [`r${k}`, repos(repo, cursor)])) }), { headers: { "content-type": "application/json" } });
const HOUR = 3600000;

test("one scan asks GraphQL about every repository in a few queries and keeps each one's newest merge into its default branch in the day", async () => {
  const f = fixture((query) => reply(query, (repo) => {
    if (repo === "bitcoin/bitcoin") return { defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: true, endCursor: "x" }, nodes: [pr(900, 30 * HOUR, HOUR), pr(901, 2 * HOUR), pr(902, HOUR, HOUR, "29.x"), pr(800, 30 * HOUR, 30 * HOUR)] } };
    if (repo === "lightningnetwork/lnd") return { defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(7, 3 * HOUR)] } };
    if (repo === "Foundation-Devices/passport2") return { defaultBranchRef: { name: "dev-v2.5.0" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(55, HOUR, HOUR, "dev-v2.5.0")] } };
    if (repo === "lightning/bolts") return null;
    return { defaultBranchRef: { name: "main" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } };
  }));
  const response = await f.request(), body = await response.json();
  const queried = f.calls.flatMap((c) => asked(c.query).map(([repo]) => repo));
  assert.deepEqual(queried.slice().sort(), REPOS.slice().sort());
  assert.ok(f.calls.length <= Math.ceil(REPOS.length / 40));
  assert.ok(f.calls.every((c) => c.url === "https://api.github.com/graphql" && c.auth === "Bearer test-token"));
  // Merged into a release branch or before the day is no merge; a moved default branch is followed; a repository GitHub
  // no longer knows is left out.
  assert.deepEqual(body.merges, { "bitcoin/bitcoin": [NOW - 2 * HOUR, 901], "lightningnetwork/lnd": [NOW - 3 * HOUR, 7], "Foundation-Devices/passport2": [NOW - HOUR, 55] });
  // Shared through the cache, revalidated by its tag, and aged out of the day between scans.
  await f.request(); assert.equal(f.calls.length, Math.ceil(REPOS.length / 42));
  assert.equal((await f.request({ "if-none-match": `W/${response.headers.get("etag")}` })).status, 304);
  // A day on, the next scan finds every one of those merges older than the day.
  f.advance(23 * HOUR);
  assert.deepEqual((await (await f.request()).json()).merges, {});
});

test("a repository whose first page is all of the day pages on, within the budget", async () => {
  const f = fixture((query) => reply(query, (repo, cursor) => repo !== "bitcoin/bitcoin"
    ? { defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }
    : cursor === "page2" ? { defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(77, HOUR / 2, 20 * HOUR), pr(1, 40 * HOUR, 40 * HOUR)] } }
      : { defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: true, endCursor: "page2" }, nodes: Array.from({ length: 25 }, (_, k) => pr(100 + k, 30 * HOUR, HOUR)) } }));
  const body = await (await f.request()).json();
  assert.deepEqual(body.merges, { "bitcoin/bitcoin": [NOW - HOUR / 2, 77] });
  assert.deepEqual(asked(f.calls.at(-1).query), [["bitcoin/bitcoin", "page2"]]);
});

test("without a token the feed is closed; a refusal answers from the last good scan", async () => {
  const closed = fixture(() => { throw new Error("asked GitHub"); }, {});
  const shut = await closed.request();
  assert.equal(shut.status, 503);
  assert.ok(Number(shut.headers.get("retry-after")) >= 3000);
  assert.equal(closed.calls.length, 0);
  let refuse = false;
  const f = fixture((query) => refuse ? new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil((NOW + 3 * HOUR) / 1000)) } })
    : reply(query, (repo) => ({ defaultBranchRef: { name: "master" }, pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: repo === "bitcoin/bitcoin" ? [pr(5, HOUR)] : [] } })));
  assert.deepEqual((await (await f.request()).json()).merges, { "bitcoin/bitcoin": [NOW - HOUR, 5] });
  refuse = true;
  f.advance(10 * 60000);
  assert.deepEqual((await (await f.request()).json()).merges, { "bitcoin/bitcoin": [NOW - HOUR, 5] });
  assert.equal((await f.request({}, "POST")).status, 405);
});
