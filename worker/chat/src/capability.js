// A principal's speaking capability (#663), as the edge keeps it: the island's answer over the bridge (`capability`,
// worker/src/chat-capability.js) with its time, in the `capabilities` table. X principals are never asked: they listen.
// An answer is asked again after REFRESH_MS. If the bridge cannot answer, the last answer stands until STALE_MS has passed
// since it was checked, and then reads `unknown`: a listener stays signed in, and no new speaking privilege is granted on
// an answer older than that. An account that was eligible and is now refused reads `revoked`, and its live speaking
// (leases, publications, a cloud) is asked to end over the bridge (`revoke`, #665-#667), which also runs on logout,
// logout everywhere and deletion.

import { bridgeCall } from "./bridge.js";
import { assertion, chooseDisplay } from "./session.js";

export const REFRESH_MS = 5 * 60 * 1000;
export const STALE_MS = 15 * 60 * 1000;
export const STATES = ["eligible", "ineligible", "revoked", "unknown"];

const unknown = (now) => ({ state: "unknown", character: null, policy: "", checkedAt: now, fresh: false });
const fromRow = (row, now) => ({ state: row.state, character: row.character, policy: row.policy, checkedAt: row.checked_at, fresh: now - row.checked_at < STALE_MS });

/** Ask the island to end whatever this principal holds live; best effort, since a lease is also revalidated (#667). */
export const revokeLive = async (env, principal, reason) => {
  const reply = await bridgeCall(env, "revoke", { reason }, assertion(principal));
  return reply.ok || reply.error.code === "unknown_operation";
};

/**
 * `{ state, character, policy, checkedAt, fresh }` for a principal. `state` past its stale window is `unknown`.
 * `force` asks the island whatever the age of the last answer (a privileged operation about to be granted).
 */
export const capabilityFor = async (env, principal, { force = false, now = Date.now(), waitUntil = null } = {}) => {
  if (principal.provider !== "github") return { state: "ineligible", character: null, policy: "", checkedAt: now, fresh: true };
  const row = await env.DB.prepare("SELECT state, character, policy, checked_at FROM capabilities WHERE principal_id = ?1").bind(principal.id).first();
  if (row && !force && now - row.checked_at < REFRESH_MS) return fromRow(row, now);
  const reply = await bridgeCall(env, "capability", {}, assertion(principal));
  const answer = reply.ok && reply.result && STATES.includes(reply.result.state) ? reply.result : null;
  if (!answer || answer.state === "unknown") {
    // Nothing was decided: keep what was known, inside its window, and write nothing.
    if (!row) return unknown(now);
    const kept = fromRow(row, now);
    return kept.fresh ? kept : { ...kept, state: "unknown", character: null };
  }
  const wasEligible = !!row && row.state === "eligible";
  const state = answer.state === "eligible" ? "eligible" : wasEligible || row?.state === "revoked" ? "revoked" : "ineligible";
  const character = state === "eligible" && typeof answer.character === "string" ? answer.character.slice(0, 64) : null;
  const policy = typeof answer.policy === "string" ? answer.policy.slice(0, 64) : "";
  await env.DB.prepare(
    `INSERT INTO capabilities (principal_id, state, character, policy, checked_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (principal_id) DO UPDATE SET state = ?2, character = ?3, policy = ?4, checked_at = ?5`,
  ).bind(principal.id, state, character, policy, now).run();
  // The island's own name for the account, where it has one (an older island sends none): this account's chosen name
  // here too (session.js `displayOf`), so a rename on the island reaches Ooga Chat at the next answer.
  // Also on the principal the caller holds, so the answer it builds now (`/api/chat/me`, an audience socket's assertion)
  // carries it. A best-effort write: one that fails is asked again at the next answer, and never keeps a revocation from
  // ending live speaking below.
  if (typeof answer.display === "string" && answer.display) {
    try { const chosen = await chooseDisplay(env.DB, principal.id, answer.display); if (chosen) principal.chosen_display = chosen; } catch { /* next answer */ }
  }
  if (wasEligible && state !== "eligible") {
    const ending = revokeLive(env, principal, "eligibility");
    if (waitUntil) waitUntil(ending); else await ending;
  }
  return { state, character, policy, checkedAt: now, fresh: true };
};
