// Independent character releases use the deployed baseline and verified events, never the current source tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { digest } from "../../scripts/character-submissions.mjs";
import { seedCatalog, encodeCatalog, readCatalog, planCatalog, activateCatalog } from "../../scripts/character-catalog.mjs";

const NOW = Date.parse("2026-11-20T16:00:00Z"), BASELINE = "1".repeat(40), ENGINE = "island-character-data-v1";
const blobSha = (source) => createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex");
const source = (handle, extra = {}) => safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000,
  look: { skin: "#c48a5a", hair: "#1a120c", face: "beard" }, voice: { poke: "Let's build.", idle: ["One block at a time."] }, ...extra });
const file = (handle, extra = {}, kind = "data") => {
  const text = source(handle, extra);
  return { path: `src/characters/${handle}.js`, source: text, blob: blobSha(text), kind };
};
const seed = (sources = [file("Alice")], extra = {}) => seedCatalog({ environment: "production", engine: ENGINE,
  baseline: BASELINE, sources, now: NOW, ...extra });
const activate = (catalog, previous = null, extra = {}) => activateCatalog(previous, catalog,
  { expectedGeneration: previous?.generation || 0, now: NOW, ...extra });
const entry = (handle, extra = {}, base = null) => {
  const f = file(handle, extra);
  return { pr: 20, head: "2".repeat(40), author: extra.github || handle, path: f.path, base, hash: digest(f.source),
    lane: "daily", source: f.source, blob: f.blob };
};
const bundle = (entries, merge = "3".repeat(40)) => ({ repository: "OogaBoogaX/oogaboogaland", pr: 40, merge,
  head: "4".repeat(40), lane: "daily", entries });
const plan = (catalog, event, activation = activate(catalog), extra = {}) => planCatalog(catalog, event,
  { environment: "production", engine: ENGINE, activation, now: NOW, ...extra });

test("a character release keeps the deployed baseline and applies only the verified bundle", () => {
  const deployed = seed(), before = JSON.stringify(deployed.catalog), event = bundle([entry("Bob")]);
  // Neither a newer engine nor unrelated character work merged on rock is an input to this planner.
  const next = plan(deployed.catalog, event);
  assert.equal(next.catalog.baseline, BASELINE); assert.equal(next.catalog.engine, ENGINE);
  assert.deepEqual(next.catalog.entries.map((row) => row.identity.handle), ["Alice", "Bob"]);
  assert.deepEqual(next.catalog.entries.find((row) => row.identity.handle === "Alice"), deployed.catalog.entries[0]);
  assert.equal(next.catalog.events.length, 1); assert.equal(next.catalog.events[0].merge, event.merge);
  assert.equal(JSON.stringify(deployed.catalog), before, "planning must not mutate the active release");
  assert.equal(next.noop, false); assert.notEqual(next.digest, deployed.digest);
});

test("catalog bytes and digest do not depend on input file or object property order", () => {
  const a = file("Alice"), b = file("Bob"), forward = seed([a, b]), reverse = seed([b, a]);
  assert.equal(forward.json, reverse.json); assert.equal(forward.digest, reverse.digest);
  const reordered = Object.fromEntries(Object.entries(forward.catalog).reverse());
  assert.equal(encodeCatalog(reordered, { now: NOW }).json, forward.json);
  assert.equal(readCatalog(forward.json, { now: NOW }).digest, forward.digest);
  assert.equal(digest(forward.json), forward.digest);
});

test("updates require the precise previously published blob, not merely the same handle", () => {
  const deployed = seed(), old = deployed.catalog.entries[0];
  const accepted = plan(deployed.catalog, bundle([entry("Alice", { look: { hair: "#445566" } }, old.blob)]));
  assert.equal(accepted.catalog.entries[0].row.look.hair, "#445566");
  assert.throws(() => plan(deployed.catalog, bundle([entry("Alice", {}, "f".repeat(40))])));
  assert.throws(() => plan(deployed.catalog, bundle([entry("Alice")])));
  assert.throws(() => plan(deployed.catalog, bundle([entry("Bob", {}, old.blob)])));
});

test("out-of-order events cannot skip an update and duplicate delivery is idempotent", () => {
  const initial = seed(), first = bundle([entry("Alice", { look: { hair: "#445566" } }, initial.catalog.entries[0].blob)]);
  const changed = plan(initial.catalog, first), active = activate(changed.catalog, activate(initial.catalog));
  const second = bundle([entry("Alice", { look: { hair: "#778899" } }, changed.catalog.entries[0].blob)], "5".repeat(40));
  assert.throws(() => plan(initial.catalog, second));
  const duplicate = plan(changed.catalog, first, active);
  assert.equal(duplicate.noop, true); assert.equal(duplicate.digest, changed.digest);
  const newest = plan(changed.catalog, second, active);
  assert.equal(newest.catalog.entries[0].row.look.hair, "#778899");
  const altered = structuredClone(first); altered.entries[0] = entry("Alice", {}, initial.catalog.entries[0].blob);
  assert.throws(() => plan(changed.catalog, altered, active), "a merge ID cannot be reused for different source bytes");
  const attributed = structuredClone(first); attributed.entries[0].author = "Mallory";
  assert.throws(() => plan(changed.catalog, attributed, active), "a replay cannot change the source's author");
});

test("custom baseline characters reserve their identities but cannot be replaced by automatic data", () => {
  const text = '(() => { "use strict"; const BL = window.BL; BL.characters.add({ handle: "Artist", github: "Painter", joined: 1790000000, lastCommit: 1790000000, dress: { extras() { throw new Error("must not execute"); } } }); })();';
  const compiled = { path: "src/characters/Artist.js", source: text, blob: blobSha(text), kind: "custom" };
  const deployed = seed([file("Alice"), compiled]), reserved = deployed.catalog.entries.find((row) => row.kind === "custom");
  assert.deepEqual(reserved.identity, { handle: "Artist", github: "Painter" }); assert.equal(reserved.row, null);
  assert.ok(!deployed.json.includes("must not execute"), "catalog JSON never contains compiled character code");
  assert.throws(() => plan(deployed.catalog, bundle([entry("Artist", { github: "Painter" }, compiled.blob)])));
  assert.throws(() => plan(deployed.catalog, bundle([entry("Painter")])));
  assert.throws(() => plan(deployed.catalog, bundle([entry("Other", { github: "Painter" })])));
});

test("automatic changes cannot change identity, collide with aliases or claim another file", async (t) => {
  const deployed = seed([file("Alice", { github: "AliceOwner" })]), old = deployed.catalog.entries[0];
  for (const [name, mutate] of [
    ["owner transfer", () => entry("Alice", { github: "Mallory" }, old.blob)],
    ["case-insensitive handle collision", () => entry("alice")],
    ["owner alias collision", () => entry("Bob", { github: "ALICEOWNER" })],
    ["owner used as handle", () => entry("AliceOwner")],
    ["path traversal", () => ({ ...entry("Bob"), path: "src/characters/../Bob.js" })],
    ["manual lane", () => ({ ...entry("Bob"), lane: "manual" })],
    ["wrong source digest", () => ({ ...entry("Bob"), hash: "0".repeat(64) })],
    ["wrong blob digest", () => ({ ...entry("Bob"), blob: "0".repeat(40) })]
  ]) await t.test(name, () => assert.throws(() => plan(deployed.catalog, bundle([mutate()]))));
  assert.throws(() => plan(deployed.catalog, bundle([entry("Bob"), entry("Bob")])));
  const alias = plan(deployed.catalog, bundle([entry("NewArt", { github: "NewOwner" })]));
  assert.equal(alias.catalog.entries.find((row) => row.identity.handle === "NewArt").identity.github, "NewOwner");
});

test("source text is parsed as bounded data and never executed", async (t) => {
  for (const suffix of ["\nthrow new Error('must not execute');", "\nglobalThis.catalogProbe = true;", "\nimport('node:fs');"]) {
    await t.test(suffix.trim(), () => {
      const row = entry("Bob"), text = row.source + suffix;
      assert.throws(() => plan(seed().catalog, bundle([{ ...row, source: text, hash: digest(text), blob: blobSha(text) }])));
    });
  }
  assert.equal(globalThis.catalogProbe, undefined);
  const oversized = entry("Bob"), text = oversized.source + " ".repeat(32769);
  assert.throws(() => plan(seed().catalog, bundle([{ ...oversized, source: text, hash: digest(text), blob: blobSha(text) }])));
});

test("catalog and identity capacity is bounded before activation", () => {
  const full = seed(Array.from({ length: 128 }, (_, i) => file(`Player-${i}`)));
  assert.equal(full.catalog.entries.length, 128);
  assert.throws(() => plan(full.catalog, bundle([entry("Overflow")])));
  assert.throws(() => seed(Array.from({ length: 129 }, (_, i) => file(`Player-${i}`))));
  assert.throws(() => seed([file("Alice"), file("Bob", { github: "alice" })]));
});

test("activation requires the matching environment, engine, baseline and current generation", () => {
  const initial = seed(), pointer = activate(initial.catalog), next = plan(initial.catalog, bundle([entry("Bob")]), pointer);
  assert.equal(pointer.generation, 1); assert.equal(pointer.revision, initial.digest);
  const advanced = activate(next.catalog, pointer);
  assert.equal(advanced.generation, 2); assert.equal(advanced.revision, next.digest);
  assert.throws(() => activate(next.catalog, pointer, { expectedGeneration: 0 }));
  assert.throws(() => plan(initial.catalog, bundle([entry("Bob")]), pointer, { environment: "staging" }));
  assert.throws(() => plan(initial.catalog, bundle([entry("Bob")]), pointer, { engine: "unreleased-engine" }));
  assert.throws(() => plan(initial.catalog, bundle([entry("Bob")]), advanced));
  assert.throws(() => activate(seed(undefined, { environment: "staging" }).catalog, pointer));
  assert.throws(() => activate(seed(undefined, { engine: "unreleased-engine" }).catalog, pointer));
  assert.throws(() => activate(seed(undefined, { baseline: "9".repeat(40) }).catalog, pointer));
  const unrecorded = structuredClone(initial.catalog); unrecorded.entries[0].row.look.hair = "#abcdef";
  assert.throws(() => activate(unrecorded, pointer), "changed content requires a new publication event");
});

test("rollback increments activation and preserves event consumption against delayed retries", () => {
  const original = seed(), firstPointer = activate(original.catalog), event = bundle([entry("Bob")]);
  const updated = plan(original.catalog, event, firstPointer), secondPointer = activate(updated.catalog, firstPointer);
  const rollback = activate(original.catalog, secondPointer, { rollback: true });
  assert.equal(rollback.generation, 3); assert.equal(rollback.revision, original.digest);
  assert.equal(rollback.previous, updated.digest);
  const replay = plan(original.catalog, event, rollback);
  assert.equal(replay.noop, true); assert.equal(replay.digest, original.digest);
  const neverPublished = plan(original.catalog, bundle([entry("Carol")], "6".repeat(40)), firstPointer);
  assert.throws(() => activate(neverPublished.catalog, rollback, { rollback: true }));
  assert.throws(() => activate(original.catalog, secondPointer), "a backwards release requires an explicit rollback");
});

test("stored catalogs reject corrupted, unsupported and malformed records before use", async (t) => {
  const good = seed();
  for (const [name, mutate] of [
    ["unsupported schema", (row) => { row.version = 99; }],
    ["unknown top-level field", (row) => { row.executable = "alert(1)"; }],
    ["unknown entry field", (row) => { row.entries[0].dress = "code"; }],
    ["duplicate character", (row) => { row.entries.push(structuredClone(row.entries[0])); }],
    ["invalid declared identity", (row) => { row.entries[0].identity.handle = "../Alice"; }],
    ["row/identity disagreement", (row) => { row.entries[0].row.handle = "Mallory"; }],
    ["out-of-range appearance", (row) => { row.entries[0].row.look.height = 10; }],
    ["malformed digest", (row) => { row.entries[0].hash = "invalid"; }],
    ["excess event history", (row) => { row.events = Array.from({ length: 513 }, (_, i) => ({ merge: i.toString(16).padStart(40, "0"), hash: "0".repeat(64) })); }]
  ]) await t.test(name, () => { const row = structuredClone(good.catalog); mutate(row); assert.throws(() => encodeCatalog(row, { now: NOW })); });
  for (const text of ["{", "null", "[]", '{"__proto__":{"polluted":true}}']) assert.throws(() => readCatalog(text, { now: NOW }));
});

test("catalog storage requires one canonical spelling, including duplicate-key rejection", () => {
  const good = seed();
  assert.equal(readCatalog(good.json, { now: NOW }).digest, good.digest);
  for (const text of [good.json.trimEnd(), ` ${good.json}`, JSON.stringify(good.catalog, null, 2) + "\n",
    good.json.replace('"version":1', '"version":1,"version":1')]) {
    assert.throws(() => readCatalog(text, { now: NOW }), /canonical/);
  }
});

test("catalog encoding rejects accessors and custom iterators without calling them", () => {
  let calls = 0;
  const getter = structuredClone(seed().catalog);
  Object.defineProperty(getter.entries[0].row.look, "hair", { enumerable: true, get() { calls++; return "#000000"; } });
  assert.throws(() => encodeCatalog(getter, { now: NOW }));
  assert.equal(calls, 0);
  const arrayGetter = structuredClone(seed().catalog);
  Object.defineProperty(arrayGetter.entries, "0", { enumerable: true, get() { calls++; return null; } });
  assert.throws(() => encodeCatalog(arrayGetter, { now: NOW }));
  assert.equal(calls, 0);
  const iterator = structuredClone(seed().catalog);
  iterator.entries[Symbol.iterator] = function* () { calls++; };
  assert.throws(() => encodeCatalog(iterator, { now: NOW }));
  assert.equal(calls, 0);
});
