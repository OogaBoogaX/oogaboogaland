// The Durable Object inspector's two doors: the page at /inspect and its feed at /api/inspect/ws, which the Inspector
// object (inspector.js) answers. Both are for the accounts INSPECTOR_IDS names (inspect-report.js) and a 404 for
// everyone else, signed in or not, so neither is advertised. The page is served from here rather than the staged site
// with a content policy of its own: a script and style by this response's nonce, a connection to this origin and
// nothing else.

import { allowed, fromSite, getSessionFromRequest, text } from "./http.js";
import { inspectorAllowed, INSPECTOR_NAME } from "./inspect-report.js";
import { PAGE } from "./inspect-page.js";

const notFound = () => text("Not found", 404);

const viewer = async (request, env) => {
  const found = await getSessionFromRequest(request, env);
  return found && inspectorAllowed(env, found.player.id) ? found.player : null;
};

export const handleInspect = async (request, env, url) => {
  if (!env.INSPECTOR) return notFound();
  if (url.pathname === "/inspect") {
    if (request.method !== "GET") return notFound();
    if (!(await viewer(request, env))) return notFound();
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    return new Response(PAGE.replaceAll("__NONCE__", nonce), { headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-frame-options": "DENY",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    } });
  }
  // The feed: the checks in the order a cross-site page or a stranger would meet them.
  if (request.method !== "GET") return notFound();
  const player = await viewer(request, env);
  if (!player) return notFound();
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!(await allowed(env.ROOM_LIMITER, `inspect:${player.id}`))) return text("Too many reconnects", 429);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-viewer-")) headers.delete(name);
  headers.set("x-viewer-id", String(player.id));
  headers.set("x-viewer-login", player.login);
  return env.INSPECTOR.getByName(INSPECTOR_NAME).fetch(new Request(request, { headers }));
};
