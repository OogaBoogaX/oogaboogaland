// Hosted chats from Ooga Chat's page (docs/ooga-chat-hosts.md): `GET /api/chat/chats`, the live chats (with `?chat=<id>`,
// that chat's preview: its stage and how many listen), and
// `POST /api/chat/chats` `{ title, zone }`, starting one, both for a signed-in principal and both over the private bridge
// (`chats`, `startChat`, worker/src/chat-bridge.js), which decides who may start one. A chat's socket and media are the
// audience's own routes with `?chat=<id>` (audience.js, media.js); `chatParam` reads it.

import { bridgeCall, bridgeHello } from "./bridge.js";
import { effective } from "./config.js";
import { allowed, fromSite, json, readBody, refusal } from "./http.js";
import { assertion, readSession } from "./session.js";

const CHAT_ID = /^[A-Za-z0-9_-]{16}$/;
const BODY_MAX = 512;

/** A request's `?chat=`: undefined when absent, null when present and malformed, else the id. */
export const chatParam = (url) => {
  if (!url.searchParams.has("chat")) return undefined;
  const id = url.searchParams.get("chat");
  return CHAT_ID.test(id) ? id : null;
};

const STATUS = { auth_required: 401, capability_required: 403, already_hosting: 409, bad_title: 400, zone_unavailable: 400, malformed: 400 };

export const handleChats = async (request, env, deps) => {
  if (request.method !== "GET" && request.method !== "POST") return refusal("method_not_allowed", 405);
  if (request.method === "POST" && !fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  if (!effective(env, await bridgeHello(env)).chats) return refusal("unavailable", 503, { retryable: true, retryAfter: 60 });
  let found;
  try { found = await readSession(request, env); } catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
  if (!found) return refusal("auth_required", 401);
  if (request.method === "GET" && new URL(request.url).searchParams.has("chat")) {
    const id = chatParam(new URL(request.url));
    if (!id) return refusal("ended", 404);
    const reply = await bridgeCall(env, "chatPreview", { id }, assertion(found.principal));
    if (reply.ok && reply.result && reply.result.chat) return json(reply.result);
    return reply.ok || reply.error.code === "ended" ? refusal("ended", 404) : refusal("unavailable", 503, { retryable: true, retryAfter: 5 });
  }
  if (request.method === "GET") {
    const reply = await bridgeCall(env, "chats", {}, assertion(found.principal));
    return reply.ok && Array.isArray(reply.result.chats) ? json({ chats: reply.result.chats }) : refusal("unavailable", 503, { retryable: true, retryAfter: 5 });
  }
  if (found.principal.provider !== "github") return refusal("capability_required", 403);
  if (!(await allowed(env.CHAT_AUTH_LIMITER, found.principal.id))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  const raw = await readBody(request, BODY_MAX);
  if (raw === null) return refusal("too_large", 413);
  let body;
  try { body = JSON.parse(raw); } catch { return refusal("malformed", 400); }
  if (!body || typeof body.title !== "string" || typeof body.zone !== "string") return refusal("malformed", 400);
  const reply = await bridgeCall(env, "startChat", { title: body.title, zone: body.zone, display: found.principal.display || found.principal.login }, assertion(found.principal));
  if (reply.ok && reply.result && reply.result.chat) return json({ chat: reply.result.chat }, 201);
  const { code, retryable, retryAfter } = reply.ok ? { code: "unavailable", retryable: true } : reply.error;
  return refusal(code, STATUS[code] || (retryable ? 429 : 503), { retryable, retryAfter });
};
