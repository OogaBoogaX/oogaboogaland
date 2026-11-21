import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encode as pngEncode } from "../../scripts/distribution-icons.mjs";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { seedCatalog, planCatalog, activateCatalog } from "../../scripts/character-catalog.mjs";
import { createCatalogStore, STORE_MAX_BYTES } from "../../scripts/character-catalog-store.mjs";
import { publishCatalog, loadCatalogState, CatalogConflict, seedFromApprovedBaseline, requireCatalogBundleOrder } from "../../scripts/character-catalog-publish.mjs";
import { canonicalJSON } from "../src/character-catalog-schema.js";
import { createPortraitManifest } from "../src/character-portraits-format.js";

const NOW = Date.parse("2026-11-20T16:00:00Z"), context = { environment: "production", engine: "catalog-v1", baseline: "1".repeat(40) };
const bytes = (text) => new TextEncoder().encode(text);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const file = (handle) => {
  const source = safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000 });
  return { path: `src/characters/${handle}.js`, source, kind: "data", blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex") };
};
const seed = () => seedCatalog({ ...context, sources: [file("Alice")], now: NOW });
const activate = (catalog, previous = null, rollback = false) => activateCatalog(previous, catalog, { expectedGeneration: previous?.generation || 0, rollback, now: NOW });
const planned = (catalog, activation, handle = "Bob", merge = "2".repeat(40)) => {
  const f = file(handle);
  return planCatalog(catalog, { repository: "OogaBoogaX/oogaboogaland", pr: 20, head: "3".repeat(40), lane: "daily", merge,
    entries: [{ ...f, hash: hash(f.source), base: null, lane: "daily", pr: 19, head: "4".repeat(40), author: handle }] }, { ...context, activation, now: NOW });
};
const portraits = (encoded) => {
  const height = Math.ceil((encoded.catalog.entries.length + 1) / 8) * 80;
  const png = pngEncode(640, height, Buffer.alloc(640 * height * 4));
  return { png, manifest: createPortraitManifest(encoded.catalog, encoded.digest, hash(png)) };
};
const memory = () => {
  const objects = new Map(), writes = [];
  const store = {
    async get(key) { const value = objects.get(key); return value ? { bytes: value.bytes.slice(), etag: value.etag } : null; },
    async put(key, data, condition) {
      writes.push({ key, condition });
      const old = objects.get(key);
      if (condition.ifNoneMatch === "*" ? !!old : old?.etag !== condition.ifMatch) return null;
      const etag = `"${hash(data)}"`;
      objects.set(key, { bytes: data.slice(), etag }); return { etag };
    }
  };
  return { store, objects, writes };
};
const publish = (store, encoded, activation, expectedETag, extra = {}) => publishCatalog({ store, context,
  catalog: encoded.catalog, activation, expectedETag, portraits: portraits(encoded), now: NOW, ...extra });
const pointerKey = `catalogs/${context.baseline}/active.json`;

test("bootstrap read-verifies catalog and portrait objects before the only active-pointer write", async () => {
  const f = memory(), first = seed(), activation = activate(first.catalog);
  const result = await publish(f.store, first, activation, null);
  assert.equal(result.state, "published"); assert.equal(result.generation, 1);
  assert.equal(f.writes.length, 4); assert.equal(f.writes.at(-1).key, pointerKey);
  assert.ok(f.writes.every((write) => write.condition.ifNoneMatch === "*"));
  const current = await loadCatalogState(f.store, context, { now: NOW });
  assert.equal(current.revision, first.digest); assert.equal(current.etag, result.etag);
  assert.deepEqual(result.manifest, portraits(first).manifest);
});

test("publication uses exact previous ETag and repeated acknowledgment recovery keeps one generation", async () => {
  const f = memory(), first = seed(), a = activate(first.catalog), initial = await publish(f.store, first, a, null);
  const next = planned(first.catalog, a), b = activate(next.catalog, a);
  const result = await publish(f.store, next, b, initial.etag);
  assert.equal(result.generation, 2); assert.equal(f.writes.at(-1).condition.ifMatch, initial.etag);
  const replay = await publish(f.store, next, b, initial.etag);
  assert.equal(replay.state, "already-published"); assert.equal(replay.generation, 2);
});

test("same-generation concurrent writers cannot replace each other", async () => {
  const f = memory(), first = seed(), a = activate(first.catalog), initial = await publish(f.store, first, a, null);
  const left = planned(first.catalog, a), right = planned(first.catalog, a, "Carol", "5".repeat(40));
  const results = await Promise.allSettled([publish(f.store, left, activate(left.catalog, a), initial.etag), publish(f.store, right, activate(right.catalog, a), initial.etag)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.find((r) => r.status === "rejected").reason instanceof CatalogConflict);
  const current = await loadCatalogState(f.store, context, { now: NOW });
  assert.equal(current.activation.generation, 2); assert.equal(current.catalog.entries.length, 2);
});

test("rollback advances generation and stale bundle artifacts cannot undo it", async () => {
  const f = memory(), first = seed(), a = activate(first.catalog), initial = await publish(f.store, first, a, null);
  const next = planned(first.catalog, a), b = activate(next.catalog, a), updated = await publish(f.store, next, b, initial.etag);
  const rollback = activate(first.catalog, b, true), restored = await publish(f.store, first, rollback, updated.etag, { rollback: true });
  assert.equal(restored.generation, 3);
  await assert.rejects(publish(f.store, next, b, initial.etag), CatalogConflict);
  await assert.rejects(publish(f.store, next, b, restored.etag));
  assert.equal((await loadCatalogState(f.store, context, { now: NOW })).revision, first.digest);
});

test("wrong context, portraits or expected ETag fail before any writes, including retry noops", async () => {
  const f = memory(), first = seed(), a = activate(first.catalog), initial = await publish(f.store, first, a, null);
  f.writes.length = 0;
  await assert.rejects(publish(f.store, first, a, initial.etag, { context: { ...context, environment: "staging" } }));
  const images = portraits(first); images.manifest.image = "0".repeat(64);
  await assert.rejects(publish(f.store, first, a, initial.etag, { portraits: images }));
  const next = planned(first.catalog, a);
  await assert.rejects(publish(f.store, next, activate(next.catalog, a), '"stale"'), CatalogConflict);
  assert.equal(f.writes.length, 0);
});

test("failed or conflicting immutable assets never activate a partially uploaded catalog", async () => {
  const first = seed(), a = activate(first.catalog), images = portraits(first);
  const conflict = memory();
  conflict.objects.set(`portraits/${first.digest}/manifest.json`, { bytes: bytes("wrong"), etag: '"wrong"' });
  await assert.rejects(publish(conflict.store, first, a, null), CatalogConflict);
  assert.equal(conflict.objects.has(pointerKey), false);
  const failed = memory(), originalPut = failed.store.put;
  failed.store.put = (key, data, condition) => { if (key.endsWith("manifest.json")) throw new Error("upload failed"); return originalPut(key, data, condition); };
  await assert.rejects(publish(failed.store, first, a, null), /upload failed/);
  assert.equal(failed.objects.has(pointerKey), false); assert.equal(failed.objects.has(`portraits/${first.digest}/${images.manifest.image}.png`), true);
});

test("lost upload and activation acknowledgments are reconciled by exact read-back bytes", async () => {
  const f = memory(), originalPut = f.store.put;
  f.store.put = async (...args) => { await originalPut(...args); throw new Error("ack lost"); };
  const first = seed(), result = await publish(f.store, first, activate(first.catalog), null);
  assert.equal(result.state, "already-published"); assert.equal(result.generation, 1);
  assert.equal(f.objects.size, 4);
});

test("bootstrap source evidence comes from the pinned tree and cannot execute custom code", async () => {
  const f = file("Alice"), visited = [], gh = {
    async tree(ref) { visited.push(ref); return new Map([[f.path, { type: "blob", mode: "100644", sha: f.blob, size: Buffer.byteLength(f.source) }]]); },
    async file(ref, path) { assert.equal(ref, context.baseline); assert.equal(path, f.path); return { source: f.source, sha: f.blob }; }
  };
  const result = await seedFromApprovedBaseline(gh, context, { now: NOW });
  assert.equal(result.digest, seed().digest); assert.deepEqual(visited, [context.baseline]);
  const bad = { ...gh, file: async () => ({ source: f.source + "\n", sha: f.blob }) };
  await assert.rejects(seedFromApprovedBaseline(bad, context, { now: NOW }));
});

test("direct publication refuses to skip an earlier merged bundle while allowing consumed acknowledgment retries", async () => {
  const bob = "2".repeat(40), carol = "5".repeat(40), a = activate(seed().catalog);
  const commits = new Map([[bob, { sha: bob, parents: [{ sha: context.baseline }] }], [carol, { sha: carol, parents: [{ sha: bob }] }],
    [context.baseline, { sha: context.baseline, parents: [] }]]);
  const gh = { repo: "OogaBoogaX/oogaboogaland",
    async api(path) { return commits.get(path === "commits/rock" ? carol : path.slice(8)); },
    async list(path) { const merge = path.split("/")[1]; return [{ number: merge === bob ? 10 : 11, merge_commit_sha: merge, base: { ref: "rock" }, head: { ref: "automation/characters-daily-test" } }]; }
  };
  await assert.rejects(requireCatalogBundleOrder(gh, context, a, { pr: 11, merge: carol }), /earliest outstanding/);
  await requireCatalogBundleOrder(gh, context, a, { pr: 10, merge: bob });
  await requireCatalogBundleOrder({ repo: gh.repo, api() { throw new Error("retry must not rescan history"); } }, context,
    { ...a, events: [{ merge: bob, hash: "f".repeat(64) }] }, { pr: 10, merge: bob });
});

const credentials = { accountId: "a".repeat(32), bucket: "catalog-production", accessKeyId: "A".repeat(32), secretAccessKey: "b".repeat(64), now: () => NOW };
test("R2 adapter signs the fixed HTTPS endpoint, payload and strong conditional header", async () => {
  let seen;
  const store = createCatalogStore({ ...credentials, fetcher: async (url, request) => { seen = { url, request }; return new Response(null, { headers: { etag: '"accepted"' } }); } });
  const payload = bytes("hello"); await store.put(pointerKey, payload, { ifMatch: '"previous"', contentType: "application/json" });
  assert.equal(seen.url, `https://${credentials.accountId}.r2.cloudflarestorage.com/catalog-production/${pointerKey}`);
  assert.equal(seen.request.redirect, "error"); assert.equal(seen.request.method, "PUT");
  assert.equal(seen.request.headers["x-amz-content-sha256"], hash(payload)); assert.equal(seen.request.headers["if-match"], '"previous"');
  assert.match(seen.request.headers.authorization, /SignedHeaders=content-type;host;if-match;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
  assert.equal(seen.url.includes(credentials.accessKeyId), false);
  await assert.rejects(store.put(pointerKey, payload, { contentType: "application/json" }), /precondition/);
  await assert.rejects(store.get("../../other"), /invalid object/);
});

test("R2 adapter handles 404/412, bounds streaming reads and rejects weak ETags", async () => {
  const missing = createCatalogStore({ ...credentials, fetcher: async (_, request) => new Response(null, { status: request.method === "GET" ? 404 : 412 }) });
  assert.equal(await missing.get(pointerKey), null);
  assert.equal(await missing.put(pointerKey, bytes("x"), { ifNoneMatch: "*", contentType: "application/json" }), null);
  for (const response of [new Response("x", { headers: { etag: 'W/"weak"' } }),
    new Response("too many bytes", { headers: { etag: '"valid"', "content-length": "2" } }),
    new Response("x", { headers: { etag: '"valid"', "content-length": String(STORE_MAX_BYTES + 1) } })]) {
    const store = createCatalogStore({ ...credentials, fetcher: async () => response });
    await assert.rejects(store.get(pointerKey));
  }
});

test("R2 reads disable compression so the original object ETag can guard its next write", async () => {
  const payload = bytes('{"message":"Ooga 🍌"}\n'), etag = '"original"';
  let written = false;
  const store = createCatalogStore({ ...credentials, fetcher: async (_, request) => {
    if (request.method === "GET") {
      const compressed = request.headers["accept-encoding"] !== "identity";
      // Fetch decodes a compressed body, while Cloudflare's response keeps the weakened ETag.
      return new Response(payload, { headers: { etag: compressed ? `W/${etag}` : etag,
        "content-length": String(payload.byteLength), ...(compressed ? { "content-encoding": "gzip" } : {}) } });
    }
    assert.equal(request.headers["if-match"], etag);
    written = true;
    return new Response(null, { headers: { etag: '"updated"' } });
  } });
  const current = await store.get(pointerKey);
  assert.equal(current.etag, etag); assert.deepEqual(current.bytes, payload);
  assert.deepEqual(await store.put(pointerKey, bytes("next"), { ifMatch: current.etag, contentType: "application/json" }), { etag: '"updated"' });
  assert.equal(written, true);
});

test("R2 adapter bounds a stalled body, cancels it and never exposes credential-bearing fetch errors", async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const store = createCatalogStore({ ...credentials, timeoutMs: 10,
    fetcher: async () => new Response(body, { headers: { etag: '"valid"' } }) });
  await assert.rejects(store.get(pointerKey), /timed out/); assert.equal(cancelled, true);
  const broken = createCatalogStore({ ...credentials, fetcher: async () => { throw new Error(credentials.secretAccessKey); } });
  await assert.rejects(broken.get(pointerKey), (error) => !error.message.includes(credentials.secretAccessKey) && /request unavailable/.test(error.message));
});
