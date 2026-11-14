import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { tessQueue as Q, parseClientMessage } from "../src/protocol.js";

const fixture = t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1800000000000 });
  const stored = new Map(), messages = new Map();
  const room = { players: new Map(), send: (ws, m) => messages.get(ws).push(structuredClone(m)), background: p => p.catch(() => {}), scheduleAlarm: async () => {},
    ctx: { storage: { get: async k => structuredClone(stored.get(k)), put: async (k, v) => stored.set(k, structuredClone(v)) } } };
  const add = id => { const p = { id, ws: id, inHub: true, visible: true, zone: "outside" }; room.players.set(id, p); messages.set(id, []); return p; };
  const last = id => messages.get(id).findLast(m => m.op === "state");
  const send = (p, op, fields = {}) => {
    const m = parseClientMessage(JSON.stringify({ t: "tess-guide", op, token: last(p.id)?.token || "", ...fields }));
    assert.ok(m); Q.message(room, p, m);
  };
  return { room, stored, messages, add, last, send, advance: ms => t.mock.timers.tick(ms) };
};
test("Tess FIFO is opt-in, idempotent, bounded and gives one ready/active turn; waiting users cannot publish or accept another token", async t => {
  const h = fixture(t), a = h.add(1), b = h.add(2), c = h.add(3);
  h.send(a, "watch"); assert.equal(h.last(1).position, 0);
  h.send(a, "join"); h.send(a, "join"); h.send(b, "join"); h.send(c, "join");
  assert.deepEqual(h.room.tessQueue.entries.map(e => e.id), [1, 2, 3]);
  assert.equal(h.last(1).phase, "ready"); assert.equal(h.last(2).position, 2);
  h.send(b, "accept", { token: h.last(1).token }); assert.equal(h.last(1).phase, "ready");
  h.send(a, "accept"); assert.equal(h.last(1).phase, "active");
  const pose = [1, 2, 3, 1, 4, 5, 6, 7, 8, 9, 1, 0];
  h.send(b, "pose", { a: pose }); assert.equal(h.room.tessQueue.pose, null);
  h.send(a, "pose", { a: pose, question: "private", answer: "private" });
  assert.deepEqual(h.room.tessQueue.pose, pose);
  assert.equal(h.messages.get(2).at(-1).op, "pose");
  assert.ok(!JSON.stringify(h.messages.get(2)).includes("private"));
  assert.notEqual(h.last(2).token, h.last(1).token, "a visitor sees only their own lease");
  h.advance(1000); h.send(a, "cancel"); assert.equal(h.last(2).phase, "ready"); assert.equal(h.room.tessQueue.pose, null);
  h.send(b, "accept"); assert.equal(h.last(2).phase, "active");
  h.send(a, "join"); assert.deepEqual(h.room.tessQueue.entries.map(e => e.id), [2, 3, 1]);
  for (let i = 4; i <= 40; i++) h.send(h.add(i), "join");
  assert.equal(h.room.tessQueue.entries.length, 32); assert.equal(h.last(40).position, 0);
  await h.room.tessSaving;
});
test("Tess reconnect keeps FIFO briefly, old tokens cannot cancel replacements, idle/ready turns expire and an empty queue has no wake", async t => {
  const h = fixture(t), a = h.add(1), b = h.add(2);
  h.send(a, "join"); h.send(a, "accept"); h.send(b, "join"); const token = h.last(1).token;
  h.room.players.delete(1); Q.presence(h.room, a, true);
  h.advance(14000); const rejoined = h.add(1); Q.presence(h.room, rejoined);
  assert.equal(h.last(1).token, token); assert.equal(h.last(1).phase, "active");
  h.room.players.delete(1); Q.presence(h.room, rejoined, true);
  h.advance(15001); Q.sweep(h.room); assert.equal(h.last(2).phase, "ready");
  const again = h.add(1); h.send(again, "join"); assert.notEqual(h.last(1).token, token);
  h.send(again, "cancel", { token }); assert.equal(h.last(1).position, 2);
  h.advance(20001); Q.sweep(h.room); assert.equal(h.last(1).phase, "ready");
  h.send(again, "accept"); h.advance(60001); Q.sweep(h.room);
  assert.equal(h.room.tessQueue.entries.length, 0); assert.equal(Q.deadline(h.room), Infinity);
  await h.room.tessSaving;
});
test("Tess hibernation restores one turn, deployments hold disconnected places briefly, cancellation writes cannot resurrect a turn", async t => {
  const h = fixture(t), a = h.add(1), b = h.add(2);
  h.send(a, "join"); h.send(a, "accept"); h.send(b, "join"); await h.room.tessSaving;
  const token = h.last(1).token;
  delete h.room.tessQueue; await Q.restore(h.room); await h.room.tessSaving;
  assert.equal(h.last(1).token, token); assert.equal(h.last(1).phase, "active"); assert.equal(h.last(2).phase, "wait");
  h.room.players.clear(); delete h.room.tessQueue; await Q.restore(h.room); await h.room.tessSaving;
  h.advance(15001); Q.sweep(h.room); await h.room.tessSaving;
  assert.deepEqual(h.stored.get("tessQueue"), []);
  h.add(1); h.send(a, "join"); h.send(a, "cancel"); await h.room.tessSaving;
  delete h.room.tessQueue; await Q.restore(h.room); assert.equal(h.room.tessQueue.entries.length, 0);
});
test("Tess messages reject malformed poses and traffic cannot hold a turn forever", async t => {
  const h = fixture(t), a = h.add(1);
  for (const patch of [{ op: "take" }, { op: "pose", token: "x", a: [] }, { op: "pose", token: "x", a: Array(12).fill(999) }, { op: "accept", token: 1 }])
    assert.equal(parseClientMessage(JSON.stringify({ t: "tess-guide", ...patch })), null);
  h.send(a, "join"); h.send(a, "accept");
  const end = h.room.tessQueue.entries[0].end;
  for (let i = 0; i < 19; i++) { h.advance(15000); h.send(a, "touch"); }
  assert.equal(h.room.tessQueue.entries[0].end, end);
  h.advance(15001); Q.sweep(h.room); assert.equal(h.room.tessQueue.entries.length, 0);
  a.inHub = false; h.send(a, "join"); assert.equal(h.room.tessQueue.entries.length, 0);
  // The fourth visitor used to expire behind three valid five-minute turns.
  a.inHub = true;
  const visitors = [a, h.add(2), h.add(3), h.add(4)];
  for (const p of visitors) h.send(p, "join");
  const lastToken = h.last(4).token;
  for (const p of visitors.slice(0, 3)) {
    assert.equal(h.last(p.id).phase, "ready"); h.send(p, "accept");
    for (let i = 0; i < 19; i++) { h.advance(15000); h.send(p, "touch"); }
    h.advance(15001); Q.sweep(h.room);
    await h.room.tessSaving;
    delete h.room.tessQueue; await Q.restore(h.room);
  }
  assert.equal(h.last(4).token, lastToken); assert.equal(h.last(4).phase, "ready");
  assert.equal(h.room.tessQueue.entries.length, 1);
  h.advance(20001); Q.sweep(h.room);
  assert.equal(h.room.tessQueue.entries.length, 0, "an unattended ready prompt still releases its place");
  assert.equal(Q.deadline(h.room), Infinity);
  await h.room.tessSaving;
});
test("real Room sockets bind Tess turns to the account, reject replaced connections and schedule the lease deadline", async t => {
  const h = fixture(t);
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, CAST_ROWS: [{ handle: "one" }, { handle: "two" }], DurableObject: class {}, Date, Map, Set, ArrayBuffer };
  runInNewContext(source, context);
  // Rooms built here without the constructor (Object.create) take the inspector's reporter switched off.
  context.Room.prototype.inspect = protocol.inspectReporter(null, {}, "Room", () => "", () => null);
  const room = Object.create(context.Room.prototype);
  let alarm = null;
  room.players = new Map(); room.chatBuckets = new Map(); room.pinTries = new Map(); room.doorPasses = new Map();
  room.ctx = { storage: { ...h.room.ctx.storage, getAlarm: async () => alarm, setAlarm: async at => { alarm = at; } } };
  const socket = id => ({ sent: [], deserializeAttachment: () => ({ id }), send(text) { this.sent.push(JSON.parse(text)); }, serializeAttachment() {} });
  const a = socket(1), b = socket(2);
  room.players.set(1, room.record(a, { id: 1, login: "one", inHub: true }));
  room.players.set(2, room.record(b, { id: 2, login: "two", inHub: true }));
  const send = (ws, op, extra = {}) => room.webSocketMessage(ws, JSON.stringify({ t: "tess-guide", op, ...extra }));
  send(a, "join", { id: 2 }); send(b, "join");
  const token = a.sent.at(-1).token;
  send(a, "accept", { token });
  const pose = [-511.999, 511.999, -511.999, 2, -511.999, 511.999, -511.999, 511.999, -511.999, 511.999, 1, 1];
  assert.ok(JSON.stringify({ t: "tess-guide", op: "pose", token, a: pose }).length <= protocol.MESSAGE_MAX);
  send(a, "pose", { token, a: pose }); assert.deepEqual(b.sent.at(-1).a, pose);
  const replacement = socket(1); room.players.set(1, room.record(replacement, { id: 1, login: "one", inHub: true }));
  send(a, "cancel", { token }); assert.equal(room.tessQueue.entries[0].phase, "active");
  send(replacement, "cancel", { token }); assert.equal(room.tessQueue.entries[0].id, 2); assert.equal(b.sent.at(-1).phase, "ready");
  await room.tessSaving;
  assert.equal(room.nextAlarm(), Date.now() + 20000);
  assert.ok(alarm <= room.nextAlarm());
});
