// Voice links: two players who each ask hear each other in any zone. The room's reading of an ask, who hears whom with
// links, and the real Room: only the asker sees a one-way ask, a break leaves the other's ask standing, and links last.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";

const { parseClientMessage, voicePeers, restoreLinks, storedLinks, linkView, LINK_FEATURE, LINK_BURST, LINK_WANTS, LINK_ACCOUNTS } = protocol;

test("a link message is a yes or no toward a player; anything else is ignored", () => {
  assert.deepEqual(parseClientMessage('{"t":"link","to":7,"on":true}'), { t: "link", to: 7, on: true });
  assert.deepEqual(parseClientMessage('{"t":"link","to":7,"on":false}'), { t: "link", to: 7, on: false });
  for (const bad of [{ to: 7 }, { on: true }, { to: 0, on: true }, { to: -1, on: true }, { to: "7", on: true }, { to: 7, on: 1 }, { to: 1.5, on: false }]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "link", ...bad })), null, JSON.stringify(bad));
  }
});

const speaker = (id, zone, extra = {}) => ({ id, zone, body: `b${id}`, voice: { sub: "s", track: "mic" }, ...extra });
const links = (...pairs) => { const m = new Map(); for (const [a, b] of pairs) { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); } return m; };

test("a link needs both asks, reaches across zones and past a body, and still needs a live microphone and a receive session", () => {
  const players = [speaker(1, "outside"), speaker(2, "dsb-outside"), speaker(3, "outside")];
  assert.deepEqual(voicePeers(players).get(1), [3], "with no links, zones decide");
  assert.deepEqual(voicePeers(players, null, links([1, 2])).get(1), [3], "one ask is no link");
  const both = links([1, 2], [2, 1]);
  assert.deepEqual(voicePeers(players, null, both).get(1), [2, 3], "the linked voice joins the zone's");
  assert.deepEqual(voicePeers(players, null, both).get(2), [1], "and it is the same both ways");
  assert.deepEqual(voicePeers(players, null, both).get(3), [1], "nobody else gains it");
  const away = [speaker(1, "none", { body: null }), speaker(2, "ember-den", { pokerVoice: 3 })];
  assert.deepEqual(voicePeers(away, null, both).get(1), [2], "nowhere and bodiless, a link still carries");
  assert.deepEqual(voicePeers([speaker(1, "outside"), speaker(2, "dsb-outside", { voice: { sub: "s", track: null } })], null, both).get(1), [], "no microphone, nothing to hear");
  assert.deepEqual(voicePeers([speaker(1, "outside", { voice: { sub: null, track: "mic" } }), speaker(2, "dsb-outside")], null, both).get(1), [], "no receive session, nothing heard");
});

test("stored asks come back bounded, with anything malformed dropped", () => {
  assert.equal(restoreLinks(undefined).size, 0);
  assert.equal(restoreLinks("no").size, 0);
  const restored = restoreLinks([[1, [2, 2, 1, 0, -3, "x", 3]], ["a", [1]], [4, "x"], [5, []]]);
  assert.deepEqual([...restored.keys()], [1], "a row with no good asks is gone");
  assert.deepEqual([...restored.get(1)], [2, 3], "an ask of oneself or a bad id is gone");
  const many = restoreLinks([[1, Array.from({ length: LINK_WANTS + 9 }, (_, i) => i + 2)]]);
  assert.equal(many.get(1).size, LINK_WANTS);
  assert.equal(restoreLinks(Array.from({ length: LINK_ACCOUNTS + 9 }, (_, i) => [i + 1, [i + 2]])).size, LINK_ACCOUNTS);
  assert.deepEqual(storedLinks(restored), [[1, [2, 3]]]);
  assert.deepEqual(linkView(links([1, 2], [1, 3], [2, 1]), 1), { wants: [2, 3], linked: [2] });
});

const harness = async () => {
  let now = 100000;
  const accepted = [], saved = new Map();
  let ready = null;
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
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); }, acceptWebSocket: (ws) => accepted.push(ws), waitUntil() {},
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => Array.isArray(key) ? new Map() : saved.get(key), put: async (key, value) => { saved.set(key, JSON.parse(JSON.stringify(value))); }, getAlarm: async () => null, setAlarm: async () => {} },
  };
  const h = { room: new context.Room(ctx, {}), saved, advance: (ms) => { now += ms; } };
  await ready;
  h.room.sfu = {};
  h.send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg));
  h.join = async (id, login, zone = "outside") => {
    const before = accepted.length;
    await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    const ws = accepted[before];
    h.room.players.get(id).voice = { pub: "p", sub: "s", track: "mic", gen: 1, mids: {}, pubMid: null };
    h.send(ws, { t: "body", name: login });
    h.send(ws, { t: "zone", name: zone });
    return ws;
  };
  h.leave = (ws) => { ws.closed = { code: 1000 }; h.room.webSocketClose(ws); };
  h.wake = async () => { h.room = new context.Room(ctx, {}); await ready; };
  return h;
};
const seen = (ws) => ws.sent.filter((m) => m.t === "links");
const last = (ws) => { const m = seen(ws).at(-1); return { wants: m.wants, linked: m.linked }; };
const hears = (ws) => ws.sent.filter((m) => m.t === "voice").at(-1).peers;

test("room: one ask shows to the asker alone, a second makes the link for both, a break returns the other's ask, and cancelling ends it", async () => {
  const h = await harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b", "dsb-outside");
  assert.ok(a.sent.find((m) => m.t === "welcome").features.includes(LINK_FEATURE), "the room says it keeps links");
  assert.deepEqual(last(a), { wants: [], linked: [] }, "welcome is followed by this player's links");
  assert.deepEqual(hears(a), [], "apart, they hear nobody");

  const told = seen(b).length;
  h.send(a, { t: "link", to: 2, on: true });
  assert.deepEqual(last(a), { wants: [2], linked: [] }, "the asker sees their ask (ember)");
  assert.equal(seen(b).length, told, "the one asked is told nothing (still grey)");
  assert.deepEqual(hears(a), [], "an ask carries no voice");

  h.send(b, { t: "link", to: 1, on: true });
  assert.deepEqual(last(a), { wants: [2], linked: [2] }, "linked for the first asker");
  assert.deepEqual(last(b), { wants: [1], linked: [1] }, "and for the second, in the same moment");
  assert.deepEqual(hears(a), [2]);
  assert.deepEqual(hears(b), [1]);

  h.send(a, { t: "link", to: 2, on: false });
  assert.deepEqual(last(a), { wants: [], linked: [] }, "the breaker goes back to grey");
  assert.deepEqual(last(b), { wants: [1], linked: [] }, "the other goes back to ember");
  assert.deepEqual(hears(a), [], "apart again, they cannot hear each other");
  assert.deepEqual(hears(b), []);

  const after = seen(a).length;
  h.send(b, { t: "link", to: 1, on: false });
  assert.deepEqual(last(b), { wants: [], linked: [] }, "the ember side cancels to grey");
  assert.equal(seen(a).length, after, "and the other hears nothing of it");
  assert.equal(h.room.links.size, 0, "nothing is left behind");
});

test("room: a link in one zone keeps both hearing each other after one walks to another, and the same zone hears as before once it is broken", async () => {
  const h = await harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  assert.deepEqual(hears(a), [2], "same zone");
  h.send(a, { t: "link", to: 2, on: true }); h.send(b, { t: "link", to: 1, on: true });
  h.send(b, { t: "zone", name: "dsb-outside" });
  assert.deepEqual(hears(a), [2], "the link follows them out");
  assert.deepEqual(hears(b), [1]);
  h.send(b, { t: "zone", name: "outside" });
  h.send(a, { t: "link", to: 2, on: false });
  assert.deepEqual(hears(a), [2], "together, breaking a link changes nothing");
});

test("room: a linked partner outside the Studio keeps a speaker's microphone live there, as a listener inside does", async () => {
  const h = await harness();
  const voiceOf = (ws) => ws.sent.filter((m) => m.t === "voice").at(-1);
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  h.room.studio.hostId = 1;
  h.send(a, { t: "zone", name: "dsb-studio" });
  assert.equal(voiceOf(a).listeners, 0, "alone in the Studio, nobody can hear it");
  h.send(a, { t: "link", to: 2, on: true });
  assert.equal(voiceOf(a).listeners, 0, "an ask carries no voice");
  h.send(b, { t: "link", to: 1, on: true });
  assert.deepEqual(voiceOf(a).peers, [2]);
  assert.equal(voiceOf(a).listeners, 1, "the partner hears it from the island");
  h.send(b, { t: "zone", name: "dsb-studio" });
  assert.equal(voiceOf(a).listeners, 1, "in the Studio too, counted once");
  h.send(b, { t: "zone", name: "outside" });
  h.room.players.get(2).voice.sub = null;
  h.room.updateVoice();
  assert.equal(voiceOf(a).listeners, 0, "with no receive session the partner hears nothing");
  h.room.players.get(2).voice.sub = "s";
  h.room.updateVoice();
  assert.equal(voiceOf(a).listeners, 1);
  h.send(a, { t: "link", to: 2, on: false });
  assert.equal(voiceOf(a).listeners, 0, "a broken link takes the listener away");
});

test("room: a visitor back with the microphone closed shows as in voice and muted, and counts as someone who can hear", async () => {
  const h = await harness();
  const voiceOf = (ws) => ws.sent.filter((m) => m.t === "voice").at(-1);
  const shown = (ws) => { const m = ws.sent.filter((s) => s.t === "vstate").at(-1); return { voice: m.voice, muted: m.muted }; };
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  const back = h.room.players.get(2);
  back.voice = { pub: null, sub: null, track: null, pending: null, gen: 0, mids: {}, pubMid: null };
  h.room.sfu = { newSession: async () => ({ sessionId: "back" }) };
  h.room.updateVoice();
  assert.equal(voiceOf(a).ears, undefined, "with no receive session it hears nothing");
  h.send(b, { t: "mute", on: true });
  assert.deepEqual(shown(a), { voice: false, muted: true }, "not connected yet, so not in voice");
  await h.room.voiceRequest("session", { headers: new Headers({ "x-player-id": "2", "x-room-token": back.connectionToken }), json: async () => ({ kind: "sub" }) });
  assert.deepEqual(shown(a), { voice: true, muted: true }, "others see it in voice, muted");
  assert.equal(h.room.view(back).voice, true, "and so does anyone who joins later");
  assert.deepEqual(hears(b), [1], "it hears the speaker");
  assert.deepEqual(voiceOf(a).peers, [], "a closed microphone is nothing to pull");
  assert.equal(voiceOf(a).ears, 1, "and the speaker knows it can be heard, so its microphone is not held off as alone");
  h.send(b, { t: "zone", name: "dsb-outside" });
  assert.equal(voiceOf(a).ears, undefined, "from another zone it cannot hear the speaker");
  h.send(b, { t: "zone", name: "outside" });
  assert.equal(voiceOf(a).ears, 1);
  h.send(b, { t: "mute", on: false });
  assert.deepEqual(shown(a), { voice: false, muted: false }, "a listener who is not muted (a Studio audience) stays off the roster");
});

test("room: links outlive a reconnect and a woken room, and are stored as asks alone", async () => {
  const h = await harness();
  let a = await h.join(1, "a");
  const b = await h.join(2, "b", "dsb-outside");
  h.send(a, { t: "link", to: 2, on: true }); h.send(b, { t: "link", to: 1, on: true });
  assert.deepEqual(h.saved.get("voiceLinks"), [[1, [2]], [2, [1]]]);
  h.leave(a);
  a = await h.join(1, "a");
  assert.deepEqual(last(a), { wants: [2], linked: [2] }, "a reconnect finds its link");
  assert.deepEqual(hears(a), [2], "and hears it");
  await h.wake();
  assert.deepEqual(linkView(h.room.links, 2), { wants: [1], linked: [1] }, "a woken room reads it from storage");
});

test("room: asks are held to a rate, an offline player cannot be asked but can be let go, and a full list says so", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  h.send(a, { t: "link", to: 1, on: true });
  assert.equal(h.room.links.size, 0, "nobody links to themselves");
  h.send(a, { t: "link", to: 42, on: true });
  assert.equal(h.room.links.size, 0, "nobody offline can be asked");
  h.room.links.set(1, new Set([42]));
  h.advance(10000);
  h.send(a, { t: "link", to: 42, on: false });
  assert.equal(h.room.links.size, 0, "an ask of someone offline can be taken back");
  await h.join(2, "b");
  h.room.links.set(1, new Set(Array.from({ length: LINK_WANTS }, (_, i) => 1000 + i)));
  h.advance(10000);
  h.send(a, { t: "link", to: 2, on: true });
  assert.equal(seen(a).at(-1).refused, "full");
  assert.ok(!h.room.links.get(1).has(2), "a full list takes no more");
  h.room.links.clear();
  h.advance(10000);
  for (let i = 0; i < LINK_BURST * 2; i++) h.send(a, { t: "link", to: 2, on: i % 2 === 0 });
  assert.ok(seen(a).length <= LINK_BURST + 4, "a burst past the bucket writes and says nothing more");
});

test("room: link-all answers everyone here who has asked, with nobody waiting takes back every ask, and leaves the others' asks standing", async () => {
  const h = await harness();
  const a = await h.join(1, "a"), b = await h.join(2, "b", "dsb-outside"), c = await h.join(3, "c", "dsb-outside");
  const did = (ws) => { const m = seen(ws).at(-1); return [m.all, m.n]; };
  assert.deepEqual(parseClientMessage('{"t":"link-all"}'), { t: "link-all" });
  h.send(a, { t: "link-all" });
  assert.deepEqual(did(a), ["none", 0], "nobody has asked and nothing is held");
  h.send(b, { t: "link", to: 1, on: true });
  h.send(c, { t: "link", to: 1, on: true });
  h.room.links.set(42, new Set([1]));
  h.advance(10000);
  h.send(a, { t: "link-all" });
  assert.deepEqual(did(a), ["linked", 2], "both here are answered, the one offline is not");
  assert.deepEqual(last(a), { wants: [2, 3], linked: [2, 3] });
  assert.deepEqual(last(b), { wants: [1], linked: [1] }, "each is told");
  assert.deepEqual(hears(a), [2, 3], "and heard across zones at once");
  h.advance(10000);
  h.send(a, { t: "link-all" });
  assert.deepEqual(did(a), ["unlinked", 2], "with nobody left waiting it unlinks everyone");
  assert.deepEqual(last(a), { wants: [], linked: [] });
  assert.deepEqual(last(c), { wants: [1], linked: [] }, "the other's ask still stands");
  assert.deepEqual(hears(a), []);
  h.advance(10000);
  h.send(a, { t: "link-all" });
  assert.deepEqual(did(a), ["linked", 2], "so the next press links them again");
  h.room.links.set(1, new Set(Array.from({ length: LINK_WANTS - 1 }, (_, i) => 1000 + i)));
  h.advance(10000);
  h.send(a, { t: "link-all" });
  assert.equal(seen(a).at(-1).refused, "full", "more waiting than fit says so");
  assert.deepEqual(did(a), ["linked", 1], "and links as many as fit");
  assert.equal(h.room.links.get(1).size, LINK_WANTS);
});

test("room: a deleted account's asks, and every ask of it, go at once", async () => {
  const h = await harness();
  const a = await h.join(1, "a", "dsb-outside"), b = await h.join(2, "b"), c = await h.join(3, "c");
  h.send(a, { t: "link", to: 2, on: true }); h.send(b, { t: "link", to: 1, on: true });
  h.send(c, { t: "link", to: 1, on: true });
  await h.room.forgetVoiceLinks(1);
  assert.deepEqual(h.saved.get("voiceLinks"), []);
  assert.deepEqual(last(b), { wants: [], linked: [] }, "the partner is told");
  assert.deepEqual(hears(b), [3], "and hears only their own zone");
  await h.room.forgetVoiceLinks(99);
  assert.deepEqual(h.saved.get("voiceLinks"), [], "an account with no links writes nothing new");
});
