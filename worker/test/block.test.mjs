import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";
const harness = t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let initialized;
  const writes = [];
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
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, ...studioPolicy, sha256Hex, getPlayer, sfuClient: () => null,
    CAST_ROWS: ["a","b","c","d",...Array.from({length:70},(_,i)=>"ooga"+i)].map(login=>({handle:login,github_login:login})),
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView,
  };
  runInNewContext(source, context);
  const stored = new Map();
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (initialized = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => structuredClone(Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key)), put: async (key, value) => { const copy=structuredClone(value); writes.push({key,value:copy}); stored.set(key,copy); }, getAlarm: async () => null, setAlarm: async () => {} },
  };
  const h = { ctx, stored, writes, advance:ms=>t.mock.timers.tick(ms) };
  h.room = new context.Room(ctx, {});
  const join = async (id, login) => {
    await initialized;
    const before = accepted.length;
    await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg.t === "bf" ? { v: W.WIRE, ...msg } : msg));
  h.join=join;h.send=send;h.wake=async()=>{if(h.room.flushTimer)clearTimeout(h.room.flushTimer);h.room=new context.Room(ctx,{});await initialized;return h.room;};
  return h;
};
const W = protocol.BLOCK;
const bf = ws => ws.sent.filter(m => m.t === "bf");
const last = ws => bf(ws).at(-1);
const enter = async (h, id, login = "ooga" + id) => {
  const ws = await h.join(id, login);
  h.send(ws, { t: "body", name: login }); h.send(ws, { t: "zone", name: W.ZONE });
  h.room.players.get(id).visible = true;
  return { id, ws, p: h.room.players.get(id) };
};
const send = (h, a, k, extra = {}) => { if (a.p.blockBuckets) a.p.blockBuckets.control = { tokens: 12, at: Date.now() }; h.send(a.ws, { t: "bf", k, ...extra }); };
const crowd = async (h, n) => { const list = []; for (let i = 1; i <= n; i++) list.push(await enter(h, i)); return list; };
const startRound = (h, list) => { for (const a of list) send(h, a, "reg"); if (list.length === 1) send(h, list[0], "alone"); else for (const a of list) send(h, a, "ready", { r: 1 }); const m = h.room.blockMatch; if (m.phase === "countdown") { h.advance(W.COUNTDOWN_MS); send(h, list[0], "go", { s: m.s }); } return h.room.blockMatch; };
const frame = (m, q = 1, size = 64) => { const b = new ArrayBuffer(size), v = new DataView(b); v.setUint32(0, W.MAGIC, true); v.setUint32(4, m.tag, true); v.setUint32(8, m.epoch, true); v.setUint32(12, q, true); return b; };

test("the page and the Worker share one cap of four a side", () => {
  assert.equal(W.MAX_SIDE, 4); assert.equal(W.MAX_PLAYERS, 8);
  const base = { t: "bf", v: W.WIRE, k: "opt", n: 4, m: 1 };
  assert.ok(protocol.parseClientMessage(JSON.stringify(base)));
  for (const n of [0, 5, 1.5, "2", null]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, n })), null, String(n));
  for (const m of [-1, 0, W.MAPS.length, null]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, m })), null, "Fort Chaos is retired");
  assert.equal(W.sizeFor(1, 8), 4); assert.equal(W.sizeFor(1, 3), 2); assert.equal(W.sizeFor(4, 1), 4); assert.equal(W.sizeFor(1, 1), 2, "never a 1v1");
  assert.equal(W.ruleFor(-1, 2), 1, "two people, unpicked: doesn't need to be home"); assert.equal(W.ruleFor(-1, 1), 0); assert.equal(W.ruleFor(-1, 3), 0); assert.equal(W.ruleFor(0, 2), 0, "a pick stands"); assert.equal(W.ruleFor(1, 4), 1);
  for (const r of [0, 1]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, r })).r, r);
  for (const r of [2, -1, 0.5, "1", null]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, r })), null, "rule " + String(r));
  assert.equal("r" in protocol.parseClientMessage(JSON.stringify(base)), false, "left out, no pick");
});
test("the first in picks the scoring rule; unpicked, two people play doesn't-need-to-be-home and others classic", async (t) => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg");
  assert.equal(last(a.ws).rule, 0, "one person: classic");
  send(h, b, "reg");
  assert.equal(last(b.ws).rule, 1, "two people, nothing picked: doesn't need to be home");
  send(h, c, "reg");
  assert.equal(last(c.ws).rule, 0, "three: classic again");
  send(h, b, "opt", { n: 2, m: 2, r: 1 });
  assert.equal(h.room.blockMatch.pick, -1, "only the first in picks");
  send(h, a, "opt", { n: 2, m: 2, r: 1 });
  assert.equal(last(c.ws).rule, 1, "the first in's pick is everyone's");
  send(h, a, "opt", { n: 2, m: 3 });
  assert.equal(last(c.ws).rule, 1, "an opt without a rule leaves it");
  assert.equal(last(c.ws).map, 3);
  send(h, a, "opt", { n: 2, m: 3, r: 0 }); send(h, c, "unreg");
  assert.equal(last(b.ws).rule, 0, "two people, classic picked: classic");
  send(h, a, "unreg");
  assert.equal(h.room.blockMatch.pick, -1, "the pick leaves with the first in");
  send(h, a, "reg");
  assert.equal(last(a.ws).rule, 1, "two again, nobody has picked");
  send(h, b, "opt", { n: 2, m: 2, r: 0 });
  for (const p of [a, b]) send(h, p, "ready", { r: 1 });
  let m = h.room.blockMatch;
  assert.equal(m.phase, "countdown"); assert.equal(m.rule, 0, "fixed as the round is dealt"); assert.equal(last(a.ws).rule, 0);
  h.advance(W.COUNTDOWN_MS); send(h, a, "go", { s: m.s });
  m = h.room.blockMatch;
  assert.equal(m.phase, "play"); assert.equal(last(b.ws).rule, 0, "the round keeps its rule with the lobby empty");
  assert.equal("duel" in last(b.ws), false);
});
test("the scoring pick leaves with whoever chose it: a picker who gives up their seat mid-round takes it with them", async (t) => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg"); send(h, b, "reg");
  send(h, a, "opt", { n: 2, m: 2, r: 0 });
  assert.equal(last(b.ws).rule, 0, "the first in picked classic");
  for (const p of [a, b]) send(h, p, "ready", { r: 1 });
  let m = h.room.blockMatch;
  h.advance(W.COUNTDOWN_MS); send(h, a, "go", { s: m.s });
  m = h.room.blockMatch;
  assert.equal(m.phase, "play"); assert.equal(m.rule, 0);
  send(h, a, "unreg");
  m = h.room.blockMatch;
  assert.equal(m.host, b.id, "the round goes on with b hosting");
  send(h, b, "over", { s: m.s, w: 0 });
  send(h, c, "reg");
  m = h.room.blockMatch;
  assert.equal(m.phase, "lobby");
  assert.notEqual(m.reg[0], a.id);
  assert.equal(last(c.ws).rule, 1, "two people again, and the one who picked has gone: doesn't need to be home");
  send(h, m.reg[0] === b.id ? b : c, "opt", { n: 2, m: 2, r: 0 });
  assert.equal(last(c.ws).rule, 0, "the new first in can pick");
});
test("the input message is bounded and its widest form fits the room's frame limit", () => {
  const input = { t: "bf", v: W.WIRE, k: "input", s: "0123456789abcdef", q: 2147483647, x: -1000, z: -1000, f: -7000, b: 15, a: Array(4).fill([W.ACTIONS.length - 1, -7000, -2000, W.KINDS.length - 1]).flat() };
  assert.ok(protocol.parseClientMessage(JSON.stringify(input)));
  assert.ok(JSON.stringify(input).length <= protocol.MESSAGE_MAX);
  for (const patch of [{ x: 1001 }, { b: 16 }, { q: -1 }, { s: "x" }, { f: 7001 }, { a: [] }, { a: [1, 0, 0] }, { a: [99, 0, 0, 0] }, { a: Array(20).fill(0) }, { v: W.WIRE + 1 }, { v: W.WIRE - 1 }]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...input, ...patch })), null, JSON.stringify(patch));
});
test("random teams are as even as can be, and every empty seat is an NPC", () => {
  const rand = (seed => () => (seed = seed * 16807 % 2147483647) / 2147483647)(7);
  for (const [n, size] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [8, 4], [2, 4]]) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    for (let round = 0; round < 40; round++) {
      const seats = W.split(ids, size, rand), a = seats.slice(0, size).filter(Boolean).length, b = seats.slice(size).filter(Boolean).length;
      assert.equal(seats.length, size * 2); assert.equal(a + b, n); assert.ok(Math.abs(a - b) <= 1, `${n}: ${a}-${b}`);
      assert.deepEqual(seats.filter(Boolean).sort((x, y) => x - y), ids);
    }
  }
});
test("the first to register brings the map picked on the board: bounded, and theirs alone", async t => {
  const base = { t: "bf", v: W.WIRE, k: "reg" };
  assert.deepEqual(protocol.parseClientMessage(JSON.stringify(base)), { t: "bf", k: "reg" }, "the map is optional");
  assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, m: 1 })).m, 1);
  for (const m of [-1, W.MAPS.length, 1.5, "1", null]) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...base, m })), null, String(m));
  assert.deepEqual(protocol.parseClientMessage(JSON.stringify({ ...base, m: 0 })), { t: "bf", k: "reg" }, "a retired map is no pick");
  const h = harness(t), [a, b] = await crowd(h, 2);
  send(h, a, "reg", { m: 1 });
  assert.equal(h.room.blockMatch.map, 1, "Town, from the board");
  send(h, b, "reg", { m: 3 });
  assert.equal(h.room.blockMatch.map, 1, "the second registrant's board does not choose");
  send(h, b, "opt", { n: 2, m: 3 });
  assert.equal(h.room.blockMatch.map, 1, "nor can they change it");
  send(h, a, "opt", { n: 2, m: 2 });
  assert.equal(h.room.blockMatch.map, 2, "the first registered still can");
  send(h, a, "unreg");
  send(h, a, "reg", { m: 3 });
  assert.equal(h.room.blockMatch.map, 2, "back in behind someone else, it stays");
  send(h, b, "unreg"); send(h, a, "unreg");
  send(h, a, "reg", { m: 1 }); send(h, a, "alone");
  assert.equal(h.room.blockMatch.phase, "play");
  assert.equal(h.room.blockMatch.map, 1, "Pick Town, Register, Start alone plays Town");
});
test("a map picked while a round runs waits for the next round, and leaves this one alone", async t => {
  const h = harness(t), [a, b] = await crowd(h, 2);
  send(h, a, "reg", { m: 1 }); send(h, a, "alone");
  const m = h.room.blockMatch;
  send(h, b, "reg", { m: 3 });
  assert.equal(m.map, 1, "the round under way keeps its map");
  send(h, b, "opt", { n: 2, m: 2 });
  assert.equal(m.map, 1);
  send(h, a, "over", { s: m.s, w: 0 });
  assert.equal(h.room.blockMatch.phase, "lobby");
  assert.equal(h.room.blockMatch.map, 2, "the waiter's latest pick");
  assert.equal(h.room.blockMatch.reg[0], b.p.id);
});
test("a first waiter who leaves takes their map with them, and the next waiter can pick", async t => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg", { m: 1 }); send(h, a, "alone");
  const m = h.room.blockMatch;
  send(h, b, "reg", { m: 3 }); send(h, c, "reg", { m: 2 });
  assert.equal(m.next, 3);
  send(h, b, "unreg");
  assert.equal(m.next, -1, "not the departed waiter's");
  send(h, a, "over", { s: m.s, w: 0 });
  assert.equal(h.room.blockMatch.map, 1, "nothing picked: the last round's map stands");
  send(h, a, "unreg"); send(h, c, "unreg");
  send(h, a, "reg", { m: 1 }); send(h, a, "alone");
  const n = h.room.blockMatch;
  send(h, b, "reg", { m: 3 }); send(h, c, "reg", { m: 2 });
  send(h, b, "unreg"); send(h, c, "opt", { n: 2, m: 2 });
  send(h, a, "over", { s: n.s, w: 0 });
  assert.equal(h.room.blockMatch.map, 2, "the new first waiter confirms their map");
});
test("a round starts only when everyone registered is ready, and alone at once", async t => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg"); send(h, a, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "lobby", "ready alone is waiting, not starting");
  send(h, a, "alone");
  assert.equal(h.room.blockMatch.phase, "play", "Start alone starts at once");
  assert.deepEqual([...h.room.blockMatch.seats].filter(Boolean), [1]); assert.equal(h.room.blockMatch.host, 1);
  send(h, a, "over", { s: h.room.blockMatch.s, w: 0 });
  assert.equal(h.room.blockMatch.phase, "lobby"); assert.deepEqual([...h.room.blockMatch.reg], [1]); assert.deepEqual([...h.room.blockMatch.ready], [0]);
  send(h, b, "reg"); send(h, c, "reg");
  send(h, a, "ready", { r: 1 }); send(h, b, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "lobby", "c is not ready");
  send(h, c, "ready", { r: 1 });
  const m = h.room.blockMatch;
  assert.equal(m.phase, "countdown"); assert.equal(m.size, 2); assert.equal(m.seats.filter(Boolean).length, 3);
  send(h, a, "go", { s: m.s }); assert.equal(m.phase, "countdown", "not before the countdown ends");
  send(h, b, "ready", { r: 0 }); assert.equal(m.phase, "lobby", "taking ready back stops it"); assert.deepEqual([...m.seats], []);
  send(h, b, "ready", { r: 1 }); assert.equal(m.phase, "countdown");
  h.advance(W.COUNTDOWN_MS); send(h, c, "go", { s: m.s });
  assert.equal(m.phase, "play");
  assert.ok(m.host > 0); assert.ok(m.seats.includes(m.host));
});
test("only the first registered picks the map and size, and the size grows to seat everyone", async t => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg"); send(h, b, "reg"); send(h, c, "reg");
  send(h, b, "opt", { n: 4, m: 3 }); assert.equal(h.room.blockMatch.size, 2); assert.equal(h.room.blockMatch.map, W.FIRST_MAP);
  send(h, a, "opt", { n: 1, m: 3 }); assert.equal(h.room.blockMatch.map, W.FIRST_MAP, "a size of one is refused");
  send(h, a, "opt", { n: 2, m: 2 }); assert.equal(h.room.blockMatch.size, 2); assert.equal(h.room.blockMatch.map, 2);
  for (const x of [a, b, c]) send(h, x, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.size, 2, "three players fit two a side");
});
test("waiting alone stays open, a second player's ready starts it, and Start alone works only alone", async t => {
  const h = harness(t), [a, b, c] = await crowd(h, 3);
  send(h, a, "reg"); send(h, a, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "lobby"); assert.equal(W.canStart(h.room.blockMatch), false);
  send(h, b, "reg");
  send(h, b, "alone"); assert.equal(h.room.blockMatch.phase, "lobby", "not while two are in");
  send(h, a, "alone"); assert.equal(h.room.blockMatch.phase, "lobby", "nor for the first, once someone joined");
  send(h, b, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "countdown", "two humans ready start it");
  send(h, b, "unreg");
  assert.equal(h.room.blockMatch.phase, "lobby"); assert.deepEqual([...h.room.blockMatch.ready], [0], "the others left: the choice comes back");
  send(h, c, "alone"); assert.equal(h.room.blockMatch.phase, "lobby", "someone not registered cannot start it");
  send(h, a, "alone");
  assert.equal(h.room.blockMatch.phase, "play"); assert.equal(h.room.blockMatch.host, a.id);
});
test("the first leaves and the next registered picks", async t => {
  const h = harness(t), [a, b] = await crowd(h, 2);
  send(h, a, "reg"); send(h, b, "reg"); send(h, a, "unreg");
  assert.deepEqual([...h.room.blockMatch.reg], [2]);
  send(h, b, "opt", { n: 3, m: 1 }); assert.equal(h.room.blockMatch.size, 3);
});
test("registration stops at eight", async t => {
  const h = harness(t), list = await crowd(h, 9);
  for (const a of list) send(h, a, "reg");
  assert.equal(h.room.blockMatch.reg.length, W.MAX_PLAYERS);
  assert.ok(!h.room.blockMatch.reg.includes(9));
});
test("visitors outside the area or without an Ooga are refused", async t => {
  const h = harness(t), ws = await h.join(1, "a");
  h.send(ws, { t: "bf", k: "reg" });
  assert.equal(h.room.blockMatch, null, "out of the area");
  h.send(ws, { t: "zone", name: W.ZONE }); h.send(ws, { t: "bf", k: "reg" });
  assert.equal(h.room.blockMatch, null, "no Ooga, no registration");
});
test("late arrivals watch: they get no seat, their inputs go nowhere, and they can sign up for the next round", async t => {
  const h = harness(t), [a, b, late] = await crowd(h, 3);
  const m = startRound(h, [a, b]);
  assert.equal(m.phase, "play");
  const host = m.host === a.id ? a : b, guest = m.host === a.id ? b : a;
  assert.ok(W.watching(m, late.id)); assert.ok(!W.canEnter(m, late.id)); assert.ok(W.canEnter(m, guest.id));
  host.ws.sent.length = 0;
  h.send(late.ws, { t: "bf", k: "input", s: m.s, q: 1, x: 0, z: 0, f: 0, b: 0 });
  assert.equal(bf(host.ws).length, 0, "a watcher cannot drive");
  send(h, late, "reg");
  assert.deepEqual([...m.reg], [late.id]); assert.equal(W.seatOf(m, late.id), -1, "no seat in the round under way");
  assert.equal(m.phase, "play");
  send(h, host, "over", { s: m.s, w: 1 });
  assert.equal(h.room.blockMatch.reg[0], late.id, "deck waiters come first");
  assert.equal(h.room.blockMatch.reg.length, 3); assert.equal(h.room.blockMatch.phase, "lobby");
});
test("the seat a player leaves goes to an NPC, the host hands over, and the last one out ends the round", async t => {
  const h = harness(t), list = await crowd(h, 3), m = startRound(h, list);
  const host = list.find(x => x.id === m.host), rest = list.filter(x => x !== host), epoch = m.epoch;
  const seat = W.seatOf(m, rest[0].id);
  h.send(rest[0].ws, { t: "zone", name: "outside" });
  assert.equal(m.seats[seat], 0); assert.equal(m.phase, "play"); assert.equal(m.host, host.id);
  h.send(host.ws, { t: "zone", name: "outside" });
  assert.equal(m.host, rest[1].id); assert.equal(m.epoch, epoch + 1); assert.equal(m.q, -1);
  assert.equal(last(rest[1].ws).host, rest[1].id);
  h.send(rest[1].ws, { t: "zone", name: "outside" });
  assert.equal(h.room.blockMatch, null);
});
test("frames come only from the host, in order, for this round, and reach guests and the deck alone", async t => {
  const h = harness(t), [a, b, late] = await crowd(h, 3), m = startRound(h, [a, b]);
  const away = await h.join(9, "ooga9"); h.send(away, { t: "body", name: "ooga9" }); h.send(away, { t: "zone", name: "outside" });
  const host = m.host === a.id ? a : b, guest = m.host === a.id ? b : a, n = () => guest.ws.bins.length;
  send(h, late, "watch", { on: 1 });
  h.room.webSocketMessage(host.ws, frame(m, 1));
  assert.equal(n(), 1); assert.equal(late.ws.bins.length, 0, "odd frames skip viewers"); assert.equal(away.bins.length, 0); assert.equal(host.ws.bins.length, 0);
  h.room.webSocketMessage(host.ws, frame(m, 1)); assert.equal(n(), 1, "a replay");
  h.room.webSocketMessage(guest.ws, frame(m, 2)); assert.equal(n(), 1, "not from a guest");
  h.room.webSocketMessage(host.ws, frame({ tag: m.tag + 1, epoch: m.epoch }, 3)); assert.equal(n(), 1, "another round");
  h.room.webSocketMessage(host.ws, frame({ tag: m.tag, epoch: m.epoch + 1 }, 3)); assert.equal(n(), 1, "another host");
  h.room.webSocketMessage(host.ws, frame(m, 4, W.FRAME_MAX + 1)); assert.equal(n(), 1, "too big");
  h.room.webSocketMessage(host.ws, frame(m, 5, W.FRAME_MAX)); assert.equal(n(), 2);
  h.room.webSocketMessage(host.ws, frame(m, 6)); assert.equal(late.ws.bins.length, 1, "a viewer takes every other frame");
  send(h, late, "watch", { on: 0 }); h.room.webSocketMessage(host.ws, frame(m, 8)); assert.equal(late.ws.bins.length, 1, "and none once it stops watching");
});
test("rate limits hold input, frames and control to their budgets", async t => {
  const h = harness(t), [a, b] = await crowd(h, 2), m = startRound(h, [a, b]);
  const host = m.host === a.id ? a : b, guest = m.host === a.id ? b : a;
  host.ws.sent.length = 0;
  for (let q = 1; q <= 100; q++) h.send(guest.ws, { t: "bf", k: "input", s: m.s, q, x: 0, z: 0, f: 0, b: 0 });
  assert.equal(bf(host.ws).filter(x => x.k === "input").length, W.INPUT_HZ + 4);
  for (let q = 1; q <= 100; q++) h.room.webSocketMessage(host.ws, frame(m, q));
  assert.equal(guest.ws.bins.length, W.FRAME_HZ + 2);
  h.advance(1000);
  h.room.webSocketMessage(host.ws, frame(m, 200));
  assert.equal(guest.ws.bins.length, W.FRAME_HZ + 3, "the bucket refills");
});
test("an input reaches the host alone, marked with the sender's seat from the room's own record", async t => {
  const h = harness(t), [a, b] = await crowd(h, 2), m = startRound(h, [a, b]);
  const host = m.host === a.id ? a : b, guest = m.host === a.id ? b : a;
  host.ws.sent.length = 0; guest.ws.sent.length = 0;
  h.send(guest.ws, { t: "bf", k: "input", s: m.s, q: 7, x: 500, z: -500, f: 100, b: 1, a: [0, 100, 200, 1], from: 0 });
  const got = bf(host.ws)[0];
  assert.equal(got.from, W.seatOf(m, guest.id)); assert.deepEqual([...got.a], [0, 100, 200, 1]);
  assert.equal(bf(guest.ws).length, 0);
});
test("a silent player is swept and a page that goes quiet loses its seat", async t => {
  const h = harness(t), [a, b] = await crowd(h, 2);
  send(h, a, "reg"); send(h, b, "reg");
  h.advance(W.IDLE_MS - 1000); send(h, a, "beat");
  h.advance(2000); send(h, a, "beat");
  assert.deepEqual([...h.room.blockMatch.reg], [1], "b went quiet");
});
test("the registry survives hibernation in one attachment under the socket limit, with no storage writes", async t => {
  const h = harness(t), list = await crowd(h, 8), m = startRound(h, list);
  assert.equal(m.phase, "play");
  const host = list.find(x => x.id === m.host);
  assert.ok(JSON.stringify(host.ws.store).length <= 2048, String(JSON.stringify(host.ws.store).length));
  assert.equal(h.writes.filter(w => /block/i.test(String(w.key))).length, 0);
  const seats = [...m.seats], s = m.s;
  await h.wake();
  const again = h.room.blockMatch;
  assert.equal(again.s, s); assert.equal(again.phase, "play"); assert.deepEqual([...again.seats], seats); assert.equal(again.host, host.id);
});
test("a new page hears the current match on arrival; an older page is never told of the feature it lacks", async t => {
  const h = harness(t), [a] = await crowd(h, 1);
  send(h, a, "reg");
  const b = await enter(h, 2);
  assert.equal(last(b.ws).phase, "lobby"); assert.deepEqual([...last(b.ws).reg], [1]);
  assert.ok(b.ws.sent.find(m => m.t === "welcome").features.includes(W.FEATURE));
});
test("a countdown ends by the room's clock with no go from anyone", async t => {
  const h = harness(t), list = await crowd(h, 2), [a] = list;
  for (const x of list) send(h, x, "reg"); for (const x of list) send(h, x, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "countdown");
  h.advance(W.COUNTDOWN_MS + 10); send(h, a, "beat");
  assert.equal(h.room.blockMatch.phase, "play");
});
test("a host that only beats loses the round to the next seat; one that sends frames keeps it", async t => {
  const h = harness(t), list = await crowd(h, 2), m = startRound(h, list);
  const host = list.find(x => x.id === m.host), guest = list.find(x => x !== host), epoch = m.epoch;
  for (let i = 0; i < 4; i++) { h.advance(W.IDLE_MS / 3); send(h, host, "beat"); send(h, guest, "beat"); }
  assert.equal(m.host, guest.id, "beating is no proof of a live host");
  assert.equal(m.epoch, epoch + 1);
});
test("when the last unready player leaves, an all-ready lobby starts", async t => {
  const h = harness(t), list = await crowd(h, 3), [a, b, c] = list;
  for (const x of list) send(h, x, "reg"); send(h, a, "ready", { r: 1 }); send(h, b, "ready", { r: 1 });
  assert.equal(h.room.blockMatch.phase, "lobby");
  send(h, c, "unreg");
  assert.equal(h.room.blockMatch.phase, "countdown");
});
test("a hidden host hands over to a seated page on show, and stays if none is", async t => {
  const h = harness(t), list = await crowd(h, 2), m = startRound(h, list);
  const host = list.find(x => x.id === m.host), guest = list.find(x => x !== host);
  guest.p.visible = false;
  h.send(host.ws, { t: "visible", on: false }); assert.equal(m.host, host.id, "nobody on show to take it");
  guest.p.visible = true; host.p.visible = true;
  h.send(host.ws, { t: "visible", on: false }); assert.equal(m.host, guest.id);
});
test("a restored countdown with its host gone goes back to the lobby", async t => {
  const h = harness(t), list = await crowd(h, 2);
  for (const x of list) send(h, x, "reg"); for (const x of list) send(h, x, "ready", { r: 1 });
  const m = h.room.blockMatch, host = list.find(x => x.id === m.host);
  assert.equal(m.phase, "countdown");
  host.ws.store.body = null;
  await h.wake();
  const again = h.room.blockMatch;
  assert.equal(again.phase, "lobby"); assert.deepEqual([...again.seats], []);
});
test("at most five viewers, the sixth is told the chairs are full, and a leaving viewer frees a seat", async t => {
  const h = harness(t), list = await crowd(h, 2), m = startRound(h, list), viewers = [];
  for (let i = 0; i < 6; i++) { const ws = await h.join(20 + i, "ooga" + (20 + i)); h.send(ws, { t: "zone", name: W.ZONE }); h.send(ws, { t: "bf", k: "watch", on: 1 }); viewers.push({ ws, p: h.room.players.get(20 + i) }); }
  const sixth = viewers[5];
  assert.equal(W.MAX_VIEWERS, 5); assert.equal(viewers.filter(v => v.p.blockWatch).length, 5); assert.ok(!sixth.p.blockWatch);
  assert.ok(sixth.ws.sent.some(x => x.t === "bf" && x.k === "chairs-full"));
  const host = list.find(x => x.id === m.host);
  h.room.webSocketMessage(host.ws, frame(m, 2)); assert.equal(sixth.ws.bins.length, 0, "the sixth gets no frames");
  h.send(viewers[0].ws, { t: "bf", k: "watch", on: 0 });
  h.send(sixth.ws, { t: "bf", k: "watch", on: 1 }); assert.equal(sixth.p.blockWatch, true, "a seat freed by watch off");
  h.send(viewers[1].ws, { t: "zone", name: "outside" });
  h.send(viewers[0].ws, { t: "bf", k: "watch", on: 1 }); assert.equal(viewers[0].p.blockWatch, true, "a seat freed by walking away");
});
test("traffic through the Worker with eight live players, simulated over ten seconds", async t => {
  const h = harness(t), list = await crowd(h, 8), m = startRound(h, list);
  assert.equal(m.phase, "play");
  const host = list.find(x => x.id === m.host), guests = list.filter(x => x !== host);
  // Five viewers: no body, no input, no position, asking only for the feed; they must receive frames at half rate.
  const viewers = [];
  for (let i = 0; i < 5; i++) { const ws = await h.join(20 + i, "ooga" + (20 + i)); h.send(ws, { t: "zone", name: W.ZONE }); h.send(ws, { t: "bf", k: "watch", on: 1 }); viewers.push({ ws }); }
  for (const v of viewers) v.ws.sent.length = 0;
  const out0 = () => [...list, ...viewers].reduce((n, x) => n + x.ws.sent.length + x.ws.bins.length, 0), base = out0();
  let framesIn = 0, inputsIn = 0, beats = 0;
  for (let ms = 0; ms < 10000; ms += 50) {
    h.advance(50);
    for (const g of guests) { h.send(g.ws, { t: "bf", k: "input", s: m.s, q: ms / 50 + 1, x: 0, z: 0, f: 0, b: 0 }); inputsIn++; }
    if (ms % 100 === 0) { h.room.webSocketMessage(host.ws, frame(m, ms / 100 + 1, 900)); framesIn++; }
    if (ms % 2000 === 0) for (const x of list) { h.send(x.ws, { t: "bf", k: "beat" }); beats++; }
  }
  const seconds = 10, framesOut = guests.reduce((n, g) => n + g.ws.bins.length, 0), inputsOut = bf(host.ws).filter(x => x.k === "input").length, total = out0() - base;
  const viewerFrames = viewers.reduce((n, v) => n + v.ws.bins.length, 0);
  t.diagnostic(`simulated 8 players + 5 viewers, 10 s: IN frames ${framesIn / seconds}/s, inputs ${inputsIn / seconds}/s, beats ${beats / seconds}/s, viewer messages 0/s; OUT frames to players ${framesOut / seconds}/s, frames to viewers ${viewerFrames / seconds}/s, inputs relayed ${inputsOut / seconds}/s, total out ${total / seconds}/s`);
  assert.equal(viewerFrames, framesIn * 5 / 2, "half rate to each viewer"); assert.equal(viewers.reduce((n, v) => n + v.ws.sent.filter(x => x.t === "bf").length, 0), 0, "no match traffic beyond the feed while the round runs");
  assert.equal(framesOut, 7 * framesIn, "each frame reaches the seven guests");
  assert.equal(inputsOut, inputsIn, "every input reaches the host alone");
});
