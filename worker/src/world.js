// /api/world: the World Map's live layer (the page at /map, src/map/). The map is drawn from the game's own data
// (scripts/world-map.mjs); this says who stands where on it, by the zone each signed-in player reports to the room.
//
// What a viewer gets depends on who they are, read from their session:
// - anyone: how many players stand in each zone;
// - a signed-in player (an account with an Ooga): their names too, as the live players tab already shows them;
// - an Inspector account (INSPECTOR_IDS, as /inspect): the room's sockets and every Durable Object the Inspector has
//   heard from, its class, name, sockets and cap.
// A signed-in viewer also gets the estimated CPU each zone costs the room (`cpu`, cpu-model.js: a model from the
// room's own counts of messages in and sends out, never a measurement), and an Inspector account each object's.
//
// One read of the room serves every viewer in a data center: it is kept in the Cache API under an address no visitor
// can reach, for LIVE_MS (EMPTY_MS while nobody is online, so an empty room is left to hibernate), and concurrent
// misses in one isolate share it. A GameHost is never called from here, which could make one away from its
// GAME_LOCATION_HINT: the Inspector's reports name them. Answers are never cached by a browser.
import { allowed, clientIp, getSessionFromRequest, json, text } from "./http.js";
import { inspectorAllowed, inspectorOn, INSPECTOR_NAME } from "./inspect-report.js";
import { CPU_MODEL, cpuMs } from "./cpu-model.js";

const ISLAND = "island";
export const LIVE_MS = 10000, EMPTY_MS = 60000, RETRY_S = 20;
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

export const createWorldHandler = (sessionFor = getSessionFromRequest, cacheFor = () => globalThis.caches?.default) => async (request, env, ctx) => {
  if (request.method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
  if (!env.ROOM) return text("Not found", 404);
  // Refused, a page waits this long before it asks again (map.js), rather than giving up on the live layer.
  if (!(await allowed(env.WORLD_LIMITER, clientIp(request)))) return text("Too many requests", 429, { ...NO_STORE, "retry-after": String(RETRY_S) });
  const found = await sessionFor(request, env), inspector = !!found && inspectorAllowed(env, found.player.id);
  const origin = new URL(request.url).origin, cache = cacheFor();
  let room;
  try {
    room = await shared(origin, "room", cache, ctx, () => env.ROOM.getByName(ISLAND).worldView(), (v) => v.players ? LIVE_MS : EMPTY_MS);
  } catch {
    return json({ error: "unavailable" }, 503, NO_STORE);
  }
  const { value } = room, zones = {};
  for (const [zone, list] of Object.entries(value.zones)) zones[zone] = list.length;
  const answer = { at: room.at, refreshMs: LIVE_MS, tier: inspector ? "inspector" : found ? "player" : "public", players: value.players, zones };
  if (found) {
    answer.names = {};
    for (const [zone, list] of Object.entries(value.zones)) answer.names[zone] = [...list].sort(byName);
    if (value.load) {
      const cpu = { model: CPU_MODEL, seconds: value.load.seconds, zones: {}, total: 0 };
      for (const [zone, rates] of Object.entries(value.load.zones)) cpu.total += cpu.zones[zone] = cpuMs(rates);
      cpu.total = Math.round(cpu.total * 100) / 100;
      answer.cpu = cpu;
    }
  }
  if (inspector) {
    answer.room = { cls: "Room", name: value.name || ISLAND, sockets: value.sockets, players: value.players, maxPlayers: value.maxPlayers, commons: value.commons };
    answer.objects = [];
    if (inspectorOn(env)) {
      try {
        const objects = await shared(origin, "objects", cache, ctx, () => env.INSPECTOR.getByName(INSPECTOR_NAME).objects(), () => LIVE_MS);
        answer.objects = objects.value.map((o) => ({ ...o, cpuMs: cpuMs(o.rates) }));
      } catch { /* The room's own count still stands. */ }
    }
  }
  return json(answer, 200, NO_STORE);
};

export const handleWorld = createWorldHandler();
