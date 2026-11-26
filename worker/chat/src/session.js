// Ooga Chat's accounts and sessions (#663), in its own D1 (worker/chat/migrations/0001_identity.sql). One principal per
// provider identity, never linked across providers; its login, display name and picture are display data, refreshed at
// each fresh sign-in and never an account key. A name the account chose (`chosen_display`, 0003_chosen_display.sql) is
// kept apart from the provider's and shown before it (`displayOf`); a sign-in never touches it. A session is a random token in a host-only cookie (`__Host-` on https),
// kept in D1 by its SHA-256, touched at most every TOUCH_MS so reading it is not a write per request. Signing out,
// signing out everywhere and deleting the account work whatever the account's speaking eligibility.

import { isSecureOrigin, parseCookies, serializeCookie } from "../../src/cookies.js";
import { randomToken, sha256Hex } from "../../src/crypto.js";

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const TOUCH_MS = 10 * 60 * 1000;
const USER_AGENT_MAX = 120;
export const DISPLAY_MAX = 50;
export const PRINCIPAL = /^pr_[A-Za-z0-9_-]{22}$/;

export const cookieNames = (siteOrigin) => isSecureOrigin(siteOrigin)
  ? { session: "__Host-ooga_chat_session", oauth: "__Host-ooga_chat_oauth" }
  : { session: "ooga_chat_session", oauth: "ooga_chat_oauth" };

export const sessionCookie = (env, token, ms = SESSION_MS) =>
  serializeCookie(cookieNames(env.SITE_ORIGIN).session, token, { maxAge: Math.floor(ms / 1000), secure: isSecureOrigin(env.SITE_ORIGIN) });
export const clearSessionCookie = (env) => sessionCookie(env, "", 0);

export const newPrincipalId = () => `pr_${randomToken().slice(0, 22)}`;

// Text a person chose, for display only: no control, format or direction characters, collapsed spaces, bounded.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;
export const cleanDisplay = (text, fallback) => {
  const clean = typeof text === "string" ? text.replace(UNSAFE, "").replace(/\s+/g, " ").trim().slice(0, DISPLAY_MAX).trim() : "";
  return clean || fallback;
};

/** The name to show for a principal: the one it chose (Ooga Chat's Commons name, or the island's own for that GitHub
 * account), else the provider's display name, else its login. A sign-in refreshes only the provider's. */
export const displayOf = (principal) => principal.chosen_display || principal.display || principal.login;

/** Keep the name a principal chose (cleaned as any display is); written only when it changed. */
export const chooseDisplay = async (db, principalId, display) => {
  const clean = cleanDisplay(display, "");
  if (!clean) return null;
  await db.prepare("UPDATE principals SET chosen_display = ?2 WHERE id = ?1 AND chosen_display IS NOT ?2").bind(principalId, clean).run();
  return clean;
};

/** The picture's key: changes whenever its address does, so a cached face is never stale or another's. */
export const avatarKey = async (url) => url ? (await sha256Hex(url)).slice(0, 16) : null;
export const avatarPath = (row) => row.avatar_url && row.avatar_key ? `/api/chat/avatar/${row.id}/${row.avatar_key}` : null;

/**
 * Create or refresh the principal for a provider identity at sign-in; returns its row. A GitHub login is a verified donor
 * name and the island's contributor key, so when another GitHub account signs in with a login an earlier principal still
 * holds (renamed away, then taken), that principal's sessions and capability answer go first, as the island's own
 * `highscores_player_login` trigger ends the sessions of any other id holding a login.
 */
export const upsertPrincipal = async (db, { provider, providerUserId, login, display, avatarUrl }, now = Date.now()) => {
  const key = await avatarKey(avatarUrl);
  if (provider === "github") {
    const others = "SELECT id FROM principals WHERE provider = 'github' AND provider_user_id <> ?1 AND lower(login) = lower(?2)";
    await db.batch([
      db.prepare(`DELETE FROM sessions WHERE principal_id IN (${others})`).bind(providerUserId, login),
      db.prepare(`DELETE FROM capabilities WHERE principal_id IN (${others})`).bind(providerUserId, login),
    ]);
  }
  return db.prepare(
    `INSERT INTO principals (id, provider, provider_user_id, login, display, avatar_url, avatar_key, created_at, profile_at, last_login_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)
     ON CONFLICT (provider, provider_user_id) DO UPDATE SET login = ?4, display = ?5, avatar_url = ?6, avatar_key = ?7, profile_at = ?8, last_login_at = ?8
     RETURNING *`,
  ).bind(newPrincipalId(), provider, providerUserId, login, display, avatarUrl || null, key, now).first();
};

export const createSession = async (db, principalId, userAgent, now = Date.now()) => {
  const token = randomToken();
  await db.prepare("INSERT INTO sessions (token_hash, principal_id, created_at, expires_at, last_used_at, user_agent) VALUES (?1, ?2, ?3, ?4, ?3, ?5)")
    .bind(await sha256Hex(token), principalId, now, now + SESSION_MS, String(userAgent || "").slice(0, USER_AGENT_MAX)).run();
  return token;
};

/** A native app's session (`Authorization: Bearer <token>`), which a browser never sends here: no CORS is allowed. */
export const bearerToken = (request) => {
  const match = /^Bearer ([A-Za-z0-9_-]{1,64})$/.exec(request.headers.get("authorization") || "");
  return match ? match[1] : null;
};

/** The session's token: a native app's bearer token when it sends one, else the browser's cookie. */
export const sessionToken = (request, env) =>
  bearerToken(request) || parseCookies(request.headers.get("cookie")).get(cookieNames(env.SITE_ORIGIN).session) || null;

/**
 * `{ principal, session, token }` for a live session, or null. Throws on a D1 failure, so a caller can say it could not
 * tell rather than "signed out". `removal` also admits a banned principal, for signing out and deleting the account.
 */
export const readSession = async (request, env, { removal = false, now = Date.now() } = {}) => {
  const token = sessionToken(request, env);
  if (!token || token.length > 64 || !env.DB) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, s.last_used_at, p.* FROM sessions s JOIN principals p ON p.id = s.principal_id WHERE s.token_hash = ?1`,
  ).bind(hash).first();
  if (!row) return null;
  if (row.expires_at <= now) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(hash).run();
    return null;
  }
  if (row.banned_at && !removal) return null;
  if (now - row.last_used_at >= TOUCH_MS) {
    // Bookkeeping: a failed stamp must not read as a failed sign-in.
    try { await env.DB.prepare("UPDATE sessions SET last_used_at = ?2 WHERE token_hash = ?1").bind(hash, now).run(); } catch { /* next time */ }
  }
  const { token_hash: tokenHash, expires_at: expiresAt, last_used_at: lastUsedAt, ...principal } = row;
  return { principal, session: { tokenHash, expiresAt, lastUsedAt }, token };
};

export const deleteSession = async (db, token) => db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
export const deleteAllSessions = (db, principalId) => db.prepare("DELETE FROM sessions WHERE principal_id = ?1").bind(principalId).run();
/** Sessions and capability answers go with it (ON DELETE CASCADE); a later sign-in starts a new principal. */
export const deletePrincipal = (db, principalId) => db.batch([
  db.prepare("DELETE FROM sessions WHERE principal_id = ?1").bind(principalId),
  db.prepare("DELETE FROM capabilities WHERE principal_id = ?1").bind(principalId),
  db.prepare("DELETE FROM principals WHERE id = ?1").bind(principalId),
]);

/** Daily: expired sessions are refused on read already; this keeps the tables from growing. */
export const purgeExpired = (db, now = Date.now()) => db.batch([
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(now),
  db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?1").bind(now),
  db.prepare("DELETE FROM native_codes WHERE expires_at <= ?1").bind(now),
  db.prepare("DELETE FROM native_consents WHERE expires_at <= ?1").bind(now),
]);

/** What crosses the bridge about a principal: the edge writes it from its own row, never from a request. */
export const assertion = (principal) => ({ id: principal.id, provider: principal.provider, providerUserId: principal.provider_user_id, login: principal.login });
