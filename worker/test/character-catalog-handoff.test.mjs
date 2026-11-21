import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encode as pngEncode } from "../../scripts/distribution-icons.mjs";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { seedCatalog, activateCatalog, planCatalog } from "../../scripts/character-catalog.mjs";
import { publishCatalog, loadCatalogState, CatalogConflict } from "../../scripts/character-catalog-publish.mjs";
import { readReleaseState, initializeRelease, prepareHandoff, beginHandoff, resumeHandoff, completeHandoff, checkPreservation, abortUnfencedHandoff, replaceUnstagedHandoff } from "../../scripts/character-catalog-handoff.mjs";
import { canonicalJSON } from "../src/character-catalog-schema.js";
import { createPortraitManifest } from "../src/character-portraits-format.js";

const NOW = Date.parse("2026-11-20T16:00:00Z"), token = "f".repeat(32);
const from = { environment: "production", engine: "v1", baseline: "1".repeat(40) }, to = { ...from, engine: "v2", baseline: "2".repeat(40) };
const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const file = (handle, extra = {}) => {
  const source = safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000, ...extra });
  return { path: `src/characters/${handle}.js`, kind: "data", source, blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex") };
};
const source = file("Alice"), seed = (context, sources = [source]) => seedCatalog({ ...context, sources, now: NOW });
const activate = (catalog, previous = null) => activateCatalog(previous, catalog, { expectedGeneration: previous?.generation || 0, now: NOW });
const images = (encoded) => {
  const png = pngEncode(640, 80, Buffer.alloc(640 * 80 * 4));
  return { png, manifest: createPortraitManifest(encoded.catalog, encoded.digest, hash(png)) };
};
const fixture = async () => {
  const objects = new Map(), writes = [];
  const store = {
    async get(key) { const item = objects.get(key); return item ? { bytes: item.bytes.slice(), etag: item.etag } : null; },
    async put(key, data, condition) {
      writes.push(key); const old = objects.get(key);
      if (condition.ifNoneMatch === "*" ? !!old : old?.etag !== condition.ifMatch) return null;
      const etag = `"${hash(data)}"`; objects.set(key, { bytes: data.slice(), etag }); return { etag };
    }
  };
  const first = seed(from), activation = activate(first.catalog);
  await publishCatalog({ store, context: from, catalog: first.catalog, activation, portraits: images(first), expectedETag: null, now: NOW });
  const release = await initializeRelease({ store, context: from, now: NOW });
  const gh = {
    async tree(ref) { assert.equal(ref, to.baseline); return new Map([[source.path, { type: "blob", mode: "100644", size: Buffer.byteLength(source.source), sha: source.blob }]]); },
    async file(ref) { assert.equal(ref, to.baseline); return { source: source.source, sha: source.blob }; }
  };
  const prepared = await prepareHandoff({ gh, store, currentContext: from, nextContext: to, now: NOW });
  return { store, objects, writes, first, activation, release, prepared, gh };
};
const begin = (f) => beginHandoff({ store: f.store, environment: "production", expectedETag: f.release.etag, prepared: f.prepared, token, now: NOW });
const target = async (f) => {
  const activation = activate(f.prepared.catalog);
  return publishCatalog({ store: f.store, context: to, catalog: f.prepared.catalog, activation, portraits: images(f.prepared), expectedETag: null, now: NOW });
};

test("manual handoff fences pre-barrier publishers, preserves catalog bytes and switches only after runtime verification", async () => {
  const f = await fixture(), old = await loadCatalogState(f.store, from, { now: NOW }), held = await begin(f);
  assert.equal(held.state.pending.fenced, true); assert.equal(held.state.pending.sourceGeneration, old.activation.generation + 1);
  assert.equal(held.state.pending.sourceRevision, old.revision); assert.notEqual(held.state.pending.sourceETag, old.etag);
  assert.equal(await f.store.put(`catalogs/${from.baseline}/active.json`, bytes(canonicalJSON(old.activation)), { ifMatch: old.etag }), null);
  const published = await target(f);
  const complete = await completeHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token,
    verified: { baseline: to.baseline, engine: to.engine, revision: published.revision, generation: published.generation }, now: NOW });
  assert.equal(complete.state.pending, null); assert.deepEqual(complete.state.context, to);
  assert.equal(complete.state.generation, 4);
});

test("a failed deploy or mismatched runtime confirmation leaves the barrier held indefinitely", async () => {
  const f = await fixture(), held = await begin(f); await target(f);
  await assert.rejects(completeHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token,
    verified: { baseline: from.baseline, engine: from.engine, revision: f.first.digest, generation: 1 }, now: NOW + 30 * 86400000 }));
  const after = await readReleaseState(f.store, "production"); assert.equal(after.etag, held.etag); assert.ok(after.state.pending);
  await assert.rejects(initializeRelease({ store: f.store, context: from, now: NOW }), CatalogConflict);
});

test("preservation refuses changed plain data and identity loss while allowing reviewed custom code changes", () => {
  const first = seed(from), changed = seed(to, [file("Alice", { look: { hair: "#123456" } })]);
  assert.throws(() => checkPreservation(first.catalog, changed.catalog), /plain-data/);
  assert.throws(() => checkPreservation(first.catalog, seed(to, []).catalog), /removes/);
  const custom = seed(from, [{ ...source, kind: "custom" }]);
  assert.equal(checkPreservation(custom.catalog, changed.catalog), true);
  assert.throws(() => checkPreservation(custom.catalog, seed(to, [file("Alice", { github: "Other" })]).catalog), /reassigns/);
});

test("a publisher winning between barrier and fence keeps deployment held instead of losing its character", async () => {
  const f = await fixture(), original = f.store.put, b = file("Bob");
  const next = planCatalog(f.first.catalog, { repository: "OogaBoogaX/oogaboogaland", pr: 10, merge: "3".repeat(40), head: "4".repeat(40), lane: "daily",
    entries: [{ ...b, lane: "daily", hash: hash(b.source), base: null, pr: 9, head: "5".repeat(40), author: "Bob" }] }, { ...from, activation: f.activation, now: NOW });
  const advanced = activate(next.catalog, f.activation), activeKey = `catalogs/${from.baseline}/active.json`;
  f.objects.set(`catalogs/${from.baseline}/${next.digest}.json`, { bytes: bytes(next.json), etag: '"new-catalog"' });
  f.store.put = async (key, data, condition) => {
    const result = await original(key, data, condition);
    if (key === "release.json" && JSON.parse(new TextDecoder().decode(data)).pending?.fenced === false) {
      const prior = f.objects.get(activeKey); await original(activeKey, bytes(canonicalJSON(advanced)), { ifMatch: prior.etag });
    }
    return result;
  };
  await assert.rejects(begin(f), /won the fence race/);
  const release = await readReleaseState(f.store, "production"); assert.ok(release.state.pending); assert.equal(release.state.pending.fenced, false);
  assert.equal((await loadCatalogState(f.store, from, { now: NOW })).revision, next.digest);
  f.store.put = original;
  const before = await loadCatalogState(f.store, from, { now: NOW });
  await assert.rejects(abortUnfencedHandoff({ store: f.store, environment: "production", expectedETag: release.etag, token: "0".repeat(32), now: NOW }), CatalogConflict);
  const cancelled = await abortUnfencedHandoff({ store: f.store, environment: "production", expectedETag: release.etag, token, now: NOW });
  assert.equal(cancelled.state.pending, null); assert.deepEqual(cancelled.state.context, from);
  const after = await loadCatalogState(f.store, from, { now: NOW });
  assert.equal(after.revision, next.digest); assert.equal(after.activation.generation, before.activation.generation + 1);
  assert.equal(await f.store.put(activeKey, bytes(canonicalJSON(advanced)), { ifMatch: before.etag }), null);
});

test("recovery confirms a committed fence after the process loses the second release-state update", async () => {
  const f = await fixture(), original = f.store.put;
  let failOnce = true;
  f.store.put = async (key, data, condition) => {
    if (key === "release.json" && JSON.parse(new TextDecoder().decode(data)).pending?.fenced && failOnce) { failOnce = false; throw new Error("interrupted"); }
    return original(key, data, condition);
  };
  await assert.rejects(begin(f), CatalogConflict);
  const partial = await readReleaseState(f.store, "production"); assert.equal(partial.state.pending.fenced, false);
  await assert.rejects(abortUnfencedHandoff({ store: f.store, environment: "production", expectedETag: partial.etag, token, now: NOW }), /original fence committed/);
  const resumed = await resumeHandoff({ store: f.store, environment: "production", expectedETag: partial.etag, token, now: NOW });
  assert.equal(resumed.state.pending.fenced, true); assert.equal(resumed.state.pending.sourceGeneration, 2);
  const again = await resumeHandoff({ store: f.store, environment: "production", expectedETag: resumed.etag, token, now: NOW });
  assert.equal(again.etag, resumed.etag);
});

test("same-baseline handoffs, stale tokens and wrong environment cannot change release authority", async () => {
  const f = await fixture();
  await assert.rejects(prepareHandoff({ gh: f.gh, store: f.store, currentContext: from, nextContext: { ...from, engine: "v2" }, now: NOW }), /distinct approved baseline/);
  await assert.rejects(readReleaseState(f.store, "staging"), /invalid release state/);
  const held = await begin(f);
  await assert.rejects(resumeHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token: "a".repeat(32), now: NOW }), CatalogConflict);
  await assert.rejects(abortUnfencedHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token, now: NOW }), /unfenced/);
});

const replacement = (f, held, extra = {}) => {
  const context = { ...to, baseline: "8".repeat(40) };
  return replaceUnstagedHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token,
    expectedTarget: to.baseline, prepared: { ...seed(context), context }, newToken: "b".repeat(32),
    verified: { ...from, revision: f.first.digest, generation: held.state.pending.sourceGeneration }, now: NOW, ...extra });
};

test("unpublished target replacement preserves the source fence and barrier, with exact CAS readback after a lost acknowledgment", async () => {
  const f = await fixture(), held = await begin(f), source = await loadCatalogState(f.store, from, { now: NOW });
  const original = f.store.put, before = f.writes.length;
  f.store.put = async (key, data, condition) => {
    const result = await original(key, data, condition);
    if (key === "release.json") throw new Error("acknowledgment lost after commit");
    return result;
  };
  const replaced = await replacement(f, held);
  assert.deepEqual(f.writes.slice(before), ["release.json"]);
  assert.deepEqual(replaced.state.context, from); assert.equal(replaced.state.pending.fenced, true);
  assert.equal(replaced.state.pending.to.baseline, "8".repeat(40)); assert.equal(replaced.state.pending.token, "b".repeat(32));
  assert.equal(replaced.state.generation, held.state.generation + 1);
  for (const key of ["from", "sourceETag", "sourceRevision", "sourceGeneration", "fenceHash", "fenced"])
    assert.deepEqual(replaced.state.pending[key], held.state.pending[key], key);
  assert.deepEqual(await loadCatalogState(f.store, from, { now: NOW }), source);
  await assert.rejects(resumeHandoff({ store: f.store, environment: "production", expectedETag: held.etag, token, now: NOW }), CatalogConflict);
});

test("unpublished replacement rejects stale evidence, live mismatches and character regression without writes", async () => {
  const f = await fixture(), held = await begin(f), before = f.writes.length;
  for (const extra of [{ token: "0".repeat(32) }, { expectedETag: '"stale"' }, { expectedTarget: "7".repeat(40) },
    { newToken: token }, { verified: { ...to, revision: f.first.digest, generation: 2 } },
    { verified: { ...from, revision: f.first.digest, generation: 1 } }]) await assert.rejects(replacement(f, held, extra));
  const context = { ...to, baseline: "8".repeat(40) };
  await assert.rejects(replacement(f, held, { prepared: { ...seed(context, []), context } }), /removes/);
  assert.equal(f.writes.length, before); assert.equal((await readReleaseState(f.store, "production")).etag, held.etag);
});

test("an activated target or changed source fence cannot be replaced", async () => {
  const f = await fixture(), held = await begin(f);
  await target(f);
  const before = f.writes.length;
  await assert.rejects(replacement(f, held), /already activated/);
  assert.equal(f.writes.length, before);
  const g = await fixture(), pending = await begin(g), source = await loadCatalogState(g.store, from, { now: NOW });
  const active = { ...source.activation, generation: source.activation.generation + 1, previous: source.revision };
  await g.store.put(`catalogs/${from.baseline}/active.json`, bytes(canonicalJSON(active)), { ifMatch: source.etag });
  await assert.rejects(replacement(g, pending), /Source fence changed/);
  assert.equal((await readReleaseState(g.store, "production")).etag, pending.etag);
});

test("a competing release-state CAS cannot be overwritten by target replacement", async () => {
  const f = await fixture(), held = await begin(f), original = f.store.put;
  f.store.put = async (key, data, condition) => {
    if (key === "release.json") {
      const other = { ...held.state, generation: held.state.generation + 1, pending: { ...held.state.pending, token: "c".repeat(32) } };
      await original(key, bytes(canonicalJSON(other)), condition);
    }
    return original(key, data, condition);
  };
  await assert.rejects(replacement(f, held), CatalogConflict);
  const actual = await readReleaseState(f.store, "production");
  assert.equal(actual.state.pending.token, "c".repeat(32)); assert.equal(actual.state.pending.to.baseline, to.baseline);
});

test("a new baseline cannot revive a rolled-back addition, including after a later character publication", async () => {
  const f = await fixture(), bob = file("Bob"), carol = file("Carol");
  const update = async (source, merge) => {
    const current = await loadCatalogState(f.store, from, { now: NOW });
    const next = planCatalog(current.catalog, { repository: "OogaBoogaX/oogaboogaland", pr: 10, merge, head: "4".repeat(40), lane: "daily",
      entries: [{ ...source, lane: "daily", hash: hash(source.source), base: null, pr: 9, head: "5".repeat(40), author: source.path.split("/").at(-1).slice(0, -3) }] }, { ...from, activation: current.activation, now: NOW });
    await publishCatalog({ store: f.store, context: from, catalog: next.catalog, activation: activate(next.catalog, current.activation), portraits: images(next), expectedETag: current.etag, now: NOW });
  };
  await update(bob, "6".repeat(40));
  const current = await loadCatalogState(f.store, from, { now: NOW });
  const rollback = activateCatalog(current.activation, f.first.catalog, { expectedGeneration: current.activation.generation, rollback: true, now: NOW });
  await publishCatalog({ store: f.store, context: from, catalog: f.first.catalog, activation: rollback, portraits: images(f.first), expectedETag: current.etag, rollback: true, now: NOW });
  await update(carol, "7".repeat(40));
  const sources = [source, bob, carol], gh = {
    async tree() { return new Map(sources.map((s) => [s.path, { type: "blob", mode: "100644", size: Buffer.byteLength(s.source), sha: s.blob }])); },
    async file(_, path) { const s = sources.find((s) => s.path === path); return { source: s.source, sha: s.blob }; }
  };
  const before = f.writes.length;
  await assert.rejects(prepareHandoff({ gh, store: f.store, currentContext: from, nextContext: to, now: NOW }), /rolled-back character/);
  assert.equal(f.writes.length, before); assert.equal((await readReleaseState(f.store, "production")).state.pending, null);
  sources.splice(1, 1);
  const safe = await prepareHandoff({ gh, store: f.store, currentContext: from, nextContext: to, now: NOW });
  assert.deepEqual(safe.catalog.entries.map((entry) => entry.identity.handle), ["Alice", "Carol"]);
});
