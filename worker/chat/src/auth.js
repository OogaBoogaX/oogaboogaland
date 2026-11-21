// Sign-in and the account (#663), on Ooga Chat's own origin. Every sign-in lands as a listener: the session says what
// the island decided about speaking (capability.js), and speaking itself is a lease the audience grants later (#665).
//   GET  /auth/<provider>            starts OAuth: a single-use state in D1, bound to this provider and to this browser
//                                    (the hash of a nonce in its own short-lived cookie), X with a PKCE verifier (S256)
//   GET  /auth/<provider>/callback   checks and spends that state, reads the profile, opens a session, and sends the
//                                    browser home with the result alone: /?signin=<ok|denied|failed|unavailable|rate-limited>&provider=<p>
//   GET  /api/chat/me                the session (identity protocol 1, docs/ooga-chat-app.md); 401 signed out, 503 when
//                                    it could not tell
//   DELETE /api/chat/me              deletes the account: its sessions, its capability answer, its principal
//   POST /api/chat/logout[?all=1]    ends this session (or every one), 204 only once done
//   GET  /api/chat/avatar/<id>/<key> the principal's picture, fetched from its provider's image host (avatar.js)
//   POST /auth/<provider>/consent    a native sign-in's Continue or Cancel, from the page its callback answered
//   POST /api/chat/native/token      a native app's one-time code and PKCE verifier for its session token
// A native app (a desktop client, RFC 8252) starts with `/auth/<provider>?native=<S256 challenge>&port=<loopback port>`
// in the system browser: the same single-use state, bound to that browser. Its callback, signed in, sets no cookie: it
// answers a page naming the account and asking to continue to the desktop app, since a site could start a native
// sign-in for someone who already approved the OAuth app and the provider would come straight back. Only that page's
// Continue (a same-site POST, bound to the browser by a fresh nonce in the sign-in cookie, single-use, five minutes)
// makes a one-time code and sends the browser on to `http://127.0.0.1:<port>/callback` with it; Cancel, and any
// failure, send the result alone. The app trades the code and its verifier for a session token it sends as
// `Authorization: Bearer` (session.js).
// State-changing calls must come from the app's own page (`fromSite`) or carry a bearer session (`fromApp`). Nothing
// here stores, logs or returns a provider token, a code, a verifier or a session token, but the one consent a native
// sign-in's page posts back and the code and token it hands its own app.

import { parseCookies, serializeCookie, isSecureOrigin } from "../../src/cookies.js";
import { randomToken, sameString, sha256Hex } from "../../src/crypto.js";
import { capabilityFor, revokeLive, STALE_MS } from "./capability.js";
import { effective } from "./config.js";
import { bridgeHello } from "./bridge.js";
import { allowed, clientIp, fromSite, html, json, readBody, redirect, refusal } from "./http.js";
import { authorizeUrl, PROVIDERS, profileFor } from "./providers.js";
import {
  avatarPath, cleanDisplay, clearSessionCookie, cookieNames, createSession, deleteAllSessions, deletePrincipal, deleteSession,
  bearerToken, readSession, sessionCookie, upsertPrincipal,
} from "./session.js";

export const OAUTH_MS = 10 * 60 * 1000;
export const NATIVE_CODE_MS = 2 * 60 * 1000;
export const NATIVE_CONSENT_MS = 5 * 60 * 1000;
export const IDENTITY_SCHEMA = 1;
// A PKCE S256 challenge is the base64url SHA-256 of the verifier: 43 characters. A verifier is 43 to 128 unreserved ones.
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const NATIVE_BODY_MAX = 512;
const PROVIDER_NAME = { github: "GitHub", x: "X" };

const back = (provider, result, cookies = []) =>
  redirect(`/?signin=${result}${PROVIDERS.includes(provider) ? `&provider=${provider}` : ""}`, cookies);
// A native sign-in's result goes back to its app on loopback, never to this origin's page; only the host is fixed here.
const backNative = (port, provider, result, cookies = [], code = null) =>
  redirect(`http://127.0.0.1:${port}/callback?signin=${result}&provider=${provider}${code ? `&code=${code}` : ""}`, cookies);
const nativePort = (value) => {
  const port = /^\d{1,5}$/.test(value || "") ? Number(value) : 0;
  return port >= 1024 && port <= 65535 ? port : 0;
};
const s256 = async (verifier) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let raw = "";
  for (const b of digest) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
/** A state-changing call from the app's page, or from a native app holding a bearer session (no browser sends one). */
const fromApp = (request, env) => fromSite(request, env.SITE_ORIGIN) || !!bearerToken(request);
const oauthCookie = (env, value, ms) => serializeCookie(cookieNames(env.SITE_ORIGIN).oauth, value, { maxAge: Math.floor(ms / 1000), secure: isSecureOrigin(env.SITE_ORIGIN) });

// The page a native sign-in stops at, signed in: who it is, and a form whose two buttons post its answer back here. It
// carries no script or style, so its policy allows nothing but that form (and the loopback address its answer is sent
// on to) and no frame round it, so no other page can dress it up or click it through.
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const consentPage = (provider, port, principal, consent, cookies) => {
  const who = principal.display && principal.display !== principal.login ? `${escape(principal.display)} (${escape(principal.login)})` : escape(principal.login);
  return html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ooga Chat sign-in</title></head>
<body>
<h1>Ooga Chat</h1>
<p>Signed in with ${PROVIDER_NAME[provider]} as <strong>${who}</strong>.</p>
<p>Continue to the Ooga Chat desktop app?</p>
<form method="post" action="/auth/${provider}/consent">
<input type="hidden" name="consent" value="${consent}">
<button type="submit" name="choice" value="continue">Continue</button>
<button type="submit" name="choice" value="cancel">Cancel</button>
</form>
<p>If you did not just sign in from the Ooga Chat desktop app on this computer, choose Cancel.</p>
</body>
</html>
`, `default-src 'none'; form-action 'self' http://127.0.0.1:${port}; frame-ancestors 'none'; base-uri 'none'`, 200, cookies);
};

const providerOn = async (env, provider) => effective(env, await bridgeHello(env))[provider];

const start = async (request, env, url, provider) => {
  let challenge = null, port = 0;
  if (url.searchParams.has("native") || url.searchParams.has("port")) {
    challenge = url.searchParams.get("native");
    port = nativePort(url.searchParams.get("port"));
    if (!CHALLENGE.test(challenge || "") || !port) return refusal("bad_request", 400);
  }
  const done = (result) => port ? backNative(port, provider, result) : back(provider, result);
  if (!(await providerOn(env, provider))) return done("unavailable");
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return done("rate-limited");
  const state = randomToken(), nonce = randomToken();
  // 86 characters of [A-Za-z0-9_-]: inside PKCE's 43-128 and its unreserved alphabet.
  const verifier = provider === "x" ? randomToken() + randomToken() : null;
  await env.DB.prepare("INSERT INTO oauth_states (state_hash, provider, browser_hash, verifier, next, expires_at, native_challenge, native_port) VALUES (?1, ?2, ?3, ?4, '/', ?5, ?6, ?7)")
    .bind(await sha256Hex(state), provider, await sha256Hex(nonce), verifier, Date.now() + OAUTH_MS, challenge, port || null).run();
  return redirect(await authorizeUrl(env, provider, state, verifier), [oauthCookie(env, nonce, OAUTH_MS)], 302);
};

const callback = async (request, env, url, provider, deps) => {
  const clear = oauthCookie(env, "", 0);
  let port = 0;
  const fail = (result, reason) => {
    console.warn("ooga chat sign-in", provider, result, reason);
    return port ? backNative(port, provider, result, [clear]) : back(provider, result, [clear]);
  };
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return fail("rate-limited", "limit");
  const state = url.searchParams.get("state"), code = url.searchParams.get("code"), denied = url.searchParams.get("error");
  const nonce = parseCookies(request.headers.get("cookie")).get(cookieNames(env.SITE_ORIGIN).oauth) || "";
  // Spent before anything else, whatever happens next: a state is good for one callback.
  const held = typeof state === "string" && state.length <= 64 ? await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ?1 RETURNING provider, browser_hash, verifier, expires_at, native_challenge, native_port",
  ).bind(await sha256Hex(state)).first() : null;
  const ours = !!held && held.provider === provider && held.expires_at > Date.now() && !!nonce && nonce.length <= 64 && sameString(held.browser_hash, await sha256Hex(nonce));
  if (!ours) return fail("failed", "state");
  // From here the result belongs to whoever started it: a native app hears it on its own loopback port.
  if (held.native_challenge) port = nativePort(String(held.native_port));
  if (denied) return fail(denied === "access_denied" ? "denied" : "failed", "provider");
  if (typeof code !== "string" || !code || code.length > 512) return fail("failed", "code");
  if (!(await providerOn(env, provider))) return fail("unavailable", "disabled");
  const answer = await profileFor(env, provider, code, held.verifier, deps.fetch, deps.waitUntil);
  if (!answer.profile) return fail(answer.result, answer.reason);
  const p = answer.profile;
  const principal = await upsertPrincipal(env.DB, { ...p, display: cleanDisplay(p.display, p.login) });
  if (principal.banned_at) return fail("failed", "banned");
  if (port) {
    // No code yet: the browser that signed in says first whether this goes on to the app (consent, below).
    const consent = randomToken(), fresh = randomToken();
    await env.DB.prepare("INSERT INTO native_consents (consent_hash, principal_id, provider, browser_hash, challenge, port, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(await sha256Hex(consent), principal.id, provider, await sha256Hex(fresh), held.native_challenge, port, Date.now() + NATIVE_CONSENT_MS).run();
    return consentPage(provider, port, principal, consent, [oauthCookie(env, fresh, NATIVE_CONSENT_MS)]);
  }
  const token = await createSession(env.DB, principal.id, request.headers.get("user-agent"));
  // The island's answer now, so the app's first look already has it; a slow or absent bridge only leaves it unknown.
  if (principal.provider === "github") {
    const asking = capabilityFor(env, principal, { force: true, waitUntil: deps.waitUntil }).catch(() => null);
    if (deps.waitUntil) deps.waitUntil(asking); else await asking;
  }
  return back(provider, "ok", [clear, sessionCookie(env, token)]);
};

/**
 * A native sign-in's answer from its page: `consent=<token>&choice=<continue|cancel>`, posted by the browser that signed
 * in. A post from any other page is refused before anything is read. The consent is spent first, whatever happens
 * next; one that is missing, expired, another provider's or another browser's sends the browser back with `failed`
 * (to its app's loopback port when the consent named one, else this origin's page). Cancel sends `denied`; Continue
 * alone makes the one-time code (as the callback once did) and sends it on to the app.
 */
const consent = async (request, env, provider, deps) => {
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  const clear = oauthCookie(env, "", 0);
  const form = new URLSearchParams((await readBody(request, NATIVE_BODY_MAX)) ?? "");
  const token = form.get("consent") || "", choice = form.get("choice");
  const nonce = parseCookies(request.headers.get("cookie")).get(cookieNames(env.SITE_ORIGIN).oauth) || "";
  const held = token && token.length <= 64 ? await env.DB.prepare(
    "DELETE FROM native_consents WHERE consent_hash = ?1 RETURNING principal_id, provider, browser_hash, challenge, port, expires_at",
  ).bind(await sha256Hex(token)).first() : null;
  const port = held ? nativePort(String(held.port)) : 0;
  const fail = (result, reason) => {
    console.warn("ooga chat sign-in", provider, result, reason);
    return port ? backNative(port, provider, result, [clear]) : back(provider, result, [clear]);
  };
  const ours = !!held && held.provider === provider && held.expires_at > Date.now() && !!nonce && nonce.length <= 64 && sameString(held.browser_hash, await sha256Hex(nonce));
  if (!ours || !port) return fail("failed", "consent");
  if (choice === "cancel") return fail("denied", "cancel");
  if (choice !== "continue") return fail("failed", "choice");
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return fail("rate-limited", "limit");
  const principal = await env.DB.prepare("SELECT * FROM principals WHERE id = ?1").bind(held.principal_id).first();
  if (!principal || principal.banned_at) return fail("failed", "banned");
  const code = randomToken();
  await env.DB.prepare("INSERT INTO native_codes (code_hash, principal_id, challenge, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(code), principal.id, held.challenge, Date.now() + NATIVE_CODE_MS).run();
  if (principal.provider === "github") {
    const asking = capabilityFor(env, principal, { force: true, waitUntil: deps.waitUntil }).catch(() => null);
    if (deps.waitUntil) deps.waitUntil(asking); else await asking;
  }
  return backNative(port, provider, "ok", [clear], code);
};

/** The session as the app reads it (identity protocol 1), with what the island decided about speaking. */
export const sessionView = (found, capability) => {
  const p = found.principal, eligible = p.provider === "github" && capability.state === "eligible" && capability.fresh;
  return {
    schema: IDENTITY_SCHEMA,
    // `participant` is how the audience lists this account (gh:<id> or x:<id>, #665): one row a person, whichever app.
    identity: { principal: p.id, participant: `${p.provider === "github" ? "gh" : "x"}:${p.provider_user_id}`, provider: p.provider,
      providerUserId: p.provider_user_id, login: p.login, display: p.display || p.login, avatar: avatarPath(p) },
    capabilities: { listen: true, react: true, speak: eligible, contributor: eligible, raiseHand: eligible },
    eligibility: { state: p.provider === "github" ? capability.state : "ineligible", checkedAt: capability.checkedAt, staleAfter: STALE_MS / 1000, policy: capability.policy },
    character: eligible && capability.character ? { handle: capability.character } : null,
    expiresAt: found.session.expiresAt,
  };
};

const me = async (request, env, deps) => {
  const removal = request.method === "DELETE";
  let found;
  try { found = await readSession(request, env, { removal }); }
  catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
  if (request.method === "GET") {
    if (!found) return refusal("auth_required", 401);
    let capability;
    try { capability = await capabilityFor(env, found.principal, { waitUntil: deps.waitUntil }); }
    catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
    return json(sessionView(found, capability));
  }
  if (request.method !== "DELETE") return refusal("method_not_allowed", 405);
  if (!fromApp(request, env)) return refusal("forbidden", 403);
  if (!found) return refusal("auth_required", 401);
  await deletePrincipal(env.DB, found.principal.id);
  await revokeLive(env, found.principal, "deleted");
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(env), "cache-control": "no-store" } });
};

const logout = async (request, env, url) => {
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (!fromApp(request, env)) return refusal("forbidden", 403);
  let found;
  try { found = await readSession(request, env, { removal: true }); }
  catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
  if (found) {
    const all = url.searchParams.get("all") === "1";
    if (all) await deleteAllSessions(env.DB, found.principal.id); else await deleteSession(env.DB, found.token);
    await revokeLive(env, found.principal, all ? "logout-all" : "logout");
  }
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(env), "cache-control": "no-store" } });
};

/**
 * A native app's code and verifier for its session: `{ code, verifier }` → `{ token, expiresAt }`. The code is spent
 * first, whatever happens next, and is good only within its two minutes and with the verifier behind its challenge.
 * No browser page can read the answer: this origin sends no CORS headers.
 */
const nativeToken = async (request, env) => {
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  let body;
  try { body = JSON.parse((await readBody(request, NATIVE_BODY_MAX)) ?? ""); } catch { body = null; }
  const code = body && typeof body.code === "string" && body.code.length <= 64 ? body.code : "";
  const verifier = body && typeof body.verifier === "string" ? body.verifier : "";
  if (!code || !VERIFIER.test(verifier)) return refusal("bad_request", 400);
  const held = await env.DB.prepare("DELETE FROM native_codes WHERE code_hash = ?1 RETURNING principal_id, challenge, expires_at")
    .bind(await sha256Hex(code)).first();
  if (!held || held.expires_at <= Date.now() || !sameString(held.challenge, await s256(verifier))) return refusal("invalid_grant", 400);
  const principal = await env.DB.prepare("SELECT id, banned_at FROM principals WHERE id = ?1").bind(held.principal_id).first();
  if (!principal || principal.banned_at) return refusal("invalid_grant", 400);
  const token = await createSession(env.DB, principal.id, request.headers.get("user-agent"));
  const session = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).first();
  return json({ token, expiresAt: session.expires_at });
};

export const handleAuth = async (request, env, url, deps) => {
  const [, root, provider, step, extra] = url.pathname.split("/");
  if (root === "auth") {
    if (!PROVIDERS.includes(provider) || extra !== undefined || (step !== undefined && step !== "callback" && step !== "consent")) return refusal("not_found", 404);
    if (request.method !== (step === "consent" ? "POST" : "GET")) return refusal("method_not_allowed", 405);
    if (!env.DB) return back(provider, "unavailable");
    if (step === "consent") return consent(request, env, provider, deps);
    return step === "callback" ? callback(request, env, url, provider, deps) : start(request, env, url, provider);
  }
  if (url.pathname === "/api/chat/me") return env.DB ? me(request, env, deps) : refusal("unavailable", 503);
  if (url.pathname === "/api/chat/logout") return env.DB ? logout(request, env, url) : refusal("unavailable", 503);
  if (url.pathname === "/api/chat/native/token") return env.DB ? nativeToken(request, env) : refusal("unavailable", 503);
  return null;
};
