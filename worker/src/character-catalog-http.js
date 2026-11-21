// Public catalog data only. Ownership always uses the server's selected snapshot;
// a page's compatibility query can refuse a response, never select authority.
import { catalogFor } from "./character-catalog.js";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
  "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" };
const answer = (request, body, status, extra = {}) => new Response(request.method === "HEAD" ? null : JSON.stringify(body),
  { status, headers: { ...headers, ...extra } });

export const handleCharacterCatalog = async (request, env) => {
  if (!["GET", "HEAD"].includes(request.method)) return answer(request, { error: "method_not_allowed" }, 405, { allow: "GET, HEAD" });
  const loader = catalogFor(env);
  if (!loader.enabled) return answer(request, { error: "catalog_disabled" }, 404);
  const url = new URL(request.url), baseline = url.searchParams.get("baseline"), engine = url.searchParams.get("engine");
  if (baseline !== null && baseline !== env.CHARACTER_CATALOG_BASELINE || engine !== null && engine !== env.CHARACTER_CATALOG_ENGINE)
    return answer(request, { error: "catalog_incompatible" }, 409);
  const snapshot = await loader.read();
  if (!snapshot) return answer(request, { error: "catalog_unavailable" }, 503, { "retry-after": "15" });
  return answer(request, { revision: snapshot.revision, generation: snapshot.generation, catalog: snapshot.catalog }, 200,
    { etag: `"${snapshot.generation}-${snapshot.revision}"` });
};
