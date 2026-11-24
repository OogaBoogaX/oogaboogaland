// Ooga Chat's infrastructure (#662): the private bridge's envelope checks, the edge's routing, bootstrap, health and
// feature flags, the identity schema, and the wrangler configs that keep staging and production apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { memoryD1, readJsonc } from "./cloudflare-host.mjs";

const { BRIDGE_VERSION, ENVELOPE_MAX, makeEnvelope, readReply } = await import("../src/chat-bridge-protocol.js");
const { BASE_OPS, BridgeRefusal, ChatBridge, bridgeFeatures, handleEnvelope } = await import("../src/chat-bridge.js");
const { bootstrap, effective, flagsOf, health, version } = await import("../chat/src/config.js");
const { forgetHello, forgetReadiness } = await import("../chat/src/bridge.js");
const { route } = await import("../chat/src/index.js");
const { scrubbed } = await import("../chat/src/http.js");

const SECRETS = { GITHUB_CLIENT_SECRET: "gh-secret-value", X_CLIENT_SECRET: "x-secret-value", REALTIME_SECRET: "sfu-secret-value" };
const island = (vars = {}) => ({ ENVIRONMENT: "staging", REALTIME_APP_ID: "app", REALTIME_SECRET: SECRETS.REALTIME_SECRET, ...vars });
// The edge's binding to the island, as the runtime gives it: `call` on the named entrypoint.
const bound = (env) => ({ call: (envelope) => new ChatBridge({}, env).call(structuredClone(envelope)) });
const assets = (build = "e310d64685e87b14") => ({ fetch: async (request) => new URL(request.url).pathname === "/build.json"
  ? new Response(JSON.stringify({ app: "ooga-chat", build }), { headers: { "content-type": "application/json" } })
  : new Response("<!doctype html>app", { headers: { "content-type": "text/html" } }) });
const edge = (vars = {}) => {
  forgetHello();
  forgetReadiness();
  return { ENVIRONMENT: "staging", SITE_ORIGIN: "https://chat.example", ASSETS: assets(), DB: memoryD1(new URL("../chat/migrations/", import.meta.url)),
    GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: SECRETS.GITHUB_CLIENT_SECRET, X_CLIENT_ID: "x-id", X_CLIENT_SECRET: SECRETS.X_CLIENT_SECRET,
    OBL: bound(island({ OOGA_CHAT_FEATURES: "bridge,outdoor,cloud,commons" })), DONATIONS: {}, FEATURES: "github,x,listen,speak,feed,commons,cloud", ...vars };
};
const get = (env, path, init = {}) => route(new Request(`https://chat.example${path}`, init), env);

test("the bridge answers hello always and every other operation only with its `bridge` feature", async () => {
  const env = island();
  const ok = await handleEnvelope(env, makeEnvelope("staging", "hello"));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.result, { version: BRIDGE_VERSION, environment: "staging", features: { bridge: false, outdoor: false, cloud: false, commons: false, commonsSend: false, chats: false, copies: false }, voice: true });
  const ops = { ...BASE_OPS, echo: { run: (_env, envelope) => envelope.payload } };
  assert.deepEqual((await handleEnvelope(env, makeEnvelope("staging", "echo", { a: 1 }), ops)).error, { code: "disabled", retryable: false });
  const on = island({ OOGA_CHAT_FEATURES: " bridge , nonsense,commons" });
  assert.deepEqual(bridgeFeatures(on), { bridge: true, outdoor: false, cloud: false, commons: true, commonsSend: false, chats: false, copies: false });
  assert.deepEqual((await handleEnvelope(on, makeEnvelope("staging", "echo", { a: 1 }), ops)).result, { a: 1 });
  // A sub-feature named without `bridge` stays off: the kill switch is one word.
  assert.deepEqual(bridgeFeatures(island({ OOGA_CHAT_FEATURES: "outdoor,cloud,commons,commons-send" })), { bridge: false, outdoor: false, cloud: false, commons: false, commonsSend: false, chats: false, copies: false });
  assert.equal(bridgeFeatures(island({ OOGA_CHAT_FEATURES: "bridge,commons-send" })).commonsSend, false, "sending needs `commons`");
  assert.equal(bridgeFeatures(island({ OOGA_CHAT_FEATURES: "copies" })).copies, false, "a chat's copy needs `chats`");
  assert.equal(bridgeFeatures(island({ OOGA_CHAT_FEATURES: "chats,copies" })).copies, true);
});

test("the bridge refuses a wrong version, another environment, a bad id, an unknown operation and an oversized envelope", async () => {
  const env = island({ OOGA_CHAT_FEATURES: "bridge" });
  const code = async (envelope) => (await handleEnvelope(env, envelope)).error?.code;
  assert.equal(await code({ ...makeEnvelope("staging", "hello"), v: BRIDGE_VERSION + 1 }), "protocol_unsupported");
  assert.equal(await code(makeEnvelope("production", "hello")), "environment_mismatch", "a production edge never reaches staging");
  assert.equal(await code(makeEnvelope("local", "hello")), "environment_mismatch");
  assert.equal(await code(makeEnvelope("staging", "hello", {}, null, "short")), "malformed");
  assert.equal(await code(makeEnvelope("staging", "hello", {}, null, "a/b/c/d/e/f")), "malformed");
  assert.equal(await code(makeEnvelope("staging", "toString")), "unknown_operation", "an inherited name is no operation");
  assert.equal(await code(makeEnvelope("staging", "drop_tables")), "unknown_operation");
  assert.equal(await code(makeEnvelope("staging", "hello", { pad: "x".repeat(ENVELOPE_MAX) })), "malformed");
  for (const bad of [null, [], "hello", 7]) assert.equal(await code(bad), "malformed");
  // An island Worker that does not know its environment answers nobody.
  assert.equal((await handleEnvelope({}, makeEnvelope("staging", "hello"))).error.code, "environment_mismatch");
});

test("an operation's own refusal passes on with its code; anything else is `internal`, without its message", async () => {
  const env = island({ OOGA_CHAT_FEATURES: "bridge" });
  const ops = { ...BASE_OPS, full: { run: () => { throw new BridgeRefusal("speaker_capacity", true, 30); } },
    broken: { run: () => { throw new Error("D1_ERROR: secret table detail"); } } };
  const quiet = console.error; console.error = () => {};
  try {
    assert.deepEqual((await handleEnvelope(env, makeEnvelope("staging", "full"), ops)).error, { code: "speaker_capacity", retryable: true, retryAfter: 30 });
    const broken = await handleEnvelope(env, makeEnvelope("staging", "broken"), ops);
    assert.deepEqual(broken.error, { code: "internal", retryable: true });
    assert.ok(!JSON.stringify(broken).includes("secret"));
  } finally { console.error = quiet; }
});

test("the edge reads only a well-formed reply; anything else is the bridge being unavailable", () => {
  assert.deepEqual(readReply({ ok: true, requestId: "abcdefgh", result: 1 }).result, 1);
  assert.deepEqual(readReply({ ok: false, error: { code: "disabled", retryable: false, extra: "x" } }), { ok: false, error: { code: "disabled", retryable: false } });
  for (const bad of [null, undefined, {}, { ok: true }, { ok: false, error: { code: "Not A Code" } }, { ok: false, error: { code: "x".repeat(41) } }, "ok"])
    assert.deepEqual(readReply(bad), { ok: false, error: { code: "unavailable", retryable: true } });
  assert.equal(readReply({ ok: false, error: { code: "rate_limited", retryAfter: 99999 } }).error.retryAfter, undefined, "an unbounded wait is dropped");
});

test("a feature counts only with everything it needs; the bridge must be this environment's and this version", () => {
  const hello = { version: BRIDGE_VERSION, environment: "staging", features: { bridge: true, outdoor: true, cloud: true, commons: true }, voice: true };
  const all = edge();
  assert.deepEqual(flagsOf({ FEATURES: "github, x ,bogus" }), new Set(["github", "x"]));
  assert.deepEqual(effective(all, hello), { github: true, x: true, listen: true, speak: true, feed: true, commons: true, cloud: true, chats: false, bridge: "ok" });
  assert.equal(effective(edge({ GITHUB_CLIENT_SECRET: "" }), hello).github, false, "no secret, no GitHub button");
  assert.equal(effective(edge({ DB: undefined }), hello).github, false, "no database, no sign-in");
  const noGithub = effective(edge({ GITHUB_CLIENT_SECRET: "" }), hello);
  assert.equal(noGithub.speak, false, "only a GitHub contributor speaks; X alone cannot");
  assert.equal(noGithub.commons, false);
  assert.equal(noGithub.listen, true, "an X listener still hears");
  assert.equal(effective(all, { ...hello, environment: "production" }).bridge, "mismatch");
  assert.equal(effective(all, { ...hello, environment: "production" }).listen, false);
  assert.equal(effective(all, { ...hello, version: BRIDGE_VERSION + 1 }).listen, false);
  assert.equal(effective(all, { ...hello, voice: false }).listen, false, "no SFU on the island, no listening");
  assert.equal(effective(all, { ...hello, features: { bridge: false } }).listen, false, "the island's kill switch wins over the edge's flags");
  assert.equal(effective(all, null).bridge, "unavailable");
  assert.equal(effective(edge({ OBL: undefined }), null).bridge, "unbound");
  assert.equal(effective(edge({ DONATIONS: undefined }), hello).feed, false);
  assert.deepEqual(effective(edge({ FEATURES: "" }), hello), { github: false, x: false, listen: false, speak: false, feed: false, commons: false, cloud: false, chats: false, bridge: "ok" });
});

test("the bootstrap is the app's contract: version 1, its protocols, flags, same-origin paths, and no secret", async () => {
  const env = edge();
  const res = await get(env, "/api/bootstrap");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.version, 1);
  assert.equal(body.build, "e310d64685e87b14");
  assert.deepEqual(body.protocols, { identity: [1], audience: [1], media: [1] });
  assert.deepEqual(body.features, { github: true, x: true, voice: true, feed: true, speak: true, commons: true, cloud: true, chats: false });
  assert.deepEqual(body.paths, { login: { github: "/auth/github", x: "/auth/x" }, session: "/api/chat/me", logout: "/api/chat/logout", audience: "/api/chat/audience",
    commons: "/api/chat/commons" });
  const flat = (value) => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(flat) : [];
  for (const path of flat(body.paths)) assert.match(path, /^\/(?!\/)[\w\-./]*$/, path);
  const text = JSON.stringify(body);
  for (const secret of Object.values(SECRETS)) assert.ok(!text.includes(secret));
  assert.ok(!text.includes("109e1799") && !text.includes("1e5c1e8f"), "no database or account id");
  // Everything off: nothing to sign in with and no audience address, so the app says so rather than failing a click.
  const off = await (await get(edge({ FEATURES: "" }), "/api/bootstrap")).json();
  assert.deepEqual(off.paths, { login: {}, session: "/api/chat/me", logout: "/api/chat/logout" });
  assert.equal(Object.values(off.features).some(Boolean), false);
  // A bridge that does not answer turns voice off, not the page.
  const lost = await (await get(edge({ OBL: { call: async () => { throw new Error("binding down"); } } }), "/api/bootstrap")).json();
  assert.equal(lost.features.voice, false);
  assert.equal(lost.features.github, true);
  assert.equal(lost.paths.audience, undefined);
});

test("health says what is off without naming anyone; version names the deployment", async () => {
  const audience = (sfu) => ({ getByName: () => ({ readiness: async () => ({ sfu, cleanup: "ok" }) }) });
  const withMedia = (sfu) => edge({ OBL: bound(island({ OOGA_CHAT_FEATURES: "bridge,outdoor,cloud,commons", AUDIENCE: audience(sfu) })) });
  const good = await (await get(withMedia("ok"), "/api/chat/health")).json();
  assert.deepEqual(good, { schema: 1, environment: "staging", status: "ok",
    checks: { assets: true, database: true, bridge: "ok", auth: { github: true, x: true }, voice: true, speak: true, feed: true, commons: true,
      media: { sfu: "ok", cleanup: "ok" }, publicData: "unknown" } });
  // #669: a degraded SFU degrades the whole, and listening off leaves media out of it.
  const sfuDown = await (await get(withMedia("degraded"), "/api/chat/health")).json();
  assert.deepEqual([sfuDown.status, sfuDown.checks.media.sfu], ["degraded", "degraded"]);
  const quiet = await (await get(edge({ FEATURES: "github", OBL: bound(island({ OOGA_CHAT_FEATURES: "bridge" })) }), "/api/chat/health")).json();
  assert.deepEqual([quiet.status, quiet.checks.media], ["ok", "off"]);
  const noBridge = await (await get(edge({ OBL: undefined }), "/api/chat/health")).json();
  assert.equal(noBridge.status, "degraded");
  assert.equal(noBridge.checks.bridge, "unbound");
  const failingDb = { prepare: () => ({ first: async () => { throw new Error("D1 down"); } }) };
  assert.equal((await (await get(edge({ DB: failingDb }), "/api/chat/health")).json()).checks.database, false);
  const bare = await (await get(edge({ ASSETS: { fetch: async () => new Response("", { status: 404 }) } }), "/api/chat/health")).json();
  assert.equal(bare.status, "down", "no staged app, nothing to serve");
  const v = await (await get(edge({ CF_VERSION_METADATA: { id: "v-123", tag: "" } }), "/api/chat/version")).json();
  assert.deepEqual(v, { schema: 1, environment: "staging", worker: "v-123", build: "e310d64685e87b14", protocols: { identity: [1], audience: [1], media: [1] }, bridge: BRIDGE_VERSION });
});

test("server paths never fall through to the app: unknown ones are JSON 404s, wrong methods 405, a flood 429", async () => {
  const env = edge();
  for (const path of ["/api/nope", "/api/chat/me/../../x", "/auth/anything", "/auth/github/elsewhere", "/api/chat/public/nope"]) {
    const res = await get(env, path);
    assert.equal(res.status, 404, path);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.deepEqual(await res.json(), { error: { code: "not_found", retryable: false } });
  }
  assert.equal((await get(env, "/api/bootstrap", { method: "POST" })).status, 405);
  const page = await get(env, "/");
  assert.equal(await page.text(), "<!doctype html>app");
  const limited = await get(edge({ CHAT_PUBLIC_LIMITER: { limit: async () => ({ success: false }) } }), "/api/chat/health");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
});

test("identity headers a caller sent are dropped before anything is handed on", () => {
  const out = scrubbed(new Headers({ "x-ooga-chat-principal": "{\"id\":\"pr_admin\"}", "X-Player-Id": "1", "x-room-token": "t", "x-game-name": "g",
    "x-client": "1.2.3.4", "content-type": "application/json", "upgrade": "websocket" }));
  assert.deepEqual([...out.keys()].sort(), ["content-type", "upgrade"]);
});

test("the identity schema: one principal per provider identity, ids as text, sessions and capabilities go with it", async () => {
  const db = memoryD1(new URL("../chat/migrations/", import.meta.url));
  const add = (id, provider, user) => db.prepare("INSERT INTO principals (id, provider, provider_user_id, login, created_at, profile_at, last_login_at) VALUES (?1, ?2, ?3, 'someone', 1, 1, 1)").bind(id, provider, user).run();
  await add("pr_a", "github", "583231");
  // The same number at X is another person: providers are never linked.
  await add("pr_b", "x", "583231");
  await assert.rejects(add("pr_c", "github", "583231"), /UNIQUE/);
  await assert.rejects(add("pr_d", "mastodon", "1"), /CHECK/);
  // An X id past 2^53 keeps every digit.
  await add("pr_e", "x", "1790000000000000001");
  assert.equal(await db.prepare("SELECT provider_user_id FROM principals WHERE id = 'pr_e'").first("provider_user_id"), "1790000000000000001");
  await db.prepare("INSERT INTO sessions (token_hash, principal_id, created_at, expires_at, last_used_at) VALUES ('h', 'pr_a', 1, 2, 1)").run();
  await db.prepare("INSERT INTO capabilities (principal_id, state, policy, checked_at) VALUES ('pr_a', 'eligible', 'v1', 1)").run();
  await assert.rejects(db.prepare("INSERT INTO capabilities (principal_id, state, policy, checked_at) VALUES ('pr_b', 'speaker', 'v1', 1)").run(), /CHECK/);
  await db.prepare("DELETE FROM principals WHERE id = 'pr_a'").run();
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 0, "deleting a principal deletes its sessions");
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM capabilities").first("n"), 0);
});

test("the configs keep staging and production apart, and the edge apart from the island", () => {
  const read = (name) => readJsonc(new URL(`../../${name}`, import.meta.url));
  for (const env of ["staging", "production"]) {
    const isle = read(`wrangler.${env}.jsonc`), chat = read(`wrangler.ooga-chat.${env}.jsonc`), other = env === "staging" ? "production" : "staging";
    assert.equal(chat.name, `ooga-chat-${env}`);
    assert.equal(chat.vars.ENVIRONMENT, env);
    assert.equal(isle.vars.ENVIRONMENT, env, "the bridge refuses an edge from another environment");
    // Each environment turns its switches on in the runbook's order, and only known ones.
    for (const flag of chat.vars.FEATURES.split(",").filter(Boolean)) assert.ok(["github", "x", "listen", "speak", "feed", "commons", "cloud", "chats"].includes(flag), `${env} ${flag}`);
    for (const flag of isle.vars.OOGA_CHAT_FEATURES.split(",").filter(Boolean)) assert.ok(["bridge", "outdoor", "cloud", "commons", "commons-send", "chats", "copies"].includes(flag), `${env} ${flag}`);
    for (const path of ["/api/*", "/auth/*", "/donations/*"]) assert.ok(chat.assets.run_worker_first.includes(path), path);
    const obl = chat.services.find((s) => s.binding === "OBL"), pay = chat.services.find((s) => s.binding === "DONATIONS");
    assert.deepEqual(obl, { binding: "OBL", service: isle.name, entrypoint: "ChatBridge" });
    assert.deepEqual(pay, isle.services.find((s) => s.binding === "DONATIONS"), "the same payment service the island uses");
    assert.equal(chat.d1_databases.length, 1);
    assert.equal(chat.d1_databases[0].database_name, `ooga-chat-${env}`);
    assert.notEqual(chat.d1_databases[0].database_id, isle.d1_databases[0].database_id, "never the island's tables");
    assert.notEqual(chat.d1_databases[0].database_id, read(`wrangler.ooga-chat.${other}.jsonc`).d1_databases[0].database_id);
    assert.match(chat.d1_databases[0].database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(existsSync(new URL(`../../${chat.d1_databases[0].migrations_dir}/0001_identity.sql`, import.meta.url)));
    const ids = [...isle.ratelimits, ...chat.ratelimits].map((r) => r.namespace_id);
    assert.equal(new Set(ids).size, ids.length, "every counter its own namespace");
    for (const r of chat.ratelimits) assert.ok(r.namespace_id.startsWith(env === "staging" ? "2" : "1"), `${r.name} counts in ${env}'s range`);
    assert.equal(chat.compatibility_date, isle.compatibility_date);
    assert.ok(!JSON.stringify(chat).match(/SECRET"\s*:/), "no secret values in a config");
  }
  const production = read("wrangler.ooga-chat.production.jsonc");
  assert.deepEqual(production.routes, [{ pattern: "ooga.chat", custom_domain: true }]);
  assert.equal(production.vars.SITE_ORIGIN, "https://ooga.chat");
  assert.equal(production.workers_dev, false, "one production origin for cookies and callbacks");
});
