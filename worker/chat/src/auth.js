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
// State-changing calls must come from the app's own page (`fromSite`). Nothing here stores, logs or returns a provider
// token, a code, a verifier or a session token.

import { parseCookies, serializeCookie, isSecureOrigin } from "../../src/cookies.js";
import { randomToken, sameString, sha256Hex } from "../../src/crypto.js";
import { capabilityFor, revokeLive, STALE_MS } from "./capability.js";
import { effective } from "./config.js";
import { bridgeHello } from "./bridge.js";
import { allowed, clientIp, fromSite, json, redirect, refusal } from "./http.js";
import { authorizeUrl, PROVIDERS, profileFor } from "./providers.js";
import {
  avatarPath, cleanDisplay, clearSessionCookie, cookieNames, createSession, deleteAllSessions, deletePrincipal, deleteSession,
  readSession, sessionCookie, upsertPrincipal,
} from "./session.js";

export const OAUTH_MS = 10 * 60 * 1000;
export const IDENTITY_SCHEMA = 1;

const back = (provider, result, cookies = []) =>
  redirect(`/?signin=${result}${PROVIDERS.includes(provider) ? `&provider=${provider}` : ""}`, cookies);
const oauthCookie = (env, value, ms) => serializeCookie(cookieNames(env.SITE_ORIGIN).oauth, value, { maxAge: Math.floor(ms / 1000), secure: isSecureOrigin(env.SITE_ORIGIN) });

const providerOn = async (env, provider) => effective(env, await bridgeHello(env))[provider];

const start = async (request, env, provider) => {
  if (!(await providerOn(env, provider))) return back(provider, "unavailable");
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return back(provider, "rate-limited");
  const state = randomToken(), nonce = randomToken();
  // 86 characters of [A-Za-z0-9_-]: inside PKCE's 43-128 and its unreserved alphabet.
  const verifier = provider === "x" ? randomToken() + randomToken() : null;
  await env.DB.prepare("INSERT INTO oauth_states (state_hash, provider, browser_hash, verifier, next, expires_at) VALUES (?1, ?2, ?3, ?4, '/', ?5)")
    .bind(await sha256Hex(state), provider, await sha256Hex(nonce), verifier, Date.now() + OAUTH_MS).run();
  return redirect(await authorizeUrl(env, provider, state, verifier), [oauthCookie(env, nonce, OAUTH_MS)], 302);
};

const callback = async (request, env, url, provider, deps) => {
  const clear = oauthCookie(env, "", 0);
  const fail = (result, reason) => {
    console.warn("ooga chat sign-in", provider, result, reason);
    return back(provider, result, [clear]);
  };
  if (!(await allowed(env.CHAT_AUTH_LIMITER, clientIp(request)))) return fail("rate-limited", "limit");
  const state = url.searchParams.get("state"), code = url.searchParams.get("code"), denied = url.searchParams.get("error");
  const nonce = parseCookies(request.headers.get("cookie")).get(cookieNames(env.SITE_ORIGIN).oauth) || "";
  // Spent before anything else, whatever happens next: a state is good for one callback.
  const held = typeof state === "string" && state.length <= 64 ? await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ?1 RETURNING provider, browser_hash, verifier, expires_at",
  ).bind(await sha256Hex(state)).first() : null;
  const ours = !!held && held.provider === provider && held.expires_at > Date.now() && !!nonce && nonce.length <= 64 && sameString(held.browser_hash, await sha256Hex(nonce));
  if (!ours) return fail("failed", "state");
  if (denied) return fail(denied === "access_denied" ? "denied" : "failed", "provider");
  if (typeof code !== "string" || !code || code.length > 512) return fail("failed", "code");
  if (!(await providerOn(env, provider))) return fail("unavailable", "disabled");
  const answer = await profileFor(env, provider, code, held.verifier, deps.fetch, deps.waitUntil);
  if (!answer.profile) return fail(answer.result, answer.reason);
  const p = answer.profile;
  const principal = await upsertPrincipal(env.DB, { ...p, display: cleanDisplay(p.display, p.login) });
  if (principal.banned_at) return fail("failed", "banned");
  const token = await createSession(env.DB, principal.id, request.headers.get("user-agent"));
  // The island's answer now, so the app's first look already has it; a slow or absent bridge only leaves it unknown.
  if (principal.provider === "github") {
    const asking = capabilityFor(env, principal, { force: true, waitUntil: deps.waitUntil }).catch(() => null);
    if (deps.waitUntil) deps.waitUntil(asking); else await asking;
  }
  return back(provider, "ok", [clear, sessionCookie(env, token)]);
};

/** The session as the app reads it (identity protocol 1), with what the island decided about speaking. */
export const sessionView = (found, capability) => {
  const p = found.principal, eligible = p.provider === "github" && capability.state === "eligible" && capability.fresh;
  return {
    schema: IDENTITY_SCHEMA,
    identity: { principal: p.id, provider: p.provider, providerUserId: p.provider_user_id, login: p.login, display: p.display || p.login, avatar: avatarPath(p) },
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
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  if (!found) return refusal("auth_required", 401);
  await deletePrincipal(env.DB, found.principal.id);
  await revokeLive(env, found.principal, "deleted");
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(env), "cache-control": "no-store" } });
};

const logout = async (request, env, url) => {
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
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

export const handleAuth = async (request, env, url, deps) => {
  const [, root, provider, step, extra] = url.pathname.split("/");
  if (root === "auth") {
    if (!PROVIDERS.includes(provider) || extra !== undefined || (step !== undefined && step !== "callback")) return refusal("not_found", 404);
    if (request.method !== "GET") return refusal("method_not_allowed", 405);
    if (!env.DB) return back(provider, "unavailable");
    return step === "callback" ? callback(request, env, url, provider, deps) : start(request, env, provider);
  }
  if (url.pathname === "/api/chat/me") return env.DB ? me(request, env, deps) : refusal("unavailable", 503);
  if (url.pathname === "/api/chat/logout") return env.DB ? logout(request, env, url) : refusal("unavailable", 503);
  return null;
};
