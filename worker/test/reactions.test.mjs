// Reactions: the wire rule (one emoji the shared policy accepts, plain or toned, never text; the hand a boolean), the room
// relaying a reaction to the sender's zone alone and keeping the raised hand on the record, its attachment and every
// view, one bucket a record limiting both (a refused hand change answered to its sender alone), and nothing touching
// storage, alarms or timers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { sfuClient } from "../src/sfu.js";
import { getPlayer } from "../src/db.js";

const { REACT_FEATURE, REACT_BURST, REACT_HZ, MESSAGE_MAX, parseClientMessage } = protocol;
const policy = globalThis.BL.reactionPolicy;

test("a reaction is one emoji the policy knows, in any of its skin tones; the hand is a boolean; anything else is ignored", () => {
  for (const e of [...policy.DEFAULTS, policy.HAND, policy.toned(policy.HAND, 5), "🧑🏽‍🤝‍🧑🏽", "🇯🇵", "❤️"]) {
    assert.deepEqual(parseClientMessage(JSON.stringify({ t: "react", e })), { t: "react", e }, e);
  }
  for (const e of ["hello", "😂😂", "❤", "", " 😂", 7, null, "x".repeat(policy.MAX + 1), "😂".padEnd(30, "!")]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "react", e })), null, JSON.stringify(e));
  }
  assert.deepEqual(parseClientMessage('{"t":"hand","on":true}'), { t: "hand", on: true, tone: 0 });
  assert.deepEqual(parseClientMessage('{"t":"hand","on":true,"tone":5}'), { t: "hand", on: true, tone: 5 });
  assert.deepEqual(parseClientMessage('{"t":"hand","on":false}'), { t: "hand", on: false, tone: 0 });
  for (const on of [1, "true", null]) assert.equal(parseClientMessage(JSON.stringify({ t: "hand", on })), null);
  for (const tone of [6, -1, 1.5, "2", null]) assert.equal(parseClientMessage(JSON.stringify({ t: "hand", on: true, tone })), null, JSON.stringify(tone));
  assert.deepEqual(policy.HANDS, ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"]);
  assert.ok(policy.HANDS.every(policy.valid), "every hand is a reaction the room knows");
  assert.equal(parseClientMessage(JSON.stringify({ t: "react", e: "😂", pad: "x".repeat(MESSAGE_MAX) })), false, "an oversized frame closes as any other");
  assert.ok(policy.DEFAULTS.length === 10 && new Set(policy.DEFAULTS).size === 10, "ten distinct defaults");
});

const roomClass = (extra = {}) => {
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class {}, WebSocketRequestResponsePair: class {}, sfuClient, CAST_ROWS: [], Date, Map, Set, Response, Promise, ...extra };
  runInNewContext(source, context);
  return context.Room;
};
const forbidden = (what) => () => { throw new Error(`a reaction touched ${what}`); };
const reactionRoom = (clock) => {
  const Room = roomClass({ Date: { now: () => clock.now }, setTimeout: forbidden("setTimeout"), setInterval: forbidden("setInterval"), clearTimeout: () => {} });
  const room = Object.create(Room.prototype);
  room.ctx = { storage: new Proxy({}, { get: (_, key) => forbidden(`storage.${String(key)}`) }) };
  room.env = {};
  room.players = new Map(); room.chatBuckets = new Map(); room.chat = protocol.chatLog();
  room.studio = studio.studioState(0);
  const join = (id, zone, extra = {}) => {
    const ws = { sent: [], saved: null, deserializeAttachment: () => ({ id }), serializeAttachment: (a) => { ws.saved = a; }, send: (text) => ws.sent.push(text) };
    const p = room.record(ws, { id, login: `player${id}`, display: `P${id}`, contributor: true, body: `player${id}`, x: 0, y: 0, z: 0, yaw: 0, ...extra });
    p.zone = zone;
    room.players.set(id, p);
    return ws;
  };
  return { room, join };
};

test("the room relays a reaction to the sender's zone alone, from a driven body, and keeps nothing", () => {
  const clock = { now: 1000 };
  const { room, join } = reactionRoom(clock);
  const a = join(1, "outside"), b = join(2, "outside"), lab = join(3, "lab"), loose = join(4, "outside", { body: null });
  room.webSocketMessage(a, '{"t":"react","e":"😂"}');
  assert.deepEqual(b.sent, ['{"t":"react","id":1,"e":"😂"}']);
  assert.deepEqual(loose.sent, ['{"t":"react","id":1,"e":"😂"}'], "a page in the zone sees it whether or not it drives");
  assert.deepEqual([a.sent, lab.sent], [[], []], "never the sender, never another zone");
  room.webSocketMessage(loose, '{"t":"react","e":"👍"}');
  assert.equal(b.sent.length, 1, "nothing to show it over: not relayed");
  room.webSocketMessage(a, '{"t":"react","e":"ooga"}');
  assert.equal(b.sent.length, 1, "text is never a reaction");
  assert.equal(room.chat.size, 0, "no history");
});

test("the raised hand lives on the record, its attachment and every view, and goes to everyone on a change only", () => {
  const clock = { now: 1000 };
  const { room, join } = reactionRoom(clock);
  const a = join(1, "outside"), b = join(2, "lab");
  assert.equal(room.view(room.players.get(1)).hand, false);
  room.webSocketMessage(a, '{"t":"hand","on":true,"tone":3}');
  assert.deepEqual(b.sent, ['{"t":"hand","id":1,"on":true,"tone":3}'], "everyone, any zone");
  assert.deepEqual([a.saved.hand, a.saved.handTone], [true, 3], "kept in the attachment for a woken room");
  assert.deepEqual([room.view(room.players.get(1)).hand, room.view(room.players.get(1)).handTone], [true, 3], "welcome and join carry it");
  room.webSocketMessage(a, '{"t":"hand","on":true,"tone":3}');
  assert.equal(b.sent.length, 1, "no change, no message");
  clock.now += 1000;
  room.webSocketMessage(a, '{"t":"hand","on":true,"tone":1}');
  assert.deepEqual(b.sent.at(-1), '{"t":"hand","id":1,"on":true,"tone":1}', "a new tone on a raised hand goes out");
  room.webSocketMessage(a, '{"t":"hand","on":false}');
  assert.deepEqual(b.sent.at(-1), '{"t":"hand","id":1,"on":false,"tone":0}');
  const restored = room.record({}, { id: 9, hand: true, handTone: 2 });
  assert.deepEqual([restored.hand, restored.handTone], [true, 2], "an attachment's hand survives hibernation");
  assert.equal(room.record({}, { id: 10 }).hand, false, "an older attachment starts with it down");
});

test("one bucket a record: a burst, then three a second across reactions and the hand; a refused hand change tells its sender", () => {
  const clock = { now: 5000 };
  const { room, join } = reactionRoom(clock);
  const a = join(1, "outside"), b = join(2, "outside");
  for (let i = 0; i < REACT_BURST + 3; i++) room.webSocketMessage(a, '{"t":"react","e":"💯"}');
  assert.equal(b.sent.length, REACT_BURST, "the burst, then nothing");
  assert.deepEqual(a.sent, [], "a dropped reaction is dropped without a word");
  // regression: a hand change over the bucket was dropped silently, so the sender's page showed a hand nobody else saw.
  room.webSocketMessage(a, '{"t":"hand","on":true,"tone":2}');
  assert.equal(b.sent.length, REACT_BURST, "the hand spends the same bucket");
  assert.deepEqual(a.sent, ['{"t":"hand","id":1,"on":false,"tone":0}'], "the sender hears the hand the room still holds");
  assert.equal(room.players.get(1).hand, false, "and the room keeps it");
  clock.now += Math.ceil(1000 / REACT_HZ);
  room.webSocketMessage(a, '{"t":"hand","on":true}');
  assert.deepEqual(b.sent.at(-1), '{"t":"hand","id":1,"on":true,"tone":0}', "one more a third of a second later");
  assert.equal(a.sent.length, 1, "an accepted change is never echoed to its sender");
  assert.ok(REACT_FEATURE === "react-v1");
});
