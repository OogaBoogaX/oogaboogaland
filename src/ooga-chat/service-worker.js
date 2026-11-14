// Ooga Chat's service worker (#657; the cache contract in docs/ooga-chat-app.md). scripts/ooga-chat.mjs stages it at
// /sw.js with VERSION (the build) and SHELL (the page at "/" and every hashed file a visit loads) filled in. It keeps
// those public files and nothing else: never an API, sign-in, sign-out, session, audience, media or donation answer,
// never a request that is not a GET, and never a response marked no-store or private. A hashed file is immutable and
// answers from the cache. The page is asked of the network first and comes from the cache only when the network fails,
// so a deployment or a bad cache entry never outlives an online reload. A new version installs and waits: the page
// chooses when it takes over (`skip-waiting`), never in the middle of voice, and taking over deletes older caches.
// It is not a background audio process and replays nothing.
"use strict";
const VERSION = "dev";
const SHELL = [];
const CACHE = `ooga-chat-${VERSION}`;
const PAGE = "/";
const cacheable = (response) => response.ok && response.type === "basic" && !/no-store|private/i.test(response.headers.get("cache-control") || "");
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    for (const path of SHELL) {
      const response = await fetch(path, { cache: "no-cache", credentials: "omit" });
      if (!cacheable(response)) throw new Error(`Ooga Chat: ${path} cannot be kept`);
      await cache.put(path, response);
    }
  }));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ooga-chat-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname !== "/" && url.pathname !== "/index.html") return;
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then((cache) => cache.match(PAGE)).then((hit) => hit || Response.error())));
    return;
  }
  if (url.search || url.pathname === PAGE || !SHELL.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(url.pathname)).then((hit) => hit || fetch(request)));
});
