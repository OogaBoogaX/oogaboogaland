import { createContributorLookup, createOwnedCharacterLookup, LOGIN } from "./contributor-policy.js";
import { catalogFor } from "./character-catalog.js";
import CAST_ROWS from "./characters.gen.json" with { type: "json" };

// Retained for callers explicitly using the embedded cast, including offline route fixtures.
export const contributorFor = createOwnedCharacterLookup(CAST_ROWS);

// Each environment holds its own catalog and contribution cache. A decision carries its own availability;
// another request cannot turn an unavailable answer into "not a contributor" between a lookup and fresh().
export const createCatalogContributorLookup = (catalog, contributions = createContributorLookup()) => {
  let revision = null, owned = null, reserved = null;
  const check = async (login, id, via) => {
    if (typeof login !== "string" || !LOGIN.test(login) || login.includes("--")) return { character: null, fresh: true };
    const snapshot = await catalog.read();
    if (!snapshot) return { character: null, fresh: false };
    if (revision !== snapshot.revision || !owned) {
      owned = createOwnedCharacterLookup(snapshot.rows, contributions);
      reserved = new Set(snapshot.rows.flatMap((row) => [row.handle.toLowerCase(), String(row.github_login || row.handle).toLowerCase()]));
      revision = snapshot.revision;
    }
    const lookup = owned, definitive = reserved.has(login.toLowerCase()) || !!globalThis.BL.accountIdentities.accountForId(id);
    const character = await lookup(login, id, via);
    return { character, fresh: !!character || definitive || typeof contributions.fresh !== "function" || contributions.fresh() };
  };
  const lookup = async (login, id, via) => (await check(login, id, via)).character;
  lookup.check = check;
  lookup.fresh = () => catalog.fresh() && (typeof contributions.fresh !== "function" || contributions.fresh());
  return lookup;
};

const environments = new WeakMap();
export const contributorForEnv = (env) => {
  if (!environments.has(env)) environments.set(env, createCatalogContributorLookup(catalogFor(env)));
  return environments.get(env);
};

// Existing injected lookups keep their small interface; runtime lookups return the atomic decision above.
export const contributorDecision = async (lookup, login, id, via) => {
  if (typeof lookup.check === "function") return lookup.check(login, id, via);
  const character = await lookup(login, id, via);
  return { character, fresh: !!character || typeof lookup.fresh !== "function" || lookup.fresh() };
};
