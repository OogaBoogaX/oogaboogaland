// The private bridge's wire, shared unchanged by both ends: Ooga Chat's edge Worker (worker/chat/src/bridge.js), which
// writes envelopes, and this Worker's ChatBridge entrypoint (chat-bridge.js), which checks them. Pure; no host import.
// An envelope is `{ v, env, requestId, op, principal, payload }`; a reply is `{ ok: true, requestId, result }` or
// `{ ok: false, error: { code, retryable, retryAfter? } }`. Bump BRIDGE_VERSION only with a deploy plan for both ends:
// a mismatched pair refuses every call (`protocol_unsupported`) and the edge reports the bridge as unavailable.

export const BRIDGE_VERSION = 1;
export const BRIDGE_ENVIRONMENTS = ["staging", "production", "local"];
// An envelope's whole serialized size; the largest payload any operation takes is far under it.
export const ENVELOPE_MAX = 16 * 1024;
export const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const ERROR_CODE = /^[a-z_]{1,40}$/;

/** An operation's own refusal: thrown inside an operation, passed on as `{ code, retryable, retryAfter }`. */
export class BridgeRefusal extends Error {
  constructor(code, retryable = false, retryAfter = 0) {
    super(code);
    this.code = code; this.retryable = retryable; this.retryAfter = retryAfter;
  }
}

// The island's switch for the bridge (`OOGA_CHAT_FEATURES`, comma-separated): `bridge` turns every operation on but
// those marked always-on; `outdoor`, `cloud` and `commons` each also need `bridge`.
export const FEATURES = ["bridge", "outdoor", "cloud", "commons"];
export const bridgeFeatures = (env) => {
  const named = new Set(String(env.OOGA_CHAT_FEATURES || "").split(",").map((name) => name.trim()).filter((name) => FEATURES.includes(name)));
  const bridge = named.has("bridge");
  return { bridge, outdoor: bridge && named.has("outdoor"), cloud: bridge && named.has("cloud"), commons: bridge && named.has("commons") };
};

export const newRequestId = () => crypto.randomUUID().replaceAll("-", "");

export const makeEnvelope = (environment, op, payload = {}, principal = null, requestId = newRequestId()) =>
  ({ v: BRIDGE_VERSION, env: environment, requestId, op, principal, payload });

/** A reply as the edge may trust it, or a bounded refusal: anything malformed reads as the bridge being unavailable. */
export const readReply = (reply) => {
  if (reply && reply.ok === true && Object.hasOwn(reply, "result")) return reply;
  if (reply && reply.ok === false && reply.error && ERROR_CODE.test(reply.error.code)) {
    const retryAfter = Number.isInteger(reply.error.retryAfter) && reply.error.retryAfter > 0 && reply.error.retryAfter <= 3600 ? reply.error.retryAfter : 0;
    return { ok: false, error: { code: reply.error.code, retryable: reply.error.retryable === true, ...(retryAfter ? { retryAfter } : {}) } };
  }
  return { ok: false, error: { code: "unavailable", retryable: true } };
};
