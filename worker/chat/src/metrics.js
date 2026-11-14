// Ooga Chat's edge in Workers Logs (#669, docs/ooga-chat-operations.md): one fixed-schema line for each notable API
// answer, which the owner counts in the dashboard's Query Builder by its fields. The configs keep invocation logs off,
// so no request URL (an OAuth callback's code and state), header, cookie or address reaches the logs at all; and a line
// here holds only names from the lists below and a status: never an id, login, token, URL, SDP or free text.
// Public reads that succeed are not logged, so the line count follows sign-ins, sockets and media, not page loads.

import { MEDIA_OPS } from "./media.js";

export const METRIC_V = 1;
const EXACT = {
  "/api/bootstrap": "bootstrap", "/api/chat/config": "bootstrap", "/api/chat/health": "health", "/api/chat/version": "version",
  "/api/chat/audience": "audience", "/api/chat/commons": "commons", "/api/chat/me": "me", "/api/chat/logout": "logout",
  "/api/chat/public/contributors": "public",
};
const QUIET = new Set(["bootstrap", "health", "version", "public", "avatar", "me"]);
const SIGNIN = new Set(["ok", "denied", "failed", "unavailable", "rate-limited"]);
const PROVIDER = new Set(["github", "x"]);
const DONATION = new Set(["invoice", "note", "onchain", "socket"]);
const ENVIRONMENTS = new Set(["staging", "production"]);

/** A path's fixed name, or null for one this Worker does not log (the staged app's files). */
export const routeOf = (path) => {
  if (EXACT[path]) return EXACT[path];
  if (path.startsWith("/api/chat/media/")) { const op = path.slice(16); return MEDIA_OPS.includes(op) ? `media:${op}` : "media:unknown"; }
  if (path.startsWith("/api/chat/avatar/")) return "avatar";
  if (path.startsWith("/donations/")) { const op = path.slice(11); return DONATION.has(op) ? `donations:${op}` : "donations:unknown"; }
  if (path.startsWith("/auth/")) {
    const [provider, step] = path.slice(6).split("/");
    return PROVIDER.has(provider) ? `auth:${provider}:${step === "callback" ? "callback" : "start"}` : "auth:unknown";
  }
  return path.startsWith("/api/") ? "api:unknown" : null;
};

/** The line for an answer, or null when there is nothing worth a line. `close` is a refused socket's close code. */
export const metricLine = (env, path, res) => {
  const route = routeOf(path);
  if (!route || !res) return null;
  if (QUIET.has(route) && res.status < 400) return null;
  const line = { ooga: "chat", v: METRIC_V, env: ENVIRONMENTS.has(env.ENVIRONMENT) ? env.ENVIRONMENT : "", route, status: res.status };
  if (Number.isSafeInteger(res.closeCode)) line.close = res.closeCode;
  if (route.startsWith("auth:") && res.status === 303) {
    const at = String(res.headers.get("location") || "");
    const result = /[?&]signin=([a-z-]+)/.exec(at);
    if (result && SIGNIN.has(result[1])) line.signin = result[1];
  }
  return JSON.stringify(line);
};
