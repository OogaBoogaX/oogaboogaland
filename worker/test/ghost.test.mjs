// HALLOWEEN: the arcade's ghost hunt's follower messages: parsed within bounds, relayed through the real Room to the
// ghost arena's host alone, never from the host itself or a page outside the arena, and throttled; and the arena's own
// host, its state frames and its followers' reports kept to the pages in the arena.
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
  assert.deepEqual(parseClientMessage('{"t":"ghost","k":"leave"}'), { t: "ghost", k: "leave" }, "a hunter quits the hunt");
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
const ghosts = (ws) => ws.sent.filter((m) => m.t === "ghost");

test("a follower's ghost report reaches the arena's host alone, and nothing from the host or a page outside the arena is relayed", async () => {
  const h = harness();
  const host = await h.join(1, "a"), follower = await h.join(2, "b"), away = await h.join(3, "c");
  for (const [ws, name] of [[host, "a"], [follower, "b"], [away, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(host, { t: "zone", name: "ghost-arena" });
  await h.send(follower, { t: "zone", name: "ghost-arena" });
  await h.send(away, { t: "hub", on: true });
  assert.equal(h.room.ghostHostId, 1, "the first page in the arena hosts");
  await h.send(follower, { t: "ghost", k: "hit", g: 4, d: 2 });
  await h.send(follower, { t: "ghost", k: "start" });
  await h.send(follower, { t: "ghost", k: "hits", h: [0, 12, 4, 6] });
  assert.deepEqual(ghosts(host), [{ t: "ghost", k: "hit", g: 4, d: 2, from: 2 }, { t: "ghost", k: "start", from: 2 }, { t: "ghost", k: "hits", h: [0, 12, 4, 6], from: 2 }]);
  assert.equal(ghosts(follower).length + ghosts(away).length, 0, "only the host hears the hunt's reports");
  await h.send(away, { t: "ghost", k: "start" });
  await h.send(host, { t: "ghost", k: "start" });
  assert.equal(ghosts(host).length, 3, "a page outside the arena and the host itself are not relayed");
});

test("a follower's ghost reports are throttled to a burst, and come back with time", async () => {
  const h = harness();
  const host = await h.join(1, "a"), follower = await h.join(2, "b");
  for (const [ws, name] of [[host, "a"], [follower, "b"]]) { await h.send(ws, { t: "body", name }); await h.send(ws, { t: "zone", name: "ghost-arena" }); }
  for (let i = 0; i < protocol.GHOST_BURST + 8; i++) await h.send(follower, { t: "ghost", k: "hit", g: i, d: 1 });
  assert.equal(ghosts(host).length, protocol.GHOST_BURST);
  h.advance(1000);
  await h.send(follower, { t: "ghost", k: "hit", g: 99, d: 1 });
  assert.equal(ghosts(host).length, protocol.GHOST_BURST + 1);
});

test("the ghost arena elects its own host; its state frames reach the arena alone, and its followers report to it", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  for (const [ws, name] of [[a, "a"], [b, "b"], [c, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(c, { t: "hub", on: true });
  await h.send(a, { t: "zone", name: "ghost-arena" });
  await h.send(b, { t: "zone", name: "ghost-arena" });
  assert.equal(h.room.ghostHostId, 1, "the first page in the arena hosts its hunt");
  assert.equal(h.room.hostId, 3, "the island keeps its own NPC host");
  await h.send(b, { t: "ghost", k: "ready" });
  assert.deepEqual(ghosts(a), [{ t: "ghost", k: "ready", from: 2 }], "a follower in the arena reports to the arena's host");
  assert.equal(ghosts(c).length, 0, "not to the island's");
  const frame = new ArrayBuffer(16);
  new DataView(frame).setUint32(0, protocol.GHOST_MAGIC, true);
  await h.room.webSocketMessage(a, frame);
  assert.equal(b.bins.length, 1, "a page in the arena hears the hunt");
  assert.equal(c.bins.length, 0, "a page on the island does not");
  await h.room.webSocketMessage(b, frame);
  assert.equal(a.bins.length, 0, "only the arena's host sends its state");
  await h.send(c, { t: "zone", name: "arcade-hunt" });
  assert.equal(c.bins.length, 1, "a page walking in catches up with the hunt's last state");
  await h.send(a, { t: "zone", name: "arcade.hall" });
  assert.equal(h.room.ghostHostId, 2, "the host walking out hands the hunt on");
  assert.ok(b.sent.some((m) => m.t === "ghost-host" && m.id === 2 && m.followers === 1), "every page hears the new host");
  const big = new ArrayBuffer(protocol.GHOST_FRAME_MAX + 4);
  new DataView(big).setUint32(0, protocol.GHOST_MAGIC, true);
  await h.room.webSocketMessage(b, big);
  assert.equal(c.bins.length, 1, "a frame over the cap is dropped");
});

test("a hidden page hands the arena's hosting on, and comes back a follower", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  for (const [ws, name] of [[a, "a"], [b, "b"]]) { await h.send(ws, { t: "body", name }); await h.send(ws, { t: "zone", name: "ghost-arena" }); }
  assert.equal(h.room.ghostHostId, 1);
  await h.send(a, { t: "visible", on: false });
  assert.equal(h.room.ghostHostId, 2, "the visible page takes the hunt over");
  assert.ok(b.sent.some((m) => m.t === "ghost-host" && m.id === 2 && m.followers === 1), "and every page hears it");
  await h.send(a, { t: "visible", on: true });
  assert.equal(h.room.ghostHostId, 2, "shown again, the first page follows");
  await h.send(b, { t: "visible", on: false });
  await h.send(a, { t: "visible", on: false });
  assert.equal(h.room.ghostHostId, 0, "with every arena page hidden, nobody hosts");
  assert.equal(protocol.parseClientMessage('{"t":"visible","on":"yes"}'), null, "a visibility report must be a flag");
});

test("a spectator in the arena's hallway watches the hunt but neither hosts nor reports to it", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  for (const [ws, name] of [[a, "a"], [b, "b"], [c, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(a, { t: "zone", name: "arcade-hunt" });
  await h.send(b, { t: "zone", name: "arcade.haunt" });
  await h.send(c, { t: "zone", name: "arcade.hall" });
  assert.equal(h.room.ghostHostId, 1);
  assert.equal(h.room.ghostFollowers, 1, "the hallway's spectator follows, so the host sends");
  const frame = new ArrayBuffer(16);
  new DataView(frame).setUint32(0, protocol.GHOST_MAGIC, true);
  await h.room.webSocketMessage(a, frame);
  assert.equal(b.bins.length, 1, "the hallway hears the hunt");
  assert.equal(c.bins.length, 0, "the rest of the hall does not");
  await h.send(b, { t: "ghost", k: "ready" });
  assert.equal(ghosts(a).length, 0, "a spectator outside the arena cannot ready up");
  // #422: past the hallway's midpoint the spectator is on the arena's half: still watching, still not a hunter, and not
  // handed the kept frame again for a step it already follows.
  await h.send(b, { t: "zone", name: "ghost-arena.haunt" });
  assert.equal(b.bins.length, 1, "crossing the hallway's midpoint resends nothing");
  await h.room.webSocketMessage(a, frame);
  assert.equal(b.bins.length, 2, "the arena's half of the hallway hears the hunt");
  await h.send(b, { t: "ghost", k: "ready" });
  assert.equal(ghosts(a).length, 0, "and cannot ready up either");
  assert.equal(h.room.ghostFollowers, 1);
  assert.ok(protocol.inGhostArena({ zone: "arcade.arena" }), "a page loaded before #422 still reports the arena by its old zone");
  await h.send(a, { t: "zone", name: "arcade.haunt" });
  assert.equal(h.room.ghostHostId, 0, "nobody in the hallway hosts");
  await h.send(c, { t: "zone", name: "arcade.haunt" });
  assert.equal(c.bins.length, 0, "and with no host, no kept frame is handed on");
});

test("the arena's kept frame is dropped once nobody follows, so the next page in is not handed a stale hunt", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  for (const [ws, name] of [[a, "a"], [b, "b"], [c, "c"]]) await h.send(ws, { t: "body", name });
  await h.send(a, { t: "zone", name: "arcade-hunt" });
  await h.send(b, { t: "zone", name: "arcade-hunt" });
  const frame = new ArrayBuffer(16);
  new DataView(frame).setUint32(0, protocol.GHOST_MAGIC, true);
  await h.room.webSocketMessage(a, frame);
  assert.equal(b.bins.length, 1);
  await h.send(b, { t: "zone", name: "arcade.hall" });
  assert.equal(h.room.lastGhost, null, "the last follower leaving drops the kept frame");
  await h.room.webSocketMessage(a, frame);
  assert.equal(h.room.lastGhost, null, "nor is one kept while nobody follows");
  await h.send(c, { t: "zone", name: "ghost-arena" });
  assert.equal(c.bins.length, 0, "the next page in waits for the host's own frame");
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
