// The World Map's live layer, /api/world (worker/src/world.js): what each kind of viewer is told, the one read of the
// room every viewer in a data center shares, and the route's refusals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFixture } from "./routes.mjs";

const { createWorldHandler, worker, LIVE_MS, EMPTY_MS, RETRY_S } = routeFixture();

const VIEW = { name: "island", sockets: 4, players: 3, maxPlayers: 32, commons: 1,
  zones: { outside: [{ display: "Bea", login: "bea" }, { display: "al", login: "al" }], "dsb-maxis": [{ display: "Cy", login: "cy" }] },
  load: { seconds: 8, zones: { outside: { in: 12, out: 300 }, "dsb-maxis": { in: 6, out: 0 } } } };
const OBJECTS = [{ cls: "Room", name: "island", status: "live", lastSeen: 1, sockets: 4, maxSockets: 32, rates: { in: 18, out: 300 } },
  { cls: "GameHost", name: "ghost-hunt:arena:v1", status: "running", lastSeen: 1, sockets: 2, maxSockets: 32, rates: { in: 6, out: 0 } }];

const memoryCache = () => {
  const saved = new Map();
  return { saved, match: async (key) => saved.get(key.url)?.clone(), put: async (key, response) => { saved.set(key.url, response.clone()); } };
};
const setup = ({ view = VIEW, success = true, broken = false } = {}) => {
  const calls = { room: 0, objects: 0 };
  const env = {
    ROOM: { getByName: (name) => { assert.equal(name, "island"); return { worldView: async () => { calls.room++; if (broken) throw new Error("room down"); return structuredClone(view); } }; } },
    INSPECTOR: { getByName: () => ({ objects: async () => { calls.objects++; return structuredClone(OBJECTS); } }) },
    INSPECTOR_IDS: "7",
    WORLD_LIMITER: { limit: async () => ({ success }) }
  };
  return { env, calls };
};
// A session for account `id`, or none.
const as = (id) => async () => id ? { player: { id, login: `p${id}` }, session: {} } : null;
const get = (method = "GET") => new Request("https://oogabooga.land/api/world", { method });
const ask = async (id, env, cache = memoryCache()) => {
  const res = await createWorldHandler(as(id), () => cache)(get(), env, { waitUntil: () => {} });
  return { res, body: await res.json(), cache };
};

test("a viewer signed out is told how many stand where, never who or what serves them", async () => {
  const { env, calls } = setup();
  const { res, body } = await ask(0, env);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual({ ...body, at: 0 }, { at: 0, refreshMs: LIVE_MS, tier: "public", players: 3, zones: { outside: 2, "dsb-maxis": 1 } });
  assert.equal(calls.objects, 0, "the Inspector is not asked");
});

test("a signed-in player sees names as the players tab shows them, and an Inspector account the sockets and objects too", async () => {
  const player = await ask(3, setup().env);
  assert.equal(player.body.tier, "player");
  assert.deepEqual(player.body.names.outside.map((p) => p.display), ["al", "Bea"], "by name, case aside");
  assert.equal(player.body.room, undefined);
  assert.equal(player.body.objects, undefined);
  assert.ok(!JSON.stringify(player.body).includes("socket"), "no sockets for a player");

  const inspector = await ask(7, setup().env);
  assert.equal(inspector.body.tier, "inspector");
  assert.deepEqual(inspector.body.room, { cls: "Room", name: "island", sockets: 4, players: 3, maxPlayers: 32, commons: 1 });
  assert.deepEqual(inspector.body.objects.map(({ cpuMs, ...o }) => o), OBJECTS);
  assert.deepEqual(inspector.body.objects.map((o) => o.cpuMs), [330, 10], "each object's messages in at 1/600 s, sends out at 1/1000 s");
  assert.deepEqual(inspector.body.names["dsb-maxis"], [{ display: "Cy", login: "cy" }]);
});

test("a signed-in viewer is told each zone's estimated CPU, from the room's own counts, and a viewer signed out is not", async () => {
  const { body } = await ask(3, setup().env);
  assert.deepEqual(body.cpu.zones, { outside: 320, "dsb-maxis": 10 }, "12 in and 300 out a second, 6 in");
  assert.equal(body.cpu.total, 330);
  assert.equal(body.cpu.seconds, 8, "the span the rates were counted over");
  assert.deepEqual(body.cpu.model, { inMs: 1000 / 600, outMs: 1, budgetMs: 1000 });
  assert.equal((await ask(0, setup().env)).body.cpu, undefined);
  const older = await ask(3, setup({ view: { ...VIEW, load: undefined } }).env);
  assert.equal(older.body.cpu, undefined, "a room that counts nothing says nothing");
});

test("one read of the room serves every viewer while it lasts, longer while nobody is online", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000000 });
  const { env, calls } = setup(), cache = memoryCache();
  for (const id of [0, 3, 7, 0]) await ask(id, env, cache);
  assert.equal(calls.room, 1, "every tier from the same read");
  t.mock.timers.tick(LIVE_MS - 1);
  await ask(0, env, cache);
  assert.equal(calls.room, 1, "still fresh");
  t.mock.timers.tick(2);
  await ask(0, env, cache);
  assert.equal(calls.room, 2, "read again once it is past its time");

  const empty = setup({ view: { ...VIEW, players: 0, sockets: 0, zones: {} } }), quiet = memoryCache();
  await ask(0, empty.env, quiet);
  t.mock.timers.tick(LIVE_MS + 1);
  await ask(0, empty.env, quiet);
  assert.equal(empty.calls.room, 1, "an empty room is left alone longer");
  t.mock.timers.tick(EMPTY_MS);
  await ask(0, empty.env, quiet);
  assert.equal(empty.calls.room, 2);
});

test("the route refuses past its limit, to other methods, without a room, and says so when the room fails", async () => {
  const limited = setup({ success: false }), refused = await createWorldHandler(as(0), memoryCache)(get(), limited.env);
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get("retry-after"), String(RETRY_S), "the page is told when to ask again, not that there is no backend");
  assert.equal(limited.calls.room, 0, "a refused request reads nothing");
  assert.equal((await createWorldHandler(as(0), memoryCache)(get("POST"), setup().env)).status, 405);
  assert.equal((await createWorldHandler(as(0), memoryCache)(get(), {})).status, 404, "no backend: the page shows the map alone");
  const down = await createWorldHandler(as(0), memoryCache)(get(), setup({ broken: true }).env);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("cache-control"), "no-store");
});

test("the Worker answers /api/world", async () => {
  const { env } = setup();
  const res = await worker.fetch(get(), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).tier, "public", "no session cookie, no names");
});
