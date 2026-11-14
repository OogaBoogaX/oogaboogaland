// The edge's side of the private bridge (worker/src/chat-bridge.js): one bounded call over the `OBL` service binding.
// The envelope carries this environment and a fresh request id; a principal is written only from this Worker's own
// validated session (never from anything the browser sent). A missing binding, a timeout, a thrown call or a malformed
// reply all read as `{ ok: false, error: { code: "unavailable" } }`, never as a fallback to an anonymous speaker, a demo
// payment or an empty roster that looks real. `hello` is cached a short while per isolate for the bootstrap and health.

import { makeEnvelope, readReply } from "../../src/chat-bridge-protocol.js";

export const CALL_MS = 5000;
const HELLO_MS = 30000;

const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })]).finally(() => clearTimeout(timer));
};

export const bridgeCall = async (env, op, payload = {}, principal = null, timeout = CALL_MS) => {
  if (!env.OBL || typeof env.OBL.call !== "function" || !env.ENVIRONMENT) return { ok: false, error: { code: "unavailable", retryable: true } };
  try {
    return readReply(await within(env.OBL.call(makeEnvelope(env.ENVIRONMENT, op, payload, principal)), timeout));
  } catch {
    return { ok: false, error: { code: "unavailable", retryable: true } };
  }
};

let hello = null, helloAt = 0;
/** The bridge's last word on what it can do (cached HELLO_MS), or null when it could not be reached. */
export const bridgeHello = async (env, now = Date.now()) => {
  if (hello && now - helloAt < HELLO_MS && hello.env === env) return hello.value;
  const reply = await bridgeCall(env, "hello", {}, null, 2000);
  const value = reply.ok && reply.result && typeof reply.result === "object" ? reply.result : null;
  hello = { env, value }; helloAt = now;
  return value;
};
export const forgetHello = () => { hello = null; helloAt = 0; };
