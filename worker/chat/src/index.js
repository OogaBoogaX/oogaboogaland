// Ooga Chat's edge Worker (`ooga-chat-<env>`, docs/ooga-chat-backend.md): the staged app (`npm run build:ooga-chat`)
// from static assets, and on the same origin its server routes. Only the paths named in `run_worker_first`
// (wrangler.ooga-chat.<env>.jsonc) reach this code; every other path is served straight from the assets, so an API path
// that is not handled here answers a JSON 404 rather than falling through to the app's HTML.
// Identity never passes through: identity headers a caller sent are dropped (`scrubbed`), and whatever this Worker
// hands the island Worker over its private bridge (`OBL`, worker/src/chat-bridge.js) it writes itself, from its own
// session. Routes: the public configuration (config.js), sign-in and the account (#663, auth.js, avatar.js), the public
// panels and donations (#664, public.js, donations.js), the audience socket (#665, audience.js) and its media (#666,
// media.js); the Commons (#670) adds its own here.

import { handleAudienceSocket } from "./audience.js";
import { handleAuth } from "./auth.js";
import { handleAvatar } from "./avatar.js";
import { bootstrap, effective, health, version } from "./config.js";
import { handleDonations } from "./donations.js";
import { handleMedia } from "./media.js";
import { handlePublic } from "./public.js";
import { allowed, clientIp, json, refusal } from "./http.js";
import { purgeExpired } from "./session.js";

const PUBLIC_GET = {
  "/api/bootstrap": bootstrap,
  "/api/chat/config": bootstrap,
  "/api/chat/health": health,
  "/api/chat/version": version,
};

// What a route may reach beyond `env`: the network, background work and the edge cache, so the checks can supply their own.
const hostDeps = (ctx) => ({
  fetch: (...args) => fetch(...args),
  waitUntil: ctx && ctx.waitUntil ? (task) => ctx.waitUntil(task) : null,
  cache: typeof caches !== "undefined" ? caches.default : null,
});

export const route = async (request, env, deps = hostDeps(null)) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const read = PUBLIC_GET[path];
  if (read) {
    if (request.method !== "GET" && request.method !== "HEAD") return refusal("method_not_allowed", 405);
    if (!(await allowed(env.CHAT_PUBLIC_LIMITER, clientIp(request)))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
    return json(await read(env));
  }
  if (path === "/api/chat/audience") return handleAudienceSocket(request, env, deps);
  if (path.startsWith("/api/chat/media/")) return handleMedia(request, env, url, deps);
  if (path.startsWith("/api/chat/avatar/")) return handleAvatar(request, env, url, deps);
  if (path.startsWith("/api/chat/public/")) return handlePublic(request, env, url, deps);
  if (path.startsWith("/donations/")) return handleDonations(request, env, url, { ...deps, feed: effective(env, null).feed });
  if (path.startsWith("/auth/") || path === "/api/chat/me" || path === "/api/chat/logout") return handleAuth(request, env, url, deps);
  if (path.startsWith("/api/")) return refusal("not_found", 404);
  return env.ASSETS.fetch(request);
};

export default {
  fetch: (request, env, ctx) => route(request, env, hostDeps(ctx)),
  // Daily: expired sessions and abandoned sign-ins are already refused on read; this keeps the tables small.
  async scheduled(_controller, env, ctx) {
    if (env.DB) ctx.waitUntil(purgeExpired(env.DB));
  },
};
