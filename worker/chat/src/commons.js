// The Commons and Online Oogas (#670): `GET /api/chat/commons`, upgraded, from the app's own page, for a GitHub
// principal the island's contributor policy calls eligible now (an X account, a non-contributor, an unknown or stale
// answer, a revoked one or a signed-out visitor never get one, whatever the page hides or shows). The socket goes
// through the private bridge to the island's Room as a community member: The Commons' one conversation and the island's
// presence without positions, never a player slot, a body or a voice. Refusals are sockets closed with a code: 4401 no
// session, 4403 not a contributor now, 4429 too many sockets lately, 4503 the Commons is off.
// `POST /api/chat/commons/name` sets the member's name there, the island's own display name for the account (the
// bridge's `display`, worker/src/chat-display.js), from the name field at the top of the app's Commons tab.

import { assertionFor, closedSocket } from "./audience.js";
import { bridgeCall, bridgeHello } from "./bridge.js";
import { effective } from "./config.js";
import { allowed, fromSite, json, readBody, refusal } from "./http.js";
import { assertion, readSession } from "./session.js";

const SOCKET_HEADERS = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions"];

export const handleCommonsSocket = async (request, env, deps) => {
  if (request.method !== "GET") return refusal("method_not_allowed", 405);
  if (request.headers.get("upgrade") !== "websocket") return refusal("upgrade_required", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  if (!effective(env, await bridgeHello(env)).commons) return closedSocket(4503, "unavailable");
  let found;
  try { found = await readSession(request, env); } catch { return closedSocket(1013, "try_again"); }
  if (!found) return closedSocket(4401, "auth_required");
  if (found.principal.provider !== "github") return closedSocket(4403, "capability_required");
  if (!(await allowed(env.CHAT_SOCKET_LIMITER, found.principal.id))) return closedSocket(4429, "rate_limited");
  const assertion = await assertionFor(env, found, deps);
  if (!assertion.eligible) return closedSocket(4403, "capability_required");
  const headers = new Headers({ "x-ooga-chat-assertion": JSON.stringify(assertion) });
  for (const name of SOCKET_HEADERS) { const value = request.headers.get(name); if (value !== null) headers.set(name, value); }
  try {
    return await env.OBL.fetch(new Request("https://chat-bridge.invalid/commons", { headers }));
  } catch {
    return closedSocket(1013, "try_again");
  }
};

// The name field's save: `{ display }` in, `{ display }` (as the island kept it) out. The same gates as the socket, as
// HTTP refusals: 401 no session, 403 not an eligible GitHub contributor now, 429 too many saves lately, 503 the Commons
// is off or the island could not answer, 400 a name the island's rules refuse (3 to 24 letters, digits, spaces or
// simple punctuation).
const NAME_BODY_MAX = 512;
export const handleCommonsName = async (request, env, deps) => {
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  if (!effective(env, await bridgeHello(env)).commons) return refusal("unavailable", 503, { retryable: true, retryAfter: 60 });
  let found;
  try { found = await readSession(request, env); } catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
  if (!found) return refusal("auth_required", 401);
  if (found.principal.provider !== "github") return refusal("capability_required", 403);
  if (!(await allowed(env.CHAT_AUTH_LIMITER, found.principal.id))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  const raw = await readBody(request, NAME_BODY_MAX);
  if (raw === null) return refusal("too_large", 413);
  let body;
  try { body = JSON.parse(raw); } catch { return refusal("malformed", 400); }
  if (!body || typeof body.display !== "string") return refusal("invalid_display", 400);
  if (!(await assertionFor(env, found, deps)).eligible) return refusal("capability_required", 403);
  const reply = await bridgeCall(env, "display", { display: body.display }, assertion(found.principal));
  if (reply.ok && reply.result && typeof reply.result.display === "string") return json({ display: reply.result.display });
  const code = reply.ok ? "unavailable" : reply.error.code;
  if (code === "invalid_display") return refusal(code, 400);
  if (code === "capability_required") return refusal(code, 403);
  return refusal("unavailable", 503, { retryable: true, retryAfter: 5 });
};
