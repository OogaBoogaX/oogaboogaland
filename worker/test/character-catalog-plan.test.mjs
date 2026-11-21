// The operator CLI emits reviewable plans. It neither discovers a checkout nor writes a release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { runCatalogPlan } from "../../scripts/character-catalog-plan.mjs";
import { CATALOG_MAX_BYTES, readCatalog } from "../../scripts/character-catalog.mjs";

const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "character-catalog-plan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = safeCharacterSource({ handle: "Alice", joined: 1790000000, lastCommit: 1790000000 });
  const blob = createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex");
  const input = { environment: "production", engine: "characters-v1", baseline: "1".repeat(40),
    sources: [{ path: "src/characters/Alice.js", kind: "data", source, blob }] };
  const put = (name, contents) => { const path = join(dir, name); writeFileSync(path, contents); return path; };
  return { dir, input, put, seed: put("baseline.json", JSON.stringify(input)) };
};

test("CLI seeds only explicitly supplied sources and proposes activation without writing it", async (t) => {
  const f = fixture(t), initial = readdirSync(f.dir), bytes = readFileSync(f.seed);
  const output = await runCatalogPlan(["seed", f.seed], {}), result = readCatalog(output);
  assert.equal(result.catalog.entries.length, 1); assert.equal(result.catalog.entries[0].identity.handle, "Alice");
  assert.deepEqual(readdirSync(f.dir), initial); assert.deepEqual(readFileSync(f.seed), bytes);
  const catalogPath = f.put("catalog.json", output), before = readdirSync(f.dir);
  const metadata = JSON.parse(await runCatalogPlan(["verify", catalogPath], {}));
  assert.equal(metadata.revision, result.digest); assert.equal(metadata.characters, 1); assert.equal(metadata.events, 0);
  const pointer = JSON.parse(await runCatalogPlan(["activate", catalogPath, "--expected-generation", "0"], {}));
  assert.equal(pointer.revision, result.digest); assert.equal(pointer.generation, 1);
  assert.deepEqual(readdirSync(f.dir), before); assert.equal(readFileSync(catalogPath, "utf8"), output);
  const pointerPath = f.put("activation.json", JSON.stringify(pointer));
  const duplicate = JSON.parse(await runCatalogPlan(["activate", catalogPath, pointerPath, "--expected-generation", "1"], {}));
  assert.deepEqual(duplicate, pointer);
  await assert.rejects(runCatalogPlan(["activate", catalogPath, pointerPath, "--expected-generation", "0"], {}));
});

test("CLI refuses implicit discovery, unknown options and ambiguous generation values", async (t) => {
  const f = fixture(t), output = await runCatalogPlan(["seed", f.seed], {}), catalog = f.put("catalog.json", output);
  for (const args of [[], ["seed"], ["seed", f.seed, "extra"], ["seed", f.seed, "--deploy"], ["publish", catalog],
    ["activate", catalog], ["activate", catalog, "--expected-generation"],
    ["activate", catalog, "--expected-generation", "0", "--expected-generation", "0"],
    ["verify", catalog, "--rollback"], ["plan", catalog],
    ...["-1", "01", "1.0", "1e2", "9007199254740992"].map((generation) => ["activate", catalog, "--expected-generation", generation])]) {
    await assert.rejects(runCatalogPlan(args, {}), undefined, args.join(" "));
  }
  assert.match(await runCatalogPlan(["--help"], {}), /never publishes/);
  const invalid = f.put("invalid-baseline.json", JSON.stringify({ ...f.input, directory: "src/characters" }));
  await assert.rejects(runCatalogPlan(["seed", invalid], {}));
});

test("CLI validates file size and UTF-8 before parsing operator inputs", async (t) => {
  const f = fixture(t);
  const oversized = f.put("oversized.json", " ".repeat(CATALOG_MAX_BYTES + 1));
  await assert.rejects(runCatalogPlan(["verify", oversized], {}), /bounded|bound/);
  const largeSeed = f.put("large-seed.json", " ".repeat(16 * 1024 * 1024 + 1));
  await assert.rejects(runCatalogPlan(["seed", largeSeed], {}), /bounded|bound/);
  const invalidUtf8 = f.put("invalid-utf8.json", Buffer.from([0x7b, 0xff, 0x7d]));
  await assert.rejects(runCatalogPlan(["seed", invalidUtf8], {}), /UTF-8/);
  await assert.rejects(runCatalogPlan(["seed", f.dir], {}), /bounded/);
});

test("CLI plans and local validation errors never echo environment credentials", async (t) => {
  const f = fixture(t), token = "fixture-secret-must-not-appear", env = { GH_TOKEN: token, GITHUB_TOKEN: token };
  const output = await runCatalogPlan(["seed", f.seed], env), path = f.put("catalog.json", output);
  assert.ok(!output.includes(token));
  assert.ok(!(await runCatalogPlan(["verify", path], env)).includes(token));
  const activation = f.put("activation.json", "{}");
  await assert.rejects(runCatalogPlan(["plan", path, activation, "--pr", "0", "--merge", "not-a-sha", "--bot", "not-a-bot"], env),
    (error) => !error.message.includes(token));
  await assert.rejects(runCatalogPlan(["plan", path, activation, "--pr", "1", "--merge", "2".repeat(40), "--bot", "catalog[bot]"], {}),
    (error) => /token/.test(error.message) && !error.message.includes(token));
});
