// Voice across a crossing (#392): the room's reading of a crossing, who it lets hear whom along one, and the real Room
// keeping a crossing, broadcasting it and re-planning voice only when a place is gained or lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";

const { BLEND, parseClientMessage, voicePeers } = protocol;
const STEPS = BLEND.STEPS;

test("a crossing is a zone and a step from 1 to STEPS, or none; anything else is ignored", () => {
  assert.deepEqual(parseClientMessage('{"t":"blend","to":"rainforest","k":7}'), { t: "blend", to: "rainforest", k: 7 });
  assert.deepEqual(parseClientMessage(`{"t":"blend","to":"sphere","k":${STEPS}}`), { t: "blend", to: "sphere", k: STEPS });
  assert.deepEqual(parseClientMessage('{"t":"blend","to":null,"k":0}'), { t: "blend", to: null, k: 0 });
  for (const bad of [{ to: "rainforest", k: 0 }, { to: "rainforest", k: STEPS + 1 }, { to: "rainforest", k: 2.5 }, { to: "rainforest", k: "3" },
    { to: "bifrost.chamber", k: 3 }, { to: "Rain Forest", k: 3 }, { to: null, k: 3 }, { to: 4, k: 3 }, {}]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "blend", ...bad })), null, JSON.stringify(bad));
  }
});

test("along a bridge a player hears the island and the land ahead, both ends only their own, and never a place behind the land", () => {
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, zone, blendTo = null, blendK = 0) => ({ id, body: `ooga-${id}`, zone, voice: on, blendTo, blendK });
  const hears = (listener) => {
    const island = p(1, "outside"), forest = p(2, "rainforest"), isle = p(3, "bifrost"), chamber = p(4, "bifrost.chamber"), room = p(5, "sphere-3"), sphere = p(6, "sphere");
    return voicePeers([island, forest, isle, chamber, room, sphere, listener]).get(listener.id);
  };
  assert.deepEqual(hears(p(9, "outside", "rainforest", 1)), [1, 2], "just onto the vine bridge: the island and the rainforest");
  assert.deepEqual(hears(p(9, "outside", "rainforest", STEPS / 2)), [1, 2], "halfway: both");
  assert.deepEqual(hears(p(9, "outside", "rainforest", STEPS)), [2], "at the far end: the rainforest alone");
  assert.deepEqual(hears(p(9, "outside")), [1], "on the island: the island alone");
  assert.deepEqual(hears(p(9, "outside", "bifrost", 10)), [1, 3], "toward ₿IFRÖST: its isle, never its chamber");
  assert.deepEqual(hears(p(9, "outside", "sphere", 10)), [1, 6], "toward the Sphere: its outside, never one of its rooms");
  assert.deepEqual(hears(p(9, "bifrost.chamber")), [3, 4], "the chamber still hears its group, the isle and the chamber");
  // Both ways: whoever a crosser hears hears the crosser, and two at opposite ends of one bridge hear nobody across it.
  const nearEnd = p(10, "outside", "rainforest", 1), farEnd = p(11, "outside", "rainforest", STEPS);
  const peers = voicePeers([p(1, "outside"), p(2, "rainforest"), p(4, "bifrost.chamber"), nearEnd, farEnd]);
  assert.deepEqual(peers.get(1), [10], "the island hears the one just onto the bridge, not the one at its far end");
  assert.deepEqual(peers.get(2), [10, 11], "the rainforest hears both on the bridge");
  assert.deepEqual(peers.get(10), [1, 2, 11], "two on one bridge hear each other");
  assert.deepEqual(peers.get(4), [], "nothing reaches the chamber from the bridge");
});

test("down a slope a player hears the level above and the one below; on a level, that level alone", () => {
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, zone, blendTo = null, blendK = 0) => ({ id, body: `ooga-${id}`, zone, voice: on, blendTo, blendK });
  const island = p(1, "outside"), hq = p(2, "hq"), basement = p(3, "hq", "hq-basement", STEPS), forest = p(4, "rainforest"), chamber = p(5, "rainforest", "rainforest-under", STEPS);
  const hears = (listener) => voicePeers([island, hq, basement, forest, chamber, listener]).get(listener.id);
  assert.deepEqual(hears(p(9, "hq")), [2], "on HQ's floor: HQ, not the basement under it nor the island over it");
  assert.deepEqual(hears(p(9, "hq", "hq-basement", STEPS)), [3], "in the basement: the basement alone");
  assert.deepEqual(hears(p(9, "hq", "hq-basement", 10)), [2, 3], "halfway down the basement's ramp: both");
  assert.deepEqual(hears(p(9, "outside", "hq", 10)), [1, 2], "halfway down an entrance ramp: the island and HQ");
  assert.deepEqual(hears(p(9, "hq", "outside", 10)), [1, 2], "the same ramp from HQ's side");
  assert.deepEqual(hears(p(9, "rainforest", "rainforest-under", 10)), [4, 5], "halfway down the descent: the forest and the chamber");
  assert.deepEqual(hears(p(9, "rainforest")), [4], "in the forest: the forest, not the chamber under it");
  assert.deepEqual(voicePeers([basement, hq, chamber, forest]).get(3), [], "the basement hears nobody on HQ's floor");
  for (const [zone, to] of [["outside", "hq"], ["hq", "outside"], ["hq", "hq-basement"], ["rainforest", "rainforest-under"]]) assert.ok(BLEND.adjacent(zone, to), `${zone} to ${to}`);
  for (const [zone, to] of [["outside", "hq-basement"], ["outside", "rainforest-under"], ["hq-basement", "outside"], ["rainforest", "hq-basement"]]) assert.ok(!BLEND.adjacent(zone, to), `not ${zone} to ${to}`);
});

test("the volumes: equal-power across a bridge, full between two side by side, nothing across a whole bridge", () => {
  const { gain, weight } = BLEND;
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(gain("outside", "rainforest", 0.5, "outside", null, 0), Math.SQRT1_2) && close(gain("outside", "rainforest", 0.5, "rainforest", null, 0), Math.SQRT1_2));
  assert.ok(close(gain("outside", "rainforest", 0, "outside", null, 0), 1) && close(gain("outside", "rainforest", 1, "outside", null, 0), 0));
  assert.ok(close(gain("outside", "rainforest", 0.3, "outside", "rainforest", 0.3), 1), "side by side on the bridge");
  assert.ok(close(gain("outside", "rainforest", 0, "outside", "rainforest", 1), 0), "the bridge's two ends");
  assert.ok(close(gain("outside", null, 0, "outside", "rainforest", 0.25), gain("outside", "rainforest", 0.25, "outside", null, 0)), "the same both ways");
  assert.equal(gain("outside", "bifrost", 0.5, "bifrost.chamber", null, 0), 0);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(close(weight("outside", "outside", "sphere", t) ** 2 + weight("sphere", "outside", "sphere", t) ** 2, 1), "equal power at " + t);
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
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView,
  };
  runInNewContext(source, context);
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => Array.isArray(key) ? new Map() : undefined, put: async () => {}, getAlarm: async () => null, setAlarm: async () => {} },
  };
  const room = new context.Room(ctx, {});
  // Voice sessions as the SFU would leave them, so the room plans who hears whom.
  room.sfu = {};
  const send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
  const join = async (id, login, zone) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    const ws = accepted[before];
    room.players.get(id).voice = { pub: "p", sub: "s", track: "mic", gen: 1, mids: {}, pubMid: null };
    send(ws, { t: "body", name: login });
    send(ws, { t: "zone", name: zone });
    return ws;
  };
  return { room, join, send, advance: (ms) => { now += ms; } };
};
const last = (ws, t) => ws.sent.filter((m) => m.t === t).at(-1);
const count = (ws, t) => ws.sent.filter((m) => m.t === t).length;

test("room: a crossing reaches the next land's voices and everyone else's pages, and goes with the zone; it reaches nowhere else", async () => {
  const h = harness();
  const islander = await h.join(1, "a", "outside"), forester = await h.join(2, "b", "rainforest"), crosser = await h.join(3, "c", "outside");
  assert.deepEqual(last(crosser, "voice").peers, [1], "on the island: the island");
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "rainforest", k: 4 });
  assert.deepEqual(last(crosser, "voice").peers, [1, 2], "onto the bridge: the rainforest too");
  assert.deepEqual(last(forester, "voice").peers, [3], "and the rainforest hears the crosser");
  assert.deepEqual(last(islander, "blend"), { t: "blend", id: 3, to: "rainforest", k: 4 }, "every other page gets the step");
  assert.equal(count(crosser, "blend"), 0, "not the crosser's own");
  const lists = count(crosser, "voice");
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "rainforest", k: 12 });
  assert.equal(count(crosser, "voice"), lists, "a step along the way changes no list");
  assert.equal(last(forester, "blend").k, 12);
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "rainforest", k: BLEND.STEPS });
  assert.deepEqual(last(crosser, "voice").peers, [2], "at the far end: the island is let go");
  assert.equal(h.room.players.get(3).ws.store.blendK, BLEND.STEPS, "kept through a hibernation");
  h.send(crosser, { t: "zone", name: "rainforest" });
  assert.equal(h.room.players.get(3).blendTo, null, "the zone takes the crossing with it");
  assert.deepEqual(last(crosser, "voice").peers, [2]);
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "bifrost", k: 5 });
  assert.equal(h.room.players.get(3).blendTo, null, "no crossing from the rainforest to ₿IFRÖST");
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "hq-basement", k: 5 });
  assert.equal(h.room.players.get(3).blendTo, null, "no level below the rainforest but its own");
  h.send(crosser, { t: "zone", name: "cave-lab" });
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "rainforest", k: 5 });
  assert.equal(h.room.players.get(3).blendTo, null, "nor from a cave");
  assert.deepEqual(last(crosser, "voice").peers, []);
  // A page sending faster than BLEND_HZ is held to it.
  h.send(crosser, { t: "zone", name: "outside" });
  for (let k = 1; k <= BLEND.STEPS; k++) h.send(crosser, { t: "blend", to: "rainforest", k });
  assert.ok(h.room.players.get(3).blendK <= protocol.BLEND_HZ, "a burst is held to the bucket");
});
