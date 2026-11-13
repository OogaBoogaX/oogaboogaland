// The Durable Object inspector: the allowlist, the reporter, the Inspector's rules and object, the room's lines and the
// two routes, with the Cloudflare host mocked as the other room tests do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import { listed, listedIds } from "../src/allowlist.js";
import { inspectorAllowed, inspectorOn, inspectReporter, INSPECT_FEATURE } from "../src/inspect-report.js";
import { absorb, cleanReport, KEEP_MS, LOG_KEEP, nextAlarm, expiredEvents, STALE_MS, sweep } from "../src/inspector-logic.js";
import { routeFixture } from "./routes.mjs";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// An INSPECTOR binding that keeps every report it is sent and answers as the Inspector would.
const binding = (watchUntil = 0) => {
  const reports = [];
  return { reports, getByName: () => ({ report: async (r) => {
    assert.equal(Object.getPrototypeOf(r.counters), Object.prototype, "RPC counters must have the ordinary object prototype");
    assert.equal(Object.getPrototypeOf(r.peaks), Object.prototype, "RPC peaks must have the ordinary object prototype");
    reports.push(structuredClone(r)); return { watchUntil }; } }) };
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
  assert.ok(studioPolicy.studioHostAllowed({ STUDIO_HOST_IDS: "5" }, 5) && !studioPolicy.studioHostAllowed({ STUDIO_HOST_IDS: "5,x" }, 5), "the Studio reads the same rule");
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
  assert.equal(expiredEvents(events, 0).length, 3);
  assert.equal(expiredEvents([{ at: 0 }, { at: KEEP_MS }], KEEP_MS).length, 1, "a day old goes at its deadline");
  const delayed = [{ id: 1, at: KEEP_MS }, { id: 2, at: 0 }, { id: 3, at: KEEP_MS + 1 }];
  assert.deepEqual(expiredEvents(delayed, KEEP_MS).map(e => e.id), [2], "late reports expire without deleting newer ones");
  assert.equal(nextAlarm([], delayed, 1), KEEP_MS, "the earliest event can be behind a newer one");
});

// The real room, as doorway.test.mjs runs it, with the inspector on.
const roomHost = ({ sfu = null, inspector = true } = {}) => {
  let now = 100000;
  const accepted = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.webSocket = init.webSocket; }
    clone() { return this; }
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
    ...protocol, ...studioPolicy, sha256Hex, getPlayer, sfuClient: () => sfu,
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date: Clock, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  const stored = new Map(), INSPECTOR = binding();
  const ctx = {
    id: {}, waitUntil: () => {},
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: {
      get: async (key) => Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key),
      put: async (key, value) => { stored.set(key, value); }, getAlarm: async () => null, setAlarm: async () => {},
    },
  };
  const room = new context.Room(ctx, inspector ? { INSPECTOR, INSPECTOR_IDS: "1" } : {});
  const join = async (id, login) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const events = () => INSPECTOR.reports.flatMap((r) => r.events);
  return { room, join, events, INSPECTOR, advance: (ms) => { now += ms; } };
};

test("the room tells the inspector who joined, moved and dropped, with what the close said", async () => {
  const { room, join, events, advance, INSPECTOR } = roomHost();
  const a = await join(1, "a"), b = await join(2, "b");
  assert.ok(a.sent[0].features.includes(INSPECT_FEATURE), "pages hear the inspector is on");
  room.webSocketMessage(a, JSON.stringify({ t: "zone", name: "factory" }));
  room.webSocketMessage(b, JSON.stringify({ t: "visible", on: false }));
  advance(65000);
  room.webSocketClose(a, 1006, "", false);
  room.webSocketClose(b, 1000, "paused", true);
  await flush();
  const lines = events();
  assert.ok(INSPECTOR.reports.length && INSPECTOR.reports.every(r => r.name === "island"), "routing name survives missing ctx.id.name metadata");
  assert.deepEqual(lines.filter((e) => e.kind === "join").map((e) => e.login), ["a", "b"]);
  assert.deepEqual(lines.find((e) => e.kind === "zone").fields, { from: "outside", to: "factory" });
  assert.deepEqual(lines.find((e) => e.kind === "visible").fields, { visible: false });
  const [first, second] = lines.filter((e) => e.kind === "leave");
  assert.deepEqual([first.login, first.fields.reason, first.fields.code, first.fields.clean, first.fields.zone, first.fields.on], ["a", "closed", 1006, false, "factory", 65000]);
  assert.deepEqual([second.fields.code, second.fields.said, second.fields.clean], [1000, "paused", true]);
});

test("a page back from a drop says why, once a connection; a stale eviction names its kick", async () => {
  const { room, join, events, advance } = roomHost();
  const a = await join(1, "a");
  const back = { t: "back", why: "heartbeat", code: 1006, clean: false, down: 4200 };
  room.webSocketMessage(a, JSON.stringify(back));
  room.webSocketMessage(a, JSON.stringify(back));
  assert.equal(protocol.parseClientMessage(JSON.stringify({ ...back, why: "made-up" })), null);
  assert.equal(protocol.parseClientMessage(JSON.stringify({ ...back, down: -1 })), null);
  advance(protocol.STALE_MS + protocol.SWEEP_MS + 1);
  await room.alarm();
  await flush();
  const lines = events();
  assert.deepEqual(lines.filter((e) => e.kind === "back").map((e) => e.fields), [{ why: "heartbeat", code: 1006, clean: false, down: 4200 }]);
  const leave = lines.find((e) => e.kind === "leave");
  assert.deepEqual([leave.fields.reason, leave.fields.code], ["stale", protocol.CLOSE_KICK]);
});

test("a failed SFU call is logged with its status and code, never its session", async () => {
  const failure = Object.assign(new Error("SFU request failed: 410 session_error"), { status: 410, code: "session_error" });
  const sfu = { newSession: async () => { throw failure; } };
  const { room, join, events } = roomHost({ sfu });
  const a = await join(1, "a");
  const token = a.sent[0].connectionToken;
  const res = await room.voiceRequest("session", { headers: new Headers({ "x-player-id": "1", "x-room-token": token }), json: async () => ({ kind: "sub" }) });
  assert.equal(res.status, 502);
  await flush();
  const line = events().find((e) => e.kind === "voice-fail");
  assert.deepEqual([line.fields.op, line.fields.status, line.fields.code], ["session", 410, "session_error"]);
  assert.ok(!JSON.stringify(events()).includes(token), "no connection token in the log");
});

test("with the inspector off the room reports nothing and keeps its welcome as before", async () => {
  const { join, INSPECTOR } = roomHost({ inspector: false });
  const a = await join(1, "a");
  await flush();
  assert.ok(!a.sent[0].features.includes(INSPECT_FEATURE));
  assert.equal(INSPECTOR.reports.length, 0);
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
  const context = { inspectorAllowed, LIMITS: {}, RECENT_MS: 120000, WATCH_MS: 90000, absorb, cleanReport, nextAlarm, expiredEvents, sweep,
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

  const now = Date.now();
  await again.object.report({ ...room, events: [{ at: now, kind: "join", id: 1, login: "fresh" }, { at: now - KEEP_MS, kind: "leave", id: 2, login: "expired" }] });
  assert.ok(!again.object.events.some(e => e.login === "expired"), "delayed old lines are removed even behind fresh lines");
  assert.ok(!again.object.added.some(e => e.login === "expired"), "expired lines cannot escape in a pending update");
  const restored = inspectorHost(first.db);
  assert.ok(!restored.object.events.some(e => e.login === "expired"), "expired lines are removed from SQLite too");
  assert.ok(restored.object.events.some(e => e.login === "fresh"), "newer lines survive");

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

test("the page and its feed are a 404 to everyone the allowlist does not name", async () => {
  const SITE = "https://site.test", FAR = 4102444800;
  const database = (login, id) => {
    const player = { id, login, banned_at: null, created_at: 1, token_hash: "h", expires_at: FAR, last_used_at: FAR };
    return { prepare: () => ({ bind: () => ({ first: async () => player, run: async () => ({}) }) }), batch: async () => [] };
  };
  const request = (path, headers = {}) => new Request(SITE + path, { headers: { origin: SITE, cookie: "__Host-obl_session=held", ...headers } });
  let forwarded = null;
  const INSPECTOR = { getByName: () => ({ fetch: async (r) => { forwarded = r; return new Response("feed"); } }) };
  const { worker } = routeFixture();
  const env = { SITE_ORIGIN: SITE, DB: database("ooga-dev", 7), INSPECTOR, INSPECTOR_IDS: "7" };
  const ws = { upgrade: "websocket" };
  assert.equal((await worker.fetch(request("/inspect"), { ...env, INSPECTOR_IDS: "8" })).status, 404, "another account");
  assert.equal((await worker.fetch(request("/inspect"), { ...env, INSPECTOR_IDS: "" })).status, 404, "switched off");
  assert.equal((await worker.fetch(new Request(SITE + "/inspect"), env)).status, 404, "signed out");
  const page = await worker.fetch(request("/inspect"), env);
  assert.equal(page.status, 200);
  const html = await page.text(), nonce = /script-src 'nonce-([^']+)'/.exec(page.headers.get("content-security-policy"))[1];
  assert.ok(html.includes(`<script nonce="${nonce}">`) && !html.includes("__NONCE__"));
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal((await worker.fetch(request("/api/inspect/ws", ws), { ...env, INSPECTOR_IDS: "8" })).status, 404);
  assert.equal((await worker.fetch(request("/api/inspect/ws", { ...ws, origin: "https://evil.test" }), env)).status, 403);
  assert.equal((await worker.fetch(request("/api/inspect/ws"), env)).status, 426);
  assert.equal((await worker.fetch(request("/api/inspect/ws", ws), { ...env, ROOM_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal(forwarded, null);
  assert.equal((await worker.fetch(request("/api/inspect/ws", { ...ws, "x-viewer-id": "1" }), env)).status, 200);
  assert.equal(forwarded.headers.get("x-viewer-id"), "7", "the viewer is who the session says");
});
