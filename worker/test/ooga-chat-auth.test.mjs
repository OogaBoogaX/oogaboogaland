// Ooga Chat sign-in (#663): GitHub and X through the real routes with fake providers and a real SQLite D1, the
// island's capability answer through the real bridge with a fake contributor lookup, the account lifecycle and the
// picture proxy. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryD1 } from "./cloudflare-host.mjs";

const { BASE_OPS, handleEnvelope } = await import("../src/chat-bridge.js");
const { capabilityOps, githubAccount, POLICY } = await import("../src/chat-capability.js");
const { makeEnvelope } = await import("../src/chat-bridge-protocol.js");
const { route } = await import("../chat/src/index.js");
const { forgetHello } = await import("../chat/src/bridge.js");
const { REFRESH_MS, STALE_MS, capabilityFor } = await import("../chat/src/capability.js");
const { avatarUrl } = await import("../chat/src/providers.js");
const { cleanDisplay, purgeExpired } = await import("../chat/src/session.js");

const SITE = "https://chat.example";
const BIG_X_ID = "1790000000000000001";

// The island, behind its bridge: a contributor lookup the check controls, a ban list, and every `revoke` it was asked.
const islandOf = ({ contributors = { "ooga-dev": "ooga-dev" }, fresh = true, banned = [], names = {} } = {}) => {
  const revoked = [];
  const contributorFor = Object.assign(async (login) => contributors[login.toLowerCase()] ? { handle: contributors[login.toLowerCase()] } : null, { fresh: () => fresh });
  const DB = { prepare: () => ({ bind: (id) => ({ first: async () => (banned.includes(id) ? { banned_at: 1 } : names[id] ? { display: names[id] } : null) }) }) };
  const env = { ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "bridge", REALTIME_APP_ID: "app", REALTIME_SECRET: "s", DB };
  const ops = { ...BASE_OPS, ...capabilityOps({ contributorFor }),
    revoke: { run: (_env, envelope) => { revoked.push({ principal: envelope.principal.id, reason: envelope.payload.reason }); return { revoked: 1 }; } } };
  const island = { revoked, contributors, down: false, calls: 0 };
  island.binding = { call: async (envelope) => { island.calls++; if (island.down) throw new Error("binding down"); return handleEnvelope(env, structuredClone(envelope), ops); } };
  return island;
};

// GitHub and X as fakes: each answers the requests a sign-in makes and records them.
const providers = ({ githubUser = { id: 583231, login: "ooga-dev", name: "Ooga Dev", type: "User", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4" },
  xUser = { id: BIG_X_ID, username: "ooga_dev", name: "Ooga \u202eDev", profile_image_url: "https://pbs.twimg.com/profile_images/1/me_normal.jpg" }, status = {} } = {}) => {
  const seen = [];
  const fetch = async (input, init = {}) => {
    // As workerd does: its fetch has no "error" redirect mode and throws on it.
    if (init.redirect !== undefined && init.redirect !== "follow" && init.redirect !== "manual") throw new TypeError(`Invalid redirect value ${init.redirect}`);
    const url = new URL(typeof input === "string" ? input : input.url);
    seen.push({ url: url.toString(), init });
    const answer = (body, code = 200, type = "application/json") => new Response(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body), { status: code, headers: { "content-type": type } });
    const key = `${url.host}${url.pathname}`;
    if (status[key]) return answer({ error: "nope" }, status[key]);
    if (key === "github.com/login/oauth/access_token") return answer({ access_token: "gho_github_token" });
    if (key === "api.github.com/user") return answer(githubUser);
    if (key === "api.x.com/2/oauth2/token") return answer({ access_token: "x_access_token", token_type: "bearer" });
    if (key === "api.x.com/2/users/me") return answer({ data: xUser });
    if (key === "api.x.com/2/oauth2/revoke") return answer({ revoked: true });
    if (url.host === "avatars.githubusercontent.com" || url.host === "pbs.twimg.com") return answer(new Uint8Array([137, 80, 78, 71]), 200, "image/png");
    throw new Error(`unexpected request ${url}`);
  };
  return { fetch, seen };
};

const setup = ({ island = islandOf(), fake = providers(), vars = {} } = {}) => {
  forgetHello();
  const tasks = [];
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: SITE, DB: memoryD1(new URL("../chat/migrations/", import.meta.url)), ASSETS: { fetch: async () => new Response("app") },
    GITHUB_CLIENT_ID: "gh-client", GITHUB_CLIENT_SECRET: "gh-secret", X_CLIENT_ID: "x-client", X_CLIENT_SECRET: "x-secret",
    OBL: island.binding, FEATURES: "github,x,listen,speak", ...vars };
  const deps = { fetch: fake.fetch, waitUntil: (task) => tasks.push(task), cache: null };
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const take = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";"), eq = pair.indexOf("=");
      const name = pair.slice(0, eq), value = pair.slice(eq + 1);
      if (/Max-Age=0/.test(line)) jar.delete(name); else jar.set(name, value);
    }
    return res;
  };
  const go = async (path, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (jar.size && !headers.has("cookie")) headers.set("cookie", cookieHeader());
    const res = take(await route(new Request(`${SITE}${path}`, { ...init, headers }), env, deps));
    await Promise.all(tasks.splice(0));
    return res;
  };
  const signIn = async (provider = "github") => {
    const start = await go(`/auth/${provider}`);
    assert.equal(start.status, 302);
    const to = new URL(start.headers.get("location"));
    return go(`/auth/${provider}/callback?code=the-code&state=${encodeURIComponent(to.searchParams.get("state"))}`);
  };
  const me = async () => go("/api/chat/me");
  return { env, deps, jar, go, signIn, me, fake, island };
};
const site = { origin: SITE };

test("GitHub: starts with a bound single-use state, ends home with the result alone, and opens a listener session", async () => {
  const s = setup();
  const start = await s.go("/auth/github");
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(to.searchParams.get("client_id"), "gh-client");
  assert.equal(to.searchParams.get("redirect_uri"), `${SITE}/auth/github/callback`);
  assert.equal(to.searchParams.get("scope"), null, "no GitHub scope: the public profile is enough");
  assert.match(start.headers.get("set-cookie"), /^__Host-ooga_chat_oauth=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  const row = await s.env.DB.prepare("SELECT * FROM oauth_states").first();
  assert.equal(row.provider, "github");
  assert.equal(row.verifier, null);
  assert.notEqual(row.state_hash, to.searchParams.get("state"), "D1 keeps the state's hash, not the state");
  const done = await s.go(`/auth/github/callback?code=the-code&state=${to.searchParams.get("state")}`);
  assert.equal(done.status, 303);
  assert.equal(done.headers.get("location"), "/?signin=ok&provider=github");
  assert.ok(s.jar.has("__Host-ooga_chat_session"));
  assert.ok(!s.jar.has("__Host-ooga_chat_oauth"), "the sign-in cookie is gone");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM oauth_states").first("n"), 0, "spent");
  const view = await (await s.me()).json();
  assert.equal(view.schema, 1);
  assert.match(view.identity.principal, /^pr_[A-Za-z0-9_-]{22}$/);
  assert.deepEqual({ ...view.identity, principal: "x" }, { principal: "x", participant: "gh:583231", provider: "github", providerUserId: "583231", login: "ooga-dev", display: "Ooga Dev",
    avatar: `/api/chat/avatar/${view.identity.principal}/${view.identity.avatar.split("/").pop()}` });
  assert.deepEqual(view.capabilities, { listen: true, react: true, speak: true, contributor: true, raiseHand: true });
  assert.equal(view.eligibility.state, "eligible");
  assert.equal(view.eligibility.staleAfter, 900);
  assert.equal(view.eligibility.policy, POLICY);
  assert.deepEqual(view.character, { handle: "ooga-dev" });
  // The provider's token went to GitHub's API alone and is nowhere in the answer or the database.
  const text = JSON.stringify(view) + JSON.stringify(await s.env.DB.prepare("SELECT * FROM principals").all());
  for (const secret of ["gho_github_token", "the-code", "gh-secret"]) assert.ok(!text.includes(secret), secret);
  const exchange = s.fake.seen.find((r) => r.url.includes("access_token"));
  assert.equal(exchange.init.redirect, "manual");
});

test("an ineligible GitHub account still signs in, as a listener; X is a listener whatever its name", async () => {
  const s = setup({ island: islandOf({ contributors: {} }) });
  assert.equal((await s.signIn("github")).headers.get("location"), "/?signin=ok&provider=github");
  const view = await (await s.me()).json();
  assert.equal(view.eligibility.state, "ineligible");
  assert.deepEqual(view.capabilities, { listen: true, react: true, speak: false, contributor: false, raiseHand: false });
  assert.equal(view.character, null);
  // An X account named exactly like a contributor is no contributor: it is never asked about.
  const x = setup({ island: islandOf({ contributors: { ooga_dev: "ooga_dev" } }) });
  await x.signIn("x");
  const xv = await (await x.me()).json();
  assert.equal(xv.identity.provider, "x");
  assert.equal(xv.identity.providerUserId, BIG_X_ID, "every digit of an id past 2^53");
  assert.equal(xv.eligibility.state, "ineligible");
  assert.equal(xv.capabilities.speak, false);
  assert.equal(x.island.calls, 1, "only hello crossed the bridge; X never asks about capability");
});

test("X: PKCE S256, a confidential exchange, user lookup only, and the token revoked after the one read", async () => {
  const s = setup();
  const start = await s.go("/auth/x");
  const to = new URL(start.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://x.com/i/oauth2/authorize");
  assert.equal(to.searchParams.get("scope"), "tweet.read users.read");
  assert.equal(to.searchParams.get("code_challenge_method"), "S256");
  assert.equal(to.searchParams.get("redirect_uri"), `${SITE}/auth/x/callback`);
  const { verifier } = await s.env.DB.prepare("SELECT verifier FROM oauth_states").first();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  assert.equal(to.searchParams.get("code_challenge"), digest);
  await s.go(`/auth/x/callback?code=x-code&state=${to.searchParams.get("state")}`);
  const urls = s.fake.seen.map((r) => r.url);
  assert.deepEqual(urls, ["https://api.x.com/2/oauth2/token", "https://api.x.com/2/users/me?user.fields=profile_image_url", "https://api.x.com/2/oauth2/revoke"]);
  const exchange = s.fake.seen[0];
  assert.equal(exchange.init.headers.authorization, `Basic ${btoa("x-client:x-secret")}`);
  assert.equal(new URLSearchParams(exchange.init.body).get("code_verifier"), verifier);
  const view = await (await s.me()).json();
  assert.equal(view.identity.login, "ooga_dev");
  assert.equal(view.identity.display, "Ooga Dev", "direction overrides never reach a display name");
  const { avatar_url } = await s.env.DB.prepare("SELECT avatar_url FROM principals").first();
  assert.equal(avatar_url, "https://pbs.twimg.com/profile_images/1/me_200x200.jpg");
});

test("a state is good once, for its provider and its browser, within ten minutes; refusals open no session", async () => {
  const s = setup();
  const state = async (provider = "github") => new URL((await s.go(`/auth/${provider}`)).headers.get("location")).searchParams.get("state");
  const sessions = () => s.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n");
  const result = (res) => res.headers.get("location");
  // Replay: the second callback with the same state fails.
  const once = await state();
  assert.equal(result(await s.go(`/auth/github/callback?code=c&state=${once}`)), "/?signin=ok&provider=github");
  s.jar.delete("__Host-ooga_chat_session");
  s.jar.set("__Host-ooga_chat_oauth", "replayed-nonce");
  assert.equal(result(await s.go(`/auth/github/callback?code=c&state=${once}`)), "/?signin=failed&provider=github");
  // Another browser: the state is right, the nonce cookie is not.
  const other = await state();
  s.jar.set("__Host-ooga_chat_oauth", "someone-elses-nonce");
  assert.equal(result(await s.go(`/auth/github/callback?code=c&state=${other}`)), "/?signin=failed&provider=github");
  // A GitHub state at X's callback, and no state at all.
  const crossed = await state("github");
  assert.equal(result(await s.go(`/auth/x/callback?code=c&state=${crossed}`)), "/?signin=failed&provider=x");
  assert.equal(result(await s.go("/auth/github/callback?code=c")), "/?signin=failed&provider=github");
  // Expired.
  const late = await state();
  await s.env.DB.prepare("UPDATE oauth_states SET expires_at = 1").run();
  assert.equal(result(await s.go(`/auth/github/callback?code=c&state=${late}`)), "/?signin=failed&provider=github");
  // Consent refused at the provider.
  const refused = await state();
  assert.equal(result(await s.go(`/auth/github/callback?error=access_denied&state=${refused}`)), "/?signin=denied&provider=github");
  assert.equal(await sessions(), 1, "only the one good sign-in opened a session");
});

test("provider failures have their own results and a retry: limits, credits, outages, bad profiles", async () => {
  const outcome = async (provider, fake) => {
    const s = setup({ fake });
    return (await s.signIn(provider)).headers.get("location");
  };
  assert.equal(await outcome("x", providers({ status: { "api.x.com/2/users/me": 429 } })), "/?signin=rate-limited&provider=x");
  assert.equal(await outcome("x", providers({ status: { "api.x.com/2/oauth2/token": 402 } })), "/?signin=unavailable&provider=x");
  assert.equal(await outcome("x", providers({ status: { "api.x.com/2/users/me": 503 } })), "/?signin=unavailable&provider=x");
  assert.equal(await outcome("x", providers({ xUser: { id: 17, username: "n" } })), "/?signin=failed&provider=x", "a numeric id is no X id");
  assert.equal(await outcome("github", providers({ githubUser: { id: 7, login: "acme", type: "Organization" } })), "/?signin=failed&provider=github");
  assert.equal(await outcome("github", providers({ status: { "github.com/login/oauth/access_token": 500 } })), "/?signin=unavailable&provider=github");
  // A provider switched off (no secret) is unavailable from the start, and its callback opens nothing.
  const off = setup({ vars: { X_CLIENT_SECRET: "" } });
  assert.equal((await off.go("/auth/x")).headers.get("location"), "/?signin=unavailable&provider=x");
  // The sign-in limiter.
  const limited = setup({ vars: { CHAT_AUTH_LIMITER: { limit: async () => ({ success: false }) } } });
  assert.equal((await limited.go("/auth/github")).headers.get("location"), "/?signin=rate-limited&provider=github");
});

test("a rename refreshes display data on the same principal; a banned principal cannot sign in", async () => {
  const s = setup();
  await s.signIn("github");
  const first = (await (await s.me()).json()).identity;
  s.fake = providers({ githubUser: { id: 583231, login: "ooga-renamed", name: "", type: "User", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=5" } });
  const again = setup({ island: islandOf({ contributors: { "ooga-renamed": "ooga-dev" } }), fake: s.fake });
  again.env.DB = s.env.DB;
  await again.signIn("github");
  const second = (await (await again.me()).json()).identity;
  assert.equal(second.principal, first.principal, "a rename is the same account");
  assert.equal(second.login, "ooga-renamed");
  assert.equal(second.display, "ooga-renamed", "an empty name shows the login");
  assert.equal(second.avatar, first.avatar, "GitHub's picture address is the account's own, whatever its query says");
  await s.env.DB.prepare("UPDATE principals SET banned_at = 1").run();
  assert.equal((await again.me()).status, 401, "a banned account's sessions read as signed out");
  const third = setup({ fake: s.fake });
  third.env.DB = s.env.DB;
  assert.equal((await third.signIn("github")).headers.get("location"), "/?signin=failed&provider=github");
});

test("the capability: cached, refreshed, kept through a short outage, unknown after its window, revoked when lost", async () => {
  const island = islandOf();
  const s = setup({ island });
  await s.signIn("github");
  const principal = await s.env.DB.prepare("SELECT * FROM principals").first();
  const t0 = (await s.env.DB.prepare("SELECT checked_at FROM capabilities").first("checked_at"));
  const at = (ms) => capabilityFor(s.env, principal, { now: t0 + ms });
  const calls = island.calls;
  assert.equal((await at(REFRESH_MS - 1)).state, "eligible");
  assert.equal(island.calls, calls, "inside the refresh window nothing crosses the bridge");
  island.down = true;
  const kept = await at(REFRESH_MS + 1);
  assert.equal(kept.state, "eligible", "a short outage keeps a recent answer");
  assert.equal((await at(STALE_MS + 1)).state, "unknown", "past its window an answer grants nothing new");
  assert.equal(island.revoked.length, 0, "an outage revokes nothing");
  island.down = false;
  delete island.contributors["ooga-dev"];
  const lost = await at(STALE_MS + 2);
  assert.equal(lost.state, "revoked");
  assert.deepEqual(island.revoked, [{ principal: principal.id, reason: "eligibility" }], "live speaking is asked to end");
  assert.equal((await capabilityFor(s.env, principal, { force: true, now: t0 + STALE_MS + 3 })).state, "revoked", "and it stays revoked");
  const view = await (await s.me()).json();
  assert.equal(view.eligibility.state, "revoked");
  assert.equal(view.capabilities.speak, false);
  island.contributors["ooga-dev"] = "ooga-dev";
  assert.equal((await capabilityFor(s.env, principal, { force: true })).state, "eligible", "a contribution counted again restores it");
});

test("signing out ends this session (or all) and live speaking, from the app's own page only, answering once done", async () => {
  const s = setup();
  await s.signIn("github");
  const cookie = s.jar.get("__Host-ooga_chat_session");
  const other = setup({ island: s.island, fake: s.fake });
  other.env.DB = s.env.DB;
  await other.signIn("github");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 2);
  assert.equal((await s.go("/api/chat/logout", { method: "POST", headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await s.go("/api/chat/logout", { method: "GET" })).status, 405);
  const out = await s.go("/api/chat/logout", { method: "POST", headers: site });
  assert.equal(out.status, 204);
  assert.match(out.headers.get("set-cookie"), /__Host-ooga_chat_session=; .*Max-Age=0/);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 1, "only this browser's session");
  assert.equal((await s.go("/api/chat/me", { headers: { cookie: `__Host-ooga_chat_session=${cookie}` } })).status, 401);
  assert.equal((await s.go("/api/chat/logout", { method: "POST", headers: site })).status, 204, "signing out twice is no error");
  assert.equal((await other.go("/api/chat/logout?all=1", { method: "POST", headers: site })).status, 204);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 0);
  assert.deepEqual(s.island.revoked.map((r) => r.reason), ["logout", "logout-all"]);
});

test("deleting the account removes the principal, its sessions and its capability; signing in again is a new principal", async () => {
  const s = setup();
  await s.signIn("github");
  const before = (await (await s.me()).json()).identity.principal;
  assert.equal((await s.go("/api/chat/me", { method: "DELETE" })).status, 403, "from the app's own page only");
  const gone = await s.go("/api/chat/me", { method: "DELETE", headers: site });
  assert.equal(gone.status, 204);
  for (const table of ["principals", "sessions", "capabilities"]) assert.equal(await s.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first("n"), 0, table);
  assert.equal(s.island.revoked.at(-1).reason, "deleted");
  await s.signIn("github");
  assert.notEqual((await (await s.me()).json()).identity.principal, before);
  // A principal the island no longer thinks eligible can still delete itself.
  delete s.island.contributors["ooga-dev"];
  assert.equal((await s.go("/api/chat/me", { method: "DELETE", headers: site })).status, 204);
});

test("the session answer: 401 signed out, 503 when it could not tell, never cached, never a token", async () => {
  const s = setup();
  const out = await s.me();
  assert.equal(out.status, 401);
  assert.equal(out.headers.get("cache-control"), "no-store");
  await s.signIn("github");
  const res = await s.me();
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(!(await res.text()).includes(s.jar.get("__Host-ooga_chat_session")));
  s.env.DB = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR"); } }) }) };
  assert.equal((await s.me()).status, 503, "an outage is not signed out");
  const expired = setup();
  await expired.signIn("github");
  await expired.env.DB.prepare("UPDATE sessions SET expires_at = 1").run();
  assert.equal((await expired.me()).status, 401);
  assert.equal(await expired.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 0, "an expired session is removed on read");
});

test("pictures: only the stored address on its provider's host, an image type, a bounded size, the current key", async () => {
  assert.equal(avatarUrl("github", "https://avatars.githubusercontent.com/u/1?v=4&evil=1"), "https://avatars.githubusercontent.com/u/1?v=4&s=112");
  assert.equal(avatarUrl("x", "https://pbs.twimg.com/profile_images/9/a_normal.png"), "https://pbs.twimg.com/profile_images/9/a_200x200.png");
  for (const bad of ["http://avatars.githubusercontent.com/u/1", "https://evil.example/u/1", "https://avatars.githubusercontent.com.evil.example/u/1",
    "https://user:pw@avatars.githubusercontent.com/u/1", "https://169.254.169.254/latest", "javascript:alert(1)", null, "x".repeat(600)])
    assert.equal(avatarUrl("github", bad), null, String(bad));
  assert.equal(avatarUrl("x", "https://avatars.githubusercontent.com/u/1"), null, "each provider its own host");
  const s = setup();
  await s.signIn("github");
  const path = (await (await s.me()).json()).identity.avatar;
  const res = await s.go(path);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [137, 80, 78, 71]);
  const fetched = s.fake.seen.find((r) => r.url.startsWith("https://avatars."));
  assert.equal(fetched.init.redirect, "manual", "a redirect comes back as a 3xx, never followed");
  assert.equal(fetched.init.headers.cookie, undefined);
  assert.equal(fetched.init.headers.authorization, undefined);
  assert.equal((await s.go(path.replace(/[0-9a-f]{16}$/, "0000000000000000"))).status, 404, "an old key is no face");
  assert.equal((await s.go("/api/chat/avatar/pr_nope/0000000000000000")).status, 404);
  const svg = setup();
  await svg.signIn("github");
  const svgPath = (await (await svg.me()).json()).identity.avatar;
  svg.deps.fetch = async () => new Response("<svg onload=alert(1)>", { headers: { "content-type": "image/svg+xml" } });
  assert.equal((await svg.go(svgPath)).status, 404, "no SVG");
  svg.deps.fetch = async () => new Response(new Uint8Array(600 * 1024), { headers: { "content-type": "image/png" } });
  assert.equal((await svg.go(svgPath)).status, 404, "no unbounded body");
});

test("display names keep what a person chose and nothing that reorders or hides text", () => {
  assert.equal(cleanDisplay("  Ooga   Booga  ", "x"), "Ooga Booga");
  assert.equal(cleanDisplay("a\u202eb\u2066c\u200bd\u0000e", "x"), "abcde");
  assert.equal(cleanDisplay("café 🍌", "x"), "café 🍌");
  assert.equal(cleanDisplay("", "login"), "login");
  assert.equal(cleanDisplay(null, "login"), "login");
  assert.equal(cleanDisplay("x".repeat(80), "l").length, 50);
});

test("the island's capability answer: GitHub principals only, its ban list, and unknown when it could not tell", async () => {
  const env = { ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "bridge" };
  const ask = async (principal, { contributors = {}, fresh = true, banned = false, name = null } = {}) => {
    const contributorFor = Object.assign(async (login) => contributors[login] ? { handle: contributors[login] } : null, { fresh: () => fresh });
    const DB = { prepare: () => ({ bind: () => ({ first: async () => (banned ? { banned_at: 5 } : name ? { display: name } : null) }) }) };
    const ops = { ...BASE_OPS, ...capabilityOps({ contributorFor, now: () => 42 }) };
    return handleEnvelope({ ...env, DB }, makeEnvelope("staging", "capability", {}, principal), ops);
  };
  const gh = { id: "pr_aaaaaaaaaaaaaaaaaaaaaa", provider: "github", providerUserId: "583231", login: "ooga-dev" };
  assert.deepEqual((await ask(gh, { contributors: { "ooga-dev": "ooga-dev" } })).result, { state: "eligible", character: "ooga-dev", reason: null, policy: POLICY, checkedAt: 42, display: null });
  assert.equal((await ask(gh)).result.state, "ineligible");
  assert.equal((await ask(gh, { contributors: { "ooga-dev": "ooga-dev" }, name: "wicked" })).result.display, "wicked", "the island's own name for the account");
  assert.equal((await ask(gh, { fresh: false })).result.state, "unknown");
  assert.equal((await ask(gh, { contributors: { "ooga-dev": "ooga-dev" }, banned: true })).result.reason, "banned");
  assert.equal((await ask({ ...gh, provider: "x" })).error.code, "capability_required");
  assert.equal((await ask(null)).error.code, "capability_required");
  for (const bad of ["0", "-1", "1e3", "12345678901234567", ""]) assert.equal((await ask({ ...gh, providerUserId: bad })).error.code, "malformed", bad);
  assert.equal((await ask({ ...gh, login: "--x" })).error.code, "malformed");
  assert.deepEqual(githubAccount(gh), { id: 583231, login: "ooga-dev" });
});

test("a name the account chose: the island's own name for it, kept across sign-ins and shown before the provider's", async () => {
  const names = {};
  const s = setup({ island: islandOf({ names }) });
  await s.signIn("github");
  assert.equal((await (await s.me()).json()).identity.display, "Ooga Dev", "with no name of its own, the provider's");
  names[583231] = "wicked";
  await s.signIn("github");
  assert.equal((await (await s.me()).json()).identity.display, "wicked", "the island's name, from its capability answer");
  const row = await s.env.DB.prepare("SELECT display, chosen_display FROM principals").first();
  assert.deepEqual(row, { display: "Ooga Dev", chosen_display: "wicked" }, "a sign-in refreshes the provider's name and keeps the chosen one");
  delete names[583231];
  await s.signIn("github");
  assert.equal((await (await s.me()).json()).identity.display, "wicked", "an island with no name for it leaves the chosen one");
  // A rename on the island reaches the principal the caller holds, so the answer built on this very refresh names it.
  const principal = await s.env.DB.prepare("SELECT * FROM principals").first();
  names[583231] = "Wicked Smart";
  const t0 = await s.env.DB.prepare("SELECT checked_at FROM capabilities").first("checked_at");
  await capabilityFor(s.env, principal, { now: t0 + REFRESH_MS + 1 });
  assert.equal(principal.chosen_display, "Wicked Smart", "the held principal carries the island's new name at once");
  // A write that fails is best effort: the answer still comes, and the principal keeps the name it had.
  const held = await s.env.DB.prepare("SELECT * FROM principals").first(), prepare = s.env.DB.prepare.bind(s.env.DB);
  names[583231] = "Another";
  s.env.DB.prepare = (sql) => /chosen_display = \?2/.test(sql) ? { bind: () => ({ run: async () => { throw new Error("D1 down"); } }) } : prepare(sql);
  const answer = await capabilityFor(s.env, held, { force: true, now: t0 + REFRESH_MS + 2 });
  s.env.DB.prepare = prepare;
  assert.equal(answer.state, "eligible", "a failed name write leaves the answer standing");
  assert.equal(held.chosen_display, "Wicked Smart", "and the name it had");
});

test("expired sessions and abandoned sign-ins are purged daily", async () => {
  const s = setup();
  await s.signIn("github");
  await s.go("/auth/github");
  await s.env.DB.prepare("UPDATE sessions SET expires_at = 5").run();
  await s.env.DB.prepare("UPDATE oauth_states SET expires_at = 5").run();
  await purgeExpired(s.env.DB, 10);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first("n"), 0);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM oauth_states").first("n"), 0);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM principals").first("n"), 1, "the account stays");
});

test("the island refuses a login another GitHub id holds there, by its own identity-collision rule", async () => {
  const DB = memoryD1(new URL("../migrations/", import.meta.url));
  await DB.prepare("INSERT INTO players (id, login, created_at, last_login_at) VALUES (1, 'alice', 0, 0)").run();
  await DB.prepare("UPDATE game_highscores SET owners = json_object('bob', 3) WHERE game_id = 'cloud-hopper'").run();
  const contributorFor = Object.assign(async (login) => ({ handle: login.toLowerCase() }), { fresh: () => true });
  const ops = { ...BASE_OPS, ...capabilityOps({ contributorFor, now: () => 42 }) };
  const ask = async (id, login) => (await handleEnvelope({ ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "bridge", DB },
    makeEnvelope("staging", "capability", {}, { id: "pr_x", provider: "github", providerUserId: String(id), login }), ops)).result;
  assert.deepEqual([(await ask(1, "alice")).state, (await ask(1, "Alice")).state], ["eligible", "eligible"], "the id that holds the login");
  assert.deepEqual(await ask(2, "ALICE"), { state: "ineligible", character: null, reason: "identity-collision", policy: POLICY, checkedAt: 42, display: null },
    "a login renamed away and taken by another account is not their Ooga");
  assert.equal((await ask(3, "bob")).state, "eligible", "a leaderboard owner under its own id");
  assert.equal((await ask(4, "bob")).reason, "identity-collision", "a leaderboard that owns the login under another id");
  assert.equal((await ask(5, "carol")).state, "eligible", "a login nobody else holds");
});

test("a GitHub login taken by a new account ends the sessions of the principal that held it", async () => {
  const s = setup();
  await s.signIn("github");
  const before = await s.env.DB.prepare("SELECT id FROM principals").first("id");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM capabilities").first("n"), 1);
  const taker = setup({ island: s.island, fake: providers({ githubUser: { id: 999, login: "Ooga-Dev", name: "", type: "User", avatar_url: null } }) });
  taker.env.DB = s.env.DB;
  await taker.signIn("github");
  const rows = (await s.env.DB.prepare("SELECT principal_id FROM sessions").all()).results.map((r) => r.principal_id);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0], before, "only the new holder of the login keeps a session");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM capabilities WHERE principal_id = ?1").bind(before).first("n"), 0);
  assert.equal((await s.me()).status, 401, "the old holder's browser is signed out");
});

test("the picture's account decides before its cache: a deleted account or an old key is no face, whatever is cached", async () => {
  const s = setup();
  const store = new Map();
  s.deps.cache = { match: async (key) => (store.has(key) ? store.get(key).clone() : undefined), put: async (key, res) => { store.set(key, res); } };
  await s.signIn("github");
  const path = (await (await s.me()).json()).identity.avatar;
  assert.equal((await s.go(path)).status, 200);
  assert.deepEqual([...store.keys()], [`${SITE}${path}`], "keyed by the path alone");
  const fetches = s.fake.seen.length;
  assert.equal((await s.go(`${path}?x=1`)).status, 200);
  assert.equal(s.fake.seen.length, fetches, "a query string is the same cached face");
  await s.go("/api/chat/me", { method: "DELETE", headers: site });
  assert.equal((await s.go(path)).status, 404, "deleted, so no face, cached or not");
});

// A native app (RFC 8252): PKCE S256 over the system browser, the result back on loopback, a bearer session.
const pkce = async () => {
  const verifier = "v".repeat(20) + "-native_verifier.~0123456789";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
};
// Up to the consent page: the browser has signed in with the provider, and the app has nothing yet.
const nativePage = async (s, challenge, port = 53682) => {
  const start = await s.go(`/auth/github?native=${challenge}&port=${port}`);
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const page = await s.go(`/auth/github/callback?code=the-code&state=${encodeURIComponent(state)}`);
  assert.equal(page.status, 200);
  const body = await page.text();
  return { page, body, consent: /name="consent" value="([A-Za-z0-9_-]+)"/.exec(body)[1] };
};
const answer = (s, consent, choice, headers = { origin: SITE }) => s.go("/auth/github/consent", { method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams({ consent, choice }).toString() });
const nativeSignIn = async (s, challenge, port = 53682) => answer(s, (await nativePage(s, challenge, port)).consent, "continue");
const exchange = (s, body, headers = {}) =>
  s.go("/api/chat/native/token", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("native: the callback asks first, and only Continue sends the browser to loopback with a one-time code", async () => {
  const s = setup();
  const { challenge } = await pkce();
  const { page, body, consent } = await nativePage(s, challenge);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  const csp = page.headers.get("content-security-policy");
  assert.equal(csp, "default-src 'none'; form-action 'self' http://127.0.0.1:53682; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("referrer-policy"), "same-origin", "no-referrer would make its own POST's Origin null");
  assert.ok(!/name="referrer"/.test(body));
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.ok(!/<script|<style|\sstyle=|\son[a-z]+=/i.test(body), "nothing the policy would have to allow");
  assert.match(body, /Ooga Dev \(ooga-dev\)/);
  assert.match(body, /Continue to the Ooga Chat desktop app\?/);
  assert.match(body, /<form method="post" action="\/auth\/github\/consent">/);
  assert.ok(!s.jar.has("__Host-ooga_chat_session"), "the browser gets no session");
  assert.ok(s.jar.has("__Host-ooga_chat_oauth"), "the consent is bound to this browser");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_codes").first("n"), 0, "no code before Continue");
  assert.notEqual(await s.env.DB.prepare("SELECT consent_hash FROM native_consents").first("consent_hash"), consent, "D1 keeps the consent's hash");
  assert.equal((await s.go("/auth/github/consent")).status, 405, "an answer is a POST");
  const done = await answer(s, consent, "continue");
  assert.equal(done.status, 303);
  assert.match(done.headers.get("location"), /^http:\/\/127\.0\.0\.1:53682\/callback\?signin=ok&provider=github&code=[A-Za-z0-9_-]{43}$/);
  assert.ok(!s.jar.has("__Host-ooga_chat_oauth"), "and the sign-in cookie is gone");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_consents").first("n"), 0, "spent");
});

test("native: the browser goes back to loopback with a one-time code, never a cookie, and the code and verifier make a bearer session", async () => {
  const s = setup();
  const { verifier, challenge } = await pkce();
  const done = await nativeSignIn(s, challenge);
  assert.equal(done.status, 303);
  const to = new URL(done.headers.get("location"));
  assert.equal(`${to.origin}${to.pathname}`, "http://127.0.0.1:53682/callback");
  assert.equal(to.searchParams.get("signin"), "ok");
  assert.equal(to.searchParams.get("provider"), "github");
  const code = to.searchParams.get("code");
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!s.jar.has("__Host-ooga_chat_session"), "the browser gets no session");
  assert.ok(!s.jar.has("__Host-ooga_chat_oauth"), "and loses its sign-in cookie");
  assert.notEqual(await s.env.DB.prepare("SELECT code_hash FROM native_codes").first("code_hash"), code, "D1 keeps the code's hash");
  assert.equal((await exchange(s, { code, verifier: verifier + "x" })).status, 400, "a wrong verifier is refused...");
  assert.equal((await exchange(s, { code, verifier })).status, 400, "...and spends the code");

  const again = new URL((await nativeSignIn(s, challenge)).headers.get("location")).searchParams.get("code");
  const got = await exchange(s, { code: again, verifier });
  assert.equal(got.status, 200);
  const { token, expiresAt } = await got.json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(expiresAt > Date.now());
  assert.equal((await exchange(s, { code: again, verifier })).status, 400, "a code makes one session");
  s.jar.clear();
  const bearer = { authorization: `Bearer ${token}` };
  const view = await (await s.go("/api/chat/me", { headers: bearer })).json();
  assert.equal(view.identity.login, "ooga-dev");
  assert.equal(view.capabilities.speak, true);
  assert.equal((await s.go("/api/chat/logout", { method: "POST" })).status, 403, "no page and no bearer: refused");
  assert.equal((await s.go("/api/chat/logout", { method: "POST", headers: bearer })).status, 204);
  assert.equal((await s.go("/api/chat/me", { headers: bearer })).status, 401, "signed out");
});

test("native: a bad start is refused, a failure goes back to loopback, and a stale code is no session", async () => {
  const s = setup();
  const { verifier, challenge } = await pkce();
  for (const query of [`native=${challenge}`, `native=${challenge}&port=80`, `native=${challenge}&port=70000`, `native=short&port=5000`, "port=5000"]) {
    assert.equal((await s.go(`/auth/github?${query}`)).status, 400, query);
  }
  const start = await s.go(`/auth/github?native=${challenge}&port=5000`);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const denied = await s.go(`/auth/github/callback?error=access_denied&state=${encodeURIComponent(state)}`);
  assert.equal(denied.headers.get("location"), "http://127.0.0.1:5000/callback?signin=denied&provider=github");
  const off = setup({ vars: { FEATURES: "listen" } });
  assert.equal((await off.go(`/auth/github?native=${challenge}&port=5000`)).headers.get("location"), "http://127.0.0.1:5000/callback?signin=unavailable&provider=github");

  const code = new URL((await nativeSignIn(s, challenge)).headers.get("location")).searchParams.get("code");
  await s.env.DB.prepare("UPDATE native_codes SET expires_at = 1").run();
  assert.equal((await exchange(s, { code, verifier })).status, 400);
  assert.equal((await exchange(s, { verifier })).status, 400);
  assert.equal((await s.go("/api/chat/native/token")).status, 405);
  await nativePage(s, challenge);
  await s.env.DB.prepare("UPDATE native_consents SET expires_at = 1").run();
  await purgeExpired(s.env.DB);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_codes").first("n"), 0);
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_consents").first("n"), 0);
});

test("native: Cancel goes back denied and makes no code", async () => {
  const s = setup();
  const { challenge } = await pkce();
  const { consent } = await nativePage(s, challenge);
  const done = await answer(s, consent, "cancel");
  assert.equal(done.headers.get("location"), "http://127.0.0.1:53682/callback?signin=denied&provider=github");
  assert.equal(await s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_codes").first("n"), 0);
  assert.ok(!s.jar.has("__Host-ooga_chat_oauth"));
  assert.equal((await answer(s, consent, "continue")).headers.get("location"), "/?signin=failed&provider=github", "and the consent is spent");
});

test("native: a replayed, expired, foreign or cross-site consent makes no code", async () => {
  const s = setup();
  const { challenge } = await pkce();
  const codes = () => s.env.DB.prepare("SELECT COUNT(*) AS n FROM native_codes").first("n");
  // Another site's form, posting this browser's consent with its cookie: refused before the consent is read or spent.
  const { consent } = await nativePage(s, challenge);
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, {}]) {
    assert.equal((await answer(s, consent, "continue", headers)).status, 403, JSON.stringify(headers));
  }
  assert.equal(await codes(), 0);
  assert.equal((await answer(s, consent, "continue")).headers.get("location").split("&code=")[0], "http://127.0.0.1:53682/callback?signin=ok&provider=github", "still good for its own page");
  assert.equal(await codes(), 1);
  // Replayed: spent, so failed, and with no record left nothing names a port.
  assert.equal((await answer(s, consent, "continue")).headers.get("location"), "/?signin=failed&provider=github");
  assert.equal((await answer(s, "made-up", "continue")).headers.get("location"), "/?signin=failed&provider=github");
  assert.equal(await codes(), 1);
  // Expired.
  const late = (await nativePage(s, challenge, 5000)).consent;
  await s.env.DB.prepare("UPDATE native_consents SET expires_at = 1").run();
  assert.equal((await answer(s, late, "continue")).headers.get("location"), "http://127.0.0.1:5000/callback?signin=failed&provider=github");
  // Another browser: the consent is posted without the cookie that started it, or with another browser's.
  const theirs = (await nativePage(s, challenge, 5001)).consent;
  s.jar.set("__Host-ooga_chat_oauth", "someone-elses-nonce");
  assert.equal((await answer(s, theirs, "continue")).headers.get("location"), "http://127.0.0.1:5001/callback?signin=failed&provider=github");
  // Another provider's route.
  const other = (await nativePage(s, challenge, 5002)).consent;
  const x = await s.go("/auth/x/consent", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE }, body: `consent=${other}&choice=continue` });
  assert.equal(x.headers.get("location"), "http://127.0.0.1:5002/callback?signin=failed&provider=x");
  assert.equal(await codes(), 1, "none of them made a code");
});

test("native: a web sign-in is unchanged, and a banned account's code makes no session", async () => {
  const s = setup();
  const web = await s.signIn("github");
  assert.equal(web.headers.get("location"), "/?signin=ok&provider=github");
  const { verifier, challenge } = await pkce();
  const code = new URL((await nativeSignIn(s, challenge)).headers.get("location")).searchParams.get("code");
  const { consent } = await nativePage(s, challenge);
  await s.env.DB.prepare("UPDATE principals SET banned_at = 1").run();
  assert.equal((await exchange(s, { code, verifier })).status, 400);
  assert.equal((await answer(s, consent, "continue")).headers.get("location"), "http://127.0.0.1:53682/callback?signin=failed&provider=github", "banned between page and Continue");
});
