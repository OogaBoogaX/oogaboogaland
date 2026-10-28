// /donations/* and /purchases/*: the page's donation and purchase calls, passed on over the DONATIONS service binding to bananapayserver's PageApi
// entrypoint, as its docs/protocol.md ("How OBL's Worker passes them on") asks. Who is giving comes from this Worker's
// GitHub sign-in, independently of the page's editable display handle; only the body and type go on, never its request, whose
// cookies carry the session. The visitor's address goes beside each call for bananapayserver's rate limits. Without the
// binding, or when bananapayserver throws, the page hears that donations are closed. Purchases (fireworks first) go the
// same way, an invoice for one and the buyer's own totals each carrying the signed-in buyer.

import { clientIp, fromSite, getSessionFromRequest, json } from "./http.js";

const CALLS = { "/donations/invoice": "invoice", "/donations/note": "note", "/donations/onchain": "onchain", "/purchases/buy": "purchase", "/purchases/mine": "purchases" };
// The calls that name who is giving or buying.
const SIGNED = new Set(["invoice", "purchase", "purchases"]);
const SOCKET_HEADERS = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version"];
const BODY_MAX = 1024;

const closed = () => json({ error: "closed" }, 503);

export const handleDonations = async (request, env, url) => {
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!env.DONATIONS) return closed();
  const visitor = clientIp(request);
  try {
    // The socket's upgrade: the WebSocket headers alone, with the visitor's address set here whatever the browser sent.
    if (url.pathname === "/donations/socket") {
      if (request.method !== "GET") return json({ error: "not found" }, 404);
      const headers = new Headers({ "x-client": visitor });
      for (const name of SOCKET_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      return await env.DONATIONS.fetch(new Request(url, { headers }));
    }
    const method = CALLS[url.pathname];
    if (!method || request.method !== "POST") return json({ error: "not found" }, 404);
    // The protocol's bodies are at most 1 KiB, so a larger one goes no further.
    if (Number(request.headers.get("content-length") || 0) > BODY_MAX) return json({ error: "too large" }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > BODY_MAX) return json({ error: "too large" }, 413);
    const call = new Request(url, { method: "POST", headers: { "content-type": request.headers.get("content-type") || "" }, body });
    if (!SIGNED.has(method)) return await env.DONATIONS[method](call, visitor);
    // The donor: GitHub's numeric id, which survives a rename, and the login as GitHub gives it, or nobody.
    const found = await getSessionFromRequest(request, env);
    return await env.DONATIONS[method](call, found ? { id: found.player.id, login: found.player.login } : null, visitor);
  } catch {
    return closed();
  }
};
