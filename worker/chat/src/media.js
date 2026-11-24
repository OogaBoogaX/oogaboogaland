// Media signalling (#666): `POST /api/chat/media/<op>` from the app's own page, with a session, passed to the island
// Worker's Audience object through the private bridge with the edge's own assertion. The Audience owns every upstream id
// and decides what may be published or pulled; the page names only its own audience connection (`connection`, from its
// snapshot). Bodies are SDP and at most 256 KiB. Publishing needs `speak` on and a GitHub principal; listening needs only
// `listen`. The SFU secret never reaches this Worker.

import { assertionFor } from "./audience.js";
import { bridgeHello } from "./bridge.js";
import { effective } from "./config.js";
import { allowed, fromSite, readBody, refusal } from "./http.js";
import { readSession } from "./session.js";
import { chatParam } from "./chats.js";

export const MEDIA_OPS = ["ice", "renegotiate", "leave", "receive/open", "receive/sync", "receive/close", "publish/open", "publish/offer", "publish/ready", "publish/close"];
const BODY_MAX = 256 * 1024;

export const handleMedia = async (request, env, url, deps) => {
  const op = url.pathname.slice("/api/chat/media/".length);
  if (!MEDIA_OPS.includes(op)) return refusal("not_found", 404);
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (!fromSite(request, env.SITE_ORIGIN)) return refusal("forbidden", 403);
  const features = effective(env, await bridgeHello(env));
  if (!features.listen) return refusal("voice_unavailable", 503, { retryable: true });
  let found;
  try { found = await readSession(request, env); } catch { return refusal("unavailable", 503, { retryable: true, retryAfter: 5 }); }
  if (!found) return refusal("auth_required", 401);
  // In a hosted chat a host decides who speaks, X accounts included (docs/ooga-chat-hosts.md); the chat checks the lease.
  const chat = chatParam(url);
  if (chat === null || chat !== undefined && !features.chats) return refusal("not_found", 404);
  if (op.startsWith("publish/") && !chat && (!features.speak || found.principal.provider !== "github")) return refusal("capability_required", 403);
  if (!(await allowed(env.CHAT_MEDIA_LIMITER, found.principal.id))) return refusal("rate_limited", 429, { retryable: true, retryAfter: 60 });
  const body = await readBody(request, BODY_MAX);
  if (body === null) return refusal("too_large", 413);
  const headers = new Headers({ "content-type": "application/json", "x-ooga-chat-assertion": JSON.stringify(await assertionFor(env, found, deps)) });
  if (chat) headers.set("x-chat-id", chat);
  try {
    const res = await env.OBL.fetch(new Request(`https://chat-bridge.invalid/media/${op}`, { method: "POST", headers, body }));
    return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return refusal("upstream_failed", 502, { retryable: true });
  }
};
