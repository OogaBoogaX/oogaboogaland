// Private conversations (#188): the room's reading of a private message, and the real Room inviting, opening,
// relaying sealed frames it never keeps, holding a sender to its rate, blocking, ending and forgetting on a leave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";

const { parseClientMessage, PM_DATA_MAX, PM_BURST, PM_CONTROL_BURST, PM_FEATURE, CHAT_FRAME_MAX } = protocol;
const FRAME = "AQI" + "A".repeat(709);

test("a private message is an op toward a player, and data a bounded base64 frame with a number; anything else is ignored", () => {
  for (const op of ["invite", "accept", "decline", "block", "end"]) assert.deepEqual(parseClientMessage(JSON.stringify({ t: "pm", op, to: 7 })), { t: "pm", op, to: 7 });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "pm", op: "data", to: 7, d: FRAME, n: 3 })), { t: "pm", op: "data", to: 7, d: FRAME, n: 3 });
  for (const bad of [{ op: "invite" }, { op: "invite", to: 0 }, { op: "invite", to: "7" }, { op: "shout", to: 7 }, { op: "data", to: 7, d: FRAME },
    { op: "data", to: 7, d: FRAME, n: 0 }, { op: "data", to: 7, d: "AQI", n: 1 }, { op: "data", to: 7, d: "AQ<>", n: 1 }, { op: "data", to: 7, d: "A".repeat(PM_DATA_MAX + 4), n: 1 }]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pm", ...bad })), null, JSON.stringify(bad));
  }
  const long = JSON.stringify({ t: "pm", op: "data", to: 7, d: FRAME, n: 1 });
  assert.ok(long.length > 256 && long.length < CHAT_FRAME_MAX, "the largest frame fits a pm frame's allowance");
  assert.equal(parseClientMessage(JSON.stringify({ t: "zone", name: "x".repeat(300) })), false, "no other message earns it");
  assert.equal(parseClientMessage('{"t":"pm","t":"zone","name":"' + "x".repeat(300) + '"}'), false, "nor one that only starts like a private message");
});

const harness = () => {
  let now = 100000;
  const accepted = [], stored = [];
  const socket = () => ({
    sent: [], closed: null, store: null, writes: 0,
    send(text) { if (typeof text === "string") this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.writes++; this.store = JSON.parse(JSON.stringify(value)); },
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
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => Array.isArray(key) ? new Map() : undefined, put: async (key, value) => { stored.push(JSON.stringify([key, value])); }, getAlarm: async () => null, setAlarm: async () => {} },
  };
  const h = { room: new context.Room(ctx, {}), stored, advance: (ms) => { now += ms; } };
  h.send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg));
  h.join = async (id, login) => {
    const before = accepted.length;
    await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  h.leave = (ws) => { ws.closed = { code: 1000 }; h.room.webSocketClose(ws); };
  // A woken room: rebuilt from the sockets' attachments.
  h.wake = () => { h.room = new context.Room(ctx, {}); };
  return h;
};
const pm = (ws) => ws.sent.filter((m) => m.t === "pm");
const last = (ws) => pm(ws).at(-1);

test("room: an invite and its accept open one conversation, whose frames reach the other end alone and are never kept", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  assert.ok(a.sent.find((m) => m.t === "welcome").features.includes(PM_FEATURE), "the room says it relays private conversations");
  h.send(a, { t: "pm", op: "invite", to: 2 });
  assert.deepEqual(last(b), { t: "pm", op: "invite", from: 1 });
  assert.deepEqual(last(a), { t: "pm", op: "inviting", to: 2 });
  h.send(a, { t: "pm", op: "data", to: 2, d: FRAME, n: 1 });
  assert.deepEqual(last(a), { t: "pm", op: "refused", to: 2, n: 1, reason: "closed" }, "nothing passes before an accept");
  h.send(c, { t: "pm", op: "accept", to: 1 });
  assert.equal(last(c).reason, "withdrawn", "only the one invited can accept");
  h.send(b, { t: "pm", op: "accept", to: 1 });
  assert.deepEqual(last(a), { t: "pm", op: "open", with: 2 });
  assert.deepEqual(last(b), { t: "pm", op: "open", with: 1 });
  h.send(a, { t: "pm", op: "data", to: 2, d: FRAME, n: 2 });
  assert.deepEqual(last(b), { t: "pm", op: "data", from: 1, d: FRAME });
  assert.deepEqual(last(a), { t: "pm", op: "ok", to: 2, n: 2 });
  assert.ok(pm(c).every((m) => m.op === "refused"), "nobody else hears of it");
  h.send(c, { t: "pm", op: "data", to: 2, d: FRAME, n: 1 });
  assert.equal(last(c).reason, "closed", "a third player cannot write into it");
  h.send(c, { t: "pm", op: "invite", to: 1 });
  assert.equal(last(c).reason, "busy", "one conversation at a time");
  const kept = [...h.stored, ...[a, b, c].map((ws) => JSON.stringify(ws.store))].join("\n");
  assert.ok(!kept.includes(FRAME), "no frame in storage or any attachment");
  // A woken room still holds the conversation.
  h.wake();
  h.send(b, { t: "pm", op: "data", to: 1, d: FRAME, n: 9 });
  assert.deepEqual(last(a), { t: "pm", op: "data", from: 2, d: FRAME });
  assert.deepEqual(last(b), { t: "pm", op: "ok", to: 1, n: 9 });
  // A burst is held to the sender's rate.
  for (let n = 10; n < 10 + PM_BURST + 4; n++) h.send(a, { t: "pm", op: "data", to: 2, d: FRAME, n });
  assert.equal(pm(a).filter((m) => m.op === "refused" && m.reason === "rate").length, 4);
  h.send(b, { t: "pm", op: "end", to: 1 });
  assert.deepEqual(last(a), { t: "pm", op: "closed", from: 2, reason: "ended" });
  h.advance(5000);
  h.send(a, { t: "pm", op: "data", to: 2, d: FRAME, n: 30 });
  assert.equal(last(a).reason, "closed", "an ended conversation passes nothing");
});

test("room: a decline and a block answer the inviter, a block refuses them both ways, and a leave ends it all", async () => {
  const h = harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b"), c = await h.join(3, "c");
  h.send(c, { t: "pm", op: "invite", to: 1 });
  h.send(a, { t: "pm", op: "decline", to: 3 });
  assert.deepEqual(last(c), { t: "pm", op: "declined", from: 1 });
  h.send(c, { t: "pm", op: "invite", to: 1 });
  h.send(a, { t: "pm", op: "block", to: 3 });
  assert.deepEqual(last(c), { t: "pm", op: "declined", from: 1 });
  h.advance(20000);
  h.send(c, { t: "pm", op: "invite", to: 1 });
  assert.equal(last(c).reason, "unavailable", "blocked");
  h.send(a, { t: "pm", op: "invite", to: 3 });
  assert.equal(last(a).reason, "unavailable", "both ways");
  h.send(b, { t: "pm", op: "invite", to: 3 });
  h.send(b, { t: "pm", op: "end", to: 3 });
  assert.deepEqual(last(c), { t: "pm", op: "withdrawn", from: 2 }, "an invite taken back");
  h.send(c, { t: "pm", op: "accept", to: 2 });
  assert.equal(last(c).reason, "withdrawn");
  h.advance(20000);
  h.send(a, { t: "pm", op: "invite", to: 2 });
  h.send(b, { t: "pm", op: "invite", to: 1 });
  assert.deepEqual(last(a), { t: "pm", op: "open", with: 2 }, "two who invited each other are talking");
  h.send(c, { t: "pm", op: "invite", to: 2 });
  assert.equal(last(c).reason, "busy");
  h.leave(b);
  assert.deepEqual(last(a), { t: "pm", op: "closed", from: 2, reason: "left" });
  assert.equal(h.room.players.get(1).pm.open, 0);
  // A leave is not a no: an invite to or from someone who left says so, both ways.
  const d = await h.join(4, "a"), e = await h.join(5, "b"), f = await h.join(6, "c");
  h.send(d, { t: "pm", op: "invite", to: 5 });
  h.leave(e);
  assert.deepEqual(last(d), { t: "pm", op: "declined", from: 5, reason: "left" });
  h.send(f, { t: "pm", op: "invite", to: 4 });
  h.leave(f);
  assert.deepEqual(last(d), { t: "pm", op: "withdrawn", from: 6, reason: "left" });
  h.send(d, { t: "pm", op: "accept", to: 6 });
  assert.equal(last(d).reason, "offline", "an accept that arrives after the inviter left says they are gone");
});

test("room: a block and a spent invite rate stay with the account across its reconnects while the room is awake", async () => {
  const h = harness();
  const a = await h.join(1, "a"); await h.join(2, "b"); const c = await h.join(3, "c");
  h.send(a, { t: "pm", op: "block", to: 3 });
  const a2 = await h.join(1, "a");
  assert.equal(a.closed?.reason, "replaced", "the older socket is replaced");
  h.send(c, { t: "pm", op: "invite", to: 1 });
  assert.equal(last(c).reason, "unavailable", "the block outlived the reconnect");
  // Three invites spend the burst; a reconnect does not refill it.
  for (let i = 0; i < 3; i++) h.send(a2, { t: "pm", op: "invite", to: 2 });
  await h.join(1, "a");
  const a3 = h.room.players.get(1).ws;
  h.send(a3, { t: "pm", op: "invite", to: 2 });
  assert.equal(last(a3).reason, "rate", "the rate outlived the reconnect");
});

// MrHodlX's review of #436: block, decline and end had no rate, and a block rewrote the attachment every time.
test("room: block, decline and end are held to a rate, and blocking someone already blocked writes nothing", async () => {
  const h = harness();
  const a = await h.join(1, "a"); await h.join(2, "b"); await h.join(3, "c");
  h.send(a, { t: "pm", op: "block", to: 3 });
  const writes = a.writes;
  for (let i = 0; i < 4; i++) h.send(a, { t: "pm", op: "block", to: 3 });
  assert.equal(a.writes, writes, "the same block again changes nothing, so nothing is written");
  h.advance(60000);
  for (let id = 100; id < 140; id++) h.send(a, { t: "pm", op: "block", to: id });
  assert.equal(h.room.players.get(1).pm.blocked.length, 1 + PM_CONTROL_BURST, "a flood of controls stops at the burst");
  h.advance(60000);
  h.send(a, { t: "pm", op: "block", to: 200 });
  assert.ok(h.room.players.get(1).pm.blocked.includes(200), "the rate refills");
});
