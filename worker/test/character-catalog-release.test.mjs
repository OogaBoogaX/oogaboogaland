import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { seedCatalog, planCatalog, activateCatalog } from "../../scripts/character-catalog.mjs";
import { createReleaseCoordinator, nextCatalogBundle, reusableCatalogPortraits, RECOVERY_MAX_COMMITS, validateReleasePlan, runCatalogRelease } from "../../scripts/character-catalog-release.mjs";
import { readReleaseState } from "../../scripts/character-catalog-handoff.mjs";
import { loadCatalogState, CatalogConflict } from "../../scripts/character-catalog-publish.mjs";
import { canonicalJSON } from "../src/character-catalog-schema.js";
import { createPortraitManifest } from "../src/character-portraits-format.js";
import { encode as pngEncode } from "../../scripts/distribution-icons.mjs";

const NOW = Date.parse("2026-11-20T16:00:00Z"), REPO = "OogaBoogaX/oogaboogaland", BOT = "catalog-app[bot]";
const context = { environment: "production", engine: "catalog-v1", baseline: "1".repeat(40) };
const sha = (n) => n.toString(16).padStart(40, "0"), hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const file = (handle) => {
  const source = safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000 });
  return { path: `src/characters/${handle}.js`, kind: "data", source,
    blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex") };
};
const seed = () => seedCatalog({ ...context, sources: [file("Alice")], now: NOW });
const bundle = (merge, pr, handle) => {
  const f = file(handle);
  return { repository: REPO, pr, merge, head: sha(pr), lane: "daily", entries: [{ ...f,
    pr: pr - 1, head: sha(pr - 1), author: handle, base: null, lane: "daily", hash: hash(f.source) }] };
};
const portraits = (plan) => {
  const height = Math.ceil((plan.catalog.entries.length + 1) / 8) * 80, png = pngEncode(640, height, Buffer.alloc(640 * height * 4));
  return { png, manifest: createPortraitManifest(plan.catalog, plan.activation.revision, hash(png)) };
};
const fixture = () => {
  const objects = new Map(), writes = [], requests = [], proofs = [], bundles = new Map();
  const history = [context.baseline];
  const store = {
    async get(key) { const value = objects.get(key); return value ? { bytes: value.bytes.slice(), etag: value.etag } : null; },
    async put(key, data, conditions) {
      writes.push(key); const previous = objects.get(key);
      if (conditions.ifNoneMatch === "*" ? !!previous : previous?.etag !== conditions.ifMatch) return null;
      const etag = `"${hash(data)}"`; objects.set(key, { bytes: data.slice(), etag }); return { etag };
    }
  };
  const gh = { repo: REPO, async api(path) {
    requests.push(path);
    const id = path === "commits/rock" ? history.at(-1) : path.slice("commits/".length), i = history.indexOf(id);
    if (i < 0) throw new Error("Unknown commit");
    return { sha: id, parents: i ? [{ sha: history[i - 1] }] : [] };
  }, async list(path, pages) {
    requests.push(path); assert.equal(pages, 1);
    const merge = path.split("/")[1], source = bundles.get(merge);
    return source ? [{ number: source.pr, merge_commit_sha: merge, base: { ref: "rock" }, head: { ref: "automation/characters-daily-test" } }] : [];
  } };
  // The immutable source verifier has its own tree/hash/ownership suite. This fixture
  // records every call so these tests cover the coordinator's re-verification boundary.
  const coordinator = createReleaseCoordinator({ seedBaseline: async () => seed(), verifyBundle: async (_, input) => {
    proofs.push(input); assert.equal(input.bot, BOT); const result = bundles.get(input.merge);
    if (!result || result.pr !== input.pr) throw new Error("Unverified source");
    return result;
  } });
  const common = { gh, store, environment: "production", bot: BOT, now: NOW, bootstrapContext: context };
  const prepare = (operation = "publish", extra = {}) => coordinator.prepare({ ...common, operation, ...extra });
  const publish = (plan, extra = {}) => coordinator.publish({ ...common, plan, portraits: portraits(plan), operation: plan.operation, ...extra });
  const add = (merge, pr, handle) => { history.push(merge); if (handle) bundles.set(merge, bundle(merge, pr, handle)); };
  const boot = async () => { const plan = await prepare("bootstrap"); await publish(plan); return plan; };
  return { objects, writes, requests, proofs, bundles, history, gh, store, common, coordinator, prepare, publish, add, boot };
};

test("only explicit bootstrap registers the approved deployed context, and its acknowledgment retry is idempotent", async () => {
  const f = fixture();
  await assert.rejects(f.prepare(), /Bootstrap/);
  const plan = await f.prepare("bootstrap"); assert.equal(f.writes.length, 0);
  validateReleasePlan(plan, { now: NOW });
  const result = await f.publish(plan); assert.equal(result.generation, 1);
  assert.equal((await readReleaseState(f.store, "production")).state.context.baseline, context.baseline);
  const retry = await f.publish(plan); assert.equal(retry.state, "already-published"); assert.equal(retry.generation, 1);
  assert.equal((await f.prepare("bootstrap")).noop, true);
  await assert.rejects(f.prepare("bootstrap", { bootstrapContext: { ...context, baseline: sha(999) } }), /cannot replace/);
});

test("recovery walks the immutable first-parent chain and publishes the earliest unconsumed daily bundle", async () => {
  const f = fixture(); await f.boot(); f.add(sha(10)); f.add(sha(20), 20, "Bob"); f.add(sha(30)); f.add(sha(40), 40, "Carol");
  f.writes.length = 0;
  const plan = await f.prepare();
  assert.equal(f.writes.length, 0, "planning cannot write storage");
  assert.deepEqual(plan.source, { pr: 20, merge: sha(20) });
  assert.deepEqual(plan.catalog.entries.map((entry) => entry.identity.handle), ["Alice", "Bob"]);
  assert.equal(f.proofs.length, 1);
  const result = await f.publish(plan);
  assert.equal(result.generation, 2); assert.equal(f.proofs.length, 2, "the writer rechecks immutable source independently");
  const replay = await f.publish(plan); assert.equal(replay.generation, 2); assert.equal(f.proofs.length, 3);
  assert.deepEqual((await f.prepare()).source, { pr: 40, merge: sha(40) });
  assert.ok(!f.requests.some((path) => path.includes("updated_at")), "discovery uses the merge graph, not PR update time");
});

test("rollback preserves consumed events, so recovery cannot republish the rolled-back bundle", async () => {
  const f = fixture(), baseline = await f.boot(); f.add(sha(20), 20, "Bob");
  await f.publish(await f.prepare()); f.add(sha(40), 40, "Carol");
  const revision = baseline.activation.revision, rollback = await f.prepare("rollback", { rollbackRevision: revision });
  assert.equal(rollback.activation.generation, 3);
  assert.equal(rollback.activation.events[0].merge, sha(20));
  await f.publish(rollback, { rollbackRevision: revision });
  assert.equal((await f.publish(rollback, { rollbackRevision: revision })).generation, 3);
  f.requests.length = 0;
  const next = await f.prepare(); assert.equal(next.source.merge, sha(40));
  assert.ok(!f.requests.includes(`commits/${context.baseline}`), "rollback recovery stops at the last consumed merge without rescanning the baseline");
  assert.ok(!f.requests.includes(`commits/${sha(20)}/pulls`), "a consumed merge needs no repeated PR lookup");
  assert.deepEqual(next.catalog.entries.map((entry) => entry.identity.handle), ["Alice", "Carol"]);
  await assert.rejects(f.prepare("rollback", { rollbackRevision: "0".repeat(64) }), /previously accepted/);
});

test("tampered artifacts and changed release state cannot reach any publication write", async () => {
  const f = fixture(); await f.boot(); f.add(sha(20), 20, "Bob");
  const plan = await f.prepare(), current = await loadCatalogState(f.store, context, { now: NOW });
  const other = bundle(sha(99), 99, "Mallory");
  const encoded = planCatalog(current.catalog, other, { ...context, activation: current.activation, now: NOW });
  const tampered = { ...plan, catalog: encoded.catalog, activation: activateCatalog(current.activation, encoded.catalog,
    { expectedGeneration: current.activation.generation, now: NOW }), source: { pr: 99, merge: sha(99) } };
  f.writes.length = 0;
  await assert.rejects(f.publish(tampered), /differs/); assert.equal(f.writes.length, 0);
  const release = await readReleaseState(f.store, "production");
  const changed = { ...release.state, generation: release.state.generation + 1 };
  f.objects.set("release.json", { bytes: bytes(canonicalJSON(changed)), etag: '"changed"' });
  await assert.rejects(f.publish(plan), CatalogConflict); assert.equal(f.writes.length, 0);
});

test("a pending manual handoff blocks preparation and a previously prepared publication", async () => {
  const f = fixture(); await f.boot(); f.add(sha(20), 20, "Bob");
  const plan = await f.prepare(), release = await readReleaseState(f.store, "production"), active = await loadCatalogState(f.store, context, { now: NOW });
  const state = { ...release.state, generation: 2, pending: { token: "a".repeat(32), from: context, to: { ...context, baseline: sha(99) },
    sourceETag: active.etag, sourceRevision: active.revision, sourceGeneration: active.activation.generation, fenceHash: "b".repeat(64), fenced: false } };
  f.objects.set("release.json", { bytes: bytes(canonicalJSON(state)), etag: '"pending"' });
  f.writes.length = 0;
  await assert.rejects(f.prepare(), /handoff is pending/);
  await assert.rejects(f.publish(plan), /handoff is pending/);
  assert.equal(f.writes.length, 0);
});

test("recovery fails closed for a missing baseline, cycles, malformed commits and oversized PR lists", async () => {
  const f = fixture(); f.add(sha(20), 20, "Bob");
  await assert.rejects(nextCatalogBundle(f.gh, { baseline: sha(999) }), /first-parent/);
  for (const commit of [{ sha: sha(20), parents: [] }, { sha: "rock", parents: [{ sha: context.baseline }] },
    { sha: sha(20), parents: [{ sha: sha(20) }] }]) {
    await assert.rejects(nextCatalogBundle({ ...f.gh, api: async () => commit }, { baseline: context.baseline }));
  }
  await assert.rejects(nextCatalogBundle({ ...f.gh, list: async () => Array(101).fill({}) }, { baseline: context.baseline }), /incomplete/);
  let reads = 0;
  await assert.rejects(nextCatalogBundle({ repo: REPO, api: async () => ({ sha: sha(++reads), parents: [{ sha: sha(reads + 1) }] }) },
    { baseline: "f".repeat(40) }), /bounded/);
  assert.equal(reads, RECOVERY_MAX_COMMITS + 1);
});

test("a discovered bundle whose source verification fails stops the queue without a write", async () => {
  const f = fixture(); await f.boot(); f.add(sha(20), 20, "Bob"); f.add(sha(40), 40, "Carol");
  f.gh.list = async (path) => path.includes(sha(20)) ? [{ number: 21, merge_commit_sha: sha(20), base: { ref: "rock" }, head: { ref: "automation/characters-daily-test" } }] : [];
  f.writes.length = 0;
  await assert.rejects(f.prepare(), /Unverified source/);
  assert.equal(f.writes.length, 0); assert.equal(f.proofs.at(-1).merge, sha(20));
});

test("release CLI help requires no credentials, and malformed commands stop before I/O", async () => {
  assert.match(await runCatalogRelease(["--help"], {}), /never deploy Worker code/);
  for (const args of [["execute"], ["plan", "--environment", "production", "--environment", "staging"],
    ["publish", "--environment", "other", "--operation", "bootstrap"], ["plan", "--environment", "production", "--operation", "rollback"]]) {
    await assert.rejects(runCatalogRelease(args, {}));
  }
});


test("rollback reuses the exact accepted portrait bytes even if a later renderer would draw different pixels", async () => {
  const f = fixture(), baseline = await f.boot(); f.add(sha(20), 20, "Bob"); await f.publish(await f.prepare());
  const revision = baseline.activation.revision, plan = await f.prepare("rollback", { rollbackRevision: revision });
  const reused = await reusableCatalogPortraits(f.store, plan.catalog, revision);
  const png = pngEncode(640, 80, Buffer.alloc(640 * 80 * 4, 127));
  const different = { png, manifest: createPortraitManifest(plan.catalog, revision, hash(png)) };
  assert.notEqual(hash(reused.png), hash(different.png));
  await assert.rejects(f.publish(plan, { rollbackRevision: revision, portraits: different }), /Immutable object already has different bytes/);
  const result = await f.publish(plan, { rollbackRevision: revision, portraits: reused });
  assert.equal(result.revision, revision); assert.equal(result.manifest.image, hash(reused.png));
  f.objects.delete(`portraits/${revision}/${reused.manifest.image}.png`);
  await assert.rejects(reusableCatalogPortraits(f.store, plan.catalog, revision), /missing or differs/);
  f.objects.delete(`portraits/${revision}/manifest.json`);
  await assert.rejects(reusableCatalogPortraits(f.store, plan.catalog, revision), /manifest is missing/);
});
