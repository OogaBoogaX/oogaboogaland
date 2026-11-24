// Public data follows the server's authority; query parameters can only refuse an incompatible page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

const load = (file, dependencies, result) => compileFunction(readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8")
  .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
  .replace(/export\s+\{[^}]*\}\s+from\s+"[^"]+";/g, "")
  .replace(/export default /g, "const worker = ").replace(/export const /g, "const ") + `\nreturn ${result};`,
Object.keys(dependencies))(...Object.values(dependencies));
const baseline = "a".repeat(40), engine = "island-character-data-v1";
const environment = { CHARACTER_CATALOG_BASELINE: baseline, CHARACTER_CATALOG_ENGINE: engine };
const request = (query = "", method = "GET") => new Request(`https://island.invalid/api/characters/catalog${query}`, { method });
const fixture = ({ enabled = true, snapshot = null } = {}) => {
  let reads = 0;
  const handle = load("character-catalog-http", { catalogFor: () => ({ enabled, read: async () => { reads++; return snapshot; } }) }, "handleCharacterCatalog");
  return { handle: (req = request()) => handle(req, environment), reads: () => reads };
};

test("catalog endpoint stays disabled without reading storage", async () => {
  const f = fixture({ enabled: false }), response = await f.handle();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "catalog_disabled" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(f.reads(), 0);
});

test("catalog queries refuse other baselines and engines without selecting another catalog", async () => {
  const f = fixture();
  for (const query of ["?baseline=" + "b".repeat(40), "?engine=newer", "?baseline="]) {
    const response = await f.handle(request(query));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "catalog_incompatible" });
  }
  assert.equal(f.reads(), 0);
});

test("catalog endpoint reports a bounded outage and handles HEAD and unsupported methods", async () => {
  const f = fixture(), response = await f.handle();
  assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "15");
  assert.deepEqual(await response.json(), { error: "catalog_unavailable" });
  const head = await f.handle(request("", "HEAD"));
  assert.equal(head.status, 503); assert.equal(await head.text(), "");
  const rejected = await f.handle(request("", "POST"));
  assert.equal(rejected.status, 405); assert.equal(rejected.headers.get("allow"), "GET, HEAD");
  assert.equal(f.reads(), 2);
});

test("catalog endpoint exposes only public revision data and never caches an activation", async () => {
  const catalog = { environment: "production", baseline, engine, entries: [] };
  const snapshot = { revision: "c".repeat(64), generation: 3, catalog, rows: ["private implementation"], checkedAt: 123 };
  const f = fixture({ snapshot }), response = await f.handle(request(`?baseline=${baseline}&engine=${engine}`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { revision: snapshot.revision, generation: 3, catalog });
  assert.equal(response.headers.get("etag"), `"3-${snapshot.revision}"`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const head = await f.handle(request("", "HEAD"));
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
});

test("Worker routes catalogs and reports authority outages as retryable during service admission", async () => {
  let catalogCalls = 0;
  // The session lookup as http.js runs it, over a session whose character the catalog cannot tell now.
  const http = load("http", { parseCookies: () => new Map([["session", "token"]]), cookieNames: () => ({ session: "session" }),
    getSession: async () => ({ player: { id: 1, login: "ooga" }, session: {} }), contributorForEnv: () => null,
    contributorDecision: async () => ({ character: null, fresh: false }), oogatron: () => null }, "{ serviceSession, asPlayer, text }");
  const worker = load("index", {
    handleCharacterCatalog: async () => { catalogCalls++; return new Response("catalog"); },
    ...http,
    fromSite: () => true,
    gameName: () => "ghost-hunt:halloween",
  }, "worker");
  const env = { GAMES: {} };
  assert.equal(await (await worker.fetch(request(), env, {})).text(), "catalog");
  assert.equal(catalogCalls, 1);
  for (const path of ["/room", "/game/ghost-hunt/halloween", "/api/voice/ice"]) {
    const req = new Request(`https://island.invalid${path}`, {
      method: path.includes("voice") ? "POST" : "GET", headers: { upgrade: "websocket" }
    });
    const response = await worker.fetch(req, env, {});
    assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "15");
  }
});
