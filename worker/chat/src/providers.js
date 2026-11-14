// The two sign-in providers (#663): where each sends the visitor, how the code becomes a profile, and what is kept. Each
// returns `{ profile }` or `{ result, reason }`, `result` being the app's sign-in return (`denied`, `failed`,
// `unavailable`, `rate-limited`) and `reason` a short code for the Worker's own log. The provider token is used for the
// one profile read and dropped; X's is also revoked at once, since nothing here ever uses it again. No email, no
// follow, post or message scope is asked for, and a picture address is kept only on its provider's image host.

export const PROVIDERS = ["github", "x"];
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";
const X_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const X_TOKEN = "https://api.x.com/2/oauth2/token";
const X_ME = "https://api.x.com/2/users/me?user.fields=profile_image_url";
const X_REVOKE = "https://api.x.com/2/oauth2/revoke";
// User lookup only (docs.x.com: authorization-code PKCE, the scopes /2/users/me documents). No offline.access.
export const X_SCOPES = "tweet.read users.read";
const TIMEOUT_MS = 5000;
const UA = "ooga-chat";

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const X_USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const X_ID = /^[1-9][0-9]{0,19}$/;
const AVATAR_HOSTS = { github: ["avatars.githubusercontent.com"], x: ["pbs.twimg.com", "abs.twimg.com"] };
const AVATAR_MAX = 512;

export const callbackUrl = (env, provider) => `${env.SITE_ORIGIN}/auth/${provider}/callback`;

/** A provider's picture address, kept only on its own image host over https and resized to what a face needs. */
export const avatarUrl = (provider, raw) => {
  if (typeof raw !== "string" || raw.length > AVATAR_MAX) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !AVATAR_HOSTS[provider].includes(url.hostname)) return null;
  if (provider === "github") { url.search = ""; url.searchParams.set("v", "4"); url.searchParams.set("s", "112"); }
  else url.pathname = url.pathname.replace(/_normal(\.[a-z]+)$/i, "_200x200$1");
  url.hash = "";
  return url.toString();
};

/** The provider's authorization address for one sign-in in flight; X's carries the PKCE challenge (S256). */
export const authorizeUrl = async (env, provider, state, verifier) => {
  if (provider === "github") {
    const url = new URL(GITHUB_AUTHORIZE);
    url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    url.searchParams.set("redirect_uri", callbackUrl(env, "github"));
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "true");
    return url.toString();
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let raw = "";
  for (const b of digest) raw += String.fromCharCode(b);
  const challenge = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = new URL(X_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.X_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl(env, "x"));
  url.searchParams.set("scope", X_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

// Workers' fetch takes "follow" or "manual" only ("error" throws): with "manual" a redirect comes back as its own 3xx
// answer, which is not `ok`, so it fails as any other refusal does and is never followed.
const call = (fetcher, url, init) => fetcher(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
const failure = (status, reason) => status === 429 ? { result: "rate-limited", reason }
  : status === 402 ? { result: "unavailable", reason: "credits" }
  : status >= 500 ? { result: "unavailable", reason } : { result: "failed", reason };

const github = async (env, code, fetcher) => {
  let token;
  try {
    const res = await call(fetcher, GITHUB_TOKEN, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl(env, "github") }) });
    if (!res.ok) return failure(res.status, "exchange");
    const answer = await res.json();
    // GitHub answers 200 with `error` for a bad or used code, a wrong secret or callback.
    token = answer && typeof answer.access_token === "string" ? answer.access_token : null;
    if (!token) return { result: "failed", reason: "exchange" };
  } catch { return { result: "unavailable", reason: "exchange" }; }
  let user;
  try {
    const res = await call(fetcher, GITHUB_USER, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": UA } });
    if (!res.ok) return failure(res.status, "profile");
    user = await res.json();
  } catch { return { result: "unavailable", reason: "profile" }; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== "string" || !GITHUB_LOGIN.test(user.login) || user.type !== "User") {
    return { result: "failed", reason: "profile" };
  }
  return { profile: { provider: "github", providerUserId: String(user.id), login: user.login, display: user.name, avatarUrl: avatarUrl("github", user.avatar_url) } };
};

const x = async (env, code, verifier, fetcher, waitUntil) => {
  const basic = `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`;
  const form = { authorization: basic, "content-type": "application/x-www-form-urlencoded", "user-agent": UA };
  let token;
  try {
    const res = await call(fetcher, X_TOKEN, { method: "POST", headers: form,
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(env, "x"), code_verifier: verifier }).toString() });
    if (!res.ok) return failure(res.status, "exchange");
    const answer = await res.json();
    token = answer && typeof answer.access_token === "string" ? answer.access_token : null;
    if (!token) return { result: "failed", reason: "exchange" };
  } catch { return { result: "unavailable", reason: "exchange" }; }
  let me;
  try {
    const res = await call(fetcher, X_ME, { headers: { authorization: `Bearer ${token}`, "user-agent": UA } });
    if (!res.ok) return failure(res.status, res.status === 403 ? "forbidden" : "profile");
    me = await res.json();
  } catch { return { result: "unavailable", reason: "profile" }; }
  finally {
    // Only once the one read is done, whatever it answered.
    const revoke = call(fetcher, X_REVOKE, { method: "POST", headers: form, body: new URLSearchParams({ token, token_type_hint: "access_token" }).toString() }).catch(() => {});
    if (waitUntil) waitUntil(revoke);
  }
  const data = me && me.data;
  if (!data || typeof data.id !== "string" || !X_ID.test(data.id) || typeof data.username !== "string" || !X_USERNAME.test(data.username)) {
    return { result: "failed", reason: me && me.errors ? "suspended" : "profile" };
  }
  return { profile: { provider: "x", providerUserId: data.id, login: data.username, display: data.name, avatarUrl: avatarUrl("x", data.profile_image_url) } };
};

/** The provider's profile for a returned code, or why not. */
export const profileFor = (env, provider, code, verifier, fetcher = fetch, waitUntil = null) =>
  provider === "github" ? github(env, code, fetcher) : x(env, code, verifier, fetcher, waitUntil);
