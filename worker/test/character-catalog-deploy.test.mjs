import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { encode as pngEncode } from "../../scripts/distribution-icons.mjs";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { seedCatalog, encodeCatalog, planCatalog, activateCatalog } from "../../scripts/character-catalog.mjs";
import { loadCatalogState, publishCatalog, CatalogConflict } from "../../scripts/character-catalog-publish.mjs";
import { initializeRelease, readReleaseState } from "../../scripts/character-catalog-handoff.mjs";
import { prepareManualRelease, stageManualRelease, finishManualRelease, parseWranglerConfig, deploymentConfig, runCatalogDeploy } from "../../scripts/character-catalog-deploy.mjs";
import { createPortraitManifest } from "../src/character-portraits-format.js";

const NOW = Date.parse("2026-11-20T16:00:00Z"), environment = "production", token = "a".repeat(32);
const from = { environment, engine: "island-character-data-v1", baseline: "1".repeat(40) }, to = { ...from, baseline: "2".repeat(40) };
const hash = (data) => createHash("sha256").update(data).digest("hex");
const file = (handle) => {
  const source = safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000 });
  return { path: `src/characters/${handle}.js`, source, kind: "data", blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex") };
};
const activate = (catalog, previous = null) => activateCatalog(previous, catalog, { expectedGeneration: previous?.generation || 0, now: NOW });
const portraits = (catalog) => {
  const encoded = encodeCatalog(catalog, { now: NOW }), png = pngEncode(640, Math.ceil((catalog.entries.length + 1) / 8) * 80,
    Buffer.alloc(640 * Math.ceil((catalog.entries.length + 1) / 8) * 80 * 4));
  return { png, manifest: createPortraitManifest(catalog, encoded.digest, hash(png)) };
};
const fixture = async () => {
  const objects = new Map(), writes = [], files = [file("Alice")], requested = [];
  const store = {
    async get(key) { const object = objects.get(key); return object ? { bytes: object.bytes.slice(), etag: object.etag } : null; },
    async put(key, bytes, condition) {
      writes.push(key); const old = objects.get(key);
      if (condition.ifNoneMatch === "*" ? !!old : old?.etag !== condition.ifMatch) return null;
      const etag = `"${hash(bytes)}"`; objects.set(key, { bytes: bytes.slice(), etag }); return { etag };
    }
  };
  const first = seedCatalog({ ...from, sources: files, now: NOW }), activation = activate(first.catalog);
  await publishCatalog({ store, context: from, catalog: first.catalog, activation, expectedETag: null, portraits: portraits(first.catalog), now: NOW });
  await initializeRelease({ store, context: from, now: NOW });
  const gh = {
    async tree(ref) { requested.push(ref); assert.equal(ref, to.baseline); return new Map(files.map((f) => [f.path, { type: "blob", mode: "100644", sha: f.blob, size: Buffer.byteLength(f.source) }])); },
    async file(ref, path) { assert.equal(ref, to.baseline); const f = files.find((f) => f.path === path); return { source: f.source, sha: f.blob }; }
  };
  return { store, objects, writes, files, first, activation, gh, requested };
};
const prepare = (f, extra = {}) => prepareManualRelease({ gh: f.gh, store: f.store, environment, target: to.baseline, token, now: NOW, ...extra });
const stage = (f, plan) => stageManualRelease({ gh: f.gh, store: f.store, environment, plan, portraits: portraits(plan.catalog), now: NOW });
const answer = (plan) => new Response(JSON.stringify({ revision: plan.activation.revision, generation: plan.activation.generation, catalog: plan.catalog }));

test("manual code release holds publication through staging, then completes only after the exact live runtime confirms it", async () => {
  const f = await fixture(), { plan } = await prepare(f);
  assert.equal(plan.operation, "handoff"); assert.equal(plan.reuse, false);
  assert.equal((await readReleaseState(f.store, environment)).state.pending.fenced, true);
  await stage(f, plan);
  let requested;
  const result = await finishManualRelease({ store: f.store, plan, environment, now: NOW,
    fetcher: async (url, options) => { requested = { url, options }; return answer(plan); } });
  assert.equal(result.state.pending, null); assert.deepEqual(result.state.context, to);
  assert.equal(new URL(requested.url).origin, "https://oogabooga.land"); assert.equal(requested.options.redirect, "error");
  assert.equal((await loadCatalogState(f.store, from, { now: NOW })).activation.generation, 2);
});

test("same-baseline reader deployment preserves independently published rows and reuses exact portrait bytes", async () => {
  const f = await fixture(), b = file("Bob"), old = await loadCatalogState(f.store, from, { now: NOW });
  const next = planCatalog(old.catalog, { repository: "OogaBoogaX/oogaboogaland", pr: 10, merge: "3".repeat(40), head: "4".repeat(40), lane: "daily",
    entries: [{ ...b, hash: hash(b.source), lane: "daily", author: "Bob", head: "5".repeat(40), pr: 9, base: null }] }, { ...from, activation: old.activation, now: NOW });
  await publishCatalog({ store: f.store, context: from, catalog: next.catalog, activation: activate(next.catalog, old.activation),
    expectedETag: old.etag, portraits: portraits(next.catalog), now: NOW });
  const result = await prepare(f, { target: from.baseline });
  assert.equal(result.plan.operation, "redeploy"); assert.equal(result.plan.catalog.entries.length, 2); assert.equal(result.plan.reuse, true);
  assert.deepEqual(result.portraits.png, portraits(next.catalog).png); assert.deepEqual(f.requested, []);
  await stage(f, result.plan);
  const complete = await finishManualRelease({ store: f.store, plan: result.plan, environment, now: NOW, fetcher: async () => answer(result.plan) });
  assert.equal(complete.state, "verified"); assert.equal((await readReleaseState(f.store, environment)).state.pending, null);
});

test("failed deployment leaves a durable barrier and resumes its exact target without rerendering or refencing", async () => {
  const f = await fixture(), { plan } = await prepare(f); await stage(f, plan);
  await assert.rejects(finishManualRelease({ store: f.store, plan, environment, now: NOW, fetcher: async () => answer({ ...plan, activation: f.activation, catalog: f.first.catalog }) }), /different catalog/);
  const held = await readReleaseState(f.store, environment);
  await assert.rejects(prepare(f, { target: "6".repeat(40), resume: true }), CatalogConflict);
  const resumed = await prepare(f, { resume: true });
  assert.equal(resumed.plan.reuse, true); assert.equal(resumed.plan.releaseETag, held.etag);
  assert.equal(resumed.plan.activation.generation, plan.activation.generation);
  assert.deepEqual(resumed.portraits.png, portraits(plan.catalog).png);
  await stage(f, resumed.plan);
  await finishManualRelease({ store: f.store, plan: resumed.plan, environment, now: NOW, fetcher: async () => answer(resumed.plan) });
  assert.equal((await readReleaseState(f.store, environment)).state.pending, null);
});

test("partial target upload reuses immutable portrait bytes even before its first activation", async () => {
  const f = await fixture(), { plan } = await prepare(f), original = f.store.put;
  const key = `catalogs/${to.baseline}/active.json`;
  f.store.put = async (...args) => { if (args[0] === key) throw new Error("interrupted"); return original(...args); };
  await assert.rejects(stage(f, plan)); assert.equal(f.objects.has(key), false);
  f.store.put = original;
  const resumed = await prepare(f, { resume: true });
  assert.equal(resumed.plan.reuse, true); assert.equal(resumed.plan.expectedETag, null);
  assert.deepEqual(resumed.portraits.png, portraits(plan.catalog).png);
  await stage(f, resumed.plan); assert.equal((await loadCatalogState(f.store, to, { now: NOW })).revision, plan.activation.revision);
});

const replacementSource = (f, target) => ({
  async tree(ref) { assert.equal(ref, target); return new Map(f.files.map(file => [file.path, { type: "blob", mode: "100644", sha: file.blob, size: Buffer.byteLength(file.source) }])); },
  async file(ref, path) { assert.equal(ref, target); const file = f.files.find(file => file.path === path); return { source: file.source, sha: file.blob }; },
});

test("explicit unpublished-target recovery verifies the live source, invalidates old plans and completes the new release", async () => {
  const f = await fixture(), { plan: old } = await prepare(f), source = await loadCatalogState(f.store, from, { now: NOW });
  const target = "8".repeat(40), gh = replacementSource(f, target), before = f.writes.length;
  let checked;
  const next = await prepare(f, { gh, target, replaceHeldTarget: to.baseline, token: "b".repeat(32),
    fetcher: async (url, options) => { checked = { url, options }; return answer({ activation: source.activation, catalog: source.catalog }); } });
  assert.equal(new URL(checked.url).searchParams.get("baseline"), from.baseline);
  assert.equal(checked.options.credentials, "omit"); assert.equal(checked.options.redirect, "error");
  assert.deepEqual(f.writes.slice(before), ["release.json"]);
  assert.equal(next.plan.context.baseline, target); assert.equal(next.plan.expectedETag, null); assert.equal(next.plan.reuse, false);
  assert.equal(next.plan.token, "b".repeat(32)); assert.notEqual(next.plan.releaseETag, old.releaseETag);
  assert.equal((await loadCatalogState(f.store, from, { now: NOW })).etag, source.etag);
  await assert.rejects(stage(f, old), /state changed/);
  await assert.rejects(finishManualRelease({ store: f.store, plan: old, environment, now: NOW }), /state changed/);
  // The same explicit request after a committed CAS simply resumes its new target, even if its
  // original artifact write or acknowledgment was interrupted. It never fetches or fences again.
  const retry = await prepare(f, { gh, target, replaceHeldTarget: to.baseline, token: "c".repeat(32), fetcher: async () => { throw new Error("unexpected source check"); } });
  assert.equal(retry.plan.releaseETag, next.plan.releaseETag); assert.equal(retry.plan.token, next.plan.token);
  await stageManualRelease({ gh, store: f.store, environment, plan: next.plan, portraits: portraits(next.plan.catalog), now: NOW });
  const complete = await finishManualRelease({ store: f.store, environment, plan: next.plan, now: NOW, fetcher: async () => answer(next.plan) });
  assert.equal(complete.state.context.baseline, target); assert.equal(complete.state.pending, null);
});

test("replacement refuses an incorrect live source and an already staged target while preserving the barrier", async () => {
  const f = await fixture(), { plan } = await prepare(f), held = await readReleaseState(f.store, environment);
  const target = "8".repeat(40), gh = replacementSource(f, target), before = f.writes.length;
  await assert.rejects(prepare(f, { gh, target, replaceHeldTarget: to.baseline, token: "b".repeat(32),
    fetcher: async () => answer(plan) }), /different catalog/);
  assert.equal(f.writes.length, before); assert.equal((await readReleaseState(f.store, environment)).etag, held.etag);
  await stage(f, plan);
  const source = await loadCatalogState(f.store, from, { now: NOW }), count = f.writes.length;
  await assert.rejects(prepare(f, { gh, target, replaceHeldTarget: to.baseline, token: "b".repeat(32),
    fetcher: async () => answer({ activation: source.activation, catalog: source.catalog }) }), /already activated/);
  assert.equal(f.writes.length, count); assert.equal((await readReleaseState(f.store, environment)).etag, held.etag);
});

test("resume and target replacement are mutually exclusive at both API and CLI boundaries", async () => {
  await assert.rejects(prepareManualRelease({ environment, target: "8".repeat(40), resume: true, replaceHeldTarget: to.baseline }), /cannot be combined/);
  await assert.rejects(runCatalogDeploy(["prepare", "--environment", environment, "--target", "8".repeat(40), "--output", "unused",
    "--resume", "true", "--replace-held-target", to.baseline], {}), /cannot be combined/);
});

test("runtime verification retries only bounded transient statuses and never clears a held barrier on failure", async () => {
  const f = await fixture(), { plan } = await prepare(f); await stage(f, plan);
  let calls = 0, waits = 0;
  await assert.rejects(finishManualRelease({ store: f.store, plan, environment, now: NOW,
    fetcher: async () => { calls++; return new Response(null, { status: 503 }); }, wait: async () => { waits++; } }), /did not confirm/);
  assert.equal(calls, 5); assert.equal(waits, 4); assert.ok((await readReleaseState(f.store, environment)).state.pending);
  calls = 0;
  await finishManualRelease({ store: f.store, plan, environment, now: NOW, wait: async () => {},
    fetcher: async () => ++calls === 1 ? new Response(null, { status: 409 }) : answer(plan) });
  assert.equal(calls, 2);
});

test("artifact and resume tampering fail before publication writes", async () => {
  const f = await fixture();
  await assert.rejects(prepare(f, { target: to.baseline, resume: true }), /Resume SHA/);
  const { plan } = await prepare(f), before = f.writes.length;
  const changed = structuredClone(plan); changed.activation.generation = -1;
  await assert.rejects(stage(f, changed));
  await assert.rejects(stageManualRelease({ gh: f.gh, store: f.store, plan, environment: "staging", portraits: portraits(plan.catalog), now: NOW }));
  assert.equal(f.writes.length, before);
});

test("temporary deployment config preserves relative paths and refuses cross-environment or account bindings", async () => {
  const f = await fixture(), { plan } = await prepare(f, { target: from.baseline });
  const source = readFileSync(new URL("../../wrangler.production.jsonc", import.meta.url), "utf8"), original = parseWranglerConfig(source);
  const options = { bucket: "catalog-production", accountId: original.account_id }, configured = deploymentConfig(source, plan, options);
  assert.equal(configured.main, original.main); assert.deepEqual(configured.assets, original.assets);
  assert.equal(configured.vars.CHARACTER_CATALOG_ENABLED, "1"); assert.equal(original.vars.CHARACTER_CATALOG_ENABLED, "0");
  assert.deepEqual(configured.r2_buckets.filter((row) => row.binding === "CHARACTER_CATALOGS"), [{ binding: "CHARACTER_CATALOGS", bucket_name: options.bucket }]);
  assert.throws(() => deploymentConfig(source, plan, { ...options, accountId: "0".repeat(32) }), /target differs/);
  const altered = structuredClone(original); altered.vars.ENVIRONMENT = "staging";
  assert.throws(() => deploymentConfig(JSON.stringify(altered), plan, options), /target differs/);
  assert.deepEqual(parseWranglerConfig('{"url":"https://example/a,}", /* comment */ "rows":[1, // note\n ],}'), { url: "https://example/a,}", rows: [1] });
});

test("manual workflow keeps rendering credential-free and shares the caller's environment lock", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/cloudflare-catalog-release.yml", import.meta.url), "utf8");
  const render = workflow.split("\n  render:\n")[1].split("\n  stage:\n")[0];
  assert.doesNotMatch(render, /secrets\.|^    environment:/m); assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.prepare\.outputs\.artifact \}\}/);
  for (const name of ["staging", "production"]) {
    const parent = readFileSync(new URL(`../../.github/workflows/cloudflare-${name}.yml`, import.meta.url), "utf8");
    assert.match(parent, new RegExp(`group: cloudflare-${name}`));
    assert.match(parent, new RegExp(`CHARACTER_CATALOG_${name.toUpperCase()}_RUNTIME_ENABLED`));
    assert.match(parent, /uses: \.\/\.github\/workflows\/cloudflare-catalog-release\.yml/);
  }
});
