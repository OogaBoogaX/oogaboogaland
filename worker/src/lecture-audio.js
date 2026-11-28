// Lecture recordings (docs/lectures.md, Recording): GET or HEAD /media/lectures/<id>-<hash>.m4a answers the object
// `lectures/<id>-<hash>.m4a` in the private LECTURE_AUDIO bucket and nothing else. The name carries the first 16 hex of
// the recording's SHA-256 (src/js/lecture-kit.js `timing`), so a published name never changes: the edge and the
// browser keep it a year. The edge cache, keyed by the path alone, answers ranges (206) and If-None-Match (304) by
// itself; a miss is answered from R2 with the same range and conditional while the whole file goes into the cache.
//
// Valhodl's music (src/js/keep-music-data.js, scripts/keep-music.mjs) is served the same way, from its own bucket:
// GET or HEAD /media/keep/<name>-<hash>.mp3 answers `keep-music/<name>-<hash>.mp3` in KEEP_MUSIC.
export const LECTURE_FILE = /^[a-z]+-\d\d-[0-9a-f]{16}\.m4a$/;
export const KEEP_MUSIC_FILE = /^[a-z]+-[0-9a-f]{16}\.mp3$/;
const KEEP = "public, max-age=31536000, immutable";

const notFound = () => new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

const typedHeaders = (object, type) => new Headers({
  "content-type": type, "cache-control": KEEP, etag: object.httpEtag, "accept-ranges": "bytes",
  "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin"
});

// The bytes R2 answered for a range, as a first offset and a length (R2 gives `{ offset, length }`, either part
// missing for an open end, or `{ suffix }`).
const spanOf = (range, size) => {
  if ("suffix" in range) { const length = Math.min(range.suffix, size); return { offset: size - length, length }; }
  const offset = range.offset || 0;
  return { offset, length: range.length ?? size - offset };
};

// One kind of recording: its address `prefix`, the names it answers, its bucket's binding and folder, and its type.
const media = ({ prefix: PREFIX, pattern, binding, folder, type }) => async (request, env, url, ctx, cache = globalThis.caches?.default) => {
  const bucket = env[binding], headersOf = (object) => typedHeaders(object, type);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const file = url.pathname.slice(PREFIX.length);
  if (!url.pathname.startsWith(PREFIX) || !pattern.test(file) || !bucket) return notFound();
  const key = `${folder}/${file}`, cacheKey = `${url.origin}${url.pathname}`;

  if (request.method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return notFound();
    const headers = headersOf(object);
    headers.set("content-length", String(object.size));
    return new Response(null, { headers });
  }

  if (cache) {
    const hit = await cache.match(new Request(cacheKey, { headers: request.headers }));
    if (hit) return hit;
  }

  const ranged = request.headers.has("range");
  let object;
  try {
    object = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
  } catch {
    // A range past the end: R2 refuses it, and so does HTTP.
    const whole = ranged ? await bucket.head(key) : null;
    if (!whole) throw new Error(`media: R2 refused ${key}`);
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${whole.size}`, "cache-control": "no-store" } });
  }
  if (!object) return notFound();
  const headers = headersOf(object);
  // An object without a body is a conditional that held: the browser's copy is current.
  if (!("body" in object) || !object.body) return new Response(null, { status: 304, headers });

  let response;
  if (ranged && object.range) {
    const { offset, length } = spanOf(object.range, object.size);
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    response = new Response(object.body, { status: 206, headers });
  } else {
    headers.set("content-length", String(object.size));
    response = new Response(object.body, { headers });
  }

  // The cache takes only a whole file: a whole answer goes in as it is sent, a range has the whole file read for it.
  if (cache && ctx && ctx.waitUntil) {
    const fill = response.status === 200 ? cache.put(cacheKey, response.clone()) : (async () => {
      const whole = await bucket.get(key);
      if (!whole || !whole.body) return;
      const kept = headersOf(whole);
      kept.set("content-length", String(whole.size));
      await cache.put(cacheKey, new Response(whole.body, { headers: kept }));
    })();
    ctx.waitUntil(fill.catch(() => {}));
  }
  return response;
};
export const handleLectureAudio = media({ prefix: "/media/lectures/", pattern: LECTURE_FILE, binding: "LECTURE_AUDIO", folder: "lectures", type: "audio/mp4" });
export const handleKeepMusic = media({ prefix: "/media/keep/", pattern: KEEP_MUSIC_FILE, binding: "KEEP_MUSIC", folder: "keep-music", type: "audio/mpeg" });
