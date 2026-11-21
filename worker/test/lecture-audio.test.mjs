// Lecture recordings from R2 through the Worker (src/lecture-audio.js), with a fake bucket, edge cache and waitUntil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLectureAudio, LECTURE_FILE } from "../src/lecture-audio.js";
import { readJsonc } from "./cloudflare-host.mjs";

const FILE = "btc-01-8a6f64e92411fdcf.m4a", SITE = "https://oogabooga.land";
const BYTES = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);

// R2's answers as the runtime gives them: a range from the request's Range header, a conditional from its
// If-None-Match (an object without a body), null for a missing key, a throw for a range past the end.
const bucket = (objects) => {
  const reads = [];
  const meta = (key) => ({ key, size: objects.get(key).length, httpEtag: `"${key.length}-etag"` });
  return {
    reads,
    head: async (key) => { reads.push(["head", key]); return objects.has(key) ? meta(key) : null; },
    get: async (key, options = {}) => {
      reads.push(["get", key, options.range?.get?.("range") || null]);
      if (!objects.has(key)) return null;
      const bytes = objects.get(key), object = meta(key);
      if (options.onlyIf?.get?.("if-none-match") === object.httpEtag) return object;
      const asked = options.range?.get?.("range"), m = asked && /^bytes=(\d*)-(\d*)$/.exec(asked);
      let range = null, slice = bytes;
      if (m) {
        if (m[1] === "") range = { suffix: Number(m[2]) };
        else range = m[2] === "" ? { offset: Number(m[1]) } : { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
        const start = "suffix" in range ? bytes.length - range.suffix : range.offset;
        if (start >= bytes.length) throw new Error("InvalidRange");
        slice = bytes.slice(start, range.length ? start + range.length : bytes.length);
      }
      return { ...object, range, body: new Blob([slice]).stream() };
    }
  };
};

const rig = (objects = new Map([[`lectures/${FILE}`, BYTES]])) => {
  const cached = new Map(), waits = [], R2 = bucket(objects);
  // The fake edge cache answers whole requests only; the real one also answers ranges and If-None-Match itself.
  const cache = {
    match: async (request) => request.headers.has("range") ? undefined : cached.get(request.url)?.clone(),
    put: async (key, response) => { assert.equal(response.status, 200, "the cache takes only a whole file"); cached.set(key, new Response(await response.arrayBuffer(), response)); }
  };
  const ask = (path, init = {}) => handleLectureAudio(new Request(SITE + path, init), { LECTURE_AUDIO: R2 }, new URL(SITE + path), { waitUntil: (p) => waits.push(p) }, cache);
  return { ask, cached, waits, R2 };
};

test("rule: only a hashed lecture recording's name is asked of R2, by GET or HEAD", async () => {
  const r = rig();
  for (const path of ["/media/lectures/btc-01.m4a", "/media/lectures/btc-01-8a6f64e92411fdc.m4a", "/media/lectures/BTC-01-8a6f64e92411fdcf.m4a",
    "/media/lectures/btc-01-8a6f64e92411fdcf.mp3", "/media/lectures/x/btc-01-8a6f64e92411fdcf.m4a", "/media/lectures/..%2Fsecret", "/media/lectures/"]) {
    assert.equal((await r.ask(path)).status, 404, path);
  }
  assert.equal((await r.ask(`/media/lectures/${FILE}`, { method: "POST" })).status, 405);
  assert.equal(r.R2.reads.length, 0);
  assert.ok(LECTURE_FILE.test(FILE));
  assert.equal((await handleLectureAudio(new Request(`${SITE}/media/lectures/${FILE}`), {}, new URL(`${SITE}/media/lectures/${FILE}`), null, null)).status, 404, "no bucket bound");
  assert.equal((await r.ask("/media/lectures/btc-02-0000000000000000.m4a")).status, 404, "a name with no object");
});

test("rule: a whole recording is kept a year at the edge and in the browser, and the edge answers it again without R2", async () => {
  const r = rig();
  const first = await r.ask(`/media/lectures/${FILE}?v=1`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "audio/mp4");
  assert.equal(first.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(first.headers.get("accept-ranges"), "bytes");
  assert.equal(first.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(first.headers.get("content-length"), "1000");
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), BYTES);
  await Promise.all(r.waits);
  assert.ok(r.cached.has(`${SITE}/media/lectures/${FILE}`), "keyed by the path alone");
  const reads = r.R2.reads.length;
  const again = await r.ask(`/media/lectures/${FILE}`);
  assert.equal(again.status, 200);
  assert.deepEqual(new Uint8Array(await again.arrayBuffer()), BYTES);
  assert.equal(r.R2.reads.length, reads);
});

test("rule: a range answers 206 with its bytes, and the cache is filled with the whole file", async () => {
  const r = rig();
  const part = await r.ask(`/media/lectures/${FILE}`, { headers: { range: "bytes=100-199" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 100-199/1000");
  assert.equal(part.headers.get("content-length"), "100");
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), BYTES.slice(100, 200));
  const open = await r.ask(`/media/lectures/${FILE}`, { headers: { range: "bytes=900-" } });
  assert.equal(open.headers.get("content-range"), "bytes 900-999/1000");
  assert.deepEqual(new Uint8Array(await open.arrayBuffer()), BYTES.slice(900));
  const tail = await r.ask(`/media/lectures/${FILE}`, { headers: { range: "bytes=-10" } });
  assert.equal(tail.headers.get("content-range"), "bytes 990-999/1000");
  await Promise.all(r.waits);
  const kept = r.cached.get(`${SITE}/media/lectures/${FILE}`);
  assert.equal(kept.status, 200);
  assert.deepEqual(new Uint8Array(await kept.clone().arrayBuffer()), BYTES);
  assert.equal((await r.ask(`/media/lectures/${FILE}`, { headers: { range: "bytes=5000-" } })).status, 416);
});

test("rule: a current copy is 304, HEAD says the length without a body", async () => {
  const r = rig();
  const head = await r.ask(`/media/lectures/${FILE}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "1000");
  assert.equal(head.body, null);
  const etag = head.headers.get("etag");
  const same = await r.ask(`/media/lectures/${FILE}`, { headers: { "if-none-match": etag } });
  assert.equal(same.status, 304);
  assert.equal(same.body, null);
});

test("rule: both environments bind their own lecture bucket and run the Worker first for /media/lectures/*", () => {
  const names = new Set();
  for (const env of ["staging", "production"]) {
    const config = readJsonc(new URL(`../../wrangler.${env}.jsonc`, import.meta.url));
    assert.ok(config.assets.run_worker_first.includes("/media/lectures/*"), env);
    const binding = config.r2_buckets.find((b) => b.binding === "LECTURE_AUDIO");
    assert.ok(binding, env);
    names.add(binding.bucket_name);
  }
  assert.equal(names.size, 2, "staging and production never share a bucket");
});
