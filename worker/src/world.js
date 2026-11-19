// /api/world: the World Map's live layer (the page at /map, src/map/). The map is drawn from the game's own data
// (scripts/world-map.mjs); this says who stands where on it, by the zone each signed-in player reports to the room.
//
// What a viewer gets depends on who they are, read from their session:
// - anyone: how many players stand in each zone;
// - a signed-in player (an account with an Ooga): their names too, as the live players tab already shows them;
// - an Inspector account (INSPECTOR_IDS, as /inspect): the room's sockets and every Durable Object the Inspector has
//   heard from, its class, name, sockets and cap; the room's sockets split into players, Ooga Chat members and
//   connections it has let go of whose close is unfinished (`closing`), and how many players are `held` over a lost
//   socket, standing where they were for their page to come back.
// A signed-in viewer also gets the estimated CPU each zone costs the room (`cpu`, cpu-model.js: a model from the
// room's own counts of messages in and sends out, never a measurement), and an Inspector account each object's.
//
// A page asks every REFRESH_MS, so who stands where shows within about two seconds. One read of the room serves every
// viewer in a data center: it is kept in the Cache API under an address no visitor can reach, for LIVE_MS (EMPTY_MS
// while nobody is online, so an empty room is woken at most that often however many watch), and concurrent misses in
// one isolate share it. However many viewers there are, the room is read at most once a LIVE_MS a data center.
//
// /api/world/live is the same answer pushed: a map page opens one socket there, answered by WorldWatch
// (world-watch.js), which the room tells of every join, leave and move (world-report.js), so a change shows within a
// moment. The page falls back to asking here when the socket is not there (no WORLD binding, an older Worker) or drops.
//
// A GameHost is never called from here, which could make one away from its GAME_LOCATION_HINT: the Inspector's reports
// name them. Answers are never cached by a browser.
import { allowed, clientIp, fromSite, getSessionFromRequest, json, text } from "./http.js";
import { inspectorAllowed, inspectorOn, INSPECTOR_NAME } from "./inspect-report.js";
import { CPU_MODEL, cpuMs } from "./cpu-model.js";
import { WORLD_NAME } from "./world-report.js";

const ISLAND = "island";
export const REFRESH_MS = 2000, LIVE_MS = 1000, EMPTY_MS = 5000, RETRY_S = 20;
const NO_STORE = { "cache-control": "no-store" };

const running = new Map();
// `read()`'s answer, kept `life(answer)` ms under `name` in this data center's cache and shared by concurrent misses.
const shared = async (origin, name, cache, ctx, read, life) => {
  const key = new Request(new URL(`/__world-cache/v1/${name}`, origin));
  if (cache) {
    try {
      const hit = await cache.match(key), saved = hit && await hit.json();
      if (saved && saved.expiresAt > Date.now()) return saved;
    } catch { /* A cache failure still permits a fresh read. */ }
  }
  const id = `${origin} ${name}`;
  if (!running.has(id)) running.set(id, (async () => {
    const value = await read(), ms = life(value), saved = { value, at: Date.now(), expiresAt: Date.now() + ms };
    if (cache) try { await cache.put(key, json(saved, 200, { "cache-control": `max-age=${Math.ceil(ms / 1000)}` })); } catch { /* Serve the fresh read. */ }
    return saved;
  })());
  const pending = running.get(id);
  // Others wait on this read: it must outlive the request that started it, which a viewer can cancel by leaving.
  if (ctx) ctx.waitUntil(pending.catch(() => {}));
  try { return await pending; } finally { if (running.get(id) === pending) running.delete(id); }
};

const byName = (a, b) => a.display.localeCompare(b.display, undefined, { sensitivity: "base" }) || (a.login < b.login ? -1 : 1);

// What a viewer of `tier` ("public", "player" or "inspector") is told of the room's `worldView()` read at `at`, with the
// Inspector's `objects()` for an Inspector account. The one shape both the poll and the socket send.
export const answerFor = (value, at, tier, objects = []) => {
  const zones = {};
  for (const [zone, list] of Object.entries(value.zones)) zones[zone] = list.length;
  const answer = { at, refreshMs: REFRESH_MS, tier, players: value.players, zones };
  if (tier !== "public") {
    answer.names = {};
    for (const [zone, list] of Object.entries(value.zones)) answer.names[zone] = [...list].sort(byName);
    if (value.load) {
      const cpu = { model: CPU_MODEL, seconds: value.load.seconds, zones: {}, total: 0 };
      for (const [zone, rates] of Object.entries(value.load.zones)) cpu.total += cpu.zones[zone] = cpuMs(rates);
      cpu.total = Math.round(cpu.total * 100) / 100;
      answer.cpu = cpu;
    }
  }
  if (tier === "inspector") {
    answer.room = { cls: "Room", name: value.name || ISLAND, sockets: value.sockets, players: value.players, held: value.held, maxPlayers: value.maxPlayers, commons: value.commons, closing: value.closing };
    answer.objects = objects.map((o) => ({ ...o, cpuMs: cpuMs(o.rates) }));
  }
  return answer;
};

const tierOf = (env, found) => found ? (inspectorAllowed(env, found.player.id) ? "inspector" : "player") : "public";
const limited = () => text("Too many requests", 429, { ...NO_STORE, "retry-after": String(RETRY_S) });

export const createWorldHandler = (sessionFor = getSessionFromRequest, cacheFor = () => globalThis.caches?.default) => async (request, env, ctx) => {
  if (request.method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
  if (!env.ROOM) return text("Not found", 404);
  // Refused, a page waits this long before it asks again (map.js), rather than giving up on the live layer.
  if (!(await allowed(env.WORLD_LIMITER, clientIp(request)))) return limited();
  const found = await sessionFor(request, env), tier = tierOf(env, found);
  const origin = new URL(request.url).origin, cache = cacheFor();
  let room;
  try {
    room = await shared(origin, "room", cache, ctx, () => env.ROOM.getByName(ISLAND).worldView(), (v) => v.players ? LIVE_MS : EMPTY_MS);
  } catch {
    return json({ error: "unavailable" }, 503, NO_STORE);
  }
  let objects = [];
  if (tier === "inspector" && inspectorOn(env)) {
    try {
      objects = (await shared(origin, "objects", cache, ctx, () => env.INSPECTOR.getByName(INSPECTOR_NAME).objects(), () => LIVE_MS)).value;
    } catch { /* The room's own count still stands. */ }
  }
  return json(answerFor(room.value, room.at, tier, objects), 200, NO_STORE);
};

// The socket's door: the checks a cross-site page or a stranger meets, then the viewer's tier, decided here from the
// session as for the poll, in headers WorldWatch alone reads. A cross-site page is refused, since a signed-in viewer's
// cookie would otherwise hand it names.
export const createWorldLiveHandler = (sessionFor = getSessionFromRequest) => async (request, env) => {
  if (request.method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
  if (!env.ROOM || !env.WORLD) return text("Not found", 404);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!(await allowed(env.WORLD_LIMITER, clientIp(request)))) return limited();
  const found = await sessionFor(request, env);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-viewer-")) headers.delete(name);
  headers.set("x-viewer-tier", tierOf(env, found));
  headers.set("x-viewer-id", String(found ? found.player.id : 0));
  return env.WORLD.getByName(WORLD_NAME).fetch(new Request(request, { headers }));
};

export const handleWorld = createWorldHandler();
export const handleWorldLive = createWorldLiveHandler();
