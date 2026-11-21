// The Room's catalog boundary: adoption and hibernation use storage; messages do not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { roomCatalog } from "../src/room-catalog.js";
import { CATALOG_MAX_STALE_MS } from "../src/character-catalog.js";

const START = 1800000000000, KEY = "characterCatalogV1";
const snapshot = (at, generation = 1, rows = [{ handle: "New-Ooga", github_login: "owner" }]) => ({
  revision: String(generation).repeat(64), generation, baseline: "a".repeat(40), engine: "v1", rows, checkedAt: at,
  catalog: { rows }, activation: { revision: String(generation).repeat(64), generation },
});
// Validation of catalog bytes belongs to the loader's own tests. This stand-in
// gives the real Room controlled accepted revisions, failures and expiry.
const loader = (state) => {
  let accepted = null;
  return {
    current: () => accepted && state.now - accepted.checkedAt < CATALOG_MAX_STALE_MS ? accepted : null,
    async read() { state.reads++; if (state.remote) accepted = state.remote; return this.current(); },
    async restore(saved) {
      state.restores++;
      if (!saved || state.now - saved.checkedAt >= CATALOG_MAX_STALE_MS || !saved.catalog?.rows) return false;
      accepted = snapshot(saved.checkedAt, saved.activation.generation, saved.catalog.rows);
      return true;
    },
  };
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const host = async ({ enabled = true, rows = [] } = {}) => {
  const state = { now: START, remote: snapshot(START), reads: 0, restores: 0 };
  const stored = new Map(), writes = [], sockets = [], timers = new Map();
  let ready, nextTimer = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const socket = () => ({ readyState: 1, sent: [], attachment: null, closed: null,
    send(text) { this.sent.push(JSON.parse(text)); }, close(code, reason) { this.closed = { code, reason }; this.readyState = 3; },
    serializeAttachment(value) { this.attachment = structuredClone(value); }, deserializeAttachment() { return this.attachment; } });
  class Response { constructor(body, options = {}) { this.body = body; this.status = options.status || 200; this.webSocket = options.webSocket; } async json() { return JSON.parse(this.body); } }
  const env = enabled ? { CHARACTER_CATALOG_ENABLED: "1" } : {};
  const context = { ...protocol, ...studio, CAST_ROWS: rows, Date: Clock, Map, Set, ArrayBuffer, DataView, URL, Headers, Response, crypto, console,
    roomCatalog: { key: roomCatalog.key, create: (e, embedded, index, clock) => roomCatalog.create(e, embedded, index, clock, loader(state)) },
    DurableObject: class { constructor(ctx, e) { this.ctx = ctx; this.env = e; } }, WebSocketRequestResponsePair: class {},
    WebSocketPair: class { constructor() { this[0] = socket(); this[1] = socket(); } }, sfuClient: () => null,
    getPlayer: async () => ({ banned_at: null }), deliverHighscores: async () => {}, sha256Hex: async () => "hash",
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id) => timers.delete(id),
  };
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  runInNewContext(source, context);
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); },
    acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => ws.readyState === 1),
    getWebSocketAutoResponseTimestamp: () => new Date(state.now), waitUntil() {},
    storage: { get: async (key) => structuredClone(stored.get(key)), put: async (key, value) => { writes.push(key); stored.set(key, structuredClone(value)); },
      delete: async (key) => stored.delete(key), getAlarm: async () => null, setAlarm: async () => {} },
  };
  const h = { state, stored, writes, sockets, ctx, env, socket };
  h.wake = async () => { h.room = new context.Room(ctx, env); await ready; return h.room; };
  h.join = async (id = 1, login = "owner") => {
    const count = sockets.length;
    const response = await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket",
      "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return { response, ws: sockets[count] };
  };
  h.send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg));
  await h.wake();
  return h;
};

test("disabled Room retains its embedded cast and wire format without catalog storage", async () => {
  const h = await host({ enabled: false, rows: [{ handle: "owner" }] });
  const { response, ws } = await h.join();
  assert.equal(response.status, 101);
  assert.equal(ws.sent.find((msg) => msg.t === "welcome").catalog, undefined);
  assert.equal(h.state.reads, 0); assert.equal(h.state.restores, 0);
  assert.ok(!h.writes.includes(KEY));
  h.send(ws, { t: "body", name: "owner" });
  assert.equal(h.room.players.get(1).body, "owner");
});

test("accepted catalog owns aliases absent from the embedded cast and publishes welcome metadata", async () => {
  const h = await host(), { response, ws } = await h.join();
  assert.equal(response.status, 101);
  assert.equal(ws.sent.find((msg) => msg.t === "welcome").catalog.generation, 1);
  assert.ok(h.stored.has(KEY));
  h.send(ws, { t: "body", name: "New-Ooga" });
  assert.equal(h.room.players.get(1).body, "New-Ooga");
  assert.equal((await h.join(2, "New-Ooga")).response.status, 403, "a login cannot take another owner's alias");
});

test("hibernation restores the accepted authority before ownership checks during a storage-feed outage", async () => {
  const h = await host(), { ws } = await h.join();
  h.send(ws, { t: "body", name: "New-Ooga" });
  h.state.remote = null;
  const writes = h.writes.filter((key) => key === KEY).length;
  await h.wake();
  assert.equal(ws.closed, null);
  assert.equal(h.room.players.get(1).body, "New-Ooga");
  assert.equal(h.writes.filter((key) => key === KEY).length, writes, "an unchanged restored authority is not rewritten");
  assert.equal(h.room.catalog.metadata().generation, 1);
});

test("expired authority preserves existing sockets but refuses admission and body/outdoor grants without message I/O", async () => {
  const h = await host(), { ws } = await h.join();
  h.send(ws, { t: "body", name: "New-Ooga" });
  h.state.remote = null; h.state.now += CATALOG_MAX_STALE_MS;
  await h.wake();
  assert.equal(ws.closed, null, "an expired restore must not evict against the embedded cast");
  assert.equal((await h.join(2)).response.status, 503);
  const reads = h.state.reads;
  h.send(ws, { t: "body", name: "gorilla:New-Ooga" });
  assert.equal(h.room.players.get(1).body, "New-Ooga", "a refused grant preserves the existing body");
  assert.equal(ws.sent.at(-1).reason, "catalog-unavailable");
  h.send(ws, { t: "outdoor", v: 1, op: "enter", epoch: 1, scope: "main" });
  assert.equal(ws.sent.at(-1).op, "refused");
  h.send(ws, { t: "body", name: null });
  assert.equal(h.room.players.get(1).body, null, "releasing a body still works");
  assert.equal(h.state.reads, reads, "messages do not refresh storage");
  assert.equal(ws.closed, null);
});

test("a sweep accepts a new valid revision and applies its ownership decisions", async () => {
  const h = await host(), { ws } = await h.join();
  h.state.now += 60000;
  h.state.remote = snapshot(h.state.now, 2, []);
  await h.room.alarm();
  assert.equal(ws.closed.reason, "revoked");
  assert.equal(h.stored.get(KEY).activation.generation, 2);
});

test("an authority outage refuses voice grants while leave still cleans up without refreshing", async () => {
  const h = await host(), { ws } = await h.join(), p = h.room.players.get(1);
  h.room.sfu = {};
  h.state.remote = null; h.state.now += CATALOG_MAX_STALE_MS;
  const request = (op) => ({ url: `https://island.invalid/voice/${op}`,
    headers: new Headers({ "x-player-id": "1", "x-room-token": p.connectionToken }), json: async () => ({}) });
  assert.equal((await h.room.fetch(request("session"))).status, 503);
  assert.equal(ws.closed, null);
  const reads = h.state.reads;
  assert.equal((await h.room.fetch(request("leave"))).status, 200);
  assert.equal(h.state.reads, reads, "cleanup does not wait on a catalog request");
  assert.equal(ws.closed, null);
});

test("Commons members survive catalog unavailability while their authentication deadlines still expire", async () => {
  const h = await host();
  const ws = h.socket();
  protocol.commonsRoom.restore(h.room, ws, { community: true, connId: "member", id: 1, login: "owner", display: "owner",
    principal: "gh:1", authUntil: START + 3600000 }, START);
  h.state.remote = null; h.state.now += CATALOG_MAX_STALE_MS;
  h.room.sweepAt = 0;
  await h.room.alarm();
  assert.equal(ws.closed, null, "missing authority must not be treated as lost ownership");
  h.state.now = START + 3600000; h.room.sweepAt = 0;
  await h.room.alarm();
  assert.equal(ws.closed.reason, "auth_required");
});

test("catalog helpers persist renewed validation and cannot adopt before a successful write", async () => {
  const state = { now: START, remote: snapshot(START), reads: 0, restores: 0 };
  const saved = [], storage = { put: async (key, value) => saved.push(plain(value)) };
  const local = roomCatalog.create({ CHARACTER_CATALOG_ENABLED: "1" }, [], protocol.castIndex, () => state.now, loader(state));
  await local.refresh(storage); await local.refresh(storage);
  assert.equal(saved.length, 1);
  state.now += 60000; state.remote = snapshot(state.now);
  await local.refresh(storage);
  assert.equal(saved.length, 2, "same content with a fresh checkedAt persists the stale deadline");
  state.remote = snapshot(state.now, 2, [{ handle: "another" }]);
  await assert.rejects(local.refresh({ put: async () => { throw new Error("storage failed"); } }));
  assert.equal(local.metadata().generation, 1, "failed persistence does not replace the accepted index");
  assert.equal(local.current().handleOf.get("owner"), "new-ooga");
});
