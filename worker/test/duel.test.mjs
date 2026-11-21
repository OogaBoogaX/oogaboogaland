// Duels (worker/src/duel.js, src/js/duel-rules.js) through the real Room with a small host mock: a challenge, its
// accept, hits held to the countdown, range and the damage table, and every way a duel ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";

const R = globalThis.BL.duelRules;

const host = () => {
  const accepted = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { if (this.closed) throw new Error("closed"); this.sent.push(typeof text === "string" ? JSON.parse(text) : text); },
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
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }, { handle: "c", github_login: "c" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  let blocked = null;
  const ctx = {
    id: { name: "island" }, waitUntil: () => {},
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { blocked = fn(); return blocked; }, acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => Array.isArray(key) ? new Map() : undefined, put: async () => {}, delete: async () => {}, getAlarm: async () => null, setAlarm: async () => {} },
  };
  let r = new context.Room(ctx, {});
  const join = async (id, login, x = 0) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "1" }) });
    const ws = accepted[before];
    say(ws, { t: "body", name: login });
    say(ws, { t: "zone", name: "outside" });
    say(ws, { t: "pose", x, y: 0, z: 0, yaw: 0 });
    return ws;
  };
  const say = (ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg));
  // The room hibernated and woke: a new object rebuilt from the sockets' attachments.
  const wake = async () => { r = new context.Room(ctx, {}); await blocked; protocol.duel.init(r); };
  return { get r() { return r; }, join, say, wake, restored: () => blocked };
};
const duelsOf = (ws) => ws.sent.filter((m) => m && m.t === "duel");
const last = (ws, op) => duelsOf(ws).filter((m) => m.op === op).at(-1);

test("duel-v1 is advertised, and a challenge accepted starts a duel everyone hears", async () => {
  const h = host();
  await h.restored();
  const a = await h.join(1, "a", 0), b = await h.join(2, "b", 6), c = await h.join(3, "c", 120);
  assert.ok(a.sent.find((m) => m.t === "welcome").features.includes(R.FEATURE));
  h.say(a, { t: "duel", op: "challenge", to: 3 });
  assert.equal(last(a, "refused").reason, "far");
  h.say(a, { t: "duel", op: "challenge", to: 2 });
  assert.equal(last(b, "challenged").from, 1);
  assert.equal(last(a, "challenging").to, 2);
  h.say(b, { t: "duel", op: "accept", to: 1 });
  const start = last(c, "start");
  assert.ok(start, "a bystander sees the flag go up");
  assert.deepEqual([start.a, start.b, start.x, start.z, start.hp], [1, 2, 3, 0, [R.HP, R.HP]]);
  // A page joining now hears the duel under way.
  const d = await h.join(4, "d", 1);
  assert.equal(last(d, "list").duels[0].id, start.id);
});

test("a challenge made by a blow says so, and the blow answered starts the duel", async () => {
  const h = host();
  await h.restored();
  const a = await h.join(1, "a", 0), b = await h.join(2, "b", 4);
  h.say(a, { t: "duel", op: "challenge", to: 2, hit: true });
  assert.equal(last(b, "challenged").hit, true);
  h.say(b, { t: "duel", op: "challenge", to: 1, hit: true });
  assert.deepEqual([last(a, "start").a, last(a, "start").b], [1, 2]);
  const c = await h.join(3, "c", 8), e = await h.join(4, "e", 10);
  h.say(c, { t: "duel", op: "challenge", to: 4 });
  assert.equal(last(e, "challenged").hit, undefined, "a challenge asked for carries no blow");
});

test("hits wait for the countdown, need range, take the room's damage and end in defeat", async () => {
  const h = host();
  await h.restored();
  const a = await h.join(1, "a", 0), b = await h.join(2, "b", 2);
  h.say(a, { t: "duel", op: "challenge", to: 2 });
  h.say(b, { t: "duel", op: "challenge", to: 1 });
  h.say(a, { t: "duel", op: "hit", kind: "charged" });
  assert.equal(last(b, "hp"), undefined, "nothing counts in the countdown");
  const duel = [...h.r.duels.values()][0];
  duel.at = Date.now() - 1;
  h.say(a, { t: "duel", op: "hit", kind: "swing" });
  assert.deepEqual(last(b, "hp").hp, [R.HP, R.HP - R.DAMAGE.swing]);
  h.say(a, { t: "duel", op: "hit", kind: "nonsense" });
  assert.equal(duelsOf(b).filter((m) => m.op === "hp").length, 1, "an unknown kind is ignored");
  h.say(b, { t: "pose", x: 20, y: 0, z: 0, yaw: 0 });
  h.say(a, { t: "duel", op: "hit", kind: "charged" });
  assert.equal(duelsOf(b).filter((m) => m.op === "hp").length, 1, "a melee blow out of reach is ignored");
  for (let i = 0; i < 40 && h.r.duels.size; i++) { duel.hits[0].tokens = R.HIT_BURST; h.say(a, { t: "duel", op: "hit", kind: "head" }); }
  const end = last(b, "end");
  assert.deepEqual([end.winner, end.loser, end.reason], [1, 2, "defeat"]);
  assert.equal(h.r.players.get(1).duelRec, null);
  h.say(a, { t: "duel", op: "hit", kind: "shot" });
  assert.equal(last(a, "end").reason, "lost", "a hit with no duel is told there is none");
});

test("yielding, fleeing the flag and leaving the island each lose", async () => {
  const h = host();
  await h.restored();
  const a = await h.join(1, "a", 0), b = await h.join(2, "b", 2);
  const fight = () => { h.say(a, { t: "duel", op: "challenge", to: 2 }); h.say(b, { t: "duel", op: "accept", to: 1 }); return [...h.r.duels.values()][0]; };
  fight();
  h.say(b, { t: "duel", op: "forfeit" });
  assert.deepEqual([last(a, "end").winner, last(a, "end").reason], [1, "forfeit"]);
  for (const p of h.r.players.values()) p.duelControl = null;
  const d = fight();
  h.say(a, { t: "pose", x: R.RADIUS + 20, y: 0, z: 0, yaw: 0 });
  assert.ok(d.out[0], "past the radius the room starts counting");
  d.out[0] = Date.now() - R.OUT_MS;
  h.say(a, { t: "pose", x: R.RADIUS + 21, y: 0, z: 0, yaw: 0 });
  assert.deepEqual([last(b, "end").winner, last(b, "end").reason], [2, "fled"]);
  h.say(a, { t: "pose", x: 0, y: 0, z: 0, yaw: 0 });
  for (const p of h.r.players.values()) p.duelControl = null;
  fight();
  h.say(b, { t: "zone", name: "arcade.hall" });
  assert.deepEqual([last(a, "end").winner, last(a, "end").reason], [1, "left"]);
  assert.equal(h.r.duels.size, 0);
  h.say(b, { t: "zone", name: "outside" });
  for (const p of h.r.players.values()) p.duelControl = null;
  fight();
  // An outdoor cabinet keeps the zone `outside` but takes the player out of the fight.
  const id = BL.arcadeCabinets.outdoorSeat(BL.arcadeCabinets.entries[0].id);
  h.say(a, { t: "cabinet", op: "take", id, q: 1, slot: 0 });
  assert.equal(a.sent.filter((m) => m.t === "cabinet").at(-1).ok, true);
  assert.deepEqual([last(b, "end").winner, last(b, "end").reason], [2, "left"]);
  assert.equal(h.r.duels.size, 0);
});

test("a challenge and a duel outlast the room hibernating", async () => {
  const h = host();
  await h.restored();
  const a = await h.join(1, "a", 0), b = await h.join(2, "b", 2);
  h.say(a, { t: "duel", op: "challenge", to: 2 });
  await h.wake();
  h.say(b, { t: "duel", op: "accept", to: 1 });
  const start = last(a, "start");
  assert.ok(start, "the challenge held over the wake is accepted");
  const duel = [...h.r.duels.values()][0];
  duel.at = Date.now() - 1;
  h.say(a, { t: "duel", op: "hit", kind: "charged" });
  await h.wake();
  const woke = [...h.r.duels.values()][0];
  assert.ok(woke && woke.id === start.id, "the duel is back after a wake");
  assert.deepEqual(woke.hp, [R.HP, R.HP - R.DAMAGE.charged], "with both bars as they stood");
  assert.equal(h.r.players.get(1).duelRec, h.r.players.get(2).duelRec, "one record shared by both duelists");
  h.say(b, { t: "duel", op: "hit", kind: "swing" });
  assert.deepEqual(last(a, "hp").hp, [R.HP - R.DAMAGE.swing, R.HP - R.DAMAGE.charged]);
  h.say(a, { t: "duel", op: "forfeit" });
  assert.deepEqual([last(b, "end").winner, last(b, "end").reason], [2, "forfeit"]);
  await h.wake();
  assert.equal(h.r.duels.size, 0, "an ended duel does not come back");
});
