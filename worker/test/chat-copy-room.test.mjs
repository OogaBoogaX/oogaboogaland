// A hosted chat's copy of its zone (room-copy.js): the island's own Room as `chat:<id>`, admitting the chat's speakers
// alone, offering exactly its few kinds and taking exactly its few messages, sending its walkers home on the chat's word,
// keeping nothing once the chat ends, relaying its walkers' places, and never speaking to the World Map or Ooga Chat's
// audience singleton; and the island's side of a trip, its kept seat. The real Room on a mocked Durable Object host, as
// reconnect-hold.test.mjs drives it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import { sfuClient } from "../src/sfu.js";
import { deliverHighscores } from "../src/highscore-store.js";
import * as studio from "../src/studio-policy.js";
import { AWAY_MS, COPY_MESSAGES, WALK_MS, copyRoom } from "../src/room-copy.js";

const { CLOSE_KICK, MAX_PLAYERS } = protocol;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const CHAT = "AbCdEfGhIjKlMnOp";

// The chat's object as the copy reaches it (audience.js): who may walk, what it heard, and calls to anything else.
const chatStub = ({ speakers = new Set([1, 2, 3]), ended = false, clouds = [] } = {}) => {
  const heard = { member: [], walking: [], check: [], walk: [], singleton: 0 };
  const chat = {
    copyMember: async (id) => {
      heard.member.push(id);
      if (ended) return { ok: false, reason: "ended" };
      return speakers.has(Number(id.slice(3))) ? { ok: true, zone: "main", title: "Ooga talk", clouds } : { ok: false, reason: "not-speaker" };
    },
    walking: async (ids) => { heard.walking.push([...ids]); return { ok: true }; },
    copyCheck: async (ids) => { heard.check.push([...ids]); return ids.filter((id) => !speakers.has(Number(id.slice(3)))); },
    walk: (seq, ids, p) => { heard.walk.push({ seq, ids: [...ids], p: [...p] }); return heard.walkAnswer ? heard.walkAnswer() : Promise.resolve({ ok: true }); },
  };
  const AUDIENCE = { getByName: (name) => {
    if (name === `chat:${CHAT}`) return chat;
    heard.singleton++;
    return { world: async () => ({ ok: true }), watch: async () => {}, snapshot: async () => null, islandReaction: async () => {} };
  } };
  return { AUDIENCE, heard, speakers };
};

const host = (name, env) => {
  const accepted = [], timers = new Map(), stored = new Map(), world = [];
  let timerId = 0, alarmDeleted = 0;
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { if (this.closed) throw new Error("closed"); this.sent.push(JSON.parse(text)); },
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
    ...protocol, ...studio, deliverHighscores, sfuClient, sha256Hex, getPlayer, CAST_ROWS: [],
    DurableObject: class { constructor(ctx, e) { this.ctx = ctx; this.env = e; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, console, ArrayBuffer, DataView,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  runInNewContext(source, context);
  let restoring;
  const ctx = {
    id: { name }, waitUntil: (task) => { Promise.resolve(task).catch(() => {}); },
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (restoring = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: {
      get: async (key) => structuredClone(stored.get(key)), put: async (key, value) => { stored.set(key, structuredClone(value)); },
      delete: async (key) => { stored.delete(key); }, deleteAll: async () => { stored.clear(); },
      getAlarm: async () => null, setAlarm: async (at) => { stored.set("(alarm)", at); }, deleteAlarm: async () => { alarmDeleted++; stored.delete("(alarm)"); },
    },
  };
  // Any report to the World Map is counted.
  const fullEnv = { WORLD: { getByName: () => { world.push(name); return { report: async () => ({ watching: true }) }; } }, ...env };
  const room = () => {
    const r = new context.Room(ctx, fullEnv), ready = restoring;
    for (const fn of ["fetch", "alarm"]) {
      const handle = r[fn];
      r[fn] = async function (...args) { await ready; return handle.apply(this, args); };
    }
    return r;
  };
  const join = async (r, id, resume = "") => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/api/chats/x/world" + (resume ? "?resume=" + encodeURIComponent(resume) : ""),
      headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": `player${id}`, "x-player-display": `P${id}`, "x-player-contributor": "1" }) });
    return accepted[before];
  };
  const fire = (ms) => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } };
  return { room, join, fire, timers, stored, world, alarmDeleted: () => alarmDeleted };
};
const ALL = "bridge,outdoor,cloud,commons,commons-send,chats,copies";
const welcomeOf = (ws) => ws.sent.find((m) => m.t === "welcome");
const heard = (ws, t) => ws.sent.filter((m) => m.t === t);
const say = (r, ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg));

test("a copy admits the chat's speakers alone, and says to the chat who walks it", async () => {
  const chat = chatStub({ clouds: [{ id: "gh:9", character: "guest/x-amy", zone: "main", seat: "main-cloud-1", seatRevision: "cloud-seats-v2", lease: 3, mic: "on", hand: "", login: "amy", display: "Amy" }] });
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1);
  assert.deepEqual(chat.heard.member, ["gh:1"]);
  assert.deepEqual(welcomeOf(a).copy, { chat: CHAT, zone: "main" });
  assert.deepEqual(h.stored.get("copy").zone, "main", "the chat's zone kept on first admission");
  const out = await h.join(r, 7);
  assert.deepEqual(out.sent, [{ t: "kick", reason: "not-speaker" }]);
  assert.equal(out.closed.code, CLOSE_KICK);
  assert.ok(!r.players.has(7));
  const b = await h.join(r, 2);
  await flush();
  assert.deepEqual(chat.heard.walking, [["gh:1"], ["gh:1", "gh:2"]]);
  assert.deepEqual(heard(a, "join").map((m) => m.p.id), [2]);
  b.closed = { code: 1000 }; r.webSocketClose(b, 1000, "", true);
  await flush();
  assert.deepEqual(chat.heard.walking.at(-1), ["gh:1"], "a departure for good is told");
  // The copy has no voice and no Ooga Chat members.
  for (const path of ["/voice/session", "/community"]) assert.equal((await r.fetch({ url: `https://x.invalid${path}`, headers: new Headers() })).status, 404);

  const ended = chatStub({ ended: true }), e = host(`chat:${CHAT}`, { AUDIENCE: ended.AUDIENCE, OOGA_CHAT_FEATURES: ALL });
  const late = await e.join(e.room(), 1);
  assert.deepEqual(late.sent, [{ t: "kick", reason: "chat-ended" }]);
});

test("a copy's welcome offers exactly its kinds, and nothing the island sends after it", async () => {
  const chat = chatStub({ clouds: [] });
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1);
  assert.deepEqual(welcomeOf(a).features, ["call-v1", "react-v1", "hand-emoji-v1", "dance-v1", "cloud-seats-v2", "copy-v1"]);
  assert.deepEqual(a.sent.map((m) => m.t), ["welcome", "clouds"], "no chat history, chalk, cabinets, links, Studio or duels");
  assert.deepEqual(heard(a, "clouds")[0], { t: "clouds", v: 1, revision: 1, clouds: [] });
  assert.equal(welcomeOf(a).away, undefined);
  // Equipment, the catalog and the inspector keep theirs; a chat that has given no clouds offers none.
  const bare = chatStub({ clouds: null }), k = host(`chat:${CHAT}`, { AUDIENCE: bare.AUDIENCE, OOGA_CHAT_FEATURES: "chats,copies" });
  const b = await k.join(k.room(), 1);
  assert.deepEqual(welcomeOf(b).features, ["call-v1", "react-v1", "hand-emoji-v1", "dance-v1", "copy-v1"]);
  assert.deepEqual(b.sent.map((m) => m.t), ["welcome"]);
  // The island's own welcome offers the trip once copies are on, and the copy's kind never.
  const island = host("island", { OOGA_CHAT_FEATURES: "chats,copies" }), i = await island.join(island.room(), 1);
  assert.ok(welcomeOf(i).features.includes("travel-v1"));
  assert.ok(!welcomeOf(i).features.includes("copy-v1"));
  const off = host("island", { OOGA_CHAT_FEATURES: "chats" }), o = await off.join(off.room(), 1);
  assert.ok(!welcomeOf(o).features.includes("travel-v1"));
});

test("a copy takes exactly its few messages; every island one, and every frame, is ignored without a kick", async () => {
  assert.deepEqual([...COPY_MESSAGES].sort(), ["back", "body", "call", "hand", "hub", "mute", "pose", "react", "visible", "zone"]);
  const chat = chatStub();
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1), b = await h.join(r, 2);
  say(r, a, { t: "body", name: "player1" });
  b.sent.length = 0; a.sent.length = 0;
  const island = [{ t: "chat", text: "hi" }, { t: "pm", op: "invite", to: 2 }, { t: "link", to: 2, on: true }, { t: "link-all" },
    { t: "door", op: "ask", dir: "in", room: 3 }, { t: "shot", a: [0, 0, 0, 1, 1, 1] }, { t: "swing" }, { t: "hp", v: 50, ko: false },
    { t: "blend", to: "hq", k: 3 }, { t: "poker-voice", table: 1 }, { t: "cabinet", op: "leave", id: "invaders", q: 1 },
    { t: "duel", op: "challenge", to: 2 }, { t: "tess-guide", op: "join" }, { t: "prop", k: "s", a: [0, 0, 0, 0, 0, 0] },
    { t: "outdoor", v: 1, op: "enter", epoch: 1, scope: "main" }, { t: "audience-view", v: 1, zone: "main" }, { t: "travel" }, { t: "hub", on: true }];
  for (const msg of island) {
    assert.ok(protocol.parseClientMessage(JSON.stringify(msg)), `${msg.t} is a message the island takes`);
    await say(r, a, msg);
  }
  r.webSocketMessage(a, new ArrayBuffer(16));
  await flush();
  const p = r.players.get(1);
  assert.equal(a.closed, null);
  assert.deepEqual([b.sent, a.sent], [[], []], "nobody heard a thing");
  assert.deepEqual([p.hp, p.blendTo, p.inHub, p.travel, p.audienceZone, p.outdoor, r.chat.size], [100, null, false, undefined, undefined, undefined, 0]);
  // Its own: a pose, a zone of the chat's, a hand and a reaction.
  say(r, a, { t: "pose", x: 1, y: 2, z: 3, yaw: 0.5 });
  assert.deepEqual([p.x, p.y, p.z, p.yaw], [1, 2, 3, 0.5]);
  say(r, a, { t: "zone", name: "between" });
  assert.equal(p.zone, "between");
  for (const name of ["lab", "dsb-outside", "sphere-0", "hq"]) say(r, a, { t: "zone", name });
  assert.equal(p.zone, "between", "a zone outside the chat's own is ignored");
  assert.equal(a.closed, null);
  say(r, a, { t: "zone", name: "outside" });
  say(r, a, { t: "react", e: "😂" });
  say(r, a, { t: "hand", on: true });
  assert.deepEqual(b.sent.map((m) => m.t), ["zone", "zone", "react", "hand"]);
});

test("a copy never speaks to the World Map or the audience singleton, and hosts no NPCs or voice", async () => {
  const chat = chatStub();
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1), b = await h.join(r, 2);
  say(r, a, { t: "body", name: "player1" });
  say(r, a, { t: "zone", name: "between" });
  say(r, a, { t: "mute", on: true });
  say(r, a, { t: "hand", on: true });
  say(r, a, { t: "hub", on: true });
  r.sweepAt = 0;
  await r.alarm();
  b.closed = { code: 1006 }; r.webSocketClose(b, 1006, "", false);
  h.fire(protocol.HOLD_MS);
  await flush(); await flush();
  assert.deepEqual([h.world, chat.heard.singleton], [[], 0]);
  assert.equal(r.hostId, 0);
  assert.equal(r.sfu, null);
  // The island, alike, does report.
  const island = host("island", { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), i = island.room();
  await island.join(i, 1);
  await flush();
  assert.ok(island.world.length > 0 && chat.heard.singleton > 0, "the island's reporters are live in this harness");
});

test("the chat sends walkers home: a revocation, the sweep's check, and the end, which keeps nothing", async () => {
  const chat = chatStub();
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1), b = await h.join(r, 2), c = await h.join(r, 3);
  r.copyRevoke(2, "removed");
  assert.deepEqual(heard(b, "kick"), [{ t: "kick", reason: "removed" }]);
  assert.equal(b.closed.code, CLOSE_KICK);
  assert.deepEqual(heard(a, "leave").map((m) => [m.id, m.reason]), [[2, "removed"]]);
  // A lapsed stage hold: the sweep asks, and the chat says account 3 may no longer walk.
  chat.speakers.delete(3);
  r.sweepAt = 0;
  await r.alarm();
  assert.deepEqual(chat.heard.check.at(-1), ["gh:1", "gh:3"]);
  assert.deepEqual(heard(c, "kick"), [{ t: "kick", reason: "stage" }]);
  assert.deepEqual([...r.players.keys()], [1]);
  await r.copyClouds([{ id: "gh:5", character: "five", zone: "main", seat: "main-cloud-2" }]);
  assert.deepEqual(heard(a, "clouds").at(-1).clouds.map((x) => x.id), ["gh:5"]);
  assert.ok(h.stored.has("copy"));
  const walked = chat.heard.walking.length;
  assert.equal((await r.copyEnd()).ok, true);
  assert.deepEqual(heard(a, "kick"), [{ t: "kick", reason: "chat-ended" }]);
  assert.equal(r.players.size, 0);
  assert.deepEqual([...h.stored.keys()], [], "nothing kept");
  assert.equal(h.alarmDeleted(), 1);
  await flush();
  assert.equal(chat.heard.walking.length, walked, "an ended chat is told nothing more");
});

test("a copy holds a lost socket as the island does, and its page takes the record back", async () => {
  const chat = chatStub();
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1), b = await h.join(r, 2);
  await flush();
  const told = chat.heard.walking.length;
  a.closed = { code: 1006 }; r.webSocketClose(a, 1006, "", false);
  assert.ok(r.players.get(1).held);
  assert.equal(heard(b, "leave").length, 0);
  const again = await h.join(r, 1, welcomeOf(a).resume);
  assert.equal(welcomeOf(again).resumed, true);
  assert.deepEqual(welcomeOf(again).copy, { chat: CHAT, zone: "main" });
  assert.deepEqual(chat.heard.member, ["gh:1", "gh:2", "gh:1"], "asked again before taking the record back");
  await flush();
  assert.equal(chat.heard.walking.length, told, "still walking: nothing to tell");
  assert.deepEqual(again.sent.map((m) => m.t), ["welcome", "clouds"]);
});

test("a copy relays its walkers' places to the chat: one call in flight, at most every WALK_MS, and no timer while still", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const chat = chatStub();
  const h = host(`chat:${CHAT}`, { AUDIENCE: chat.AUDIENCE, OOGA_CHAT_FEATURES: ALL }), r = h.room();
  const a = await h.join(r, 1);
  await h.join(r, 2);
  let answer;
  chat.heard.walkAnswer = () => new Promise((resolve) => { answer = resolve; });
  say(r, a, { t: "pose", x: 1, y: 2, z: 3, yaw: 0.5 });
  r.snapshot();
  assert.equal(chat.heard.walk.length, 1);
  const first = chat.heard.walk[0];
  assert.deepEqual([first.ids, first.p], [[1, 2], [1, 2, 3, 0.5, r.players.get(2).x, 0, r.players.get(2).z, r.players.get(2).yaw]]);
  say(r, a, { t: "pose", x: 4, y: 2, z: 3, yaw: 0.5 });
  r.snapshot();
  say(r, a, { t: "pose", x: 5, y: 2, z: 3, yaw: 0.5 });
  r.snapshot();
  assert.equal(chat.heard.walk.length, 1, "one call in flight");
  answer({ ok: true });
  await flush();
  assert.equal(chat.heard.walk.length, 1, "nor sooner than WALK_MS after the last");
  t.mock.timers.tick(WALK_MS);
  await flush();
  assert.equal(chat.heard.walk.length, 2, "a burst's last change goes once");
  assert.equal(chat.heard.walk[1].p[0], 5);
  assert.ok(chat.heard.walk[1].seq > first.seq);
  answer({ ok: true });
  await flush();
  t.mock.timers.tick(WALK_MS * 4);
  await flush();
  assert.equal(chat.heard.walk.length, 2, "nothing moved: nothing sent");
  assert.equal(r.copy.walkTimer, 0, "and no timer left");
});

test("the island keeps a traveller's seat: its leave says so, its return beams in, and the chat or time lets the seat go", async () => {
  const h = host("island", { OOGA_CHAT_FEATURES: "chats,copies" }), r = h.room();
  const a = await h.join(r, 4), b = await h.join(r, 5);
  say(r, a, { t: "body", name: "player4" });
  await r.chatVoice(4, CHAT, true);
  say(r, a, { t: "travel" });
  a.closed = { code: 1006 }; r.webSocketClose(a, 1006, "", false);
  assert.ok(!r.players.has(4), "a traveller is never held");
  assert.deepEqual(heard(b, "leave").at(-1), { t: "leave", id: 4, reason: "travel", character: "player4" });
  await flush();
  assert.deepEqual(h.stored.get("away").map(([id, e]) => [id, e.chat, e.character]), [[4, CHAT, "player4"]]);
  const c = await h.join(r, 6);
  assert.deepEqual(welcomeOf(c).away, [{ id: 4, character: "player4" }]);
  // The seat counts as taken: the island fills one short of its cap, and the traveller can still come back.
  const extra = [];
  for (let id = 100; r.players.size + 1 < MAX_PLAYERS; id++) extra.push(await h.join(r, id));
  assert.deepEqual(heard(await h.join(r, 99), "kick"), [{ t: "kick", reason: "full" }]);
  const back = await h.join(r, 4);
  assert.ok(r.players.has(4));
  assert.deepEqual(heard(b, "join").at(-1).p.id, 4);
  assert.equal(heard(b, "join").at(-1).travel, true);
  assert.equal(r.away.size, 0);
  assert.equal(welcomeOf(back).away, undefined);
  // Away again; the chat lets the stage go, and every page shows the Ooga's NPC again.
  say(r, back, { t: "travel" });
  back.closed = { code: 1000 }; r.webSocketClose(back, 1000, "", true);
  assert.equal(r.away.size, 1);
  await r.chatVoice(4, "AnotherChatIdXyz", false);
  assert.equal(r.away.size, 1, "another chat's word changes nothing");
  await r.chatVoice(4, CHAT, false);
  assert.deepEqual(heard(b, "away").at(-1), { t: "away", id: 4, on: false });
  assert.equal(r.away.size, 0);
  // And past AWAY_MS, by the sweep.
  r.away.set(7, { chat: null, at: Date.now() - AWAY_MS - 1, character: "player7" });
  copyRoom.sweepAway(r, Date.now());
  assert.deepEqual(heard(b, "away").at(-1), { t: "away", id: 7, on: false });
  // A seat past its time never fills the island, even with no sweep since: the admission lets it go first.
  r.away.set(8, { chat: null, at: Date.now() - AWAY_MS - 1, character: "player8" });
  assert.equal(copyRoom.awayOthers(r, 99), 0, "an expired seat is let go at the check");
  assert.deepEqual(heard(b, "away").at(-1), { t: "away", id: 8, on: false });
  // Copies off: a travel message changes nothing.
  const off = host("island", { OOGA_CHAT_FEATURES: "chats" }), o = off.room(), x = await off.join(o, 4), y = await off.join(o, 5);
  say(o, x, { t: "travel" });
  x.closed = { code: 1000 }; o.webSocketClose(x, 1000, "", true);
  assert.equal(heard(y, "leave").at(-1).reason, "closed");
  assert.equal(o.away.size, 0);
});
