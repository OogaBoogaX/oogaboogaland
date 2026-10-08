// Ooga Chat: the wire rules as pure functions, then the real room driven through its own fetch and socket
// handlers with the Cloudflare host, sockets and storage mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sfuClient } from "../src/sfu.js";

const { CHAT_BURST, CHAT_FRAME_MAX, CHAT_HZ, CHAT_KEEP, CHAT_MAX, CHAT_RETRY_KEEP, MESSAGE_MAX, chatLog, parseClientMessage, sanitizeChat, takeToken } = protocol;
const chat = (text) => JSON.stringify({ t: "chat", text });

test("a chat line is sanitized text of 1 to CHAT_MAX characters; anything else is ignored, never fatal", () => {
  assert.deepEqual(parseClientMessage(chat("Ooga booga!")), { t: "chat", text: "Ooga booga!" });
  assert.deepEqual(parseClientMessage(chat("  padded  ")), { t: "chat", text: "padded" });
  for (const bad of ["", "   ", "\n\t", "<>{}[]", "🍌🍌"]) assert.equal(parseClientMessage(chat(bad)), null, JSON.stringify(bad));
  for (const bad of [{ t: "chat" }, { t: "chat", text: 42 }, { t: "chat", text: null }, { t: "chat", text: ["hi"] }]) assert.equal(parseClientMessage(JSON.stringify(bad)), null);
  assert.deepEqual(parseClientMessage(chat("a".repeat(CHAT_MAX))), { t: "chat", text: "a".repeat(CHAT_MAX) });
  assert.equal(parseClientMessage(chat("a".repeat(CHAT_MAX + 1))), null, "one over the limit is dropped, not cut");
  // The limit counts what is left after sanitizing.
  assert.deepEqual(parseClientMessage(chat("a".repeat(CHAT_MAX - 10) + "<>".repeat(40))), { t: "chat", text: "a".repeat(CHAT_MAX - 10) });
});

test("client-supplied names and ids are dropped: a chat parses to its text alone", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "chat", text: "hi", login: "satoshi", name: "Satoshi", id: 1, at: 0 })), { t: "chat", text: "hi" });
});

test("sanitize keeps the donation message character set and strips markup", () => {
  assert.equal(sanitizeChat('<img src=x onerror="alert(1)">hi'), "img srcx onerroralert1hi");
  assert.equal(sanitizeChat("gm @ooga #1: it's 4:20, ok? yes! a-b_c."), "gm @ooga #1: it's 4:20, ok? yes! a-b_c.");
  assert.equal(sanitizeChat("café ünïcode\u0000\u202e"), "caf ncode");
  // The same rule as donations.sanitize, read from the page's own module.
  const context = { window: {} };
  runInNewContext(readFileSync(new URL("../../src/js/donations.js", import.meta.url), "utf8"), context);
  const donation = context.window.BL.donations.sanitize;
  const samples = [String.fromCharCode(...Array.from({ length: 128 }, (_, i) => i)), "  <b>bold</b> & \"quotes\"  ", "émoji 🍌 and ✓", "a\nb\tc"];
  for (const s of samples) assert.equal(sanitizeChat(s), donation(s, Infinity), JSON.stringify(s));
});

test("a long chat frame is ignored, not closed; every other frame keeps MESSAGE_MAX", () => {
  const long = chat("a".repeat(600));
  assert.ok(long.length > MESSAGE_MAX && long.length <= CHAT_FRAME_MAX);
  assert.equal(parseClientMessage(long), null, "a chat frame over MESSAGE_MAX is read and its overlong line dropped");
  assert.equal(parseClientMessage(chat("a".repeat(CHAT_FRAME_MAX))), null, "past CHAT_FRAME_MAX it is dropped unread");
  assert.equal(parseClientMessage(chat("a".repeat(1 << 20))), null);
  // A raw line that sanitizes under the limit still arrives, even in a frame over MESSAGE_MAX.
  assert.deepEqual(parseClientMessage(chat("hello " + "\u2603".repeat(300))), { t: "chat", text: "hello" });
  // Everything else as before.
  assert.equal(parseClientMessage(" ".repeat(MESSAGE_MAX + 1)), false);
  assert.equal(parseClientMessage(JSON.stringify({ t: "zone", name: "x".repeat(MESSAGE_MAX) })), false);
  assert.equal(parseClientMessage(JSON.stringify({ t: "teleport", pad: "x".repeat(MESSAGE_MAX) })), false);
  assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 1, y: 0, z: 0, yaw: 0, pad: "x".repeat(MESSAGE_MAX) })), false);
  // A chat prefix does not lend its length to another type, through a repeated key, nor make garbage readable.
  assert.equal(parseClientMessage(`{"t":"chat","t":"pose","x":1,"y":0,"z":0,"yaw":0,"pad":"${"x".repeat(MESSAGE_MAX)}"}`), false);
  assert.equal(parseClientMessage(`{"t":"chat",${"x".repeat(MESSAGE_MAX)}`), false);
  assert.deepEqual(parseClientMessage('{"t":"pose","x":1,"y":0,"z":0,"yaw":0}'), { t: "pose", x: 1, y: 0, z: 0, yaw: 0 });
});

test("the chat ring keeps exactly the last CHAT_KEEP lines, oldest first", () => {
  const log = chatLog();
  assert.deepEqual(log.list(), []);
  for (let i = 0; i < 40; i++) log.push({ id: i });
  assert.deepEqual(log.list().map((m) => m.id), Array.from({ length: 40 }, (_, i) => i));
  for (let i = 40; i < 150; i++) log.push({ id: i });
  assert.equal(log.size, CHAT_KEEP);
  assert.deepEqual(log.list().map((m) => m.id), Array.from({ length: CHAT_KEEP }, (_, i) => 150 - CHAT_KEEP + i));
  const one = chatLog(1);
  one.push("a"); one.push("b");
  assert.deepEqual(one.list(), ["b"]);
});

test("the chat bucket: CHAT_BURST at once, then CHAT_HZ a second, never banking more than the burst", () => {
  const b = { tokens: CHAT_BURST, at: 0 };
  let spent = 0;
  for (let i = 0; i < 10; i++) if (takeToken(b, CHAT_HZ, 0, CHAT_BURST)) spent++;
  assert.equal(spent, CHAT_BURST);
  assert.ok(!takeToken(b, CHAT_HZ, 999, CHAT_BURST));
  assert.ok(takeToken(b, CHAT_HZ, 1000, CHAT_BURST));
  spent = 0;
  for (let i = 0; i < 10; i++) if (takeToken(b, CHAT_HZ, 600000, CHAT_BURST)) spent++;
  assert.equal(spent, CHAT_BURST, "a long silence still allows only a burst");
  // Without a burst the bucket is the old one: `rate` deep.
  const move = { tokens: 20, at: 0 };
  spent = 0;
  for (let i = 0; i < 40; i++) if (takeToken(move, 20, 0)) spent++;
  assert.equal(spent, 20);
});

// The real Room, on a mocked Durable Object host.
const host = () => {
  const accepted = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.status = init.status; this.webSocket = init.webSocket; } }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, sfuClient, CAST_ROWS: [{ handle: "YellowBrokeIt", github_login: "YellowBrokeIt" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, Date, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed),
    storage: { get: async () => undefined, put: async () => {}, getAlarm: async () => 0, setAlarm: async () => {} },
  };
  const room = () => new context.Room(ctx, {});
  const join = async (r, id, login, display) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-display": display }) });
    return accepted[before];
  };
  return { room, join };
};
const said = (ws) => ws.sent.filter((m) => m.t === "chat");

test("room: a joiner gets welcome then the held lines; a line goes to everyone, named by the session", async () => {
  const { room, join } = host();
  const r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  assert.deepEqual(a.sent.map((m) => m.t), ["welcome", "chat-history"], "history follows welcome as its own message");
  assert.deepEqual(a.sent[1].messages, []);
  const b = await join(r, 2, "booga", "Booga");
  r.webSocketMessage(a, JSON.stringify({ t: "chat", text: "hi <b>all</b>", login: "satoshi", name: "Satoshi", id: 7 }));
  for (const ws of [a, b]) {
    const [m] = said(ws);
    assert.equal(m.login, "ooga");
    assert.equal(m.name, "Ooga");
    assert.equal(m.text, "hi ballb");
    assert.ok(Number.isSafeInteger(m.id) && m.id !== 7 && Number.isFinite(m.at));
    assert.deepEqual(Object.keys(m).sort(), ["at", "id", "login", "name", "t", "text"]);
  }
  const c = await join(r, 3, "late", "Late");
  assert.deepEqual(c.sent[1].messages.map((m) => [m.login, m.name, m.text]), [["ooga", "Ooga", "hi ballb"]]);
});

test("room: a joiner gets exactly the last CHAT_KEEP lines in order; ids only grow", async () => {
  const { room, join } = host();
  const r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  const p = r.players.get(1);
  for (let i = 0; i < 150; i++) {
    p.chatBucket.tokens = CHAT_BURST;
    r.webSocketMessage(a, chat(`line ${i}`));
  }
  assert.equal(said(a).length, 150);
  const b = await join(r, 2, "booga", "Booga");
  const history = b.sent.find((m) => m.t === "chat-history").messages;
  assert.equal(history.length, CHAT_KEEP);
  assert.deepEqual(history.map((m) => m.text), Array.from({ length: CHAT_KEEP }, (_, i) => `line ${150 - CHAT_KEEP + i}`));
  assert.ok(history.every((m, i) => !i || m.id > history[i - 1].id));
});

test("room: over the rate a line is refused to its sender and the socket stays", async () => {
  const { room, join } = host();
  const r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  const b = await join(r, 2, "booga", "Booga");
  for (let i = 0; i < 10; i++) r.webSocketMessage(a, chat(`spam ${i}`));
  assert.equal(said(a).length, CHAT_BURST);
  assert.equal(a.sent.filter((m) => m.t === "chat-rejected").length, 10 - CHAT_BURST);
  assert.equal(b.sent.filter((m) => m.t === "chat-rejected").length, 0);
  assert.equal(a.closed, null);
  assert.ok(r.players.has(1));
});

test("room: an oversized chat frame leaves the socket open; an oversized other frame still closes it", async () => {
  const { room, join } = host();
  const r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  const b = await join(r, 2, "booga", "Booga");
  r.webSocketMessage(a, chat("a".repeat(600)));
  r.webSocketMessage(a, chat("a".repeat(5000)));
  assert.equal(a.closed, null);
  assert.ok(r.players.has(1));
  assert.equal(said(b).length, 0);
  r.webSocketMessage(a, chat("still here"));
  assert.equal(said(b).at(-1).text, "still here");
  r.webSocketMessage(b, JSON.stringify({ t: "zone", name: "x".repeat(300) }));
  assert.equal(b.closed.code, protocol.CLOSE_PROTOCOL);
  assert.ok(!r.players.has(2));
});

test("room: a room that slept or restarted wakes with no lines, and the players it still has can chat", async () => {
  const { room, join } = host();
  const r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  r.webSocketMessage(a, chat("before the nap"));
  // A real restart takes far longer than this; ids follow the clock.
  await new Promise((done) => setTimeout(done, 5));
  const woken = room();
  assert.ok(woken.players.has(1), "the roster comes back from the attachments");
  const b = await join(woken, 2, "booga", "Booga");
  assert.deepEqual(b.sent.find((m) => m.t === "chat-history").messages, []);
  woken.webSocketMessage(a, chat("after"));
  assert.equal(said(b).at(-1).text, "after");
  assert.ok(said(b).at(-1).id > said(a)[0].id, "ids keep growing across the restart");
});

const requestLine = (clientId, text = "same words") => JSON.stringify({ t: "chat", clientId, text });
const receipts = (ws, type = "chat-ack") => ws.sent.filter((m) => m.t === type);

test("chat retry ids are bounded strings, separate from the server's line id", () => {
  assert.deepEqual(parseClientMessage(requestLine("retry-1")), { t: "chat", text: "same words", clientId: "retry-1" });
  for (const bad of ["", "a".repeat(65), "bad:id", "bad\n", 42, null, {}]) assert.equal(parseClientMessage(requestLine(bad)), null);
});

test("room: lost acknowledgement then reconnect retry broadcasts once and spends no retry token", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 1, "ooga", "Ooga"), b = await join(r, 2, "booga", "Booga");
  const send = a.send;
  a.send = function (text) { if (JSON.parse(text).t !== "chat-ack") send.call(this, text); };
  r.webSocketMessage(a, requestLine("lost-ack"));
  assert.equal(receipts(a).length, 0, "acceptance happened but its acknowledgement never reached the sender");
  assert.equal(said(b).length, 1);
  a.close(1000, "disconnect after acceptance"); r.webSocketClose(a);
  const retry = await join(r, 1, "ooga", "Ooga"), bucket = r.players.get(1).chatBucket;
  bucket.tokens = 0; bucket.at = Date.now() + 60000;
  r.webSocketMessage(retry, requestLine("lost-ack"));
  assert.equal(said(b).length, 1);
  assert.equal(said(retry).length, 0);
  assert.equal(bucket.tokens, 0, "recognized retry bypasses the limiter without mutating it");
  assert.deepEqual(receipts(retry), [{ t: "chat-ack", clientId: "lost-ack" }]);
  assert.equal(r.chat.size, 1);
});

test("room: disconnect before acceptance leaves the retried id available for one new line", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 1, "ooga", "Ooga");
  a.close(1000, "disconnect before arrival"); r.webSocketClose(a);
  const retry = await join(r, 1, "ooga", "Ooga");
  r.webSocketMessage(retry, requestLine("not-arrived"));
  assert.equal(said(retry).length, 1);
  assert.equal(r.players.get(1).chatBucket.tokens, CHAT_BURST - 1);
  assert.equal(receipts(retry)[0].clientId, "not-arrived");
});

test("room: identical text with new ids and matching ids from different senders remain distinct", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 1, "ooga", "Ooga"), b = await join(r, 2, "booga", "Booga");
  r.webSocketMessage(a, requestLine("first"));
  r.webSocketMessage(a, requestLine("second"));
  r.webSocketMessage(b, requestLine("first"));
  assert.equal(said(a).length, 3);
  assert.deepEqual(said(a).map((m) => m.login), ["ooga", "ooga", "booga"]);
  assert.equal(r.chatAccepted.size, 3);
  r.webSocketMessage(a, requestLine("first", "changed words"));
  assert.equal(said(a).length, 3);
  assert.deepEqual(receipts(a, "chat-rejected").at(-1), { t: "chat-rejected", clientId: "first", reason: "conflict" });
});

test("room: a rate refusal is correlated and may later accept the same id", async () => {
  const { room, join } = host(), r = room(), a = await join(r, 1, "ooga", "Ooga");
  const bucket = r.players.get(1).chatBucket;
  bucket.tokens = 0; bucket.at = Date.now() + 60000;
  r.webSocketMessage(a, requestLine("limited"));
  assert.deepEqual(receipts(a, "chat-rejected").at(-1), { t: "chat-rejected", clientId: "limited", reason: "rate" });
  assert.equal(r.chatAccepted.size, 0);
  bucket.tokens = CHAT_BURST; bucket.at = Date.now();
  r.webSocketMessage(a, requestLine("limited"));
  assert.equal(said(a).length, 1);
  assert.equal(receipts(a)[0].clientId, "limited");
});

test("room: retry memory is bounded, evicts oldest accepted ids, and resets with the room", async () => {
  const { room, join } = host(), r = room(), a = await join(r, 1, "ooga", "Ooga");
  const bucket = r.players.get(1).chatBucket;
  for (let i = 0; i <= CHAT_RETRY_KEEP; i++) {
    bucket.tokens = CHAT_BURST; bucket.at = Date.now();
    r.webSocketMessage(a, requestLine("cache-" + i));
  }
  assert.equal(r.chatAccepted.size, CHAT_RETRY_KEEP);
  assert.ok(!r.chatAccepted.has("1:cache-0"));
  const count = said(a).length;
  r.webSocketMessage(a, requestLine("cache-1"));
  assert.equal(said(a).length, count, "a retained id still suppresses a retry");
  r.webSocketMessage(a, requestLine("cache-0"));
  assert.equal(said(a).length, count + 1, "an evicted id is a new send; no durable guarantee");
  const woken = room();
  assert.equal(woken.chatAccepted.size, 0);
  const retry = await join(woken, 1, "ooga", "Ooga");
  woken.webSocketMessage(retry, requestLine("cache-1"));
  assert.equal(said(retry).length, 1);
});
