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

test("#422: the arcade's hallway crosses from Ooga Arcade to Ghost Hunter's Arena, each end its own, the arena one region hunting or not, and nowhere else", () => {
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, zone, blendTo = null, blendK = 0) => ({ id, body: `ooga-${id}`, zone, voice: on, blendTo, blendK });
  // A hunter on a page loaded before #422 reports `arcade-hunt`, its arena `arcade.arena`: both are the arena region.
  const hall = p(1, "arcade.hall"), arena = p(2, "ghost-arena"), hunter = p(3, "arcade-hunt"), island = p(4, "outside"), nearHalf = p(5, "arcade.haunt"), farHalf = p(6, "ghost-arena.haunt"), legacy = p(7, "arcade.arena");
  const hears = (listener) => voicePeers([hall, arena, hunter, island, legacy, listener]).get(listener.id);
  assert.deepEqual(hears(p(9, "arcade.hall")), [1], "in the hall: the arcade alone, never an old page's arena");
  assert.deepEqual(hears(p(9, "ghost-arena")), [2, 3, 7], "in the arena: the arena, hunting or not, old names included; never the hall");
  assert.deepEqual(hears(p(9, "arcade.haunt")), [1], "at the hallway's arcade end: the arcade alone");
  assert.deepEqual(hears(p(9, "arcade.haunt", "ghost-arena", 1)), [1, 2, 3, 7], "a step along: both, the hunters too");
  assert.deepEqual(hears(p(9, "arcade.haunt", "ghost-arena", STEPS / 2)), [1, 2, 3, 7], "the midpoint from the arcade's half: both");
  assert.deepEqual(hears(p(9, "ghost-arena.haunt", "arcade", STEPS / 2)), [1, 2, 3, 7], "the midpoint from the arena's half: the same");
  assert.deepEqual(hears(p(9, "ghost-arena.haunt")), [2, 3, 7], "at the hallway's arena end: the arena alone, its hunt included");
  const all = voicePeers([hall, arena, hunter, island, nearHalf, farHalf, legacy]);
  assert.deepEqual(all.get(1), [5], "the hall hears its half of the hallway, never the arena's nor the old arena");
  assert.deepEqual(all.get(2), [3, 6, 7], "and the arena its own half");
  assert.deepEqual(all.get(7), [2, 3, 6], "an old page in the arena hears the arena, never the hall");
  assert.deepEqual(voicePeers([hall, arena, hunter, island, p(9, "arcade.haunt", "ghost-arena", 10)]).get(3), [2, 9], "a hunter hears the arena and the walker halfway down the hallway");
  for (const [zone, to] of [["arcade.haunt", "ghost-arena"], ["ghost-arena.haunt", "arcade"], ["arcade.hall", "ghost-arena"], ["arcade-hunt", "arcade"], ["arcade.arena", "arcade"]]) assert.ok(BLEND.adjacent(zone, to), `${zone} to ${to}`);
  for (const [zone, to] of [["ghost-arena", "outside"], ["outside", "ghost-arena"], ["arcade.haunt", "arcade"], ["arcade.arena", "ghost-arena"], ["arcade-hunt", "outside"]]) assert.ok(!BLEND.adjacent(zone, to), `not ${zone} to ${to}`);
  assert.deepEqual(["arcade.arena", "arcade-hunt", "ghost-arena.haunt", "arcade.haunt"].map(protocol.zoneGroup), ["ghost-arena", "ghost-arena", "ghost-arena", "arcade"]);
  assert.deepEqual(parseClientMessage('{"t":"blend","to":"ghost-arena","k":3}'), { t: "blend", to: "ghost-arena", k: 3 });
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(BLEND.gain("arcade.haunt", "ghost-arena", 0.5, "arcade.hall", null, 0), Math.SQRT1_2) && close(BLEND.gain("ghost-arena.haunt", "arcade", 0.5, "ghost-arena", null, 0), Math.SQRT1_2), "equal power at the midpoint from either half");
  assert.ok(close(BLEND.gain("arcade.haunt", "ghost-arena", 0.5, "ghost-arena.haunt", "arcade", 0.5), 1), "two side by side at the midpoint, one each side of it");
  assert.ok(BLEND.sameFrame("arcade.haunt", "ghost-arena.haunt") && BLEND.sameFrame("arcade.hall", "arcade-hunt") && !BLEND.sameFrame("arcade", "arcade.hall") && !BLEND.sameFrame("outside", "ghost-arena"), "the arcade scene's zones share coordinates, the island's tunnel does not");
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
  // The page can reach the end before its throttled final step reaches the room. Its explicit clear after the zone
  // must remove the room's inverted remainder, including the old land's permission to hear the arriving player.
  h.send(crosser, { t: "zone", name: "outside" });
  h.advance(1000);
  h.send(crosser, { t: "blend", to: "rainforest", k: STEPS - 1 });
  h.send(crosser, { t: "zone", name: "rainforest" });
  assert.equal(h.room.players.get(3).blendK, 1, "the room still holds the penultimate wire step");
  h.send(crosser, { t: "blend", to: null, k: 0 });
  assert.equal(h.room.players.get(3).blendTo, null, "the page's explicit endpoint clear removes the remainder");
  assert.deepEqual([last(crosser, "voice").peers, last(islander, "voice").peers, last(forester, "voice").peers], [[2], [], [3]], "endpoint isolation holds both ways");
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

// #422: one walk down the arcade's hallway and back, as the page reports it (scene-arcade.js: each half its land's zone,
// the zone flipping just past the midpoint, a step along at most every 250 ms), measured through the real Room. The
// workload is what the room sends: voice lists (each changed list is SFU pulls or closes on the page) and blend steps.
test("room: the hallway walk changes each voice list only at its ends, keeps it across the midpoint, and leaves nothing behind on reconnect", async () => {
  const h = harness();
  const hall = await h.join(1, "a", "arcade.hall"), arena = await h.join(2, "b", "ghost-arena"), walker = await h.join(3, "c", "arcade.haunt");
  const lists = (ws) => ws.sent.filter((m) => m.t === "voice").map((m) => m.peers.join());
  const mark = new Map([[walker, lists(walker).length], [hall, lists(hall).length], [arena, lists(arena).length]]);
  // Changed lists since the walk began, counted from the last list before it.
  const changes = (ws) => lists(ws).slice(Math.max(0, mark.get(ws) - 1)).filter((l, i, all) => i > 0 && l !== all[i - 1]).length;
  const startBlends = count(hall, "blend");
  assert.deepEqual(last(walker, "voice").peers, [1], "at the arcade end: the hall alone");
  const report = (u) => {
    const far = u > 0.5 + 0.03, zone = far ? "ghost-arena.haunt" : "arcade.haunt";
    if (h.room.players.get(3).zone !== zone) h.send(walker, { t: "zone", name: zone });
    const k = Math.round((far ? 1 - u : u) * STEPS);
    h.send(walker, k ? { t: "blend", to: far ? "arcade" : "ghost-arena", k } : { t: "blend", to: null, k: 0 });
    h.advance(250);
  };
  let midpoint = null;
  for (let i = 0; i <= 40; i++) {
    report(i / 40);
    if (i === 22) midpoint = { peers: last(walker, "voice").peers, blendTo: h.room.players.get(3).blendTo, k: h.room.players.get(3).blendK };
  }
  assert.deepEqual(midpoint, { peers: [1, 2], blendTo: "arcade", k: 9 }, "just past the midpoint, the crossing seen from the arena's half, both lands heard");
  assert.deepEqual(last(walker, "voice").peers, [2], "at the arena end: the arena alone");
  const out = { walker: changes(walker), hall: changes(hall), arena: changes(arena), blends: count(hall, "blend") - startBlends };
  for (let i = 40; i >= 0; i--) report(i / 40);
  assert.deepEqual(last(walker, "voice").peers, [1], "and back at the arcade end: the hall alone");
  const both = { walker: changes(walker), hall: changes(hall), arena: changes(arena), blends: count(hall, "blend") - startBlends };
  // The arena end's list loses the hall once and gains it once on the way back; each side gains and loses the walker once.
  assert.deepEqual(out, { walker: 2, hall: 1, arena: 1, blends: out.blends }, JSON.stringify(out));
  assert.deepEqual(both, { walker: 4, hall: 2, arena: 2, blends: both.blends }, JSON.stringify(both));
  assert.ok(out.blends <= STEPS + 2 && both.blends <= 2 * STEPS + 4, `blend steps bounded by STEPS a way: ${JSON.stringify(both)}`);
  // A page loaded before #422 in the arena (`arcade.arena`) stays in the arena's region in the real room: the hall
  // never hears it. (The pre-#422 baseline is measured from the old source, not here.)
  h.send(arena, { t: "zone", name: "arcade.arena" });
  assert.deepEqual([last(hall, "voice").peers, last(arena, "voice").peers], [[3], []], "the old arena name hears neither the hall nor the walker at the hall's end");
  // Reconnect halfway along: the old socket's crossing goes with it, and the new page starts from its zone alone.
  for (let i = 0; i <= 20; i++) report(i / 40 + 0.25);
  assert.equal(h.room.players.get(3).blendTo, "arcade");
  h.room.webSocketClose(walker); walker.close(1000, "gone");
  assert.deepEqual([last(hall, "voice").peers, last(arena, "voice").peers], [[], []], "gone from both sides");
  const again = await h.join(3, "c", "ghost-arena.haunt");
  assert.equal(h.room.players.get(3).blendTo, null, "a fresh socket keeps no crossing");
  assert.deepEqual([last(again, "voice").peers, last(hall, "voice").peers, last(arena, "voice").peers], [[2], [], [3]], "the arena's half alone until the page reports its step");
  h.send(again, { t: "zone", name: "arcade.hall" });
  assert.deepEqual([last(again, "voice").peers, h.room.players.get(3).blendTo], [[1], null], "into the hall: the hall alone, no crossing kept");
});
