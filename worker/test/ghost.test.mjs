// HALLOWEEN: the arcade's ghost hunt runs on the server (game-host.js, games/ghost-hunt.js; game-host.test.mjs), so the
// island's room no longer hosts it: a page's old word to a ghost host is ignored and its old state frames are dropped,
// while a shot fired in the arena still reaches the arena's hallway, where its spectators see and hear the hunt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";

test("a page's old word to a ghost host is ignored, not fatal", () => {
  const { parseClientMessage } = protocol;
  for (const msg of [{ t: "ghost", k: "start" }, { t: "ghost", k: "hits", h: [0, 12] }, { t: "ghost", k: "hit", g: 1, d: 60 }]) {
    assert.equal(parseClientMessage(JSON.stringify(msg)), null, JSON.stringify(msg));
  }
  assert.equal(parseClientMessage('{"t":"visible","on":"yes"}'), null, "a visibility report must be a flag");
});

const harness = () => {
  let now = 100000;
  const accepted = [];
  const socket = () => ({
    sent: [], bins: [], closed: null, store: null,
    send(text) { if (typeof text === "string") this.sent.push(JSON.parse(text)); else this.bins.push(text); },
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
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView,
  };
  runInNewContext(source, context);
  const stored = new Map();
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key), put: async (key, value) => stored.set(key, value), getAlarm: async () => null, setAlarm: async () => {} },
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
test("the room relays no ghost host's state, and hands nobody a hunt", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  for (const [ws, name] of [[a, "a"], [b, "b"]]) { await h.send(ws, { t: "body", name }); await h.send(ws, { t: "zone", name: "ghost-arena" }); }
  await h.send(a, { t: "hub", on: true });
  const frame = new ArrayBuffer(16);
  new DataView(frame).setUint32(0, protocol.GHOST_MAGIC, true);
  await h.room.webSocketMessage(a, frame);
  assert.equal(b.bins.length, 0, "an old page's hunt frame reaches nobody, even from the island's NPC host");
  assert.ok(!a.sent.concat(b.sent).some((m) => m.t === "ghost-host" || m.t === "welcome" && "ghostHost" in m), "no page hears of a ghost host");
});

// #422: a rifle fired in the arena is the hunt's sound for everyone watching it, each page hearing it once; a shot from
// the hallway stays in its own zone, so a spectator's page never reaches the arena's hunters.
test("an arena shot reaches the arena and both halves of its hallway once each, never the hall; a hallway shot stays in the hallway", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  for (const [ws, name] of [[a, "a"], [b, "b"], [c, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(a, { t: "zone", name: "ghost-arena" });
  await h.send(b, { t: "zone", name: "ghost-arena.haunt" });
  await h.send(c, { t: "zone", name: "arcade.haunt" });
  const shots = (ws) => ws.sent.filter((m) => m.t === "shot");
  const fire = async (ws) => { h.advance(1000); await h.send(ws, { t: "shot", a: [60, 4, -20, 62, 4, -20] }); };
  await fire(a);
  assert.deepEqual([shots(a).length, shots(b).length, shots(c).length], [0, 1, 1], "both hallway halves, once each, and not back to the shooter");
  assert.equal(shots(b)[0].id, 1);
  await h.send(c, { t: "zone", name: "arcade.hall" });
  await fire(a);
  assert.deepEqual([shots(b).length, shots(c).length], [2, 1], "the hall hears no arena shot");
  await fire(b);
  assert.deepEqual([shots(a).length, shots(c).length], [0, 1], "a hallway shot reaches neither the arena nor the hall");
  await h.send(a, { t: "zone", name: "arcade-hunt" });
  await fire(a);
  assert.equal(shots(b).length, 3, "a page loaded before #422, hunting in `arcade-hunt`, is the arena too");
});
