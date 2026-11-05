// Server-only, bounded receipts for Room handoff RPCs. A receipt and its body
// mutation share the SAME storage transaction. No expiry eviction or timer.
import { boundedJSON, sameCheckpointValue } from "./virtual-host.js";
export const BODY_OPERATIONS = Object.freeze({ key: "host-body-operations-v1", prefix: "host-body-operations-v1:",
  max: 32, indexBytes: 1024, rowBytes: 36 * 1024, commandBytes: 36 * 1024 });
const phases = ["offering", "activating", "confirming"];
const positive = v => Number.isSafeInteger(v) && v > 0;
const exact = (v, fields) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const fail = () => { throw Error("invalid or fenced body operation"); };
const key = id => BODY_OPERATIONS.prefix + id;
export function validateBodyOperation(c) {
  boundedJSON(c, BODY_OPERATIONS.commandBytes, 1024);
  if (!exact(c, ["accountId", "connection", "request", "phase", "revision", "input"])
    || !positive(c.accountId) || typeof c.connection !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(c.connection)
    || typeof c.request !== "string" || !/^[0-9a-f]{32}$/.test(c.request) || !phases.includes(c.phase) || !positive(c.revision)
    || !exact(c.input, c.phase === "offering" ? ["claim", "preparation"] : ["ref", "issued"])) fail();
  if (c.phase === "offering" ? c.input.claim?.accountId !== c.accountId || c.input.preparation?.accountId !== c.accountId
    : c.input.ref?.accountId !== c.accountId || c.input.issued?.view?.accountId !== c.accountId) fail();
  return c;
}
// Typed canonical encoding preserves -0 and cannot confuse a string/object
// with a number tag. Hashing saves retaining a second 32 KiB transfer per row.
export async function bodyOperationDigest(command) {
  validateBodyOperation(command);
  const encode = v => v === null ? "null" : typeof v === "number" ? `n${Object.is(v, -0) ? "-0" : v};`
    : typeof v === "string" ? `s${JSON.stringify(v)}` : typeof v === "boolean" ? `b${v}`
      : Array.isArray(v) ? `[${v.map(encode).join(",")}]`
        : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${encode(v[k])}`).join(",")}}`;
  const bytes = new TextEncoder().encode(encode(command));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
function validate(r) {
  boundedJSON(r, BODY_OPERATIONS.rowBytes, 2048);
  if (!exact(r, ["v", "accountId", "connection", "request", "phase", "revision", "digest", "until", "answer"])
    || r.v !== 1 || !positive(r.accountId) || typeof r.connection !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(r.connection)
    || typeof r.request !== "string" || !/^[0-9a-f]{32}$/.test(r.request) || !phases.includes(r.phase) || !positive(r.revision)
    || !/^[0-9a-f]{64}$/.test(r.digest) || !positive(r.until) || typeof r.answer?.result?.ok !== "boolean") fail();
  return r;
}
function answerFor(value, phase) {
  const result = value?.result;
  if (typeof result?.ok !== "boolean") fail();
  if (!result.ok) return { result: { ok: false, reason: result.reason }, transfer: null };
  if (phase === "confirming") return { result: { ok: true, view: result.view }, transfer: null };
  if (!result.session || !value.transfer) fail();
  return { result: { ok: true, session: result.session }, transfer: value.transfer };
}
export function createBodyOperationJournal(tx) {
  const index = async () => {
    const ids = await tx.get(BODY_OPERATIONS.key) ?? [];
    boundedJSON(ids, BODY_OPERATIONS.indexBytes);
    if (!Array.isArray(ids) || ids.length > BODY_OPERATIONS.max || ids.some(v => !positive(v)) || new Set(ids).size !== ids.length) fail();
    return ids;
  };
  return {
    async run(command, digest, now, execute, recoverOnly = false) {
      const c = validateBodyOperation(command), ids = await index(), stored = await tx.get(key(c.accountId));
      const row = stored === undefined ? null : validate(stored);
      if (!/^[0-9a-f]{64}$/.test(digest) || !Number.isSafeInteger(now) || now < 0 || typeof recoverOnly !== "boolean") fail();
      if (row) {
        if (!ids.includes(c.accountId) || row.connection !== c.connection || row.request !== c.request) fail();
        if (row.phase === c.phase && row.revision === c.revision) {
          if (row.digest !== digest) fail();
          return structuredClone(row.answer); // no mutation, even after reply/lease expiry
        }
        if (!row.answer.result.ok || phases.indexOf(c.phase) !== phases.indexOf(row.phase) + 1 || c.revision <= row.revision) fail();
        if (!sameCheckpointValue(c.input.ref, row.answer.result.session)
          || !sameCheckpointValue(c.input.issued, row.answer.transfer)) fail();
      } else if (c.phase !== "offering" || ids.includes(c.accountId) || ids.length >= BODY_OPERATIONS.max) fail();
      const expires = c.phase === "offering" ? c.input.preparation?.expiresAt : c.input.issued?.expiresAt;
      // Once a retired receipt is removed, a delayed old request still cannot
      // execute: initial offers are expired, later phases require their parent.
      if (!positive(expires) || !recoverOnly && now >= expires || expires - now > 10000) fail();
      // Close recovery must never create a body whose original RPC did not run.
      // Persist cancellation so an older in-flight call arriving afterwards is
      // fenced too. An empty read alone would not prove that it cannot commit.
      const answer = recoverOnly ? { result: { ok: false, reason: "cancelled" }, transfer: null } : answerFor(await execute(), c.phase);
      const next = validate({ v: 1, accountId: c.accountId, connection: c.connection, request: c.request,
        phase: c.phase, revision: c.revision, digest, until: Math.max(row?.until ?? 0, expires), answer });
      await tx.put(key(c.accountId), next);
      if (!row) await tx.put(BODY_OPERATIONS.key, [...ids, c.accountId]);
      return structuredClone(answer);
    },
    // Explicit server cleanup only after Room retained the outcome. Retiring
    // changes no body authority. The original request window must have ended.
    async retire(accountId, connection, request, now) {
      if (!positive(accountId)) fail();
      const stored = await tx.get(key(accountId));
      if (stored === undefined) return false;
      const row = validate(stored), ids = await index();
      if (row.connection !== connection || row.request !== request || !Number.isSafeInteger(now) || now < row.until || !ids.includes(accountId)) fail();
      await tx.delete(key(accountId)); await tx.put(BODY_OPERATIONS.key, ids.filter(id => id !== accountId));
      return true;
    },
  };
}
