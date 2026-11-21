import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compileFunction, runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { encode } from "../../scripts/distribution-icons.mjs";
import { createPortraitManifest, validatePortraitManifest, pngDimensions } from "../src/character-portraits-format.js";
import * as schema from "../src/character-catalog-schema.js";
import { handlePublic, contributorsSnapshot, forgetPublic } from "../chat/src/public.js";
import { allowed, clientIp } from "../src/http.js";

const revision = "a".repeat(64), baseline = "b".repeat(40), hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = { baseline, engine: "island-character-data-v1", environment: "staging", entries: [{ identity: { handle: "Zoe" } }, { identity: { handle: "Alice" } }] };
const png = encode(640, 80, Buffer.alloc(640 * 80 * 4));
const manifest = createPortraitManifest(catalog, revision, hash(png));

test("portrait manifest binds sorted slots, fallback, dimensions and exact catalog", () => {
  assert.deepEqual(manifest.cells, { alice: 0, zoe: 1 });
  assert.equal(manifest.fallback, 2); assert.equal(manifest.rows, 1);
  assert.equal(validatePortraitManifest(manifest, catalog, revision), manifest);
  for (const change of [{ cells: { alice: 1, zoe: 0 } }, { fallback: 1 }, { environment: "production" }, { revision: "c".repeat(64) }, { url: "https://evil.invalid/x" }])
    assert.throws(() => validatePortraitManifest({ ...manifest, ...change }, catalog, revision));
  assert.deepEqual(pngDimensions(png), { width: 640, height: 80 });
  assert.throws(() => pngDimensions(png.subarray(0, 33)));
  const corrupted = Buffer.from(png); corrupted[40] ^= 1;
  assert.throws(() => pngDimensions(corrupted));
});

const portraitFixture = () => {
  const snapshot = { revision, baseline, catalog, activation: { releases: [revision] } };
  const store = new Map([[`portraits/${revision}/manifest.json`, Buffer.from(JSON.stringify(manifest))], [`portraits/${revision}/${manifest.image}.png`, png]]);
  const reads = [];
  const env = { CHARACTER_CATALOGS: { get: async (key) => {
    reads.push(key);
    const bytes = store.get(key);
    return bytes ? { size: bytes.length, body: new Response(bytes).body } : null;
  } } };
  const source = readFileSync(new URL("../src/character-portraits.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace(/export const /g, "const ");
  const deps = { ...schema, PORTRAIT_MAX_BYTES: 2 * 1024 * 1024, pngDimensions, validatePortraitManifest, allowed, clientIp,
    catalogFor: () => ({ enabled: true, read: async () => snapshot }) };
  const api = compileFunction(source + "\nreturn { handleCharacterPortrait, portraitsFor };", Object.keys(deps))(...Object.values(deps));
  const request = (method = "GET", headers = {}) => new Request(`https://island.invalid/api/characters/portraits/${revision}/${manifest.image}.png`, { method, headers });
  return { ...api, env, snapshot, store, request, reads };
};

test("portrait reads serve only validated published bytes and never cache failures", async () => {
  const f = portraitFixture();
  assert.deepEqual(await f.portraitsFor(f.env, f.snapshot), manifest);
  const result = await f.handleCharacterPortrait(f.request(), f.env);
  assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), "image/png");
  assert.match(result.headers.get("cache-control"), /immutable/);
  assert.equal(hash(Buffer.from(await result.arrayBuffer())), manifest.image);
  assert.equal((await f.handleCharacterPortrait(f.request("GET", { "if-none-match": `"${manifest.image}"` }), f.env)).status, 304);
  assert.equal(await (await f.handleCharacterPortrait(f.request("HEAD"), f.env)).text(), "");
  f.store.set(`portraits/${revision}/${manifest.image}.png`, Buffer.from("broken"));
  const failed = await f.handleCharacterPortrait(f.request(), f.env);
  assert.equal(failed.status, 503); assert.equal(failed.headers.get("cache-control"), "no-store");
});

test("Chat portrait proxy strips credentials and binds environment and immutable path", async () => {
  let observed;
  const env = { ENVIRONMENT: "staging", OBL: { fetch: async (request) => { observed = request; return new Response("png"); } } };
  const request = new Request(`https://chat.invalid/api/chat/public/portraits/${revision}/${manifest.image}.png`, {
    headers: { cookie: "private=secret", authorization: "Bearer secret", "x-ooga-chat-environment": "production" }
  });
  const response = await handlePublic(request, env, new URL(request.url), {});
  assert.equal(await response.text(), "png");
  assert.equal(observed.headers.get("x-ooga-chat-environment"), "staging");
  assert.equal(observed.headers.get("cookie"), null); assert.equal(observed.headers.get("authorization"), null);
  assert.equal(new URL(observed.url).pathname, `/portraits/${revision}/${manifest.image}.png`);
});

test("validated portrait cache preserves HEAD and conditional reads and limits only public misses", async () => {
  const f = portraitFixture(), cached = new Map(), limited = [];
  const deps = { cache: { match: async (key) => cached.get(key)?.clone(), put: async (key, value) => { cached.set(key, value); } } };
  f.env.AVATAR_LIMITER = { limit: async ({ key }) => { limited.push(key); return { success: limited.length === 1 }; } };
  const request = (method = "GET", headers = {}) => f.request(method, { "cf-connecting-ip": "192.0.2.10", ...headers });
  const serve = (request) => f.handleCharacterPortrait(request, f.env, undefined, deps);
  assert.equal((await serve(request())).status, 200); assert.equal(f.reads.length, 2);
  assert.equal((await serve(new Request(request().url + "?cache-bust=ignored", request()))).status, 200);
  assert.equal((await serve(request("HEAD"))).body, null);
  assert.equal((await serve(request("GET", { "if-none-match": `"${manifest.image}"` }))).status, 304);
  assert.equal(f.reads.length, 2); assert.deepEqual(limited, ["portraits:192.0.2.10"]);
  f.snapshot.activation.releases = [];
  assert.equal((await serve(request())).status, 404, "cache never bypasses the active release allowlist");
  f.snapshot.activation.releases = [revision]; cached.clear();
  assert.equal((await serve(request())).status, 429); assert.equal(f.reads.length, 2);
  assert.equal((await serve(f.request())).status, 200, "private bridge calls are limited by the Chat edge");
  assert.equal(limited.length, 2);
});

test("concurrent Chat public reads cannot mix casts or portrait revisions across environments", async () => {
  forgetPublic(); let release;
  const first = new Promise((resolve) => { release = resolve; });
  const row = (name) => ({ ok: true, result: { rows: [{ handle: name }], revision: name, catalogRevision: name, catalogGeneration: 1, portraits: { revision: name } } });
  const production = { ENVIRONMENT: "production", OBL: { call: () => first } };
  const staging = { ENVIRONMENT: "staging", OBL: { call: async () => row("staging") } };
  const now = Date.now(), fetcher = async () => Response.json({ meta: { org: "OogaBoogaX", schema_version: 3, generated_at: new Date(now).toISOString() }, contributors: [] });
  const waiting = contributorsSnapshot(production, { fetcher, now });
  assert.equal((await contributorsSnapshot(staging, { fetcher, now })).catalogRevision, "staging");
  release(row("production"));
  assert.equal((await waiting).catalogRevision, "production");
  assert.equal((await contributorsSnapshot(staging, { fetcher, now })).catalogRevision, "staging");
});

test("Chat client changes face index and sheet together, rejects malformed maps and older generations", () => {
  const window = { BL: { oogaChatFaces: { cells: { old: 0 }, size: 80, columns: 8, fallback: 1 } } };
  runInNewContext(readFileSync(new URL("../../src/ooga-chat/ooga-chat-portraits.js", import.meta.url), "utf8"), { window });
  const portraits = window.BL.oogaChatPortraits;
  const body = { cast: [{ handle: "Alice" }, { handle: "Zoe" }], portraits: manifest, catalogRevision: revision, catalogGeneration: 2 };
  assert.equal(portraits.apply(body), true); assert.equal(portraits.revision, revision);
  const second = "c".repeat(64), next = { ...body, catalogRevision: second, portraits: { ...manifest, revision: second } };
  assert.equal(portraits.apply({ ...next, catalogGeneration: 1 }), false);
  assert.equal(portraits.apply({ ...next, catalogGeneration: 2 }), false, "one generation cannot name two revisions");
  assert.equal(portraits.apply({ ...next, portraits: { ...next.portraits, cells: { alice: 0, wrong: 1 } } }), false);
  assert.equal(portraits.apply({ ...next, catalogGeneration: 3 }), true); assert.equal(portraits.revision, second);
});

const clientBody = (id = revision, generation = 2, handles = ["Alice", "Zoe"]) => ({
  cast: handles.map((handle) => ({ handle })), catalogRevision: id, catalogGeneration: generation,
  portraits: createPortraitManifest({ ...catalog, entries: handles.map((handle) => ({ identity: { handle } })) }, id, manifest.image)
});
const portraitClient = () => {
  const clock = { at: 1000000 }, images = [];
  class Image extends EventTarget {
    constructor() { super(); images.push(this); }
    load(width = 640, height = 80) { this.naturalWidth = width; this.naturalHeight = height; this.dispatchEvent(new Event("load")); }
    fail() { this.naturalWidth = 0; this.dispatchEvent(new Event("error")); }
  }
  const canvas = () => {
    const value = { getContext: () => ({ drawImage: (...args) => { value.drawn = args; } }),
      toDataURL: () => `${value.drawn[0].src}:${value.drawn[1]},${value.drawn[2]}` };
    return value;
  };
  const document = new EventTarget();
  document.createElement = canvas;
  const window = { BL: { oogaChatFaces: { cells: { alice: 0, zoe: 1 }, size: 80, columns: 8, fallback: 2 } } };
  const context = { window, document, Image, Date: { now: () => clock.at }, AbortController };
  runInNewContext(readFileSync(new URL("../../src/ooga-chat/ooga-chat-portraits.js", import.meta.url), "utf8"), context);
  return { clock, images, canvas, context, document, BL: window.BL, portraits: window.BL.oogaChatPortraits };
};
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("Chat retries a failed immutable atlas at a bounded cadence without needing another revision", () => {
  const f = portraitClient(), body = clientBody();
  f.portraits.apply(body);
  assert.equal(f.portraits.canvas("Alice"), null);
  assert.equal(f.images.length, 1);
  f.images[0].fail();
  for (let i = 0; i < 100; i++) { f.portraits.apply(body); f.portraits.canvas("Alice"); f.portraits.refresh(); }
  assert.equal(f.images.length, 1, "repaints and repeated same-revision metadata cannot flood the image endpoint");
  f.clock.at += 119999; f.portraits.apply(body); assert.equal(f.images.length, 1);
  f.clock.at++; f.portraits.apply(body); assert.equal(f.images.length, 2, "the Contributing Oogas metadata poll alone retries a failed image");
  assert.equal(f.images[1].src, f.images[0].src, "recovery retries the exact immutable URL");
  f.images[1].load();
  const face = f.portraits.canvas("Alice");
  assert.equal(face.drawn[0], f.images[1]); assert.equal(face.drawn[1], 0);
  f.clock.at += 120000; f.portraits.refresh();
  assert.equal(f.images.length, 2, "a good atlas is retained without polling its bytes");
});

test("a stalled contributors body stays inside the HTTP deadline and cannot block later portrait refreshes", async () => {
  const f = portraitClient(), timers = new Map();
  let serial = 0, requests = 0, stalled = true;
  Object.assign(f.context, {
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id)
  });
  f.BL.oogaChatConfig = {};
  runInNewContext(readFileSync(new URL("../../src/ooga-chat/ooga-chat-http.js", import.meta.url), "utf8"), f.context);
  const adapter = f.BL.oogaChatHttp.create({ fetch: async (path, init) => {
    requests++; assert.equal(path, "/api/chat/public/contributors");
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: () => stalled
      ? new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }))
      : Promise.resolve(clientBody()) };
  } });
  f.portraits.configure(() => adapter.contributors());
  f.portraits.refresh(); await drain();
  assert.equal(requests, 1); assert.equal(adapter.pending, 1, "receiving headers does not finish the bounded read");
  assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 8000);
  [...timers.values()][0].fn(); await drain();
  assert.equal(adapter.pending, 0); assert.equal(timers.size, 0); assert.equal(f.portraits.revision, "embedded");
  stalled = false; f.clock.at += 120000; f.portraits.refresh(); await drain();
  assert.equal(requests, 2); assert.equal(f.portraits.revision, revision, "the next refresh can adopt a complete answer");
  assert.equal(adapter.pending, 0); assert.equal(timers.size, 0);
  stalled = true; f.clock.at += 120000; f.portraits.refresh(); await drain();
  assert.equal(adapter.pending, 1);
  adapter.dispose(); await drain();
  assert.equal(adapter.pending, 0); assert.equal(timers.size, 0); assert.equal(f.portraits.revision, revision, "disposal keeps the last good metadata");
});

test("Chat keeps the last complete atlas through failed replacements and ignores superseded image loads", () => {
  const f = portraitClient();
  f.portraits.apply(clientBody()); f.portraits.canvas("Alice"); f.images[0].load();
  const original = f.portraits.canvas("Alice"), names = ["Aaron", "Alice", "Zoe"];
  f.portraits.apply(clientBody("c".repeat(64), 3, names));
  assert.equal(f.portraits.canvas("Alice"), original, "new slot order cannot be used with the old image");
  const superseded = f.images[1];
  f.portraits.apply(clientBody("d".repeat(64), 4, names));
  assert.equal(f.portraits.canvas("Alice"), original);
  superseded.load();
  assert.equal(f.portraits.canvas("Alice"), original, "a late image cannot undo the newer revision");
  f.images[2].load(640, 160);
  assert.equal(f.portraits.canvas("Alice"), original, "invalid dimensions preserve the last complete atlas");
  assert.equal(f.images.length, 3);
  f.clock.at += 120000; f.portraits.refresh(); f.images[3].load();
  const current = f.portraits.canvas("Alice"), fallback = f.portraits.canvas("Unknown");
  assert.notEqual(current, original); assert.equal(current.drawn[0], f.images[3]); assert.equal(current.drawn[1], 80);
  assert.equal(fallback.drawn[0], f.images[3]); assert.equal(fallback.drawn[1], 240);
});

test("a quiet Listen view refreshes cached faces and stops its polling while hidden, signed out or disposed", async () => {
  const f = portraitClient(), { document, BL } = f, timers = new Map(), frames = new Map(), observers = [], drawn = new Map();
  let serial = 0, calls = 0, answer = clientBody();
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this.hidden = false; this.ownerDocument = document; }
    append(...children) { for (const child of children) if (child && typeof child === "object") { child.parentElement = this; this.children.push(child); } }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    closest() { for (let node = this; node; node = node.parentElement) if (node.hidden) return node; return null; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
    focus() { document.activeElement = this; }
  }
  document.createElement = (tag) => tag === "canvas" ? f.canvas() : new Element(tag);
  document.body = new Element("body"); document.hidden = false;
  Object.assign(f.context, {
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    setInterval: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }, clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { const id = ++serial; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id)
  });
  const render = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const noop = () => {};
  BL.signGlyphs = { letter: noop }; BL.oogaChatAuth = { gates: () => ({ joinVoice: false }) };
  BL.audienceTiles = { create: () => {
    let people = [];
    const paint = (describe) => { for (const person of people) { const tile = {}; describe(person, tile); drawn.set(person.id, tile); } };
    return { draw(list, describe) { people = list; paint(describe); }, repaint: paint, pop: noop, dispose: noop };
  } };
  BL.oogaChatPortraits.configure(async () => { calls++; return answer; });
  runInNewContext(readFileSync(new URL("../../src/ooga-chat/ooga-chat-views.js", import.meta.url), "utf8"), f.context);
  const voice = { role: "listener", phase: "idle", talking: [] }, state = {
    mode: "live", boot: { features: {} }, auth: "signed-in", busy: null, device: { online: true }, zone: "main", voice,
    session: { identity: { principal: "listener", participant: "gh:1", display: "Listener", login: "listener" } },
    audience: { version: 1, status: "live", list: [{ id: "gh:2", display: "Alice", role: "speaker", source: "world", character: "Alice", muted: false }] }
  };
  const view = BL.oogaChatViews.chat({ actions: {}, media: { state: voice, available: true, VOLUME_MAX: 2, mutedLocally: () => false, mutedByDuel: () => false },
    reactions: { bars: { mount: noop, refresh: noop }, onPop: () => noop } });
  const panel = new Element("section"); document.body.append(panel); panel.append(view.node);
  view.update(state); await drain(); render();
  f.images.at(-1).load(); render();
  const original = drawn.get("gh:2").face;
  assert.ok(original.includes(revision)); assert.equal(calls, 1); assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 120000);
  for (let i = 0; i < 50; i++) view.update(state);
  assert.equal(timers.size, 1); assert.equal(calls, 1);
  answer = clientBody("e".repeat(64), 3, ["Aaron", "Alice", "Zoe"]); f.clock.at += 120000;
  for (const timer of timers.values()) timer.fn();
  await drain(); render();
  assert.equal(calls, 2, "no audience/voice update or Contributing Oogas visit was needed");
  assert.equal(drawn.get("gh:2").face, original, "cached face stays usable while the replacement loads");
  f.images.at(-1).load(); render();
  assert.notEqual(drawn.get("gh:2").face, original); assert.ok(drawn.get("gh:2").face.endsWith(":80,0"));
  panel.hidden = true; for (const observer of observers) if (observer.target === panel) observer.fn();
  assert.equal(timers.size, 0);
  f.clock.at += 120000; panel.hidden = false;
  for (const observer of observers) if (observer.target === panel) observer.fn();
  await drain(); assert.equal(calls, 3); assert.equal(timers.size, 1);
  document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); assert.equal(timers.size, 0);
  document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); assert.equal(timers.size, 1);
  view.update({ ...state, session: null }); assert.equal(timers.size, 0);
  view.update(state); assert.equal(timers.size, 1);
  view.dispose(); assert.equal(timers.size, 0); assert.equal(frames.size, 0);
  assert.ok(observers.every((observer) => !observer.target));
  document.dispatchEvent(new Event("visibilitychange")); assert.equal(timers.size, 0, "disposed listeners cannot restart polling");
});
