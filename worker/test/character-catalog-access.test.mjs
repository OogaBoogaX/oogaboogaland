// Catalog revisions change authorization without replacing the Worker. No live network or publication.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryD1 } from "./cloudflare-host.mjs";
import { routeFixture } from "./routes.mjs";
import { cookieNames } from "../src/cookies.js";
import { createSession, upsertPlayerFromGitHub } from "../src/db.js";

const { createCatalogContributorLookup, contributorDecision, contributorForEnv } = await import("../src/contributor-access.js");
const { capabilityOps, decideCapability } = await import("../src/chat-capability.js");
const { publicOps } = await import("../src/chat-public.js");
const { displayOps } = await import("../src/chat-display.js");
const { oogatron } = await import("../src/contributor-policy.js");

const row = (handle, login = handle) => ({ handle, github_login: login, joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" });
const snapshot = (revision, rows, generation = 1) => ({ revision, rows, generation });
const loader = (initial) => {
  const state = { snapshot: initial, reads: 0 };
  return Object.assign(state, { read: async () => { state.reads++; return state.snapshot; }, fresh: () => !!state.snapshot });
};
const principal = (login = "Alice", id = "101") => ({ provider: "github", providerUserId: id, login });
const fallback = (rows = {}, fresh = true) => Object.assign(async (login) => rows[login] || null, { fresh: () => fresh });

test("published owners and aliases update without replacing the environment lookup", async () => {
  const catalog = loader(snapshot("first", [row("Alice")]));
  let external = 0;
  const lookup = createCatalogContributorLookup(catalog, Object.assign(async () => { external++; return null; }, { fresh: () => true }));
  assert.equal((await lookup("Alice", 101)).handle, "Alice");
  assert.equal(await lookup("Bob", 102), null); assert.equal(external, 1);
  catalog.snapshot = snapshot("second", [row("Alice"), row("Artist", "Bob")], 2);
  assert.equal((await lookup("Bob", 102)).handle, "Artist");
  assert.deepEqual(await lookup.check("Artist", 103), { character: null, fresh: true });
  assert.equal(external, 1, "a reserved art handle never falls back to Oogatron");
  catalog.snapshot = snapshot("third", [row("Alice")], 3);
  assert.equal(await lookup("Bob", 102), null, "a catalog removal rebuilds the ownership map");
});

test("missing catalog authority refuses bundled and external owners without asserting ineligibility", async () => {
  const catalog = loader(null); let reads = 0;
  const lookup = createCatalogContributorLookup(catalog, Object.assign(async () => { reads++; return { handle: "Alice" }; }, { fresh: () => true }));
  assert.deepEqual(await lookup.check("Alice", 101), { character: null, fresh: false });
  assert.equal(lookup.fresh(), false); assert.equal(reads, 0);
  assert.equal((await decideCapability({}, principal(), lookup)).state, "unknown");
  catalog.snapshot = snapshot("recovered", [row("Alice")]);
  assert.equal((await decideCapability({}, principal(), lookup)).state, "eligible");
});

test("concurrent outcomes keep their own availability instead of consulting a last-user flag", async () => {
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const catalog = { read: () => ++calls === 1 ? first : Promise.resolve(snapshot("ready", [row("Bob")])), fresh: () => true };
  const lookup = createCatalogContributorLookup(catalog, fallback());
  const waiting = contributorDecision(lookup, "Alice", 101);
  assert.equal((await contributorDecision(lookup, "Bob", 102)).character.handle, "Bob");
  release(null);
  assert.deepEqual(await waiting, { character: null, fresh: false });
});

test("numeric owner pins survive catalog refreshes and cannot be claimed by a recycled login", async () => {
  const catalog = loader(snapshot("first", [row("Bitcoin-Bill", "renamed-owner")]));
  const lookup = createCatalogContributorLookup(catalog, fallback({ "Bitcoin-Bill": { handle: "Bitcoin-Bill" } }, false));
  assert.equal((await lookup("renamed-owner", 185141343)).handle, "Bitcoin-Bill");
  assert.deepEqual(await lookup.check("renamed-owner", 999), { character: null, fresh: true });
  assert.deepEqual(await lookup.check("Bitcoin-Bill", 999), { character: null, fresh: true });
  catalog.snapshot = snapshot("second", [row("Elsewhere")], 2);
  assert.deepEqual(await lookup.check("renamed-owner", 185141343), { character: null, fresh: true });
});

test("environment lookups keep their contribution feeds and availability separate", async () => {
  let productionReads = 0, stagingReads = 0;
  const feed = (who, count) => ({ fetch: async () => {
    count(); const now = new Date().toISOString();
    return Response.json({ meta: { org: "OogaBoogaX", schema_version: 3, generated_at: now }, contributors: [
      { login: who, counts: { commits: 1 }, first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-10-01T00:00:00Z" }
    ] });
  } });
  const prod = { ENVIRONMENT: "production", OOGATRON: feed("catalog-prod-only", () => productionReads++) };
  const staging = { ENVIRONMENT: "staging", OOGATRON: feed("catalog-stage-only", () => stagingReads++) };
  const a = contributorForEnv(prod), b = contributorForEnv(staging);
  assert.equal(a, contributorForEnv(prod)); assert.notEqual(a, b);
  assert.equal((await a("catalog-prod-only", 1, oogatron(prod))).handle, "catalog-prod-only");
  assert.equal(await b("catalog-prod-only", 1, oogatron(staging)), null);
  assert.equal((await b("catalog-stage-only", 2, oogatron(staging))).handle, "catalog-stage-only");
  assert.equal(productionReads, 1); assert.equal(stagingReads, 1);
});

test("public cast caches follow revision and generation, remain environment-specific and refuse unavailable reads", async () => {
  const prod = {}, staging = {}, a = loader(snapshot("p1", [row("Alice")])), b = loader(snapshot("s1", [row("Bob")]));
  const op = publicOps({ catalogFor: (env) => env === prod ? a : b }).cast;
  const first = await op.run(prod), second = await op.run(staging);
  assert.deepEqual(first.rows.map((c) => c.handle), ["Alice"]); assert.deepEqual(second.rows.map((c) => c.handle), ["Bob"]);
  assert.equal(first, await op.run(prod));
  a.snapshot = snapshot("p2", [row("Alice"), row("Artist", "Carol")], 2);
  const updated = await op.run(prod);
  assert.notEqual(updated.revision, first.revision); assert.equal(updated.catalogRevision, "p2"); assert.equal(updated.catalogGeneration, 2);
  a.snapshot = snapshot("p1", [row("Alice")], 3);
  const rollback = await op.run(prod);
  assert.notEqual(rollback.revision, first.revision, "rollback activation changes the answer even with identical rows");
  a.snapshot = null;
  await assert.rejects(op.run(prod), (error) => error.code === "unavailable" && error.retryable === true);
  assert.equal(second, await op.run(staging));
});

test("capability and display operations resolve the environment-specific lookup and leave unknown eligibility unwritten", async () => {
  const prod = { OOGA_CHAT_FEATURES: "bridge,commons" }, staging = { OOGA_CHAT_FEATURES: "bridge,commons" };
  const a = createCatalogContributorLookup(loader(snapshot("p1", [row("Alice")])), fallback());
  const b = createCatalogContributorLookup(loader(null), fallback());
  const forEnv = (env) => env === prod ? a : b;
  const op = capabilityOps({ contributorForEnv: forEnv }).capability;
  assert.equal((await op.run(prod, { principal: principal() })).state, "eligible");
  assert.equal((await op.run(staging, { principal: principal() })).state, "unknown");
  const DB = memoryD1(new URL("../migrations/", import.meta.url)); staging.DB = DB;
  await assert.rejects(displayOps({ contributorForEnv: forEnv }).display.run(staging, { principal: principal(), payload: { display: "Alice Ooga" } }),
    (error) => error.code === "unavailable");
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM players").get().n, 0);
  DB.raw.close();
});

test("OAuth and existing sessions report catalog unavailability while logout remains available", async () => {
  const catalog = loader(null), SITE = "https://island.test", DB = memoryD1(new URL("../migrations/", import.meta.url));
  const routes = routeFixture({ catalog, fetcher: async (url) => url === "https://github.com/login/oauth/access_token"
    ? Response.json({ access_token: "fixture" }) : Response.json({ id: 101, login: "Alice", type: "User" }) });
  const env = { SITE_ORIGIN: SITE, DB }, callback = new Request(`${SITE}/auth/callback?code=fixture&state=held`,
    { headers: { cookie: `${cookieNames(SITE).oauth}=held.${btoa(encodeURIComponent("/"))}` } });
  const unavailable = await routes.handleAuth(callback, env, new URL(callback.url));
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get("retry-after"), "60");
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM players").get().n, 0);
  await upsertPlayerFromGitHub(DB, { id: 101, login: "Alice" }); const token = await createSession(DB, 101, "fixture");
  const cookie = `${cookieNames(SITE).session}=${token}`, me = new Request(`${SITE}/api/me`, { headers: { cookie } });
  const response = await routes.handleApi(me, env, new URL(me.url));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "unavailable" });
  catalog.snapshot = snapshot("recovered", [row("Alice")]);
  const recovered = await routes.handleApi(me, env, new URL(me.url));
  assert.equal(recovered.status, 200); assert.equal((await recovered.json()).player.login, "Alice");
  catalog.snapshot = null;
  const logout = new Request(`${SITE}/auth/logout`, { method: "POST", headers: { cookie, origin: SITE } });
  assert.equal((await routes.handleAuth(logout, env, new URL(logout.url))).status, 204);
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
  DB.raw.close();
});

test("public voice cleanup survives a catalog outage without bypassing account or request guards", async () => {
  const catalog = loader(null), SITE = "https://island.test", DB = memoryD1(new URL("../migrations/", import.meta.url));
  try {
    await upsertPlayerFromGitHub(DB, { id: 101, login: "Alice" });
    const token = await createSession(DB, 101, "fixture"), cookie = `${cookieNames(SITE).session}=${token}`;
    const { worker } = routeFixture({ catalog }), forwarded = [], limited = [];
    let allow = true;
    const env = { SITE_ORIGIN: SITE, DB,
      VOICE_LIMITER: { limit: async ({ key }) => { limited.push(key); return { success: allow }; } },
      ROOM: { getByName: (name) => { assert.equal(name, "island"); return { fetch: async (request) => {
        forwarded.push({ path: new URL(request.url).pathname, id: request.headers.get("x-player-id"),
          connection: request.headers.get("x-room-token"), body: await request.text() });
        return new Response(null, { status: 204 });
      } }; } },
    };
    const request = (op, headers = {}, method = "POST", body = "{}") => new Request(`${SITE}/api/voice/${op}`, {
      method, headers: { cookie, origin: SITE, "x-room-token": "current-connection", "x-player-id": "999", ...headers },
      ...(method === "POST" ? { body } : {}),
    });
    for (const op of ["session", "publish", "pull", "ice", "leave/extra"])
      assert.equal((await worker.fetch(request(op), env)).status, 503, `${op} still needs catalog authority`);
    assert.equal(forwarded.length, 0);
    const reads = catalog.reads;
    for (const op of ["leave", "unpublish", "close"]) {
      assert.equal((await worker.fetch(request(op), env)).status, 204);
      assert.deepEqual(forwarded.at(-1), { path: `/voice/${op}`, id: "101", connection: "current-connection", body: "{}" });
    }
    assert.equal(catalog.reads, reads, "cleanup never waits for unavailable authority");
    assert.deepEqual(limited, ["101", "101", "101"], "cleanup keeps the authenticated account's rate limit");
    assert.equal((await worker.fetch(request("leave", { cookie: "" }), env)).status, 401);
    assert.equal((await worker.fetch(request("leave", { origin: "https://other.test" }), env)).status, 403);
    assert.equal((await worker.fetch(request("leave", {}, "GET"), env)).status, 405);
    allow = false;
    assert.equal((await worker.fetch(request("leave"), env)).status, 429);
    allow = true;
    assert.equal((await worker.fetch(request("leave", {}, "POST", "x".repeat(256 * 1024 + 1)), env)).status, 413);
    DB.raw.prepare("UPDATE sessions SET expires_at = 0 WHERE player_id = 101").run();
    assert.equal((await worker.fetch(request("leave"), env)).status, 401);
    assert.equal(forwarded.length, 3, "refused cleanup requests never reach the Room");
    assert.equal(catalog.reads, reads);
  } finally { DB.raw.close(); }
});
