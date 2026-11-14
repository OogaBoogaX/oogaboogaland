// The Commons and Online Oogas (#670): `GET /api/chat/commons`, upgraded, from the app's own page, for a GitHub
// principal the island's contributor policy calls eligible now (an X account, a non-contributor, an unknown or stale
// answer, a revoked one or a signed-out visitor never get one, whatever the page hides or shows). The socket goes
// through the private bridge to the island's Room as a community member: The Commons' one conversation and the island's
// presence without positions, never a player slot, a body or a voice. Refusals are sockets closed with a code: 4401 no
// session, 4403 not a contributor now, 4429 too many sockets lately, 4503 the Commons is off.

import { assertionFor, closedSocket } from "./audience.js";
import { bridgeHello } from "./bridge.js";
import { effective } from "./config.js";
import { allowed, fromSite, refusal } from "./http.js";
import { readSession } from "./session.js";

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
