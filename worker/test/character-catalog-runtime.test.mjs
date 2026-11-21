import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { seedCatalog, planCatalog, activateCatalog, encodeCatalog } from "../../scripts/character-catalog.mjs";
import { canonicalJSON, parseCatalog, parseActivation, sha256, CATALOG_MAX_BYTES } from "../src/character-catalog-schema.js";
import { createCatalogLoader, catalogFor, CATALOG_REFRESH_MS, CATALOG_MAX_STALE_MS } from "../src/character-catalog.js";

const NOW = Date.parse("2026-11-20T16:00:00Z"), BASELINE = "1".repeat(40), ENGINE = "characters-v1";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const source = (handle, extra = {}) => {
  const text = safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000, look: { hair: "#123456" }, ...extra });
  return { path: `src/characters/${handle}.js`, kind: "data", source: text,
    blob: createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0${text}`).digest("hex") };
};
const compiled = (handle = "Alice", extra = {}) => ({ handle, github_login: handle, display: null, joined_at: "2026-09-21T14:26:40.000Z",
  last_commit_at: "2026-09-21T14:26:40.000Z", look: { hair: "#123456" }, voice: null, has_look_code: false, ...extra });
const initial = (sources = [source("Alice")]) => seedCatalog({ environment: "production", engine: ENGINE, baseline: BASELINE, sources, now: NOW });
const activationOf = (catalog, before = null, rollback = false) => activateCatalog(before, catalog,
  { expectedGeneration: before?.generation || 0, rollback, now: NOW });
const update = (previous, activation, handle = "Bob", extra = {}, base = null, merge = "3".repeat(40)) => {
  const file = source(handle, extra);
  return planCatalog(previous, { repository: "OogaBoogaX/oogaboogaland", pr: 10, head: "2".repeat(40), merge, lane: "daily",
    entries: [{ ...file, lane: "daily", hash: sha(file.source), pr: 9, head: "4".repeat(40), author: handle, base }] },
  { environment: "production", engine: ENGINE, activation, now: NOW });
};
const body = (text) => ({ size: Buffer.byteLength(text), body: new Response(text).body });
const fixture = (options = {}) => {
  let time = NOW;
  const objects = new Map(), calls = [];
  const env = { CHARACTER_CATALOG_ENABLED: "1", CHARACTER_CATALOG_ENGINE: ENGINE, CHARACTER_CATALOG_BASELINE: BASELINE,
    ENVIRONMENT: "production", CHARACTER_CATALOGS: { get: async (key) => {
      calls.push(key); const value = objects.get(key);
      if (value instanceof Error) throw value;
      return typeof value === "function" ? value() : typeof value === "string" ? body(value) : value || null;
    } }, ...options.env };
  const put = (catalog, activation) => {
    objects.set(`catalogs/${BASELINE}/${catalog.digest}.json`, catalog.json);
    objects.set(`catalogs/${BASELINE}/active.json`, canonicalJSON(activation));
  };
  const loader = createCatalogLoader(env, { rows: options.rows || [compiled()], now: () => time, timeoutMs: options.timeoutMs || 50 });
  const seed = initial(), pointer = activationOf(seed.catalog);
  put(seed, pointer);
  return { env, loader, objects, calls, put, seed, pointer, advance: (ms) => { time += ms; }, time: () => time };
};

test("runtime schema accepts exact foundation bytes, digest and activation", async () => {
  const seed = initial(), pointer = activationOf(seed.catalog);
  assert.deepEqual(parseCatalog(seed.json, NOW), seed.catalog);
  assert.equal(canonicalJSON(seed.catalog), seed.json);
  assert.equal(await sha256(seed.json), seed.digest);
  assert.deepEqual(parseActivation(canonicalJSON(pointer)), pointer);
});

test("runtime and writer reject the same malformed schema and character rows", () => {
  for (const mutate of [
    (v) => { v.version = 2; }, (v) => { v.extra = true; }, (v) => { v.entries[0].row.look.height = 20; },
    (v) => { v.entries[0].row.voice = { poke: "hello", idle: [] }; }, (v) => { v.entries[0].row.look.dress = "code"; },
    (v) => { v.entries[0].row.github = "Other"; }, (v) => { v.entries[0].row.lastCommit = 99999999999; },
    (v) => { v.entries[0].identity.github = "../owner"; }, (v) => { v.entries.push(v.entries[0]); }
  ]) {
    const value = structuredClone(initial().catalog); mutate(value);
    assert.throws(() => encodeCatalog(value, { now: NOW }));
    assert.throws(() => parseCatalog(canonicalJSON(value), NOW));
  }
  const json = initial().json;
  assert.throws(() => parseCatalog(json.replace('"version":1', '"version":1,"version":1'), NOW));
  assert.throws(() => parseCatalog(JSON.stringify(JSON.parse(json), null, 2), NOW));
});

test("disabled catalog preserves embedded authority without I/O; misconfigured enabled catalog fails closed", async () => {
  const disabled = fixture({ env: { CHARACTER_CATALOG_ENABLED: "0" } });
  assert.equal(disabled.loader.enabled, false); assert.equal(disabled.loader.fresh(), true);
  assert.equal((await disabled.loader.read()).revision, "embedded"); assert.equal(disabled.calls.length, 0);
  for (const env of [{ CHARACTER_CATALOGS: undefined }, { CHARACTER_CATALOG_ENGINE: "" }, { CHARACTER_CATALOG_BASELINE: "rock" }, { ENVIRONMENT: "other" }]) {
    const f = fixture({ env });
    assert.equal(f.loader.enabled, true); assert.equal(await f.loader.read(), null); assert.equal(f.loader.fresh(), false);
  }
  const env = {}; assert.equal(catalogFor(env), catalogFor(env)); assert.notEqual(catalogFor(env), catalogFor({}));
});

test("concurrent reads share a bounded load and a publication changes authority without a deployment", async () => {
  const f = fixture(), responses = await Promise.all(Array.from({ length: 20 }, () => f.loader.read()));
  assert.equal(f.calls.length, 2); assert.ok(responses.every((r) => r === responses[0]));
  assert.equal(responses[0].revision, f.seed.digest); assert.deepEqual(responses[0].rows.map((r) => r.handle), ["Alice"]);
  const next = update(f.seed.catalog, f.pointer), pointer = activationOf(next.catalog, f.pointer);
  f.put(next, pointer); assert.equal((await f.loader.read()).generation, 1);
  f.advance(CATALOG_REFRESH_MS);
  const changed = await f.loader.read(); assert.equal(changed.generation, 2);
  assert.deepEqual(changed.rows.map((r) => r.handle), ["Alice", "Bob"]);
  assert.ok(Object.isFrozen(changed.rows[0])); assert.equal(changed.rows[1].github_login, "Bob");
});

test("rollback advances generation while a delayed older activation cannot restore removed additions", async () => {
  const f = fixture(); await f.loader.read();
  const next = update(f.seed.catalog, f.pointer), second = activationOf(next.catalog, f.pointer);
  f.put(next, second); f.advance(CATALOG_REFRESH_MS); await f.loader.read();
  const rollback = activationOf(f.seed.catalog, second, true);
  f.put(f.seed, rollback); f.advance(CATALOG_REFRESH_MS);
  assert.equal((await f.loader.read()).generation, 3); assert.equal(f.loader.current().rows.length, 1);
  f.put(next, second); f.advance(CATALOG_REFRESH_MS);
  assert.equal((await f.loader.read()).generation, 3); assert.equal(f.loader.current().rows.length, 1);
});

test("storage failures retain trusted authority for fifteen minutes then return unavailable", async () => {
  const f = fixture(); const first = await f.loader.read();
  f.objects.set(`catalogs/${BASELINE}/active.json`, new Error("offline"));
  f.advance(CATALOG_REFRESH_MS); assert.equal(await f.loader.read(), first);
  assert.equal(f.loader.fresh(), true); assert.equal(f.loader.saved().checkedAt, NOW);
  f.advance(CATALOG_MAX_STALE_MS - CATALOG_REFRESH_MS);
  assert.equal(await f.loader.read(), null); assert.equal(f.loader.current(), null); assert.equal(f.loader.fresh(), false);
});

test("wrong context, digest mismatch, invalid JSON and overflow never replace authority", async () => {
  for (const damage of [
    (f) => { const a = structuredClone(f.pointer); a.environment = "staging"; f.objects.set(`catalogs/${BASELINE}/active.json`, canonicalJSON(a)); },
    (f) => { const a = structuredClone(f.pointer); a.engine = "unreleased"; f.objects.set(`catalogs/${BASELINE}/active.json`, canonicalJSON(a)); },
    (f) => { f.objects.set(`catalogs/${BASELINE}/${f.seed.digest}.json`, f.seed.json.replace("#123456", "#654321")); },
    (f) => { f.objects.set(`catalogs/${BASELINE}/active.json`, "{}"); },
    (f) => { f.objects.set(`catalogs/${BASELINE}/active.json`, () => ({ size: CATALOG_MAX_BYTES + 1, body: new Response("{}").body })); },
    (f) => { f.objects.set(`catalogs/${BASELINE}/active.json`, () => ({ size: 2, body: new Response("oversized").body })); }
  ]) {
    const f = fixture(); damage(f);
    assert.equal(await f.loader.read(), null); assert.equal(f.loader.current(), null);
  }
});

test("catalog cannot drop or reassign a compiled identity or replace custom hooks with plain data", async () => {
  for (const sources of [[], [source("Alice", { github: "Other" })]]) {
    const f = fixture(), seed = initial(sources); f.put(seed, activationOf(seed.catalog));
    assert.equal(await f.loader.read(), null);
  }
  const hooks = fixture({ rows: [compiled("Alice", { has_look_code: true })] });
  assert.equal(await hooks.loader.read(), null);
  const custom = { ...source("Alice"), kind: "custom" }, seed = initial([custom]);
  hooks.put(seed, activationOf(seed.catalog)); hooks.advance(CATALOG_REFRESH_MS);
  assert.equal((await hooks.loader.read()).rows[0].has_look_code, true);
});

test("restoring a saved snapshot validates its digest and timestamp without renewing its authority", async () => {
  const f = fixture(); await f.loader.read(); const saved = f.loader.saved();
  const restored = fixture(); restored.advance(CATALOG_REFRESH_MS);
  assert.equal(await restored.loader.restore(saved), true); assert.equal(restored.loader.current().checkedAt, NOW);
  const bad = structuredClone(saved); bad.catalog.entries[0].row.look.hair = "#abcdef";
  assert.equal(await fixture().loader.restore(bad), false);
  assert.equal(await fixture().loader.restore({ ...saved, checkedAt: NOW + 1 }), false);
});

test("expired persisted state retains only its generation high-water mark", async () => {
  const f = fixture(); await f.loader.read();
  const next = update(f.seed.catalog, f.pointer), second = activationOf(next.catalog, f.pointer);
  f.put(next, second); f.advance(CATALOG_REFRESH_MS); await f.loader.read(); const saved = f.loader.saved();
  const restored = fixture(); restored.advance(CATALOG_MAX_STALE_MS + CATALOG_REFRESH_MS);
  assert.equal(await restored.loader.restore(saved), false); assert.equal(restored.loader.current(), null);
  assert.equal(await restored.loader.read(), null, "older stored activation cannot revive stale authority");
  restored.put(next, second); restored.advance(CATALOG_REFRESH_MS);
  assert.equal((await restored.loader.read()).generation, 2);
});

test("a timed-out request cannot install its late result after a replacement read", async () => {
  const f = fixture({ timeoutMs: 15 });
  let release;
  f.objects.set(`catalogs/${BASELINE}/active.json`, () => new Promise((resolve) => { release = resolve; }));
  const old = f.loader.read();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await old, null);
  const next = update(f.seed.catalog, f.pointer), second = activationOf(next.catalog, f.pointer);
  f.put(next, second); f.advance(CATALOG_REFRESH_MS);
  assert.equal((await f.loader.read()).generation, 2);
  release(body(canonicalJSON(f.pointer)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.loader.current().generation, 2);
});
