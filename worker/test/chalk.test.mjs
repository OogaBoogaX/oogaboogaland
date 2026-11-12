// The EntropyLab chalkboard: the real room driven through its own fetch and socket handlers, with the Cloudflare host,
// sockets and storage mocked, and a clock the test moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import { sfuClient } from "../src/sfu.js";
import * as studio from "../src/studio-policy.js";

const { CHALK, CHALK_BURST, CHALK_FEATURE, CHALK_IDLE_MS, CHALK_TELL_MS } = protocol;

const host = () => {
  const accepted = [], saved = new Map(), chalkWrites = [], clock = { at: 1e12 };
  class FakeDate extends Date { static now() { return clock.at; } }
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { this.sent.push(JSON.parse(text)); },
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
    ...protocol, ...studio, sfuClient, sha256Hex, getPlayer, CAST_ROWS: [{ handle: "YellowBrokeIt", github_login: "YellowBrokeIt" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: FakeDate, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  const pending = [];
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => pending.push(fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), waitUntil: (p) => pending.push(p),
    storage: { get: async (key) => Array.isArray(key) ? new Map() : structuredClone(saved.get(key)), put: async (k, v) => { saved.set(k, structuredClone(v)); if (k === "chalk") chalkWrites.push("put"); },
      delete: async (k) => { if (k === "chalk") chalkWrites.push("delete"); return saved.delete(k); },
      getAlarm: async () => 0, setAlarm: async () => {} },
  };
  const room = async () => { const r = new context.Room(ctx, {}); await Promise.all(pending.splice(0)); return r; };
  const join = async (r, id, login) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-display": login, "x-player-contributor": "1" }) });
    const ws = accepted[before];
    r.players.get(id).body = login;
    return ws;
  };
  return { room, join, saved, chalkWrites, clock, settle: () => Promise.all(pending.splice(0)) };
};
// Feet `along` metres out in front of the board.
const at = (along) => ({ x: CHALK.AT.x + CHALK.AT.frontX * along, y: CHALK.AT.y, z: CHALK.AT.z + CHALK.AT.frontZ * along, yaw: 0 });
// A page sends its board layout with every chalk message (chalk-board.js VERSION).
const send = (r, ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg.t === "chalk" ? { v: CHALK.VERSION, ...msg } : msg));
const heard = (ws, t) => ws.sent.filter((m) => m.t === t);

test("room: an Ooga at the board holds it alone; its edits reach every other page as made, and the board outlives the room", async () => {
  const h = host(), r = await h.room();
  const a = await h.join(r, 1, "ooga"), b = await h.join(r, 2, "booga");
  assert.ok(a.sent[0].features.includes(CHALK_FEATURE));
  assert.deepEqual(heard(a, "chalk-board").at(-1), { t: "chalk-board", marks: CHALK.initial(), editor: 0 }, "a new room holds the original message");
  send(r, b, { t: "pose", ...at(6) });
  send(r, b, { t: "chalk", k: "take" });
  assert.deepEqual(heard(b, "chalk-refused").at(-1), { t: "chalk-refused", why: "away" }, "too far from the board");
  send(r, a, { t: "pose", ...at(1) });
  send(r, a, { t: "chalk", k: "take" });
  assert.deepEqual(heard(b, "chalk-lock").at(-1), { t: "chalk-lock", id: 1 });
  send(r, b, { t: "pose", ...at(1.5) });
  send(r, b, { t: "chalk", k: "take" });
  assert.deepEqual(heard(b, "chalk-refused").at(-1), { t: "chalk-refused", why: "busy", name: "ooga" }, "one writer at a time");
  send(r, b, { t: "chalk", k: "line", m: "c", p: [9, 9, 10, 10] });
  assert.deepEqual(heard(b, "chalk-board").at(-1).editor, 1, "an edit from a page without the board gets the board back, unchanged");
  const edits = [{ k: "line", m: "c", p: [100, 100, 200, 200] }, { k: "more", p: [300, 300, 400, 400] }, { k: "type", c: [["h", 500, 500], ["i", 520, 500]] }, { k: "back" }];
  for (const e of edits) send(r, a, { t: "chalk", ...e });
  assert.deepEqual(heard(b, "chalk").map(({ t, ...m }) => m), edits.map((e) => ({ ...e, id: 1 })), "each edit reaches the other page as made");
  assert.equal(heard(a, "chalk").length, 0, "the writer's own page already drew them");
  const original = CHALK.initial().length;
  assert.equal(r.chalk.marks.length, original + 2);
  assert.deepEqual(r.chalk.marks.at(-2).p, [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4]);
  send(r, a, { t: "chalk", k: "drop" });
  await h.settle();
  assert.deepEqual(heard(b, "chalk-lock").at(-1), { t: "chalk-lock", id: 0 });
  assert.deepEqual(h.saved.get("chalk").marks, r.chalk.marks, "letting go stores the board");
  const woken = await h.room(), c = await h.join(woken, 3, "late");
  assert.deepEqual(heard(c, "chalk-board").at(-1).marks, r.chalk.marks, "a room woken from storage hands the same board to the next to join");
  send(woken, c, { t: "pose", ...at(1) });
  send(woken, c, { t: "chalk", k: "take" });
  send(woken, c, { t: "chalk", k: "wipe", to: "clean" });
  await h.settle();
  assert.deepEqual(h.saved.get("chalk"), { marks: [], v: CHALK.VERSION }, "clearing remembers only the blank board");
  const blank = await h.room();
  assert.equal(blank.chalk.marks.length, 0, "blank stays blank after waking");
  const writes = h.chalkWrites.length, relays = heard(a, "chalk").length;
  send(woken, c, { t: "chalk", k: "wipe", to: "clean" });
  await h.settle();
  assert.equal(h.chalkWrites.length, writes, "clearing a blank board does not save again");
  assert.equal(heard(a, "chalk").length, relays, "nor relay another wipe");
  assert.equal(woken.chalkTimer, 0, "nor keep the room awake");
  send(woken, c, { t: "chalk", k: "wipe", to: "original" });
  await h.settle();
  assert.equal(h.saved.has("chalk"), false, "reset removes the stored board");
  assert.equal(h.chalkWrites.at(-1), "delete");
  const reset = await h.room();
  assert.deepEqual(reset.chalk.marks, CHALK.initial(), "absence restores the original drawing");
  const resetWrites = h.chalkWrites.length, resetRelays = heard(a, "chalk").length;
  send(woken, c, { t: "chalk", k: "wipe", to: "original" });
  send(woken, c, { t: "chalk", k: "drop" });
  await h.settle();
  assert.equal(h.chalkWrites.length, resetWrites, "resetting the original and letting go do not save");
  assert.equal(heard(a, "chalk").length, resetRelays, "nor relay an unchanged reset");
  assert.equal(woken.chalkTimer, 0);
  h.saved.set("chalk", { marks: CHALK.initial(), v: CHALK.VERSION });
  const legacy = await h.room();
  assert.deepEqual(legacy.chalk.marks, CHALK.initial());
  assert.equal(h.saved.has("chalk"), false, "an older saved default is removed on load too");
});

// The board grew half again each way: what a room stored on the first, smaller board keeps its size and place in the
// new board's middle, and is widened once, the next save storing it in the new layout.
test("room: a board stored before the board grew loads in the middle of the new one, and is saved widened once", async () => {
  const h = host();
  h.saved.set("chalk", { marks: [{ t: "c", s: 2, p: [0, 0, 1, 1] }, { t: "t", ch: "x", p: [0.5, 0.25] }] });
  const r = await h.room(), a = await h.join(r, 1, "ooga");
  const widened = [{ t: "c", s: 2, p: [1 / 6, 1 / 6, 5 / 6, 5 / 6] }, { t: "t", ch: "x", p: [0.5, 1 / 3] }];
  assert.deepEqual(heard(a, "chalk-board").at(-1).marks, widened, "the first board's corners lie a sixth in from the new board's");
  assert.equal(h.chalkWrites.length, 0, "loading writes nothing");
  send(r, a, { t: "pose", ...at(1) });
  send(r, a, { t: "chalk", k: "line", m: "c", p: [0, 0, 1000, 1000] });
  send(r, a, { t: "chalk", k: "drop" });
  await h.settle();
  assert.deepEqual(h.saved.get("chalk"), { marks: [...widened, { t: "c", s: 2, p: [0, 0, 1, 1] }], v: CHALK.VERSION }, "new edits span the whole board");
  const woken = await h.room();
  assert.deepEqual(woken.chalk.marks, h.saved.get("chalk").marks, "a board saved in the new layout is not widened again");
});

// The eraser's footprint: a new line is told apart by `f`, stored and handed on with it; one stored before it stays as it was.
test("room: a new eraser line is kept with its footprint tag, and an older one is left as stored", async () => {
  const h = host(), older = [{ t: "e", s: 4, p: [0.1, 0.1, 0.2, 0.2] }, { t: "e", p: [0.3, 0.3, 0.4, 0.4] }];
  h.saved.set("chalk", { marks: older, v: CHALK.VERSION });
  const r = await h.room(), a = await h.join(r, 1, "ooga"), b = await h.join(r, 2, "booga");
  assert.deepEqual(heard(a, "chalk-board").at(-1).marks, older, "an older eraser line loads untouched");
  send(r, a, { t: "pose", ...at(1) });
  send(r, a, { t: "chalk", k: "take" });
  send(r, a, { t: "chalk", k: "line", m: "e", p: [500, 400, 500, 400] });
  assert.deepEqual(heard(b, "chalk").at(-1), { t: "chalk", k: "line", m: "e", p: [500, 400, 500, 400], id: 1 }, "a tap's one-point line is relayed");
  send(r, a, { t: "chalk", k: "line", m: "e", o: 2, p: [250, 400, 250, 400] });
  assert.deepEqual(heard(b, "chalk").at(-1), { t: "chalk", k: "line", m: "e", o: 2, p: [250, 400, 250, 400], id: 1 }, "an upright eraser's line is relayed as held");
  const relayed = heard(b, "chalk").length;
  send(r, a, { t: "chalk", k: "line", m: "e", o: 3, p: [1, 1, 2, 2] });
  send(r, a, { t: "chalk", k: "line", m: "c", o: 2, p: [1, 1, 2, 2] });
  assert.equal(heard(b, "chalk").length, relayed, "a bad orientation is refused");
  send(r, a, { t: "chalk", k: "drop" });
  await h.settle();
  const marks = [...older, { t: "e", s: 4, f: 1, p: [0.5, 0.4, 0.5, 0.4] }, { t: "e", s: 4, f: 2, p: [0.25, 0.4, 0.25, 0.4] }];
  assert.deepEqual(h.saved.get("chalk"), { marks, v: CHALK.VERSION }, "stored with its tag, beside the older lines");
  const woken = await h.room();
  assert.deepEqual(woken.chalk.marks, marks, "and it reads back after the room sleeps");
});

test("room: the board lets go when its writer walks off, changes body or zone, leaves, or sits idle while another waits", async () => {
  const h = host(), r = await h.room();
  const a = await h.join(r, 1, "ooga"), b = await h.join(r, 2, "booga");
  send(r, a, { t: "pose", ...at(1) });
  send(r, b, { t: "pose", ...at(1.2) });
  const take = (ws) => send(r, ws, { t: "chalk", k: "take" });
  const holder = () => heard(b, "chalk-lock").at(-1).id;
  take(a);
  send(r, a, { t: "pose", ...at(5) });
  assert.equal(holder(), 0, "walking off");
  send(r, a, { t: "pose", ...at(1) });
  take(a);
  send(r, a, { t: "zone", name: "rainforest" });
  assert.equal(holder(), 0, "another zone");
  send(r, a, { t: "zone", name: "outside" });
  take(a);
  send(r, a, { t: "body", name: null });
  assert.equal(holder(), 0, "letting go of the Ooga");
  r.players.get(1).body = "ooga";
  take(a);
  send(r, a, { t: "chalk", k: "line", m: "e", p: [1, 1, 2, 2] });
  h.clock.at += CHALK_IDLE_MS - 1;
  take(b);
  assert.equal(heard(b, "chalk-refused").at(-1).why, "busy");
  h.clock.at += 1;
  take(b);
  assert.equal(heard(a, "chalk-lock").at(-1).id, 2, "an idle writer gives way to the next at the board");
  await h.settle();
  assert.equal(h.saved.get("chalk").marks.at(-1).t, "e", "and the idle writer's work was stored first");
  // The room slept and forgot who held it: the writer's next edit takes the free board back.
  r.chalkEditor = null;
  send(r, b, { t: "chalk", k: "line", m: "c", p: [5, 5, 6, 6] });
  assert.equal(heard(a, "chalk-lock").at(-1).id, 2);
  assert.deepEqual(heard(a, "chalk").at(-1), { t: "chalk", k: "line", m: "c", p: [5, 5, 6, 6], id: 2 });
  // A burst past the rate is dropped unanswered; the writer's next edit gets the room's board back instead of being
  // applied; and no stream of edits gets more than one board every CHALK_TELL_MS.
  const boards = (ws) => heard(ws, "chalk-board").length, before = r.chalk.points, told = boards(b);
  for (let i = 0; i < CHALK_BURST + 5; i++) send(r, b, { t: "chalk", k: "more", p: [7, i] });
  assert.ok(r.chalk.points < before + CHALK_BURST + 5 && boards(b) === told, "the burst's tail is dropped, with no board sent");
  h.clock.at += 1000;
  const points = r.chalk.points;
  send(r, b, { t: "chalk", k: "more", p: [8, 8] });
  assert.ok(boards(b) === told + 1 && heard(b, "chalk-board").at(-1).editor === 2 && r.chalk.points === points, "the next edit gets the board instead");
  const aTold = boards(a);
  for (let i = 0; i < 40; i++) { h.clock.at += 100; send(r, a, { t: "chalk", k: "back" }); }
  assert.equal(boards(a) - aTold, 4000 / CHALK_TELL_MS, "four seconds of edits from a page without the board get a board every CHALK_TELL_MS");
  r.webSocketClose(b);
  await h.settle();
  assert.equal(heard(a, "chalk-lock").at(-1).id, 0, "leaving the island");
  assert.equal(r.chalkTimer, 0, "no save left waiting");
});

// Regression: a refused frame must not leave a character visible only to its writer, or only in memory.
test("room: typing at capacity keeps the writer, observers and saved board consistent", async (t) => {
  for (const [marks, characters, accepted] of [[549, 2, false], [549, 1, true], [550, 1, false], [550, 2, false], [548, 2, true]]) {
    await t.test(`${marks} marks, ${characters} characters`, async () => {
      const h = host(), initial = Array.from({ length: marks }, () => ({ t: "t", ch: "x", p: [0.1, 0.2] }));
      h.saved.set("chalk", { marks: initial, v: CHALK.VERSION });
      const r = await h.room(), a = await h.join(r, 1, "ooga"), b = await h.join(r, 2, "booga");
      // These copies follow the same shared contract as the writer and observer; socket payloads are detached.
      const writer = CHALK.board(structuredClone(heard(a, "chalk-board").at(-1).marks));
      const observer = CHALK.board(structuredClone(heard(b, "chalk-board").at(-1).marks));
      const writerSession = CHALK.session(writer), observerSession = CHALK.session(observer);
      send(r, a, { t: "pose", ...at(1) });
      send(r, a, { t: "chalk", k: "take" });
      assert.equal(r.chalkDirty, false, "the restored board starts clean");
      assert.equal(r.chalkTimer, 0);
      assert.equal(h.chalkWrites.length, 0);
      const frame = { t: "chalk", k: "type", c: [["a", 300, 400], ["b", 500, 400]].slice(0, characters) };
      assert.ok(protocol.parseClientMessage(JSON.stringify({ ...frame, v: CHALK.VERSION })), "the frame is valid on the wire");
      const boards = heard(a, "chalk-board").length;
      const local = CHALK.apply(writer, CHALK.parse(frame), writerSession);
      // Send even if the current client refuses locally: an older or custom client can still submit this frame.
      send(r, a, frame);
      assert.equal(r.chalk.marks.length, marks + (accepted ? characters : 0), "no partial application");
      assert.equal(r.chalk.points, r.chalk.marks.length);
      assert.equal(local, accepted ? null : "full");
      const edits = heard(b, "chalk");
      assert.equal(edits.length, accepted ? 1 : 0, "accepted frames relay exactly once; rejected frames never relay");
      for (const edit of edits) assert.equal(CHALK.apply(observer, CHALK.parse(edit), observerSession), null);
      assert.equal(heard(a, "chalk").length, 0, "the writer never receives its own edit back");
      assert.equal(heard(a, "chalk-board").length, boards + (accepted ? 0 : 1), "only a rejection resyncs the writer");
      if (!accepted) {
        const snapshot = heard(a, "chalk-board").at(-1);
        assert.equal(snapshot.editor, 1);
        assert.deepEqual(snapshot.marks, initial, "resync contains no accepted prefix");
        assert.deepEqual(writer.marks, snapshot.marks);
      } else assert.deepEqual(edits[0], { ...frame, id: 1 });
      assert.deepEqual(writer, r.chalk);
      assert.deepEqual(observer, r.chalk, "the observer and writer agree with the room");
      assert.equal(r.chalkDirty, accepted);
      assert.equal(!!r.chalkTimer, accepted, "only accepted edits schedule a save");
      assert.equal(h.chalkWrites.length, 0, "typing is batched, not saved per frame");
      assert.deepEqual(h.saved.get("chalk").marks, initial, "stored data stays unchanged until the save");
      send(r, a, { t: "chalk", k: "drop" });
      await h.settle();
      assert.equal(r.chalkDirty, false);
      assert.equal(r.chalkTimer, 0);
      assert.deepEqual(h.chalkWrites, accepted ? ["put"] : [], "release saves accepted changes only");
      assert.deepEqual(h.saved.get("chalk").marks, writer.marks);
      const woken = await h.room(), late = await h.join(woken, 3, "late");
      assert.deepEqual(woken.chalk, writer, "reload preserves the agreed board");
      assert.deepEqual(heard(late, "chalk-board").at(-1).marks, observer.marks, "a late client sees the same board");
    });
  }
});
