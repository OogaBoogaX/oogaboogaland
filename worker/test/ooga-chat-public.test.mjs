// Ooga Chat's public panels and Feed relay (#664): the island's cast over the bridge, Oogatron's snapshot through the
// edge with its state, and /donations/* to a fake bananapayserver PageApi with the donor taken from Ooga Chat's session.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryD1 } from "./cloudflare-host.mjs";

const { BASE_OPS, handleEnvelope } = await import("../src/chat-bridge.js");
const { castRows, publicOps } = await import("../src/chat-public.js");
const { makeEnvelope } = await import("../src/chat-bridge-protocol.js");
const { route } = await import("../chat/src/index.js");
const { forgetHello } = await import("../chat/src/bridge.js");
const { contributorsSnapshot, forgetPublic, STATS_KEEP_MS, validStats } = await import("../chat/src/public.js");
const { createSession, upsertPrincipal } = await import("../chat/src/session.js");

const SITE = "https://chat.example";
const CAST = [
  { handle: "zed", github_login: "zed-gh", display: "Zed", joined_at: "2026-09-02T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z", look: { skin: "#fff" }, voice: { poke: "hi" } },
  { handle: "amy", github_login: null, display: null, joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-02T00:00:00Z", look: {}, voice: null },
];
const NOW = Date.parse("2026-11-14T12:00:00Z");
const snapshot = (generated = "2026-11-14T11:59:00Z", extra = {}) => ({ meta: { schema_version: 3, org: "OogaBoogaX", generated_at: generated, ...extra },
  contributors: [{ login: "zed-gh", counts: { commits: 3, prs: 1, reviews: 0, issues: 2, comments: 5 }, first_seen_at: "2026-09-02T00:00:00Z", last_seen_at: "2026-11-13T00:00:00Z" }] });

const island = ({ features = "", down = false } = {}) => {
  const env = { ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: features };
  const ops = { ...BASE_OPS, ...publicOps({ cast: CAST }) };
  const state = { down, calls: 0 };
  state.binding = { call: async (envelope) => { state.calls++; if (state.down) throw new Error("down"); return handleEnvelope(env, structuredClone(envelope), ops); } };
  return state;
};

// Oogatron as a fake: what it answers next, and how often it was asked.
const oogatron = (answer = () => new Response(JSON.stringify(snapshot()), { headers: { "content-type": "application/json" } })) => {
  const state = { calls: 0, answer };
  state.fetch = async (url, init = {}) => {
    // As workerd does: its fetch has no "error" redirect mode and throws on it.
    assert.equal(init.redirect, "manual");
    assert.match(String(url), /^https:\/\/oogatron\./); state.calls++; return state.answer();
  };
  return state;
};

test("the island answers its cast with only the panel's public fields, sorted, with a revision, even when its bridge is off", async () => {
  assert.deepEqual(castRows(CAST), [
    { handle: "amy", github: "amy", display: null, joinedAt: Date.parse("2026-09-01T00:00:00Z"), lastCommitAt: Date.parse("2026-10-02T00:00:00Z") },
    { handle: "zed", github: "zed-gh", display: "Zed", joinedAt: Date.parse("2026-09-02T00:00:00Z"), lastCommitAt: Date.parse("2026-10-01T00:00:00Z") },
  ]);
  const off = await handleEnvelope({ ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "" }, makeEnvelope("staging", "cast"), { ...BASE_OPS, ...publicOps({ cast: CAST }) });
  assert.equal(off.ok, true, "public browsing never depends on the outward switch");
  assert.equal(off.result.count, 2);
  assert.match(off.result.revision, /^[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(off.result).includes("poke") && !JSON.stringify(off.result).includes("skin"));
  const again = await handleEnvelope({ ENVIRONMENT: "staging" }, makeEnvelope("staging", "cast"), { ...BASE_OPS, ...publicOps({ cast: [...CAST].reverse() }) });
  assert.equal(again.result.revision, off.result.revision, "the same cast in any order is the same revision");
});

test("Oogatron's snapshot is checked at the boundary: schema 3, this org, a sane time, a bounded list", () => {
  assert.ok(validStats(snapshot(), NOW));
  for (const bad of [null, {}, { meta: {} }, snapshot("2026-11-14T11:59:00Z", { schema_version: 2 }), snapshot("2026-11-14T11:59:00Z", { org: "Other" }),
    snapshot("2027-01-01T00:00:00Z"), snapshot("yesterday"), { meta: snapshot().meta, contributors: "x" }, { meta: snapshot().meta, contributors: new Array(4097).fill({}) }])
    assert.equal(validStats(bad, NOW), null, JSON.stringify(bad)?.slice(0, 60));
});

test("the contributors snapshot names each source's state and never makes up numbers", async () => {
  forgetPublic();
  const isle = island(), feed = oogatron();
  const env = { ENVIRONMENT: "staging", OBL: isle.binding };
  const ok = await contributorsSnapshot(env, { fetcher: feed.fetch, now: NOW });
  assert.equal(ok.schema, 1);
  assert.equal(ok.stale, false);
  assert.deepEqual(ok.sources.stats, { state: "ok", generatedAt: Date.parse("2026-11-14T11:59:00Z"), source: "oogatron" });
  assert.equal(ok.sources.cast.state, "ok");
  assert.equal(ok.cast.length, 2);
  assert.deepEqual(ok.stats.contributors[0].counts, { commits: 3, prs: 1, reviews: 0, issues: 2, comments: 5 }, "every category as Oogatron counts it");
  // Inside a minute neither source is asked again.
  await contributorsSnapshot(env, { fetcher: feed.fetch, now: NOW + 59000 });
  assert.equal(feed.calls, 1);
  assert.equal(isle.calls, 1);
  // Oogatron fails: the last good snapshot, marked stale; same revision only while nothing changed.
  feed.answer = () => new Response("oops", { status: 502 });
  const stale = await contributorsSnapshot(env, { fetcher: feed.fetch, now: NOW + 61000 });
  assert.equal(stale.sources.stats.state, "stale");
  assert.equal(stale.stale, true);
  assert.equal(stale.stats.meta.generated_at, "2026-11-14T11:59:00Z");
  assert.notEqual(stale.revision, ok.revision, "stale is part of what a client sees");
  // A day after it was generated it is dropped, not shown as zeros.
  const gone = await contributorsSnapshot(env, { fetcher: feed.fetch, now: Date.parse("2026-11-14T11:59:00Z") + STATS_KEEP_MS + 1 });
  assert.equal(gone.stats, null);
  assert.equal(gone.sources.stats.state, "unavailable");
  assert.equal(gone.generatedAt, null);
  // Nothing from Oogatron ever, and the island unreachable: both say so, and nothing is invented.
  forgetPublic();
  const lost = island({ down: true });
  const none = await contributorsSnapshot({ ENVIRONMENT: "staging", OBL: lost.binding }, { fetcher: async () => { throw new Error("offline"); }, now: NOW });
  assert.deepEqual({ cast: none.cast, stats: none.stats, castState: none.sources.cast.state, statsState: none.sources.stats.state, stale: none.stale },
    { cast: null, stats: null, castState: "unavailable", statsState: "unavailable", stale: true });
  // A snapshot from another org or schema is no snapshot.
  forgetPublic();
  const foreign = await contributorsSnapshot(env, { fetcher: async () => new Response(JSON.stringify(snapshot("2026-11-14T11:59:00Z", { org: "Elsewhere" }))), now: NOW });
  assert.equal(foreign.stats, null);
  // An endless body is cut off, not buffered.
  forgetPublic();
  const huge = await contributorsSnapshot(env, { fetcher: async () => new Response("x".repeat(3 * 1024 * 1024)), now: NOW });
  assert.equal(huge.stats, null);
});

test("the public route: no sign-in, public caching, an ETag that answers 304, a limiter", async () => {
  forgetPublic(); forgetHello();
  const isle = island(), feed = oogatron();
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: SITE, OBL: isle.binding, ASSETS: { fetch: async () => new Response("app") } };
  const deps = { fetch: feed.fetch, waitUntil: null, cache: null };
  const res = await route(new Request(`${SITE}/api/chat/public/contributors`), env, deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, max-age=30");
  const etag = res.headers.get("etag");
  assert.match(etag, /^"[0-9a-f]{16}"$/);
  const body = await res.json();
  assert.equal(etag, `"${body.revision}"`);
  const again = await route(new Request(`${SITE}/api/chat/public/contributors`, { headers: { "if-none-match": etag } }), env, deps);
  assert.equal(again.status, 304);
  assert.equal(await again.text(), "");
  assert.equal((await route(new Request(`${SITE}/api/chat/public/contributors`, { method: "POST" }), env, deps)).status, 405);
  const limited = await route(new Request(`${SITE}/api/chat/public/contributors`), { ...env, CHAT_PUBLIC_LIMITER: { limit: async () => ({ success: false }) } }, deps);
  assert.equal(limited.status, 429);
});

// bananapayserver's PageApi as a fake: every call it got, and what it answers.
const pageApi = ({ throws = false } = {}) => {
  const calls = [];
  const answer = (name) => async (request, ...rest) => {
    if (throws) throw new Error("relay down");
    calls.push({ name, url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: request.method === "POST" ? await request.text() : null, rest });
    return new Response(JSON.stringify({ ok: name }), { headers: { "content-type": "application/json" } });
  };
  return { calls, invoice: answer("invoice"), note: answer("note"), onchain: answer("onchain"), fetch: answer("socket") };
};

const relay = async ({ feed = true, throws = false, vars = {} } = {}) => {
  forgetHello();
  const DONATIONS = pageApi({ throws });
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: SITE, DB: memoryD1(new URL("../chat/migrations/", import.meta.url)), DONATIONS, ASSETS: { fetch: async () => new Response("app") },
    FEATURES: feed ? "feed" : "", ...vars };
  const github = await upsertPrincipal(env.DB, { provider: "github", providerUserId: "583231", login: "ooga-dev", display: "Ooga Dev", avatarUrl: null });
  const x = await upsertPrincipal(env.DB, { provider: "x", providerUserId: "1790000000000000001", login: "ooga_dev", display: "Ooga Dev", avatarUrl: null });
  const tokens = { github: await createSession(env.DB, github.id, "test"), x: await createSession(env.DB, x.id, "test") };
  const call = (path, { who = null, method = "POST", body = '{"sats":1000,"handle":"ooga-dev"}', headers = {} } = {}) => route(new Request(`${SITE}${path}`, {
    method, body: method === "POST" ? body : undefined,
    headers: { origin: SITE, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...(who ? { cookie: `__Host-ooga_chat_session=${tokens[who]}` } : {}), ...headers },
  }), env, { fetch: async () => { throw new Error("no network"); }, waitUntil: null, cache: null });
  return { env, DONATIONS, call };
};

test("Feed: a GitHub principal is the verified donor by numeric id; X and signed-out donors are anonymous", async () => {
  const r = await relay();
  assert.equal((await r.call("/donations/invoice", { who: "github" })).status, 200);
  assert.equal((await r.call("/donations/invoice", { who: "x" })).status, 200);
  assert.equal((await r.call("/donations/invoice")).status, 200);
  const [gh, x, anon] = r.DONATIONS.calls;
  assert.deepEqual(gh.rest, [{ id: 583231, login: "ooga-dev" }, "203.0.113.9"]);
  assert.deepEqual(x.rest, [null, "203.0.113.9"], "an X account never fills the GitHub id");
  assert.deepEqual(anon.rest, [null, "203.0.113.9"]);
  assert.equal(gh.body, '{"sats":1000,"handle":"ooga-dev"}', "the page's body, unchanged");
  assert.deepEqual(Object.keys(gh.headers), ["content-type"], "never the browser's cookies or identity");
  assert.equal(new URL(gh.url).pathname, "/donations/invoice");
  await r.call("/donations/note", { who: "github", body: '{"id":"inv","message":"hi"}' });
  await r.call("/donations/onchain", { who: "github", body: '{"id":"inv"}' });
  assert.deepEqual(r.DONATIONS.calls.slice(3).map((c) => [c.name, c.rest]), [["note", ["203.0.113.9"]], ["onchain", ["203.0.113.9"]]]);
});

test("Feed: closed is closed, foreign pages are refused, bodies and paths are bounded, the socket carries no identity", async () => {
  const off = await relay({ feed: false });
  const closed = await off.call("/donations/invoice", { who: "github" });
  assert.equal(closed.status, 503);
  assert.deepEqual(await closed.json(), { error: "closed" }, "never a simulated payment");
  assert.equal(off.DONATIONS.calls.length, 0);
  const down = await relay({ throws: true });
  assert.deepEqual(await (await down.call("/donations/invoice")).json(), { error: "closed" });
  const r = await relay();
  assert.equal((await r.call("/donations/invoice", { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await r.call("/donations/invoice", { body: "x".repeat(1025) })).status, 413);
  assert.equal((await r.call("/donations/invoice", { method: "GET" })).status, 404);
  assert.equal((await r.call("/donations/refund")).status, 404);
  assert.equal((await r.call("/donations/socket", { method: "POST" })).status, 404);
  const socket = await r.call("/donations/socket?after=inv_42&evil=1", { method: "GET", who: "github",
    headers: { upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "k", "sec-websocket-version": "13", "x-client": "1.1.1.1" } });
  assert.equal(socket.status, 200);
  const opened = r.DONATIONS.calls.at(-1);
  assert.equal(opened.name, "socket");
  assert.equal(new URL(opened.url).search, "?after=inv_42", "only `after` goes on");
  assert.equal(opened.headers["x-client"], "203.0.113.9", "the visitor's address, set here, whatever the browser sent");
  assert.equal(opened.headers.cookie, undefined);
  assert.deepEqual(Object.keys(opened.headers).sort(), ["connection", "sec-websocket-key", "sec-websocket-version", "upgrade", "x-client"]);
  const busy = await relay({ vars: { CHAT_PUBLIC_LIMITER: { limit: async () => ({ success: false }) } } });
  assert.equal((await busy.call("/donations/invoice")).status, 429);
  // A session that cannot be read never turns a signed-in donor anonymous.
  const broken = await relay();
  broken.env.DB = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR"); } }) }) };
  assert.deepEqual(await (await broken.call("/donations/invoice", { who: "github" })).json(), { error: "closed" });
  assert.equal(broken.DONATIONS.calls.length, 0);
});

test("the bootstrap says Feed is on only with its flag and its binding", async () => {
  forgetHello();
  const boot = async (vars) => (await (await route(new Request(`${SITE}/api/bootstrap`), { ENVIRONMENT: "staging", SITE_ORIGIN: SITE, ASSETS: { fetch: async () => new Response("", { status: 404 }) }, ...vars }, { fetch, waitUntil: null, cache: null })).json()).features.feed;
  assert.equal(await boot({ FEATURES: "feed", DONATIONS: pageApi() }), true);
  assert.equal(await boot({ FEATURES: "feed" }), false);
  assert.equal(await boot({ FEATURES: "", DONATIONS: pageApi() }), false);
});
