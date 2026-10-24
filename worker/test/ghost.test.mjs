// HALLOWEEN: the ghost hunt's follower messages: parsed within bounds, relayed through the real Room to the NPC host
// alone, never from the host itself or a page off the island, and throttled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";

test("a ghost start, pause or hit within bounds is read; anything else is ignored, not fatal", () => {
  const { parseClientMessage } = protocol;
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"start"}'), { t: "ghost", k: "start" });
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"pause","g":3}'), { t: "ghost", k: "pause" });
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"ready"}'), { t: "ghost", k: "ready" }, "a follower readies up in the lobby");
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"hit","g":12,"d":5,"extra":1}'), { t: "ghost", k: "hit", g: 12, d: 5 });
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"hit","g":7,"d":60}'), { t: "ghost", k: "hit", g: 7, d: 60 }, "a batch of hits on one ghost");
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"hits","h":[0,12,7,4,9,60]}'), { t: "ghost", k: "hits", h: [0, 12, 7, 4, 9, 60] }, "a tenth of a second's hits on three targets as one report");
  for (const h of [[], [1], [1, 2, 3], [1, 0], [1, 61], [-1, 2], [70000, 2], [1.5, 2], Array(34).fill(1), "1,2"]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "ghost", k: "hits", h })), null, JSON.stringify(h));
  }
  for (const bad of [{ k: "hit", g: -1, d: 2 }, { k: "hit", g: 70000, d: 2 }, { k: "hit", g: 1, d: 0 }, { k: "hit", g: 1, d: 61 }, { k: "hit", g: 1.5, d: 2 },
    { k: "hit", g: "1", d: 2 }, { k: "kill", g: 1 }, {}]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "ghost", ...bad })), null, JSON.stringify(bad));
  }
});

const harness = () => {
  let now = 100000;
  const accepted = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { if (typeof text === "string") this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; } }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, ...studioPolicy, sha256Hex, getPlayer, sfuClient: () => null,
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }, { handle: "c", github_login: "c" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  const stored = new Map();
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => stored.get(key), put: async (key, value) => stored.set(key, value), getAlarm: async () => null, setAlarm: async () => {} },
  };
  const room = new context.Room(ctx, {});
  const join = async (id, login) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
  return { room, join, send, advance: (ms) => { now += ms; } };
};
const ghosts = (ws) => ws.sent.filter((m) => m.t === "ghost");

test("a follower's ghost report reaches the host alone, and nothing from the host or a page off the island is relayed", async () => {
  const h = harness();
  const host = await h.join(1, "a"), follower = await h.join(2, "b"), away = await h.join(3, "c");
  for (const [ws, name] of [[host, "a"], [follower, "b"], [away, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(host, { t: "hub", on: true });
  await h.send(follower, { t: "hub", on: true });
  assert.equal(h.room.hostId, 1, "the first page on the island hosts");
  await h.send(follower, { t: "ghost", k: "hit", g: 4, d: 2 });
  await h.send(follower, { t: "ghost", k: "start" });
  await h.send(follower, { t: "ghost", k: "hits", h: [0, 12, 4, 6] });
  assert.deepEqual(ghosts(host), [{ t: "ghost", k: "hit", g: 4, d: 2, from: 2 }, { t: "ghost", k: "start", from: 2 }, { t: "ghost", k: "hits", h: [0, 12, 4, 6], from: 2 }]);
  assert.equal(ghosts(follower).length + ghosts(away).length, 0, "only the host hears the hunt's reports");
  await h.send(away, { t: "ghost", k: "start" });
  await h.send(host, { t: "ghost", k: "start" });
  assert.equal(ghosts(host).length, 3, "a page off the island and the host itself are not relayed");
});

test("a follower's ghost reports are throttled to a burst, and come back with time", async () => {
  const h = harness();
  const host = await h.join(1, "a"), follower = await h.join(2, "b");
  for (const [ws, name] of [[host, "a"], [follower, "b"]]) { await h.send(ws, { t: "body", name }); await h.send(ws, { t: "hub", on: true }); }
  for (let i = 0; i < protocol.GHOST_BURST + 8; i++) await h.send(follower, { t: "ghost", k: "hit", g: i, d: 1 });
  assert.equal(ghosts(host).length, protocol.GHOST_BURST);
  h.advance(1000);
  await h.send(follower, { t: "ghost", k: "hit", g: 99, d: 1 });
  assert.equal(ghosts(host).length, protocol.GHOST_BURST + 1);
});
