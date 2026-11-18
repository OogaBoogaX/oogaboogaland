// A lost socket's record held for its page (room.js `hold`, `resume`): the real Room on a mocked Durable Object host, as
// chat.test.mjs drives it, with timers fired by hand so the hold's end needs no waiting.
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

const { CLOSE_KICK, CLOSE_RECONNECT, HOLD_MS } = protocol;

const host = () => {
  const accepted = [], timers = new Map();
  let timerId = 0;
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
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, console,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  runInNewContext(source, context);
  let restoring;
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (restoring = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async () => undefined, put: async () => {}, delete: async () => {}, getAlarm: async () => 0, setAlarm: async () => {} },
  };
  const room = () => {
    const r = new context.Room(ctx, {}), ready = restoring;
    for (const name of ["fetch", "alarm"]) {
      const handle = r[name];
      r[name] = async function (...args) { await ready; return handle.apply(this, args); };
    }
    return r;
  };
  const join = async (r, id, login, resume = "") => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room" + (resume ? "?resume=" + encodeURIComponent(resume) : ""),
      headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-display": login, "x-player-contributor": "1" }) });
    return accepted[before];
  };
  // Fires the pending timers of exactly this delay, as if that long had passed.
  const fire = (ms) => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } };
  return { room, join, fire, timers };
};
const welcomeOf = (ws) => ws.sent.find((m) => m.t === "welcome");
const heard = (ws, t) => ws.sent.filter((m) => m.t === t);
// A socket lost without a close frame, as the runtime reports a network blip or an edge restart.
const lose = (r, ws) => { ws.closed = { code: 1006, reason: "" }; r.webSocketClose(ws, 1006, "", false); };

test("a socket lost without a word is held: nobody else hears a leave, and the player still stands in their view", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  lose(r, a);
  assert.equal(heard(b, "leave").length, 0);
  assert.ok(r.players.get(4)?.held, "the record is held");
  const c = await join(r, 6, "third-one");
  assert.deepEqual(welcomeOf(c).players.map((p) => p.id).sort(), [4, 5], "a newcomer sees the held player too");
});

test("its page back with the welcome's key takes the record again: same voice sessions, a new token and key, no join for anyone else", async () => {
  const { room, join, timers } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  const first = welcomeOf(a), held = r.players.get(4);
  assert.equal(typeof first.resume, "string");
  held.voice.pub = "pub-session"; held.voice.sub = "sub-session";
  lose(r, a);
  const again = await join(r, 4, "new-contributor", first.resume);
  const back = welcomeOf(again);
  assert.equal(back.resumed, true);
  assert.notEqual(back.resume, first.resume, "a key serves once");
  assert.notEqual(back.connectionToken, first.connectionToken, "the old connection's voice calls are refused");
  assert.equal(r.players.get(4), held, "the same record");
  assert.equal(held.held, null);
  assert.equal(held.ws, again);
  assert.deepEqual([held.voice.pub, held.voice.sub], ["pub-session", "sub-session"]);
  assert.equal(heard(b, "leave").length + heard(b, "join").length, 0, "nobody else saw them go");
  assert.equal(again.store.resumeKey, back.resume, "the new key rides the attachment, so a wake keeps it");
  assert.ok(![...timers.values()].some((t) => t.ms === HOLD_MS), "the hold's end is called off");
});

test("not back within HOLD_MS: everyone hears the leave the close would have been", async () => {
  const { room, join, fire } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  lose(r, a);
  fire(HOLD_MS);
  assert.deepEqual(heard(b, "leave").map((m) => [m.id, m.reason]), [[4, "closed"]]);
  assert.equal(r.players.has(4), false);
  // A key that comes after is nobody's: a plain new record and a join for the others.
  const late = await join(r, 4, "new-contributor", welcomeOf(a).resume);
  assert.equal(welcomeOf(late).resumed, undefined);
  assert.equal(heard(b, "join").length, 1);
});

test("a clean close is a leave at once; the page's own CLOSE_RECONNECT is held", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one"), c = await join(r, 6, "third-one");
  a.closed = { code: 1000 }; r.webSocketClose(a, 1000, "", true);
  assert.deepEqual(heard(b, "leave").map((m) => m.id), [4]);
  c.closed = { code: CLOSE_RECONNECT }; r.webSocketClose(c, CLOSE_RECONNECT, "network", true);
  assert.deepEqual(heard(b, "leave").map((m) => m.id), [4], "the page said it is coming straight back");
  assert.ok(r.players.get(6).held);
});

test("another connection of the account, or a wrong key, replaces the held record as before", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  lose(r, a);
  const other = await join(r, 4, "new-contributor", "not-the-key");
  assert.equal(welcomeOf(other).resumed, undefined);
  assert.deepEqual(heard(b, "leave").map((m) => [m.id, m.reason]), [[4, "replaced"]]);
  assert.equal(heard(b, "join").length, 1);
});

test("its page back while the old socket still reads open ends that socket quietly, and its close later changes nothing", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  const again = await join(r, 4, "new-contributor", welcomeOf(a).resume);
  assert.equal(welcomeOf(again).resumed, true);
  assert.deepEqual(a.closed, { code: CLOSE_KICK, reason: "resumed" });
  assert.equal(heard(a, "kick").length, 0, "the old socket is its own page's, which has let go of it");
  r.webSocketClose(a, 1006, "", false);
  assert.equal(r.players.get(4).ws, again);
  assert.equal(heard(b, "leave").length + heard(b, "join").length, 0);
});

test("a held player neither hosts the NPCs nor follows them until its page is back", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor"), b = await join(r, 5, "another-one");
  for (const ws of [a, b]) await r.webSocketMessage(ws, JSON.stringify({ t: "hub", on: true }));
  const host0 = r.hostId;
  assert.ok([4, 5].includes(host0));
  const hostWs = host0 === 4 ? a : b, other = host0 === 4 ? 5 : 4;
  lose(r, hostWs);
  assert.equal(r.hostId, other, "the NPCs move to a page that is here");
  const again = await join(r, host0, host0 === 4 ? "new-contributor" : "another-one", welcomeOf(hostWs).resume);
  assert.equal(welcomeOf(again).resumed, true);
  assert.equal(r.players.get(host0).held, null);
});

// Regression (Watchtower on #789): a resumed page's `zone` repeats the zone the record has, which the room takes as no
// change, so what arriving there sends (the room's PIN, the hockey tables, a Block Frenzy match) never came again.
test("a resumed page hears its zone's arrival again: the locked room's PIN, the hockey tables and the match", async () => {
  const { room, join } = host(), r = room();
  const a = await join(r, 4, "new-contributor");
  const p = r.players.get(4);
  p.zone = "sphere-0"; p.roomLock = { room: 0, pin: "4821" };
  r.roomLocks.set(0, { pin: "4821", passes: new Map() });
  const arrived = [];
  const was = { hockey: protocol.hockey.arrive, block: protocol.block.arrive };
  protocol.hockey.arrive = (_room, q) => arrived.push(["hockey", q.id]);
  protocol.block.arrive = (_room, q) => arrived.push(["block", q.id]);
  try {
    lose(r, a);
    const again = await join(r, 4, "new-contributor", welcomeOf(a).resume);
    assert.equal(welcomeOf(again).resumed, true);
    assert.deepEqual(again.sent.filter((m) => m.t === "door" && m.op === "room-pin").map((m) => [m.room, m.pin]), [[0, "4821"]]);
    assert.deepEqual(arrived, [["hockey", 4], ["block", 4]]);
    // A room unlocked while they were away sends no PIN.
    r.roomLocks.delete(0);
    lose(r, again);
    const third = await join(r, 4, "new-contributor", welcomeOf(again).resume);
    assert.equal(third.sent.filter((m) => m.t === "door" && m.op === "room-pin").length, 0);
  } finally { protocol.hockey.arrive = was.hockey; protocol.block.arrive = was.block; }
});
