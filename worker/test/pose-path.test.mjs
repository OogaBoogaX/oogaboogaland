// The pose path through the real Room: a socket finds its player without reading its attachment, and a pose's fields
// reach the attachment at most once a second (or with any other change), never later than a second after the last pose,
// so a room woken from hibernation still knows where everyone stands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";

const host = () => {
  let now = 100000, timerId = 0;
  const accepted = [], timers = new Map(), logged = [];
  const socket = () => ({
    sent: [], closed: null, store: null, saves: 0, reads: 0,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.saves++; this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { this.reads++; return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.status = init.status; this.webSocket = init.webSocket; } }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, ...studioPolicy, sha256Hex, getPlayer, sfuClient: () => null,
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, console: { ...console, error: (...args) => logged.push(args) },
    // Timers run only when the check moves the clock past them.
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  runInNewContext(source, context);
  const stored = new Map();
  let restoring = null;
  const ctx = {
    id: { name: "island" }, waitUntil: () => {},
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (restoring = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: {
      get: async (key) => Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key),
      put: async (key, value) => { stored.set(key, value); }, delete: async (key) => { stored.delete(key); }, getAlarm: async () => null, setAlarm: async () => {},
    },
  };
  const room = () => new context.Room(ctx, {});
  const join = async (r, id, login) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (r, ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg));
  const advance = (ms) => {
    now += ms;
    for (const [id, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) if (t.at <= now && timers.delete(id)) t.fn();
  };
  return { room, join, send, advance, logged, restored: () => restoring };
};

test("a pose finds its player without reading the socket's attachment", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a");
  h.send(r, a, { t: "body", name: "a" });
  const reads = a.reads;
  for (let i = 0; i < 20; i++) { h.advance(100); h.send(r, a, { t: "pose", x: i, y: 0, z: 0, yaw: 0 }); }
  assert.equal(a.reads, reads);
  assert.equal(r.players.get(1).x, 19, "every pose still lands");
});

test("a pose's fields reach the attachment at most once a second, and a body or zone change at once", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a");
  h.send(r, a, { t: "body", name: "a" });
  const saves = a.saves;
  // Ten poses a second for three seconds.
  for (let i = 0; i < 30; i++) { h.advance(100); h.send(r, a, { t: "pose", x: i, y: 0, z: 0, yaw: 0 }); }
  assert.ok(a.saves - saves <= 4, `${a.saves - saves} saves in three seconds`);
  assert.ok(a.saves - saves >= 2, "but they are saved");
  const before = a.saves;
  h.advance(100); h.send(r, a, { t: "zone", name: "factory" });
  assert.equal(a.saves, before + 1, "a zone change saves at once");
  assert.equal(a.store.zone, "factory");
  assert.equal(a.store.x, 29, "with the latest pose");
});

test("the last pose is saved within a second, so a woken room still knows where everyone stands", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  h.send(r, a, { t: "body", name: "a" });
  for (let i = 0; i < 5; i++) { h.advance(100); h.send(r, a, { t: "pose", x: 10 + i, y: 1, z: 2, yaw: 0.5 }); }
  h.advance(1000);
  assert.equal(a.store.x, 14, "the trailing pose reached the attachment");
  // Hibernation: the room's memory goes, its sockets and their attachments stay.
  const woken = h.room();
  await h.restored();
  assert.deepEqual([woken.players.get(1).x, woken.players.get(1).y, woken.players.get(1).z], [14, 1, 2]);
  // The woken room finds both players by their sockets, as before.
  h.send(woken, b, { t: "zone", name: "factory" });
  assert.equal(woken.players.get(2).zone, "factory");
  h.advance(100); h.send(woken, a, { t: "pose", x: 3, y: 0, z: 0, yaw: 0 });
  assert.equal(woken.players.get(1).x, 3);
});

test("a replaced or evicted socket finds no player", async () => {
  const h = host(), r = h.room();
  const old = await h.join(r, 1, "a");
  const fresh = await h.join(r, 1, "a");
  assert.equal(old.closed.code, protocol.CLOSE_KICK);
  h.send(r, old, { t: "zone", name: "factory" });
  assert.equal(r.players.get(1).zone, protocol.OUTSIDE, "the old tab's message is ignored");
  h.send(r, fresh, { t: "zone", name: "factory" });
  assert.equal(r.players.get(1).zone, "factory");
  r.webSocketClose(fresh, 1000, "", true);
  assert.ok(!r.players.has(1));
  h.send(r, fresh, { t: "zone", name: "outside" });
  assert.ok(!r.players.has(1), "a closed socket brings nobody back");
});


test("a failed deferred attachment closes only that socket and still saves every other pending pose", async () => {
  for (const brokenDrop of [false, true]) {
    const h = host(), r = h.room();
    await h.restored();
    const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
    h.send(r, a, { t: "body", name: "a" });
    h.send(r, b, { t: "body", name: "b" });
    h.advance(100);
    h.send(r, a, { t: "pose", x: 11, y: 0, z: 0, yaw: 0 });
    h.send(r, b, { t: "pose", x: 21, y: 0, z: 0, yaw: 0 });
    assert.ok(r.players.get(1).posePending && r.players.get(2).posePending);
    a.serializeAttachment = () => { throw new Error("attachment failed"); };
    if (brokenDrop) r.drop = () => { throw new Error("cleanup failed"); };
    assert.doesNotThrow(() => h.advance(1000), "the timer does not leak the failure");
    assert.equal(a.closed.code, protocol.CLOSE_ERROR, "even clearing the attachment can fail without preventing close");
    assert.equal(b.closed, null);
    assert.ok(!r.players.has(1) && !r.sockets.has(a));
    assert.equal(b.store.x, 21, "later pending saves still finish");
    assert.equal(r.players.get(2).posePending, false);
    assert.equal(r.poseTimer, 0, "no retry loop or abandoned pending timer");
    assert.ok(h.logged.length > 0, "the failure is recorded");
    const woken = h.room();
    await h.restored();
    assert.equal(woken.players.get(2).x, 21, "the healthy player's last pose survives hibernation");
    assert.ok(!woken.players.has(1));
  }
});

test("every player sees every other's dance number, a late joiner and a woken room too", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  h.send(r, a, { t: "body", name: "a" });
  h.send(r, b, { t: "body", name: "b" });
  const states = (ws) => ws.sent.filter((m) => m.t === "state");
  const dancesIn = (m) => { const out = {}; for (let i = 0; m.ds && i < m.ds.length; i += 2) out[m.ds[i]] = m.ds[i + 1]; return out; };
  h.advance(100);
  h.send(r, a, { t: "pose", x: 1, y: 0, z: 0, yaw: 0, d: 5 });
  h.send(r, b, { t: "pose", x: 2, y: 0, z: 0, yaw: 0, d: 0 });
  h.advance(100);
  assert.deepEqual(dancesIn(states(b).at(-1)), { 1: 5, 2: 0 }, "b sees a's move, and its own standing still");
  assert.deepEqual(dancesIn(states(a).at(-1)), { 1: 5, 2: 0 }, "a sees b's");
  // A new move standing still is a pose of its own, relayed as any other.
  h.send(r, a, { t: "pose", x: 1, y: 0, z: 0, yaw: 0, d: 9 });
  h.advance(100);
  assert.equal(dancesIn(states(b).at(-1))[1], 9);
  // Someone arriving later (b again, from a page opened afresh) is told it in the welcome, before any pose.
  const c = await h.join(r, 2, "b");
  h.send(r, c, { t: "body", name: "b" });
  const welcome = c.sent.find((m) => m.t === "welcome");
  assert.ok(welcome.features.includes(protocol.DANCE_FEATURE));
  assert.equal(welcome.players.find((p) => p.id === 1).d, 9);
  // A woken room still has it on the next snapshot.
  h.advance(1000);
  const woken = h.room();
  await h.restored();
  h.send(woken, c, { t: "pose", x: 3, y: 0, z: 0, yaw: 0, d: 2 });
  h.advance(100);
  assert.deepEqual(dancesIn(states(a).at(-1)), { 1: 9, 2: 2 });
  // A gorilla never dances, whatever its page says.
  h.send(woken, a, { t: "body", name: "gorilla:a" });
  h.advance(100);
  h.send(woken, a, { t: "pose", x: 1, y: 0, z: 0, yaw: 0, d: 4 });
  h.advance(100);
  assert.equal(dancesIn(states(c).at(-1))[1], undefined);
});
