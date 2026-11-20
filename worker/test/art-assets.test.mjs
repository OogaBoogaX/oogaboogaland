// The staged pictures through the Worker (src/art-assets.js), with a fake assets binding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleArt } from "../src/art-assets.js";
import { readJsonc } from "./cloudflare-host.mjs";

const NAME = "/art/cloud-hopper-art-165f7504037bb4eb51361142aaa64c835addd42a2eb5c89e1692dd4be62085ab.webp";
const BYTES = Uint8Array.from({ length: 64 }, (_, i) => i);
const assets = { fetch: async (request) => new URL(request.url).pathname === NAME
  ? new Response(BYTES, { headers: { "content-type": "image/webp", etag: '"abc"', "cache-control": "public, max-age=0, must-revalidate" } })
  : new Response("not found", { status: 404, headers: { "content-type": "text/html", "cache-control": "public, max-age=0, must-revalidate" } }) };
const ask = (path) => handleArt(new Request(`https://oogabooga.land${path}`), { ASSETS: assets });

test("rule: a staged picture is kept a year, a missing one never is (a cached 404 would hide it after a rollout)", async () => {
  const found = await ask(NAME);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(found.headers.get("content-type"), "image/webp");
  assert.equal(found.headers.get("etag"), '"abc"');
  assert.equal(found.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await found.arrayBuffer()), BYTES);
  const missing = await ask("/art/cloud-hopper-art-0000.webp");
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.headers.get("cache-control"), /immutable|31536000/);
});

test("rule: both environments run the Worker first for /art/*", () => {
  for (const env of ["staging", "production"]) {
    const config = readJsonc(new URL(`../../wrangler.${env}.jsonc`, import.meta.url));
    assert.ok(config.assets.run_worker_first.includes("/art/*"), env);
  }
});
