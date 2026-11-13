// The Durable Object inspector, part 1 of 2: the allowlist, the reporter, and the Inspector's rules and object, with
// the Cloudflare host mocked as the room tests do. Part 2 (#640) adds the room's lines and the routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { listed, listedIds } from "../src/allowlist.js";
import { inspectorAllowed, inspectorOn, inspectReporter } from "../src/inspect-report.js";
import { absorb, cleanReport, KEEP_MS, LOG_KEEP, nextAlarm, pruneCount, STALE_MS, sweep } from "../src/inspector-logic.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// An INSPECTOR binding that keeps every report it is sent and answers as the Inspector would.
const binding = (watchUntil = 0) => {
  const reports = [];
  return { reports, getByName: () => ({ report: async (r) => { reports.push(structuredClone(r)); return { watchUntil }; } }) };
};

test("the allowlist names accounts by id, and one malformed value lets nobody in", () => {
  assert.deepEqual(listedIds("12, 34"), [12, 34]);
  assert.ok(listed("12,34", 34));
  for (const bad of ["", "  ", "12,x", "12,,34", "-1", "1.5", undefined]) assert.deepEqual(listedIds(bad), [], String(bad));
  assert.ok(!listed("12", 13) && !listed("12", 0));
  const INSPECTOR = binding();
  assert.ok(!inspectorOn({ INSPECTOR }), "unset is off");
  assert.ok(!inspectorOn({ INSPECTOR_IDS: "12" }), "off without the binding");
  assert.ok(inspectorOn({ INSPECTOR, INSPECTOR_IDS: "12" }));
  assert.ok(inspectorAllowed({ INSPECTOR, INSPECTOR_IDS: "12" }, 12) && !inspectorAllowed({ INSPECTOR, INSPECTOR_IDS: "12" }, 7));
});

test("a reporter switched off sends nothing and costs nothing", async () => {
  const INSPECTOR = binding(), waited = [];
  const r = inspectReporter({ waitUntil: (p) => waited.push(p) }, { INSPECTOR }, "Room", () => "island", () => { throw new Error("state read while off"); });
  assert.equal(r.on, false);
  r.woke(3); r.event("join", { id: 1, login: "a" }); r.count("in"); r.peak("late", 9); r.tick(); r.watch(Date.now() + 1000);
  await flush();
  assert.equal(INSPECTOR.reports.length, 0);
  assert.equal(waited.length, 0);
});

test("a reporter batches events into one report, and sends its rows once someone watches", async () => {
  const INSPECTOR = binding(Date.now() + 60000), details = [];
  const ctx = { waitUntil: () => {} };
  const r = inspectReporter(ctx, { INSPECTOR, INSPECTOR_IDS: "1", CF_VERSION_METADATA: { id: "v-one" } }, "Room", () => "island", (detail) => { details.push(detail); return { status: "live", sockets: 2 }; });
  r.woke(2);
  r.event("join", { id: 7, login: "a" }, { replaced: false });
  r.event("zone", { id: 7, login: "a" }, { from: "outside", to: "factory" });
  r.count("in", 3);
  await flush(); await flush();
  assert.equal(INSPECTOR.reports.length, 2, "one report for the burst, then one more with the rows once it heard it is watched");
  const [first, second] = INSPECTOR.reports;
  assert.deepEqual(first.wake, { sockets: 2 });
  assert.equal(first.version, "v-one");
  assert.deepEqual(first.events.map((e) => e.kind), ["join", "zone"]);
  assert.deepEqual(first.counters, { in: 3 });
  assert.deepEqual(details, [false, true]);
  assert.equal(second.events.length, 0);
  assert.equal(second.wake, null);
});

test("reports are bounded at the Inspector's door", () => {
  assert.equal(cleanReport({ cls: "Nope", name: "x" }), null);
  assert.equal(cleanReport({ cls: "Room", name: "bad name!" }), null);
  const r = cleanReport({ cls: "Room", name: "island", span: 1000, state: { status: "live", note: "x".repeat(500), deep: { a: { b: { c: { d: 1 } } } }, rows: Array(100).fill({ id: 1 }) },
    counters: { in: 5, bad: "x", nan: NaN }, events: [{ at: 1, kind: "leave", id: 3, login: "a".repeat(80), fields: { code: 1006, nested: { x: 1 } } }, { at: 1, kind: "invented" }] });
  assert.equal(r.state.note.length, 120);
  assert.equal(r.state.rows.length, 64);
  assert.deepEqual(r.state.deep, { a: {} }, "nothing deeper than three levels");
  assert.deepEqual(r.counters, { in: 5 });
  assert.equal(r.events.length, 1, "an unknown kind is dropped");
  assert.equal(r.events[0].login.length, 40);
  assert.deepEqual(r.events[0].fields, { code: 1006 });
});

test("a wake with fewer sockets than the room last reported is logged, a deploy named, and a plain nap only counted", () => {
  const report = (extra) => cleanReport({ cls: "Room", name: "island", span: 2000, version: "v1", state: { status: "live", sockets: 5 }, counters: { in: 10 }, ...extra });
  const { row: first } = absorb(undefined, report({}), 1000);
  assert.equal(first.rates.in, 5, "per second over the time since the last report");
  const nap = absorb(first, report({ wake: { sockets: 5 } }), 61000);
  assert.equal(nap.events.length, 0);
  assert.equal(nap.row.wakes, 1);
  assert.equal(nap.row.slept, 60000);
  const lost = absorb(nap.row, report({ wake: { sockets: 2 }, state: { status: "live", sockets: 2 } }), 70000);
  assert.deepEqual(lost.events.map((e) => [e.kind, e.fields.lost, e.fields.deployed]), [["wake-lost", 3, false]]);
  const deployed = absorb(nap.row, report({ wake: { sockets: 0 }, version: "v2", state: { status: "empty", sockets: 0 } }), 70000);
  assert.deepEqual(deployed.events.map((e) => [e.kind, e.fields.lost, e.fields.deployed]), [["wake-lost", 5, true]]);
  assert.equal(deployed.events[0].key, "Room:island");
});

test("busy rows go stale after five quiet minutes, the rest leave after a day, and the log keeps its last lines", () => {
  const live = { key: "Room:island", status: "live", lastSeen: 0 }, empty = { key: "GameHost:g", status: "idle", lastSeen: 0 };
  assert.deepEqual(sweep([live, empty], STALE_MS - 1), { stale: [], removed: [] });
  const { stale, removed } = sweep([live, empty], KEEP_MS);
  assert.deepEqual(stale.map((r) => [r.status, r.was]), [["stale", "live"]]);
  assert.deepEqual(removed, ["GameHost:g"]);
  assert.equal(nextAlarm([live], [], 10), STALE_MS);
  assert.equal(nextAlarm([], [], 10), null);
  const events = Array.from({ length: LOG_KEEP + 3 }, (_, i) => ({ at: i }));
  assert.equal(pruneCount(events, 0), 3);
  assert.equal(pruneCount([{ at: 0 }, { at: KEEP_MS }], KEEP_MS + 1), 1, "a day old goes");
});

// The Inspector object over node:sqlite, as the runtime's ctx.storage.sql answers it.
const inspectorHost = (db = new DatabaseSync(":memory:"), env = {}) => {
  const sql = { exec: (query, ...binds) => {
    const stmt = db.prepare(query);
    const rows = /^\s*select/i.test(query) ? stmt.all(...binds) : (stmt.run(...binds), []);
    return Object.assign(rows[Symbol.iterator](), { one: () => rows[0] });
  } };
  const sockets = [];
  let alarm = null;
  const ctx = { waitUntil: () => {}, setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => !ws.closed),
    storage: { sql, getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } } };
  const socket = () => ({ sent: [], closed: null, store: null, send(t) { this.sent.push(JSON.parse(t)); }, close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(v) { this.store = v; }, deserializeAttachment() { return this.store; } });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.webSocket = init.webSocket; }
    clone() { return this; }
    async json() { return JSON.parse(this.body); }
  }
  const source = readFileSync(new URL("../src/inspector.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Inspector", "class Inspector") + "\nglobalThis.Inspector = Inspector;";
  const context = { inspectorAllowed, LIMITS: {}, RECENT_MS: 120000, WATCH_MS: 90000, absorb, cleanReport, nextAlarm, pruneCount, sweep,
    DurableObject: class { constructor(c, e) { this.ctx = c; this.env = e; } }, WebSocketPair, WebSocketRequestResponsePair: class {}, Response, JSON, Date, Map, Set, Number, setTimeout, clearTimeout };
  runInNewContext(source, context);
  const envFull = { INSPECTOR: {}, INSPECTOR_IDS: "1", ...env };
  return { db, sockets, object: new context.Inspector(ctx, envFull), env: envFull, alarm: () => alarm };
};

test("the Inspector keeps rows and the log across a restart, and tells objects when someone watches", async () => {
  const room = { cls: "Room", name: "island", span: 1000, state: { status: "live", sockets: 1 }, events: [{ at: Date.now(), kind: "join", id: 1, login: "a" }] };
  const first = inspectorHost();
  assert.equal((await first.object.report(room)).watchUntil, 0, "nobody watching");
  assert.ok(first.alarm() !== null, "an alarm to mark it stale");
  const asked = [];
  const again = inspectorHost(first.db, { ROOM: { getByName: (name) => ({ inspectWatch: async (until) => { asked.push([name, until > Date.now()]); } }) } });
  assert.equal(again.object.rows.get("Room:island").status, "live");
  assert.deepEqual([...again.object.events.map((e) => e.kind)], ["join"]);

  const viewer = (id) => again.object.fetch({ headers: new Headers({ upgrade: "websocket", "x-viewer-id": String(id), "x-viewer-login": "admin" }) });
  assert.equal((await viewer(9)).status, 404, "only an allowlisted account");
  assert.equal((await viewer(1)).status, 101);
  const [ws] = again.sockets;
  assert.deepEqual(asked, [["island", true]], "the room heard from lately is asked for its detail at once");
  assert.equal(ws.sent[0].t, "snapshot");
  assert.deepEqual([...ws.sent[0].objects.map((r) => r.key)], ["Room:island"]);
  assert.ok((await again.object.report(room)).watchUntil > Date.now(), "watched now");
  again.env.INSPECTOR_IDS = "2";
  again.object.flush();
  assert.equal(ws.closed.code, 4000, "taken off the allowlist, the page is closed");
});
