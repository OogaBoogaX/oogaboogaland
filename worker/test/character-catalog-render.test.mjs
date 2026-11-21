import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { prepareCatalogRenderer, portraitResponse, portraitResult, portraitConsoleError, rendererArguments, renderCatalog } from "../../scripts/character-catalog-render.mjs";
import { seedCatalog, encodeCatalog } from "../../scripts/character-catalog.mjs";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { encode } from "../../scripts/distribution-icons.mjs";

const engine = "island-character-data-v1", baseline = "1".repeat(40), hash = (v) => createHash("sha256").update(v).digest("hex");
const source = (handle, extra = {}) => safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000, ...extra });
const file = (handle, source, kind = "data") => ({ path: `src/characters/${handle}.js`, source, kind,
  blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex") });
const seed = (sources) => seedCatalog({ environment: "production", engine, baseline, sources });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-render-"));
  mkdirSync(join(root, "src/characters"), { recursive: true }); mkdirSync(join(root, "src/js"));
  const files = [file("Alice", source("Alice")), file("Artist", '(() => { const BL = window.BL; BL.characters.add({ handle: "Artist", github: "Painter", joined: 1780000000, lastCommit: 1790000000, dress: { extras() { return "approved hook"; } } }); })();', "custom")];
  for (const f of files) writeFileSync(join(root, f.path), f.source);
  writeFileSync(join(root, "src/index.html"), '<meta content="connect-src \'self\' https: wss:;"><script src="js/characters.gen.js"></script><script src="js/contributors.js"></script>');
  const updated = seed([file("Alice", source("Alice", { look: { hair: "#abcdef" } })), files[1], file("NewArt", source("NewArt", { github: "NewOwner" }))]);
  return { root, files, updated, close: () => rmSync(root, { recursive: true, force: true }) };
};

test("portrait preparation overlays validated rows before contributors and executes only baseline custom hooks", () => {
  const f = fixture();
  try {
    const prepared = prepareCatalogRenderer(f.root, f.updated.json);
    const ctx = vm.createContext({}); vm.runInContext("window=globalThis", ctx);
    vm.runInContext(readFileSync(new URL("../../src/js/characters.js", import.meta.url), "utf8"), ctx);
    vm.runInContext(prepared.script, ctx);
    assert.equal(vm.runInContext("BL.characters.get('Alice').look.hair", ctx), "#abcdef");
    assert.equal(vm.runInContext("BL.characters.get('Artist').dress.extras()", ctx), "approved hook");
    assert.deepEqual(prepared.names, ["Alice", "Artist", "NewArt"]);
    assert.match(prepared.html, /connect-src 'none';/);
    assert.equal(readFileSync(join(f.root, "src/characters/Alice.js"), "utf8"), f.files[0].source);
  } finally { f.close(); }
});

test("renderer refuses missing owners, changed custom code and extra source-bearing catalog fields", () => {
  const f = fixture();
  try {
    for (const mutate of [
      (c) => { c.entries = c.entries.filter((e) => e.identity.handle !== "Alice"); },
      (c) => { c.entries[1].hash = "f".repeat(64); },
      (c) => { c.entries[0].identity.github = "Other"; c.entries[0].row.github = "Other"; },
      (c) => { c.engine = "unapproved"; }
    ]) {
      const catalog = structuredClone(f.updated.catalog); mutate(catalog);
      assert.throws(() => prepareCatalogRenderer(f.root, encodeCatalog(catalog).json));
    }
    const executable = structuredClone(f.updated.catalog); executable.entries[0].source = "globalThis.executed=true";
    assert.throws(() => prepareCatalogRenderer(f.root, JSON.stringify(executable)));
    writeFileSync(join(f.root, "src/characters/Artist.js"), f.files[1].source + "\n// changed code");
    assert.throws(() => prepareCatalogRenderer(f.root, f.updated.json));
  } finally { f.close(); }
});

test("portrait server binds exact host and regular files inside the approved source root", () => {
  const f = fixture(), host = "127.0.0.1:4567";
  try {
    const prepared = prepareCatalogRenderer(f.root, f.updated.json);
    const get = (url, extra = {}) => portraitResponse(prepared, { method: "GET", host, url, ...extra }, host);
    assert.equal(get("/js/characters.gen.js").body, prepared.script);
    assert.equal(get("/", { method: "HEAD" }).body, "");
    assert.equal(get("/", { host: "attacker.example" }).status, 403);
    assert.equal(get("/", { method: "POST" }).status, 405);
    writeFileSync(join(f.root, "secret.js"), "do not serve");
    symlinkSync(join(f.root, "secret.js"), join(f.root, "src/js/escape.js"));
    for (const path of ["/../secret.js", "/%2e%2e%2fsecret.js", "/js/escape.js", "/js/", "/%00.js"]) assert.equal(get(path).status, 404);
    assert.equal(get("//attacker.example/").status, 400);
    symlinkSync(join(f.root, "secret.js"), join(f.root, "src/characters/escape.js"));
    assert.throws(() => prepareCatalogRenderer(f.root, f.updated.json));
  } finally { f.close(); }
});

test("renderer result binds canonical cells to the actual PNG hash and bounds dimensions and bytes", () => {
  const f = fixture();
  try {
    const prepared = prepareCatalogRenderer(f.root, f.updated.json), png = encode(640, 80, Buffer.alloc(640 * 80 * 4));
    const output = { names: prepared.names, png: `data:image/png;base64,${png.toString("base64")}` };
    const { manifest } = portraitResult(prepared, output);
    assert.equal(manifest.image, hash(png)); assert.equal(manifest.revision, f.updated.digest);
    assert.deepEqual(manifest.cells, { alice: 0, artist: 1, newart: 2 }); assert.equal(manifest.fallback, 3);
    assert.throws(() => portraitResult(prepared, { ...output, names: ["Artist", "Alice", "NewArt"] }));
    assert.throws(() => portraitResult(prepared, { ...output, png: "data:image/png;base64," + "a".repeat(3 * 1024 * 1024) }));
    const wrong = encode(640, 160, Buffer.alloc(640 * 160 * 4));
    assert.throws(() => portraitResult(prepared, { ...output, png: `data:image/png;base64,${wrong.toString("base64")}` }));
  } finally { f.close(); }
});

test("renderer CLI requires explicit inputs and cannot write artifacts into the approved checkout", async () => {
  for (const args of [[], ["--baseline-dir", "/tmp"], ["--baseline-dir", "--catalog"], ["--unknown", "x"], ["--output", "a", "--output", "b"]]) assert.throws(() => rendererArguments(args));
  const f = fixture();
  try {
    const input = join(f.root, "catalog.json"); writeFileSync(input, f.updated.json);
    await assert.rejects(renderCatalog({ baselineDir: f.root, catalogFile: input, output: join(f.root, "art") }), /outside/);
    const result = rendererArguments(["--baseline-dir", f.root, "--catalog", input, "--output", "/tmp/catalog-portraits-test"]);
    assert.equal(result.catalogFile, input);
  } finally { f.close(); }
});

test("console failures retain bounded actionable diagnostics without allowing warnings", () => {
  const logs = ["[log.warning] blocked by content policy\u001b[31m", ...Array(20).fill("x".repeat(1000))];
  const error = portraitConsoleError(logs, "after drawing");
  assert.ok(error instanceof Error);
  assert.match(error.message, /after drawing \(21 entries\)/);
  assert.match(error.message, /blocked by content policy/);
  assert.equal(error.message.includes("\u001b"), false);
  assert.equal(error.message.split("\n").length, 9);
  assert.ok(error.message.length < 4100);
  assert.equal(logs.length, 21);
});
