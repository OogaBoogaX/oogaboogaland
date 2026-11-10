// The Timechain Sphere doorway through the real Room with a small Cloudflare host mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";

const host = () => {
  let now = 100000;
  const accepted = [], alarms = [], runtime = { listed: null, pinged: null };
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response {
    constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; }
    async json() { return JSON.parse(this.body); }
  }
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
    getWebSockets: () => runtime.listed || accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => runtime.pinged,
    storage: {
      // As Cloudflare's storage: an array of keys answers a Map of those found.
      get: async (key) => Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key),
      put: async (key, value) => stored.set(key, value), getAlarm: async () => alarms.length ? alarms.at(-1) : null,
      setAlarm: async (at) => alarms.push(at),
    },
  };
  const room = () => new context.Room(ctx, {});
  const join = async (r, id, login) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (r, ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg));
  const enter = async (r, ws, name, zone = "sphere") => {
    await send(r, ws, { t: "body", name });
    await send(r, ws, { t: "pose", x: 1, y: 2, z: 3, yaw: 0 });
    await send(r, ws, { t: "zone", name: zone });
  };
  return { room, join, send, enter, accepted, alarms, runtime, advance: (ms) => { now += ms; }, now: () => now };
};

const messages = (ws, t, op) => ws.sent.filter((m) => m.t === t && (op === undefined || m.op === op));

test("the exterior doorway is FIFO, starts only after go, and releases on completion", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a"); await h.enter(r, b, "b");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 7 });
  await h.send(r, b, { t: "door", op: "ask", dir: "out", room: 2 });
  const grantA = messages(a, "door", "grant").at(-1);
  assert.ok(grantA && !messages(a, "transit").length);
  assert.equal(messages(b, "door", "wait").at(-1).ahead, 0);
  await h.send(r, a, { t: "door", op: "go", cycle: grantA.cycle });
  const started = messages(a, "door", "started").at(-1);
  assert.ok(started.exp > grantA.exp, "the crossing receives its own full lease");
  assert.equal(messages(b, "transit").at(-1).actor, 1);
  await h.send(r, a, { t: "door", op: "done", cycle: grantA.cycle });
  assert.equal(messages(b, "transit-end").at(-1).cycle, grantA.cycle);
  assert.ok(messages(b, "door", "grant").length, "the next request is granted immediately");
});

test("leases expire by alarm, disconnects release the doorway, and room transits stay in one room", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b"), c = await h.join(r, 3, "c");
  await h.enter(r, a, "a"); await h.enter(r, b, "b"); await h.enter(r, c, "c");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 1 });
  await h.send(r, b, { t: "door", op: "ask", dir: "in", room: 2 });
  h.advance(protocol.DOOR_GRANT_MS + 1);
  await r.alarm();
  assert.ok(messages(b, "door", "grant").length, "an unused grant lapses without an idle timer");
  r.webSocketClose(b);
  assert.equal(r.doorActive, null, "the active owner cannot strand the doorway on disconnect");

  await h.send(r, a, { t: "zone", name: "sphere-7" });
  await h.send(r, a, { t: "door", op: "pass", door: "sphere-7", dir: "in" });
  await h.send(r, c, { t: "zone", name: "sphere-8" });
  assert.equal(messages(c, "transit").filter((m) => m.door === "sphere-7").length, 0);
  await h.send(r, c, { t: "zone", name: "sphere-7" });
  assert.equal(messages(c, "transit").at(-1).door, "sphere-7", "a late observer receives the active transit on entering that exact room");
});

test("a room locked from inside keeps everyone out but those with its PIN, and opens when its last occupant goes", async () => {
  const h = host(), r = h.room(), inside = await h.join(r, 1, "a"), friend = await h.join(r, 2, "b"), stranger = await h.join(r, 3, "c");
  await h.enter(r, inside, "a", "sphere-1");
  await h.enter(r, friend, "b", "sphere");
  await h.enter(r, stranger, "c", "sphere");
  assert.ok(messages(friend, "welcome").at(-1).features.includes("room-lock-v1"));
  assert.deepEqual(messages(friend, "welcome").at(-1).locks, []);
  await h.send(r, friend, { t: "door", op: "lock", room: 1, pin: "1234" });
  assert.equal(messages(friend, "door", "lock-result").at(-1).reason, "wrong-room", "only someone inside locks a room");
  await h.send(r, inside, { t: "door", op: "lock", room: 1, pin: "1234" });
  assert.equal(messages(inside, "door", "lock-result").at(-1).ok, true);
  assert.deepEqual(messages(stranger, "door", "locks").at(-1).rooms, [1], "everyone hears which rooms are locked");
  assert.deepEqual(messages(inside, "door", "room-pin").at(-1), { t: "door", op: "room-pin", room: 1, pin: "1234" }, "those inside are shown the PIN");
  assert.ok(!JSON.stringify(stranger.sent).includes("1234") && !JSON.stringify(friend.sent).includes("1234"), "nobody outside is told the PIN");
  await h.send(r, stranger, { t: "door", op: "ask", dir: "in", room: 1 });
  assert.equal(messages(stranger, "door", "denied").at(-1).reason, "locked");
  await h.send(r, stranger, { t: "zone", name: "sphere-1" });
  assert.equal(r.players.get(3).zone, "sphere", "a locked room's zone cannot simply be claimed");
  await h.send(r, stranger, { t: "door", op: "try", room: 1, pin: "0000" });
  assert.equal(messages(stranger, "door", "lock-result").at(-1).reason, "wrong");
  await h.send(r, friend, { t: "door", op: "try", room: 1, pin: "1234" });
  assert.equal(messages(friend, "door", "lock-result").at(-1).ok, true);
  await h.send(r, friend, { t: "door", op: "ask", dir: "in", room: 1 });
  assert.ok(messages(friend, "door", "grant").length, "the right PIN opens the door");
  await h.send(r, friend, { t: "door", op: "cancel" });
  await h.send(r, friend, { t: "zone", name: "sphere-1" });
  assert.equal(r.players.get(2).zone, "sphere-1");
  assert.equal(messages(friend, "door", "room-pin").at(-1).pin, "1234", "someone walking in is shown it too");
  await h.send(r, friend, { t: "zone", name: "sphere" });
  await h.send(r, friend, { t: "zone", name: "sphere-1" });
  assert.equal(r.players.get(2).zone, "sphere", "a pass is spent on walking in, so someone who left needs the PIN again");
  await h.send(r, inside, { t: "zone", name: "sphere" });
  assert.deepEqual(messages(stranger, "door", "locks").at(-1).rooms, [], "the room opens by itself once nobody is inside");
  await h.send(r, stranger, { t: "zone", name: "sphere-1" });
  assert.equal(r.players.get(3).zone, "sphere-1");
});

test("anyone inside may unlock, wrong tries run out, and a lock survives hibernation in its occupants' sockets", async () => {
  const h = host(), r = h.room(), inside = await h.join(r, 1, "a"), outside = await h.join(r, 2, "b");
  await h.enter(r, inside, "a", "sphere-1");
  await h.enter(r, outside, "b", "sphere");
  await h.send(r, inside, { t: "door", op: "lock", room: 1, pin: "4321" });
  await h.send(r, inside, { t: "door", op: "lock", room: 1, pin: "9999" });
  assert.equal(messages(inside, "door", "lock-result").at(-1).reason, "already-locked");
  h.runtime.listed = h.accepted.filter((ws) => !ws.closed);
  const woken = h.room();
  assert.deepEqual([...woken.roomLocks.keys()], [1], "the lock comes back from the occupants' attachments");
  for (let i = 0; i < 5; i++) { h.advance(1000); await h.send(woken, outside, { t: "door", op: "try", room: 1, pin: "0000" }); }
  h.advance(1000);
  await h.send(woken, outside, { t: "door", op: "try", room: 1, pin: "4321" });
  assert.equal(messages(outside, "door", "lock-result").at(-1).reason, "wait", "five wrong tries make a socket wait, even with the right PIN");
  h.advance(61000);
  await h.send(woken, outside, { t: "door", op: "try", room: 1, pin: "4321" });
  assert.equal(messages(outside, "door", "lock-result").at(-1).ok, true);
  await h.send(woken, outside, { t: "door", op: "unlock", room: 1 });
  assert.equal(messages(outside, "door", "lock-result").at(-1).reason, "wrong-room", "only someone inside opens it");
  h.advance(1000);
  await h.send(woken, inside, { t: "door", op: "unlock", room: 1 });
  assert.equal(messages(inside, "door", "lock-result").at(-1).ok, true);
  assert.deepEqual(messages(outside, "door", "locks").at(-1).rooms, []);
  assert.equal(woken.players.get(1).roomLock, null);
});

test("wrong PIN tries are the player's: a reconnect or a hibernation does not start them again", async () => {
  const h = host(), r = h.room(), inside = await h.join(r, 1, "a");
  let outside = await h.join(r, 2, "b");
  await h.enter(r, inside, "a", "sphere-1");
  await h.enter(r, outside, "b", "sphere");
  await h.send(r, inside, { t: "door", op: "lock", room: 1, pin: "2468" });
  const wrong = async (room, ws) => { h.advance(1000); await h.send(room, ws, { t: "door", op: "try", room: 1, pin: "0000" }); return messages(ws, "door", "lock-result").at(-1).reason; };
  for (let i = 0; i < 4; i++) await wrong(r, outside);
  r.webSocketClose(outside);
  outside = await h.join(r, 2, "b");
  await h.enter(r, outside, "b", "sphere");
  assert.equal(await wrong(r, outside), "wrong", "the fifth try is still answered");
  h.advance(1000);
  await h.send(r, outside, { t: "door", op: "try", room: 1, pin: "2468" });
  assert.equal(messages(outside, "door", "lock-result").at(-1).reason, "wait", "four tries, a reconnect and one more still make the player wait");
  h.advance(61000);
  for (let i = 0; i < 4; i++) await wrong(r, outside);
  h.runtime.listed = h.accepted.filter((ws) => !ws.closed);
  const woken = h.room();
  assert.equal(await wrong(woken, outside), "wrong");
  h.advance(1000);
  await h.send(woken, outside, { t: "door", op: "try", room: 1, pin: "2468" });
  assert.equal(messages(outside, "door", "lock-result").at(-1).reason, "wait", "the tally comes back with the socket after hibernation");
  h.advance(61000);
  await h.send(woken, outside, { t: "door", op: "try", room: 1, pin: "2468" });
  assert.equal(messages(outside, "door", "lock-result").at(-1).ok, true, "the wait passes, and the right PIN opens the door");
});

test("a cancelled door alarm does not pull the ordinary account sweep forward", async () => {
  const h = host(), r = h.room(), a = await h.join(r, 1, "a");
  await h.enter(r, a, "a");
  const sweepAt = r.sweepAt;
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 1 });
  await h.send(r, a, { t: "door", op: "cancel" });
  h.advance(protocol.DOOR_GRANT_MS + 1);
  await r.alarm();
  assert.equal(r.sweepAt, sweepAt);
});

test("a woken room keeps the pile loop's phase and the account sweep it stored", async () => {
  const settle = () => new Promise(setImmediate);
  const h = host(), r = h.room();
  await settle();
  const born = r.loopEpoch;
  assert.ok(born > 0);
  assert.equal(r.sweepAt, born + protocol.SWEEP_MS);
  h.advance(30000);
  const woken = h.room();
  await settle();
  assert.equal(woken.loopEpoch, born, "every page keeps hearing the same crackle");
  assert.equal(woken.sweepAt, born + protocol.SWEEP_MS, "a wake does not push the sweep out");
});

test("a hibernated room reconstructs its active lease and in-flight room transit", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a"); await h.enter(r, b, "b");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 4 });
  const grant = messages(a, "door", "grant").at(-1);
  await h.send(r, a, { t: "door", op: "go", cycle: grant.cycle });
  const woken = h.room();
  assert.equal(woken.doorActive.id, 1);
  assert.equal(woken.doorActive.phase, "active");
  await h.send(woken, b, { t: "zone", name: "sphere" });
  assert.equal(messages(b, "transit").at(-1).cycle, grant.cycle);
});

test("a voice pull is closed if its room membership changes while the SFU answers", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a", "sphere-1"); await h.enter(r, b, "b", "sphere-1");
  const pa = r.players.get(1), pb = r.players.get(2);
  pa.voice = { pub: "pub-a", sub: "sub-a", track: "mic", gen: 1 };
  pb.voice = { pub: "pub-b", sub: "sub-b", track: "mic", gen: 1 };
  let answer, began;
  const ready = new Promise((resolve) => { answer = resolve; });
  const started = new Promise((resolve) => { began = resolve; });
  const closed = [];
  r.sfu = {
    newTracks: async () => { began(); return ready; },
    closeTracks: async (session, mids) => { closed.push({ session, mids }); return { tracks: mids.map((mid) => ({ mid })) }; },
  };
  const pending = r.voiceRequest("pull", { headers: new Headers({ "x-player-id": "1", "x-room-token": pa.connectionToken }), json: async () => ({ ids: [2] }) });
  await started;
  await h.send(r, a, { t: "zone", name: "sphere-2" });
  answer({ tracks: [{ sessionId: "pub-b", mid: "7" }], sessionDescription: { type: "answer", sdp: "x" } });
  const response = await pending, body = await response.json();
  assert.deepEqual(body.tracks, []);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].session, "sub-a");
  assert.equal(Array.from(closed[0].mids).join(","), "7");
});

const woken = async (h) => { const r = h.room(); await new Promise((resolve) => setImmediate(resolve)); return r; };

test("a woken room keeps the socket that replaced a half-open one, and brings back nobody it evicted", async () => {
  const h = host(), r = h.room(), dead = await h.join(r, 1, "a");
  await h.send(r, dead, { t: "body", name: "a" });
  const live = await h.join(r, 1, "a");
  assert.equal(dead.closed.reason, "replaced");
  assert.equal(dead.store, null, "an evicted socket carries no player");
  // As the runtime lists them after a wake: newest first, the half-open one still closing.
  dead.readyState = 2; live.readyState = 1; h.runtime.listed = [live, dead];
  dead.store = JSON.parse(JSON.stringify(live.store));
  let room = await woken(h);
  assert.equal(room.players.get(1).ws, live, "the live page's frames are not dropped");
  await h.send(room, live, { t: "zone", name: "sphere" });
  assert.equal(room.players.get(1).zone, "sphere");
  // And one that was evicted, with no newer socket, stays gone.
  h.runtime.listed = [dead];
  room = await woken(h);
  assert.equal(room.players.size, 0, "a closing socket is no player");
});

test("a woken room still finds a socket gone silent, and leaves one still pinging alone", async () => {
  const h = host(), r = h.room(), a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  h.advance(protocol.STALE_MS + 1000);
  h.runtime.pinged = new Date(h.now() - 1000);
  let room = await woken(h);
  room.sweepAt = 0;
  await room.alarm();
  assert.equal(a.closed, null, "pings answered without waking the room count as heard");
  h.runtime.pinged = new Date(h.now() - protocol.STALE_MS - 500);
  room = await woken(h);
  room.sweepAt = 0;
  await room.alarm();
  assert.equal(a.closed.reason, "stale");
  assert.equal(b.closed.reason, "stale");
});

test("a lease that ran out while the room slept hands the doors to the next in the queue", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a"); await h.enter(r, b, "b");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 1 });
  await h.send(r, b, { t: "door", op: "ask", dir: "in", room: 2 });
  assert.equal(messages(b, "door", "grant").length, 0);
  h.advance(protocol.DOOR_GRANT_MS + 1);
  await woken(h);
  assert.equal(messages(b, "door", "grant").length, 1);
});

test("the frames every page hears are held to a rate, well over any page's", async () => {
  const h = host(), r = h.room(), a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  for (let i = 0; i < 200; i++) await h.send(r, a, { t: "zone", name: i % 2 ? "sphere" : "outside" });
  const heard = b.sent.filter((m) => m.t === "zone").length;
  assert.ok(heard > 2 && heard <= protocol.CONTROL_BURST, `heard ${heard}`);
  h.advance(10000);
  await h.send(r, a, { t: "zone", name: "sphere-7" });
  assert.equal(b.sent.filter((m) => m.t === "zone").at(-1).name, "sphere-7", "and it comes back");
});
