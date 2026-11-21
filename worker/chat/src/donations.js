// /donations/* on Ooga Chat's origin (#664): the native Feed the Oogas popup's calls, passed on to the same
// bananapayserver the island uses (its `PageApi` over the `DONATIONS` binding; protocol v0.2, docs/protocol.md at
// bananapayserver ede387d9), exactly as the island's own relay does (worker/src/donations.js): only the page's body and
// type go on, never the browser's request with its cookies; the visitor's address goes beside each call for the
// service's own limits; a throw or no binding is `{ error: "closed" }`, 503, never a simulated payment.
// Who is giving comes from Ooga Chat's own session: a GitHub principal is passed as the protocol's verified donor,
// `{ id, login }` with GitHub's numeric id (any GitHub account the provider vouched for, contributor or not; the
// service's `verified` mark also needs the chosen handle to match that login). An X principal or a signed-out visitor
// is `null`, an anonymous donor whose handle is just the name they typed: an X account never fills the GitHub id or
// earns the GitHub check. A donation grants no contribution and no speaking. The read socket carries public events
// only (the tally, recent donations, the leaderboard), the same for both apps; invoice control stays per invoice.

import { readSession } from "./session.js";
import { allowed, clientIp, fromSite, json } from "./http.js";

const CALLS = { "/donations/invoice": "invoice", "/donations/note": "note", "/donations/onchain": "onchain" };
const SOCKET_HEADERS = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version"];
export const DONATION_BODY_MAX = 1024;

const closed = () => json({ error: "closed" }, 503);

export const donorOf = (principal) => {
  if (!principal || principal.provider !== "github") return null;
  const id = Number(principal.provider_user_id);
  return Number.isSafeInteger(id) && id > 0 ? { id, login: principal.login } : null;
};

export const handleDonations = async (request, env, url, deps) => {
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!deps.feed || !env.DONATIONS) return closed();
  if (!(await allowed(env.CHAT_PUBLIC_LIMITER, clientIp(request)))) return json({ error: "busy" }, 429, { "retry-after": "60" });
  const visitor = clientIp(request);
  try {
    if (url.pathname === "/donations/socket") {
      if (request.method !== "GET") return json({ error: "not found" }, 404);
      const headers = new Headers({ "x-client": visitor });
      for (const name of SOCKET_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      const after = url.searchParams.get("after");
      const target = new URL("/donations/socket", url);
      // Only `after`, the last donation id the page saw; bananapayserver checks it.
      if (after !== null && after.length <= 256) target.searchParams.set("after", after);
      return await env.DONATIONS.fetch(new Request(target, { headers }));
    }
    const method = CALLS[url.pathname];
    if (!method || request.method !== "POST") return json({ error: "not found" }, 404);
    if (Number(request.headers.get("content-length") || 0) > DONATION_BODY_MAX) return json({ error: "too large" }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > DONATION_BODY_MAX) return json({ error: "too large" }, 413);
    const call = new Request(new URL(url.pathname, url), { method: "POST", headers: { "content-type": request.headers.get("content-type") || "" }, body });
    if (method !== "invoice") return await env.DONATIONS[method](call, visitor);
    // A session that cannot be read is no reason to give anonymously: say donations are closed and let the page retry.
    const found = await readSession(request, env);
    return await env.DONATIONS.invoice(call, donorOf(found && found.principal), visitor);
  } catch {
    return closed();
  }
};
