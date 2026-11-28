// The pictures `npm run build:site` stages under /art/ (scripts/distribution-modules.mjs, externalizePictures). Every
// name is art/<module>-<sha256>.<ext>, so a name never changes its bytes and the browser may keep it a year. _headers
// cannot say so: a rule per picture passes Cloudflare's 100 rules, and an /art/* rule would also cover a 404 (a page
// from one deploy asking another during a rollout), hiding that picture for a year. So /art/* runs the Worker first
// (wrangler.<env>.jsonc), which answers the asset and marks only a 200 or a 304 immutable: a 304's headers update the
// browser's stored copy, so one without the policy would leave a picture it already holds revalidating every visit.
// A Worker's response gets none of _headers, so nosniff is set here as the site-wide rule would.
const KEEP = "public, max-age=31536000, immutable";

export const handleArt = async (request, env) => {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 200 && response.status !== 304) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", KEEP);
  headers.set("x-content-type-options", "nosniff");
  if (response.status === 304) return new Response(null, { status: 304, headers });
  return new Response(response.body, { status: 200, headers });
};
