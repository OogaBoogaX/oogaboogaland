// The island room's guards: a message whose handler throws ends that socket alone, and a stored value the
// constructor cannot restore is dropped and logged rather than thrown, through the real Room with a small host mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const host = ({ stored: seed = {}, unreadable = [], failReads = {}, unwritable = [] } = {}) => {
  let now = 100000;
  const accepted = [], logged = [], reports = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { if (this.closed) throw new Error("closed"); this.sent.push(typeof text === "string" ? JSON.parse(text) : text); },
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
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, ArrayBuffer, DataView, setTimeout, clearTimeout,
    console: { ...console, error: (...args) => logged.push(args.map(String).join(" ")) },
  };
  runInNewContext(source, context);
  const stored = new Map(Object.entries(seed)), deleted = [], reads = [];
  let blocked = null;
  const ctx = {
    id: { name: "island" }, waitUntil: () => {},
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { blocked = fn(); return blocked; }, acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: {
      get: async (key) => {
        reads.push(key);
        if (failReads[key] > 0) { failReads[key]--; throw new Error("temporary read failure"); }
        if ([key].flat().some((k) => unreadable.includes(k))) throw new Error("storage unavailable");
        return Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : structuredClone(stored.get(key));
      },
      put: async (key, value) => { if (unwritable.includes(key)) throw new Error("write failed"); stored.set(key, structuredClone(value)); }, delete: async (key) => { deleted.push(key); stored.delete(key); },
      getAlarm: async () => null, setAlarm: async () => {},
    },
  };
  const INSPECTOR = { getByName: () => ({ report: async (r) => { reports.push(structuredClone(r)); return { watchUntil: 0 }; } }) };
  const room = () => new context.Room(ctx, { INSPECTOR, INSPECTOR_IDS: "1" });
  const join = async (r, id, login) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const counters = () => reports.reduce((sum, r) => { for (const [k, n] of Object.entries(r.counters)) sum[k] = (sum[k] || 0) + n; return sum; }, {});
  const events = () => reports.flatMap((r) => r.events);
  return { room, join, stored, deleted, reads, logged, counters, events, restored: () => blocked, advance: (ms) => { now += ms; } };
};

test("a handler that throws closes only the socket that sent it, counts it and logs it once", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  r.voiceState = () => { throw new Error("mute broke"); };
  assert.doesNotThrow(() => r.webSocketMessage(a, JSON.stringify({ t: "mute", on: true })));
  assert.deepEqual(a.closed, { code: protocol.CLOSE_ERROR, reason: "server error" });
  assert.equal(b.closed, null, "the other player stays");
  assert.ok(!r.players.has(1) && r.players.has(2));
  assert.ok(b.sent.some((m) => m.t === "leave" && m.id === 1), "the others hear it left");
  // The same fault again from another socket is counted again but not logged again.
  const a2 = await h.join(r, 1, "a");
  r.webSocketMessage(a2, JSON.stringify({ t: "mute", on: true }));
  assert.equal(a2.closed.code, protocol.CLOSE_ERROR);
  await flush(); await flush();
  assert.equal(h.counters().errors, 2);
  assert.deepEqual(h.events().filter((e) => e.kind === "error").map((e) => [e.id, e.fields.where, e.fields.t, e.fields.name]),
    [[1, "message", "mute", "Error"], [1, "message", "mute", "Error"]]);
  assert.equal(h.logged.length, 1, "one log line for a repeated fault");
  assert.ok(!h.logged[0].includes("mute broke"), "the log carries where it failed, not what the message said");
  // The room still works for the one left.
  r.webSocketMessage(b, JSON.stringify({ t: "zone", name: "factory" }));
  assert.equal(r.players.get(2).zone, "factory");
});

test("a handler whose promise rejects closes only its socket", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  r.say = async () => { throw new Error("chat broke"); };
  await r.webSocketMessage(a, JSON.stringify({ t: "chat", text: "hi", clientId: "c1" }));
  assert.equal(a.closed.code, protocol.CLOSE_ERROR);
  assert.equal(b.closed, null);
  assert.ok(!r.players.has(1) && r.players.has(2));
});

test("a binary frame whose handler throws closes only its socket", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  r.npcFrame = () => { throw new RangeError("frame broke"); };
  assert.doesNotThrow(() => r.webSocketMessage(a, new ArrayBuffer(16)));
  assert.equal(a.closed.code, protocol.CLOSE_ERROR);
  assert.equal(b.closed, null);
  await flush(); await flush();
  assert.deepEqual(h.events().filter((e) => e.kind === "error").map((e) => [e.fields.t, e.fields.name]), [["binary", "RangeError"]]);
});

test("a community member's message that throws closes only that member", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const b = await h.join(r, 2, "b");
  const member = { sent: [], closed: null, store: { community: true, connId: "m1", id: 3 }, send() {}, close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(v) { this.store = v; }, deserializeAttachment() { return this.store; } };
  r.community = new Map([["m1", { ws: member, connId: "m1", id: 3 }]]);
  const message = protocol.commonsRoom.message;
  protocol.commonsRoom.message = async () => { throw new Error("member broke"); };
  try {
    await r.webSocketMessage(member, JSON.stringify({ t: "chat", text: "hi", clientId: "c1" }));
  } finally { protocol.commonsRoom.message = message; }
  assert.equal(member.closed.code, protocol.CLOSE_ERROR);
  assert.ok(!r.community.has("m1"));
  assert.equal(b.closed, null, "an island player is untouched");
});

test("a stored value the room cannot restore is dropped and logged, and players can still join", async () => {
  const h = host({ stored: { studio: "garbage", hockeyLimitsV1: "garbage", voiceCleanup: "garbage", loopEpoch: "garbage", sweepAt: { bad: true }, voiceLinks: [[5, [6]]] } });
  const r = h.room();
  await h.restored();
  assert.deepEqual(h.deleted.sort(), ["hockeyLimitsV1", "loopEpoch", "studio", "sweepAt", "voiceCleanup"], "each bad key deleted, the good ones kept");
  assert.equal(typeof r.studio, "object");
  assert.ok(r.hockeyLimits && Array.isArray(r.hockeyLimits.proofs), "hockey limits back to their defaults");
  assert.ok(Array.isArray(r.cleanupJobs) && !r.cleanupJobs.length, "no cleanup jobs from a value that is not a list");
  assert.ok(Number.isFinite(r.loopEpoch) && Number.isFinite(r.sweepAt), "a stored time that is not a number is replaced");
  assert.ok(r.links.get(5).has(6), "a good key restores as before");
  assert.equal(h.logged.length, 5);
  assert.equal(h.stored.get("loopEpoch"), r.loopEpoch, "a replaced time is stored again");
  assert.ok(h.logged.every((line) => !line.includes("garbage")), "the log names the key, not the value");
  const a = await h.join(r, 1, "a");
  assert.equal(a.sent[0].t, "welcome");
});

test("a stored key that cannot be read is logged and left in storage, and the object resets rather than run on a default", async () => {
  const h = host({ stored: { chalk: { v: 1, marks: [] } }, unreadable: ["chalk"] });
  h.room();
  await assert.rejects(h.restored(), /storage unavailable/);
  assert.deepEqual(h.deleted, [], "a failed read deletes nothing");
  assert.ok(h.stored.has("chalk"));
  assert.equal(h.logged.length, 1);
});

test("an unreadable key is never overwritten by the room's next save of it", async () => {
  const links = [[5, [6]], [7, [8]]];
  const h = host({ stored: { voiceLinks: links }, failReads: { voiceLinks: 1 } });
  h.room();
  await assert.rejects(h.restored(), /temporary read failure/);
  const r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a");
  await h.join(r, 2, "b");
  r.webSocketMessage(a, JSON.stringify({ t: "link", to: 2, on: true }));
  await flush();
  const kept = new Map(h.stored.get("voiceLinks").map(([id, wants]) => [id, wants]));
  assert.deepEqual([kept.get(5), kept.get(7), kept.get(1)], [[6], [8], [2]], "the other accounts' links survive the new one");
});


test("a transient restore read failure preserves the value for the next wake", async () => {
  const saved = studioPolicy.studioState();
  saved.position = 3;
  const h = host({ stored: { studio: saved }, failReads: { studio: 1 } });
  h.room();
  await assert.rejects(h.restored(), /temporary read failure/, "the object resets, as before");
  assert.deepEqual(h.deleted, [], "a later successful read is not proof of corrupt data");
  assert.deepEqual(h.stored.get("studio"), saved);
  assert.equal(h.reads.filter(key => key === "studio").length, 1, "no diagnostic reread");
  const recovered = h.room();
  await h.restored();
  assert.equal(recovered.studio.position, 3, "the next wake restores the retained value");
});

test("a failed restore write does not delete the previously stored studio", async () => {
  const saved = { ...studioPolicy.studioState(), source: "retired-source", position: 3 };
  const h = host({ stored: { studio: saved }, unwritable: ["studio"] });
  const r = h.room();
  await h.restored();
  assert.deepEqual(h.deleted, []);
  assert.deepEqual(h.stored.get("studio"), saved, "a rejected migration write keeps the original snapshot");
  assert.equal(r.studio.source, studioPolicy.studioState().source, "this wake uses the safe default");
});

test("an unexpected restore handler failure preserves readable data", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const saved = { revision: 7 };
  h.stored.set("example", saved);
  await r.restoring("example", () => { throw new TypeError("handler failed"); });
  assert.deepEqual(h.deleted, []);
  assert.deepEqual(h.stored.get("example"), saved);
});

test("a read that fails once and then succeeds deletes nothing, and the next wake restores the value", async () => {
  const links = [[5, [6]]];
  const h = host({ stored: { voiceLinks: links }, failReads: { voiceLinks: 1 }, unwritable: ["sweepAt"] });
  h.room();
  await assert.rejects(h.restored(), /temporary read failure/, "the failed read resets the object");
  assert.deepEqual(h.deleted, [], "neither the failed read nor the failed write deleted a key");
  assert.deepEqual(h.stored.get("voiceLinks"), links, "the stored value is untouched");
  const woken = h.room();
  await h.restored();
  assert.ok(woken.links.get(5).has(6), "the next wake reads it again");
  assert.ok(Number.isFinite(woken.sweepAt), "a write that failed still leaves a default");
  assert.equal(h.logged.length, 2);
});

test("stored values of the wrong shape that would not throw are dropped: hockey limits and cleanup jobs", async () => {
  const good = { session: "s1", at: 5, revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: false, inspectUntil: 0 };
  const h = host({ stored: { hockeyLimitsV1: {}, voiceCleanup: [good, { session: 3 }] } });
  const r = h.room();
  await h.restored();
  assert.deepEqual(h.deleted.sort(), ["hockeyLimitsV1", "voiceCleanup"]);
  assert.ok(r.hockeyLimits && r.hockeyLimits.admission && Array.isArray(r.hockeyLimits.accounts), "the limits are back to their defaults");
  assert.equal(r.cleanupJobs.length, 0);
  const a = await h.join(r, 1, "a");
  r.webSocketMessage(a, JSON.stringify({ t: "body", name: "a" }));
  r.webSocketMessage(a, JSON.stringify({ t: "zone", name: "arcade.hall" }));
  r.webSocketMessage(a, JSON.stringify({ t: "hockey", k: "watch", i: 0, v: 4 }));
  assert.equal(a.closed, null, "watching a table no longer closes the player");
  const h2 = host({ stored: { voiceCleanup: [good] } }), r2 = h2.room();
  await h2.restored();
  assert.deepEqual(r2.cleanupJobs.map((j) => j.session), ["s1"], "a list of good jobs restores as before");
});

test("a helper that throws in both a handler and the departure still lets the others hear the leave and a new host", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  r.webSocketMessage(a, JSON.stringify({ t: "hub", on: true }));
  r.webSocketMessage(b, JSON.stringify({ t: "hub", on: true }));
  assert.equal(r.hostId, 1);
  r.cancelDoor = () => { throw new Error("door broke"); };
  b.sent.length = 0;
  r.webSocketMessage(a, JSON.stringify({ t: "zone", name: "factory" }));
  assert.equal(a.closed.code, protocol.CLOSE_ERROR);
  assert.deepEqual([...r.players.keys()], [2]);
  assert.ok(b.sent.some((m) => m.t === "leave" && m.id === 1), "the others hear it left");
  assert.equal(r.hostId, 2, "a new NPC host is elected");
  assert.ok(b.sent.some((m) => m.t === "host" && m.id === 2), "and told");
  // A plain close through the same fault does not escape either.
  assert.doesNotThrow(() => r.webSocketClose(b, 1001, "", true));
  assert.equal(r.players.size, 0);
});

test("the loose props' frames go from the host alone to the pages that read them, and a follower's input to the host alone", async () => {
  const h = host(), r = h.room();
  await h.restored();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  assert.ok(a.sent.find((m) => m.t === "welcome").features.includes(protocol.PROP_FEATURE), "the room says it relays them");
  const frame = (records = 1) => {
    const data = new ArrayBuffer(10 + 14 * records);
    new DataView(data).setUint32(0, protocol.PROP_MAGIC, true);
    return data;
  };
  const binary = (ws) => ws.sent.filter((m) => m instanceof ArrayBuffer);
  const inputs = (ws) => ws.sent.filter((m) => m && m.t === "prop");
  r.webSocketMessage(a, JSON.stringify({ t: "hub", on: true, props: true }));
  // A tab from before this build shows the island but never asked for prop frames.
  r.webSocketMessage(b, JSON.stringify({ t: "hub", on: true }));
  assert.equal(r.hostId, 1);
  assert.equal(a.store.props, true, "kept with the socket, so a woken room still knows");
  r.webSocketMessage(a, frame());
  assert.equal(binary(b).length, 0, "a page that never asked hears none, so it never takes one for a crew frame");
  r.webSocketMessage(b, JSON.stringify({ t: "prop", k: "s", a: [0, 0, 0, 1, 1, 1] }));
  assert.equal(inputs(a).length, 0, "nor is its input relayed");
  // The same page on this build.
  r.webSocketMessage(b, JSON.stringify({ t: "hub", on: false }));
  r.webSocketMessage(b, JSON.stringify({ t: "hub", on: true, props: true }));
  h.advance(1000);
  r.webSocketMessage(a, frame());
  assert.equal(binary(b).length, 1, "a follower that reads them hears the host's frame");
  assert.equal(binary(b)[0].byteLength, 24, "unchanged");
  assert.equal(binary(a).length, 0, "the host does not hear its own");
  assert.equal(r.lastNpc, null, "and it is not kept as the crew's frame");
  r.webSocketMessage(b, frame());
  assert.equal(binary(a).length, 0, "a follower's frame goes nowhere");
  r.webSocketMessage(a, frame(65));
  assert.equal(binary(b).length, 1, "a frame over the cap is dropped");
  for (let i = 0; i < 60; i++) r.webSocketMessage(a, frame());
  assert.ok(binary(b).length > 2 && binary(b).length <= 2 + protocol.PROP_HZ, "and the host's frames are held to their rate");
  // Inputs: only to the host, without the sender's name, bounded.
  r.webSocketMessage(b, JSON.stringify({ t: "prop", k: "k", a: [2, 1.5, -3, 40, 0, 0] }));
  assert.deepEqual(inputs(a), [{ t: "prop", k: "k", a: [2, 1.5, -3, 40, 0, 0] }]);
  assert.equal(inputs(b).length, 0);
  r.webSocketMessage(a, JSON.stringify({ t: "prop", k: "s", a: [0, 0, 0, 1, 1, 1] }));
  assert.equal(inputs(a).length + inputs(b).length, 1, "the host's own is not relayed");
  for (const bad of [{ k: "x", a: [0, 0, 0, 0, 0, 0] }, { k: "s", a: [0, 0, 0] }, { k: "s", a: [0, 0, 0, 0, 0, 1e9] }, { k: "s", a: [0, 0, 0, 0, 0, "1"] }, { k: "s" }])
    assert.equal(protocol.parseClientMessage(JSON.stringify({ t: "prop", ...bad })), null, JSON.stringify(bad));
  for (let i = 0; i < 60; i++) r.webSocketMessage(b, JSON.stringify({ t: "prop", k: "s", a: [0, 0, 0, 1, 1, 1] }));
  assert.ok(inputs(a).length <= 1 + protocol.SHOT_BURST, "a follower's inputs are held to a shot's rate");
  assert.equal(a.closed || b.closed, null, "nobody is closed for any of it");
  // The host leaves the island: its frames stop being taken at once.
  r.webSocketMessage(a, JSON.stringify({ t: "hub", on: false }));
  assert.equal(r.hostId, 2);
  h.advance(5000);
  const heard = binary(b).length;
  r.webSocketMessage(a, frame());
  assert.equal(binary(b).length, heard);
  assert.equal(r.players.get(1).props, false, "and it no longer reads them");
});
