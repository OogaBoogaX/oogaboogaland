// Ooga Chat's speaking capability (#663), answered over the private bridge by the island Worker, which already decides
// who owns an Ooga: the generated cast and Oogatron through contributor-policy.js, and the island's ban list in its own
// D1. Ooga Chat's edge never reads either; it asks here with the principal it wrote from its own session, and keeps
// the answer with its time (worker/chat/src/capability.js). Only a GitHub principal is asked about: an X account is a
// listener whatever its name, and a matching name is never a GitHub identity.
// `state` is `eligible` (a bundled owner, or an unbundled contributor Oogatron vouches for), `ineligible` (the policy
// held a verified snapshot and said no, the island has banned the account, or another GitHub id holds that login on the
// island, by the same rule as its `players_identity_insert` trigger), or `unknown` (the island's D1 or the snapshot could
// not be read, so nothing was decided). A display name or a donation is never consulted.

import { BridgeRefusal } from "./chat-bridge-protocol.js";
import { oogatron } from "./contributor-policy.js";
import { contributorDecision } from "./contributor-access.js";

export const POLICY = "obl-contributor-v1";
const GITHUB_ID = /^[1-9][0-9]{0,15}$/;
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** The principal the edge wrote, as a GitHub account, or a refusal: `{ id, login }` with the id a safe integer. */
export const githubAccount = (principal) => {
  if (!principal || principal.provider !== "github") throw new BridgeRefusal("capability_required");
  const id = typeof principal.providerUserId === "string" && GITHUB_ID.test(principal.providerUserId) ? Number(principal.providerUserId) : NaN;
  if (!Number.isSafeInteger(id) || typeof principal.login !== "string" || !GITHUB_LOGIN.test(principal.login)) throw new BridgeRefusal("malformed");
  return { id, login: principal.login };
};

// The ban, and the island's identity-collision rule (migrations/0009_identity_collision_guard.sql): unless this id
// already holds this login, another player row with it, or an Ooga leaderboard owning it under another id, is a collision.
const COLLISION = `SELECT (SELECT banned_at FROM players WHERE id = ?1) AS banned_at,
  (NOT EXISTS (SELECT 1 FROM players WHERE id = ?1 AND lower(login) = lower(?2))
    AND (EXISTS (SELECT 1 FROM players WHERE id <> ?1 AND lower(login) = lower(?2))
      OR EXISTS (SELECT 1 FROM game_highscores WHERE score_type = 'ooga'
        AND json_extract(owners, '$.' || json_quote(lower(?2))) <> ?1))) AS collision`;

/** The island's decision for a GitHub principal, as the bridge's `capability` answers it and the audience asks it again. */
export const decideCapability = async (env, principal, contributorFor, now = Date.now) => {
  const { id, login } = githubAccount(principal);
  const answer = (state, character = null, reason = null) => ({ state, character, reason, policy: POLICY, checkedAt: now() });
  if (env.DB) {
    let row;
    try { row = await env.DB.prepare(COLLISION).bind(id, login).first(); }
    catch { return answer("unknown", null, "unavailable"); }
    if (row && row.banned_at) return answer("ineligible", null, "banned");
    // A login another id holds (renamed away on GitHub, then registered by someone else) is not this account's Ooga.
    if (row && row.collision) return answer("ineligible", null, "identity-collision");
  }
  const decision = await contributorDecision(contributorFor, login, id, oogatron(env));
  if (decision.character) return answer("eligible", decision.character.handle);
  return decision.fresh ? answer("ineligible", null, "not-contributor") : answer("unknown", null, "unavailable");
};

export const capabilityOps = ({ contributorFor, contributorForEnv, now = Date.now }) => ({
  capability: { run: (env, envelope) => decideCapability(env, envelope.principal, contributorForEnv ? contributorForEnv(env) : contributorFor, now) },
});
