// ChatBridge: the private door from Ooga Chat's edge Worker (`ooga-chat-<env>`, worker/chat/) into this Worker. It is a
// named entrypoint, so it is reachable only through a service binding that names it (`OBL` in
// wrangler.ooga-chat.<env>.jsonc), never from public HTTP: the default export in index.js answers every public request.
// Each call is one envelope (chat-bridge-protocol.js), checked here before any operation runs: the bridge's protocol
// version, the caller's environment (a staging edge can never reach production, nor the other way round), a bounded
// request id, a known operation and a bounded payload. An operation receives the envelope's `principal`, which the edge
// writes from its own validated session; a browser never supplies one. Every refusal is a small `{ ok: false, error }`
// with a stable code, never a throw that would carry this Worker's internals back across the binding.
// What the bridge may do is turned on here by `OOGA_CHAT_FEATURES` (comma-separated: `bridge` for every operation but
// `hello`; `outdoor`, `cloud` and `commons` for those paths), so deploying this Worker with the variable empty is the
// kill switch for the whole outward path, whatever the edge believes. `hello` always answers, so the edge can say why.
// Operations are added by the issues that need them: `capability` (#663, chat-capability.js), `cast` (#664,
// chat-public.js), `revoke` and the audience socket (#665, audience.js); later media (#666-#668) and the Commons (#670). This file holds the boundary and `hello`.

import { WorkerEntrypoint } from "cloudflare:workers";
import { BRIDGE_ENVIRONMENTS, BRIDGE_VERSION, BridgeRefusal, ENVELOPE_MAX, ERROR_CODE, FEATURES, REQUEST_ID, bridgeFeatures } from "./chat-bridge-protocol.js";

export { BridgeRefusal, FEATURES, bridgeFeatures };
import { capabilityOps } from "./chat-capability.js";
import { contributorFor } from "./contributor-access.js";
import { publicOps } from "./chat-public.js";
import { AUDIENCE_NAME } from "./audience.js";
import CAST_ROWS from "./characters.gen.json" with { type: "json" };

const refuse = (code, retryable = false, extra = {}) => ({ ok: false, error: { code, retryable, ...extra } });

// What every version answers. `hello` reports what this side can do, without a binding id, secret or account
// identifier, so the edge's health and bootstrap can say why something is off.
export const BASE_OPS = {
  hello: { always: true, run: (env) => ({ version: BRIDGE_VERSION, environment: env.ENVIRONMENT || "", features: bridgeFeatures(env),
    voice: !!(env.REALTIME_APP_ID && env.REALTIME_SECRET) }) },
};

// The checks every envelope passes, in order, then the operation. `ops` maps a name to `{ run(env, envelope, ctx), always? }`;
// an operation without `always` needs the `bridge` feature. Exported for the Node checks, which drive it without a host.
export const handleEnvelope = async (env, envelope, ops = BASE_OPS, ctx = null) => {
  let size;
  try { size = JSON.stringify(envelope ?? null).length; } catch { return refuse("malformed"); }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || size > ENVELOPE_MAX) return refuse("malformed");
  if (envelope.v !== BRIDGE_VERSION) return refuse("protocol_unsupported", false);
  if (!BRIDGE_ENVIRONMENTS.includes(envelope.env) || envelope.env !== env.ENVIRONMENT) return refuse("environment_mismatch");
  if (typeof envelope.requestId !== "string" || !REQUEST_ID.test(envelope.requestId)) return refuse("malformed");
  if (typeof envelope.op !== "string" || !Object.hasOwn(ops, envelope.op)) return refuse("unknown_operation");
  const op = ops[envelope.op];
  if (!op.always && !bridgeFeatures(env).bridge) return refuse("disabled");
  try {
    return { ok: true, requestId: envelope.requestId, result: await op.run(env, envelope, ctx) };
  } catch (error) {
    if (error instanceof BridgeRefusal && ERROR_CODE.test(error.code)) return refuse(error.code, error.retryable, error.retryAfter ? { retryAfter: error.retryAfter } : {});
    console.error("chat bridge operation failed", envelope.op, error && error.name);
    return refuse("internal", true);
  }
};

// Ending what a principal holds live (#665): always on, since cleanup must work while admissions are switched off.
export const revokeOps = {
  revoke: {
    always: true,
    run: async (env, envelope) => {
      const reason = envelope.payload && typeof envelope.payload.reason === "string" ? envelope.payload.reason.slice(0, 32) : "";
      if (!env.AUDIENCE || !envelope.principal) return { revoked: 0 };
      return env.AUDIENCE.getByName(AUDIENCE_NAME).revoke({ id: envelope.principal.id }, reason);
    },
  },
};

export const OPS = { ...BASE_OPS, ...capabilityOps({ contributorFor }), ...publicOps({ cast: CAST_ROWS }), ...revokeOps };

const SOCKET_HEADERS = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions"];
/**
 * A socket through the bridge (#665): the edge's `x-ooga-chat-assertion` (this bridge's version and environment, and the
 * principal from its session) is checked, then handed to the Audience object as `x-audience-principal`, the only
 * identity it reads. Nothing a browser sent passes: the edge built this request, and only the WebSocket headers go on.
 */
export const bridgeFetch = async (env, request) => {
  const url = new URL(request.url);
  if (url.pathname !== "/audience") return new Response("Not found", { status: 404 });
  if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  let assertion;
  try { assertion = JSON.parse(request.headers.get("x-ooga-chat-assertion") || ""); } catch { assertion = null; }
  if (!assertion || assertion.v !== BRIDGE_VERSION || assertion.env !== env.ENVIRONMENT || !assertion.principal || typeof assertion.principal !== "object")
    return new Response("Forbidden", { status: 403 });
  if (!bridgeFeatures(env).bridge || !env.AUDIENCE) return new Response("Unavailable", { status: 503 });
  const headers = new Headers();
  for (const name of SOCKET_HEADERS) { const value = request.headers.get(name); if (value !== null) headers.set(name, value); }
  const p = assertion.principal;
  headers.set("x-audience-principal", JSON.stringify({ principal: p.id, provider: p.provider, providerUserId: p.providerUserId, login: p.login,
    display: p.display, avatar: p.avatar, character: assertion.character, eligible: assertion.eligible === true, sessionExpiresAt: assertion.sessionExpiresAt }));
  return env.AUDIENCE.getByName(AUDIENCE_NAME).fetch(new Request("https://audience.invalid/connect", { headers }));
};

export class ChatBridge extends WorkerEntrypoint {
  async call(envelope) { return handleEnvelope(this.env, envelope, OPS, this.ctx); }
  // Sockets arrive here as fetches through the same binding: the audience (#665); the Commons (#670) later.
  async fetch(request) { return bridgeFetch(this.env, request); }
}
