// The audience socket (#665): `GET /api/chat/audience`, upgraded, from the app's own page. The edge checks the session
// and the per-principal socket limiter, then hands the socket to the island Worker's Audience object through the private
// bridge (ChatBridge.fetch), with an assertion it writes itself: this bridge's version and environment, the principal from
// its own row, the last capability answer (the Audience asks the island again before granting any speaker lease) and the
// session's expiry. Nothing the browser sent passes but the WebSocket headers.
// A refusal before the socket exists is still a socket, closed at once with the protocol's code, so the app can tell
// them apart: 4401 no session (it checks the session again), 4429 too many sockets lately, 4503 listening is not on.

import { BRIDGE_VERSION } from "../../src/chat-bridge-protocol.js";
import { bridgeHello } from "./bridge.js";
import { capabilityFor } from "./capability.js";
import { effective } from "./config.js";
import { allowed, fromSite, refusal } from "./http.js";
import { avatarPath, readSession } from "./session.js";

const SOCKET_HEADERS = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions"];

/** A socket that opens only to say why it is closing. */
export const closedSocket = (code, reason) => {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.close(code, reason);
  const res = new Response(null, { status: 101, webSocket: client });
  // For the edge's metric line alone (metrics.js): which refusal this was.
  res.closeCode = code;
  return res;
};

/** What the edge tells the island about a session's principal: written here, from its own rows, never from a request. */
export const assertionFor = async (env, found, deps) => {
  const p = found.principal;
  let capability = null;
  if (p.provider === "github") { try { capability = await capabilityFor(env, p, { waitUntil: deps.waitUntil }); } catch { capability = null; } }
  return {
    v: BRIDGE_VERSION, env: env.ENVIRONMENT,
    principal: { id: p.id, provider: p.provider, providerUserId: p.provider_user_id, login: p.login, display: p.display || p.login, avatar: avatarPath(p) },
    eligible: !!capability && capability.state === "eligible" && capability.fresh,
    character: capability && capability.state === "eligible" ? capability.character : null,
    sessionExpiresAt: found.session.expiresAt,
  };
};

export const handleAudienceSocket = async (request, env, deps) => {
  if (request.method !== "GET") return refusal("method_not_allowed", 405);
  if (request.headers.get("upgrade") !== "websocket") return refusal("upgrade_required", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  if (!effective(env, await bridgeHello(env)).listen) return closedSocket(4503, "unavailable");
  let found;
  try { found = await readSession(request, env); } catch { return closedSocket(1013, "try_again"); }
  if (!found) return closedSocket(4401, "auth_required");
  const p = found.principal;
  if (!(await allowed(env.CHAT_SOCKET_LIMITER, p.id))) return closedSocket(4429, "rate_limited");
  const headers = new Headers({ "x-ooga-chat-assertion": JSON.stringify(await assertionFor(env, found, deps)) });
  for (const name of SOCKET_HEADERS) { const value = request.headers.get(name); if (value !== null) headers.set(name, value); }
  try {
    return await env.OBL.fetch(new Request("https://chat-bridge.invalid/audience", { headers }));
  } catch {
    return closedSocket(1013, "try_again");
  }
};
