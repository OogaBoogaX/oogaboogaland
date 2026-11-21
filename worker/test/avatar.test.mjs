import test from "node:test";
import assert from "node:assert/strict";
import { handleAvatar, avatarSource, AVATAR_BYTES } from "../src/avatar.js";

// A fake fetch, edge cache, limiter and waitUntil around the route.
const rig = ({ status = 200, type = "image/png", body = new Uint8Array([137, 80, 78, 71]), throws = false, limit = true } = {}) => {
  const fetched = [], cached = new Map(), waits = [];
  const deps = {
    fetch: async (url, init) => {
      fetched.push({ url, init });
      if (throws) throw new Error("offline");
      return new Response(status >= 300 && status < 400 ? null : body, { status, headers: { "content-type": type, "content-length": String(body.byteLength) } });
    },
    cache: { match: async (key) => cached.get(key)?.clone(), put: async (key, response) => { cached.set(key, response); } }
  };
  const env = { AVATAR_LIMITER: { limit: async () => ({ success: limit }) } };
  const ctx = { waitUntil: (p) => waits.push(p) };
  const ask = (path, method = "GET") => handleAvatar(new Request(`https://oogabooga.land${path}`, { method }), env, new URL(`https://oogabooga.land${path}`), ctx, deps);
  return { ask, fetched, cached, waits };
};

test("rule: only a GitHub numeric id is asked of GitHub, by its id alone, never an address from the request", async () => {
  const r = rig();
  for (const path of ["/api/avatar/", "/api/avatar/0", "/api/avatar/abc", "/api/avatar/12/x", "/api/avatar/https:%2F%2Fevil.example", "/api/avatar/12345678901234567"]) {
    assert.equal((await r.ask(path)).status, 404, path);
  }
  assert.equal((await r.ask("/api/avatar/42", "POST")).status, 405);
  assert.equal(r.fetched.length, 0);
  const ok = await r.ask("/api/avatar/583231?s=4000");
  assert.equal(ok.status, 200);
  assert.equal(r.fetched[0].url, avatarSource("583231"));
  assert.equal(r.fetched[0].init.redirect, "manual");
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.match(ok.headers.get("cache-control"), /public, max-age=86400/);
  assert.equal(ok.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(ok.headers.get("content-security-policy"), "default-src 'none'");
});

test("rule: a picture kept at the edge answers again without GitHub or the limiter", async () => {
  const r = rig();
  await r.ask("/api/avatar/7");
  await Promise.all(r.waits);
  const again = rig({ limit: false });
  again.cached.set("https://oogabooga.land/api/avatar/7", r.cached.get("https://oogabooga.land/api/avatar/7"));
  const hit = await again.ask("/api/avatar/7?v=2");
  assert.equal(hit.status, 200);
  assert.equal(again.fetched.length, 0);
});

test("rule: redirects, other types, SVG, oversized pictures and an unreachable GitHub are no picture; the limiter counts only misses", async () => {
  assert.equal((await rig({ status: 302 }).ask("/api/avatar/9")).status, 404);
  assert.equal((await rig({ status: 404 }).ask("/api/avatar/9")).status, 404);
  assert.equal((await rig({ type: "image/svg+xml" }).ask("/api/avatar/9")).status, 404);
  assert.equal((await rig({ type: "text/html" }).ask("/api/avatar/9")).status, 404);
  assert.equal((await rig({ body: new Uint8Array(AVATAR_BYTES + 1) }).ask("/api/avatar/9")).status, 404);
  assert.equal((await rig({ throws: true }).ask("/api/avatar/9")).status, 502);
  const limited = rig({ limit: false });
  const refused = await limited.ask("/api/avatar/9");
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get("retry-after"), "60");
  assert.equal(limited.fetched.length, 0);
});
