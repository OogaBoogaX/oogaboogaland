// Real writer snapshots cross the classic-script boot boundary without evaluating remote source code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { seedCatalog, encodeCatalog } from "../../scripts/character-catalog.mjs";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { catalogBaseline, catalogContinuation, catalogPageAttributes } from "../../scripts/character-catalog-build.mjs";
import { externalizeModules, externalizePage } from "../../scripts/distribution-modules.mjs";
import { catalogRoster } from "../src/character-catalog-schema.js";

const ENGINE = "island-character-data-v1", BASELINE = "1".repeat(40), NOW = Date.parse("2026-11-20T16:00:00Z");
const hash = (value, type = "sha256", encoding = "hex") => createHash(type).update(value).digest(encoding);
const file = (handle, extra = {}, kind = "data") => {
  const source = kind === "data" ? safeCharacterSource({ handle, joined: 1790000000, lastCommit: 1790000000,
    look: { hair: "#123456" }, ...extra }) : '(() => { const BL = window.BL; BL.characters.add({ handle: "Artist", github: "Painter", joined: 1780000000, lastCommit: 1790000000, dress: { extras() { return 42; } } }); })();';
  return { path: `src/characters/${handle}.js`, source, kind, blob: hash(`blob ${Buffer.byteLength(source)}\0${source}`, "sha1") };
};
const compiled = [file("Alice"), file("Artist", {}, "custom")];
const seed = (sources = compiled) => seedCatalog({ environment: "production", engine: ENGINE, baseline: BASELINE, sources, now: NOW });
const metadata = () => ({ workerPage: "1", characterCatalogBaseline: BASELINE, characterCatalogEngine: ENGINE, characterCatalogEnvironment: "production" });
const response = (snapshot) => Response.json({ revision: snapshot.digest, generation: 2, catalog: snapshot.catalog });
const changed = () => seed([file("Alice", { look: { hair: "#abcdef" } }), compiled[1], file("NewArt", { github: "NewOwner", joined: 1791000000 })]);
const js = (name) => readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), "utf8");
const fixture = (options = {}) => {
  const calls = [], ctx = vm.createContext({ document: { documentElement: { dataset: options.dataset ?? metadata() } },
    location: { protocol: options.protocol || "https:", search: options.search || "" }, URLSearchParams,
    TextEncoder, TextDecoder, crypto: webcrypto, AbortController, setTimeout: options.setTimeout || setTimeout, clearTimeout,
    fetch: async (...args) => { calls.push(args); return options.fetch ? options.fetch(...args) : response(changed()); } });
  vm.runInContext("window = globalThis", ctx);
  for (const name of ["character-catalog-schema", "characters"]) vm.runInContext(js(name), ctx);
  for (const entry of compiled) vm.runInContext(entry.source, ctx);
  vm.runInContext("originalArtist = BL.characters.get('Artist'); originalAlice = BL.characters.get('Alice')", ctx);
  vm.runInContext(js("character-catalog"), ctx);
  const records = seed().catalog.entries.map(({ path, kind, hash, blob, identity }) => ({ path, kind, hash, blob, identity }));
  vm.runInContext(`BL.characterCatalog.configure(${JSON.stringify(records)})`, ctx);
  return { ctx, calls, run: (code) => vm.runInContext(code, ctx), start: () => vm.runInContext("BL.characterCatalog.start(() => { booted = true; seen = BL.characters.all().map(c => c.handle); })", ctx) };
};
const unchanged = (f) => {
  assert.equal(f.run("BL.characters.get('Alice') === originalAlice && BL.characters.get('Artist') === originalArtist"), true);
  assert.equal(f.run("BL.characters.all().length"), 2); assert.equal(f.ctx.booted, true);
};

test("source, offline studio and unconfigured deployed pages retain synchronous embedded boot", () => {
  for (const options of [{ dataset: {} }, { dataset: { workerPage: "1" } }, { protocol: "file:" },
    { search: "?scene=studio&net=0" }, { search: "?scene=studio&nosim" }, { search: "?nosim" }, { search: "?net=0" }]) {
    const f = fixture(options); f.start(); unchanged(f); assert.equal(f.calls.length, 0);
    assert.equal(f.run("BL.characterCatalog.current.status"), "embedded");
  }
  const partial = fixture({ dataset: { workerPage: "1", characterCatalogBaseline: BASELINE } });
  partial.start(); unchanged(partial); assert.equal(partial.calls.length, 0);
  assert.equal(partial.run("BL.characterCatalog.current.status"), "incompatible");
});

test("hosted island and studio boot apply the entire catalog before consumers and pin custom hooks and NPC order", async () => {
  for (const search of ["", "?scene=studio"]) {
  const f = fixture({ search }), waiting = f.start(); assert.equal(f.ctx.booted, undefined); await waiting;
  assert.deepEqual([...f.ctx.seen], ["Artist", "Alice", "NewArt"]);
  assert.equal(f.run("BL.characters.get('Alice').look.hair"), "#abcdef");
  assert.equal(f.run("BL.characters.get('Artist') === originalArtist"), true);
  assert.equal(f.run("BL.characters.get('Painter').dress.extras()"), 42);
  assert.equal(f.run("BL.characters.ownedBy('NewOwner').handle"), "NewArt");
  assert.equal(f.run("BL.characterCatalog.current.revision"), changed().digest);
  assert.equal(f.run("BL.characterCatalog.current.roster"), await catalogRoster(ENGINE, BASELINE, ["Artist", "Alice", "NewArt"]));
  assert.equal(f.calls[0][0], `/api/characters/catalog?baseline=${BASELINE}&engine=${ENGINE}`);
  assert.equal(f.calls[0][1].credentials, "omit"); assert.equal(f.calls[0][1].redirect, "error");
  await f.start(); assert.equal(f.calls.length, 1, "a page never changes its catalog after boot");
  }
});

test("invalid authority and incompatible custom code leave both registry indices unchanged", async () => {
  const mutations = [
    (c) => { c.environment = "staging"; }, (c) => { c.baseline = "2".repeat(40); },
    (c) => { c.entries = c.entries.filter((e) => e.kind !== "custom"); },
    (c) => { c.entries.find((e) => e.kind === "custom").hash = "a".repeat(64); },
    (c) => { c.entries[0].identity.github = "Other"; c.entries[0].row.github = "Other"; }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(changed().catalog); mutate(value);
    const snapshot = encodeCatalog(value, { now: NOW }), f = fixture({ fetch: () => response(snapshot) });
    await f.start(); unchanged(f); assert.notEqual(f.run("BL.characterCatalog.current.status"), "ready");
  }
  const sources = [file("Alice"), file("Artist", { github: "Painter" })];
  const f = fixture({ fetch: () => response(seed(sources)) }); await f.start(); unchanged(f);
});

test("bounded response validation rejects tampering, malformed data and outages without console failures", async () => {
  const valid = { revision: changed().digest, generation: 2, catalog: changed().catalog };
  for (const fetch of [
    () => new Response("{}", { status: 503 }), () => new Response("{}", { status: 409 }),
    () => Response.json({ ...valid, revision: "f".repeat(64) }),
    () => Response.json({ ...valid, generation: 0 }), () => Response.json({ ...valid, ignored: true }),
    () => Response.json({ ...valid, catalog: { ...valid.catalog, code: "alert(1)" } }),
    () => new Response('{"catalog":'), () => new Response("{}", { headers: { "content-length": 3 * 1024 * 1024 } }),
    () => new Response(" ".repeat(2 * 1024 * 1024 + 2048)), () => { throw new Error("offline"); }
  ]) {
    const f = fixture({ fetch }); await f.start(); unchanged(f);
    assert.ok(["unavailable", "incompatible"].includes(f.run("BL.characterCatalog.current.status")));
  }
  const disabled = fixture({ fetch: () => new Response("{}", { status: 404 }) });
  await disabled.start(); unchanged(disabled); assert.equal(disabled.run("BL.characterCatalog.current.status"), "embedded");
});

test("a timed-out download cannot replace the cast when its promise eventually resolves", async () => {
  let timeout, resolve;
  const f = fixture({ setTimeout: (fn) => { timeout = fn; return 1; }, fetch: () => new Promise((done) => { resolve = done; }) });
  const waiting = f.start(); timeout(); await waiting; unchanged(f);
  resolve(response(changed())); await new Promise((done) => setTimeout(done, 20)); unchanged(f);
  assert.equal(f.run("BL.characterCatalog.current.status"), "unavailable");
});

test("build identity uses exact source bytes without executing custom code and metadata is explicit", () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-browser-"));
  try {
    mkdirSync(join(root, "src/characters"), { recursive: true });
    for (const entry of compiled) writeFileSync(join(root, entry.path), entry.source);
    const entries = catalogBaseline(root), expected = seed().catalog.entries;
    for (let i = 0; i < entries.length; i++) {
      assert.equal(entries[i].hash, expected[i].hash); assert.equal(entries[i].blob, expected[i].blob);
      assert.equal(entries[i].kind, expected[i].kind); assert.deepEqual(entries[i].identity, expected[i].identity);
    }
    assert.equal(catalogPageAttributes({}), "");
    assert.throws(() => catalogPageAttributes({ CHARACTER_CATALOG_BASELINE: BASELINE }));
    const env = { CHARACTER_CATALOG_BASELINE: BASELINE, CHARACTER_CATALOG_ENGINE: ENGINE, CHARACTER_CATALOG_ENVIRONMENT: "production" };
    assert.match(catalogPageAttributes(env), /data-character-catalog-environment="production"/);
    assert.throws(() => catalogPageAttributes({ ...env, CHARACTER_CATALOG_ENGINE: "unknown" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("continuation preserves strict CSP and the opt-in report build hash across hosted asynchronous boot", async () => {
  const out = mkdtempSync(join(tmpdir(), "catalog-distribution-"));
  try {
    const blocks = { "js/characters.gen.js": "window.order.push('compiled');",
      "js/character-catalog.js": "window.BL.characterCatalog={configure(){},start(fn){window.resume=fn;}};",
      "js/deferred.js": "window.order.push('deferred');", "js/contributors.js": "window.order.push('contributors'); window.BL.net=window.net;",
      "js/connection-reports.js": js("connection-reports") };
    const sources = Object.keys(blocks), block = (path) => `// ${path}\n${blocks[path]}`;
    const script = `\nwindow.BL={};window.order=[];\n${catalogContinuation(sources, block, [])}\n`, css = "body{}";
    const html = `<meta content="script-src 'sha256-${hash(script, "sha256", "base64")}'; style-src 'sha256-${hash(css, "sha256", "base64")}'"><style>${css}</style><script>${script}</script>`;
    const hosted = externalizePage(externalizeModules(html, out, new Map([["later", ["js/deferred.js"]]]), block), out, block);
    assert.ok(!hosted.includes("unsafe-inline") && !hosted.includes("unsafe-eval") && !hosted.includes("<script>"));
    assert.match(hosted, /script-src 'self'/);
    const main = readdirSync(join(out, "js")).find((name) => name.startsWith("main-"));
    const requests = [], timers = new Map(), input = { checked: false, addEventListener: (_kind, fn) => { input.change = fn; } };
    const elements = { "players-diagnostics": {}, "players-diagnostics-input": input, "players-diagnostics-status": {} };
    let observer = null, serial = 0;
    const ctx = vm.createContext({ document: { currentScript: { src: `https://site.test/js/${main}?private-query` }, getElementById: (id) => elements[id] },
      net: { state: { backend: true, connectionReports: true, me: { id: 71 }, room: "live" }, subscribe() {},
        subscribeConnection: (fn) => { observer = fn; return () => { observer = null; }; } },
      localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 1000 }, AbortController,
      addEventListener() {}, removeEventListener() {},
      setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }, clearTimeout: (id) => timers.delete(id),
      fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: true, status: 201 }; } });
    vm.runInContext("window=globalThis", ctx);
    vm.runInContext(readFileSync(join(out, "js", main), "utf8"), ctx);
    assert.deepEqual([...ctx.order], ["compiled"]);
    ctx.document.currentScript = null;
    await Promise.resolve().then(() => ctx.resume());
    assert.deepEqual([...ctx.order], ["compiled", "contributors"]);
    assert.equal(observer, null); assert.equal(requests.length, 0); assert.equal(timers.size, 0, "boot never opts into diagnostics");
    input.checked = true; input.change();
    observer({ kind: "socket-close", room: "live", code: 1006, clean: false });
    const [timer, pending] = [...timers].find(([, value]) => value.ms === 2000);
    timers.delete(timer); await pending.fn();
    assert.equal(requests.length, 1); assert.equal(requests[0].url, "/api/connection-reports");
    const report = JSON.parse(requests[0].body);
    assert.equal(report.clientBuild, main.slice(5, -3)); assert.equal(report.consent, true);
    assert.ok(!requests[0].body.includes("private-query") && !requests[0].body.includes("https://site.test"));
    assert.throws(() => catalogContinuation(["js/contributors.js"], block, []));
  } finally { rmSync(out, { recursive: true, force: true }); }
});
