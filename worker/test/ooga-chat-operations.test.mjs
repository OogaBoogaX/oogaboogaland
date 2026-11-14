// Ooga Chat's operations (#669): the edge's metric lines for Workers Logs, the Audience's reports to the owner's private
// Inspector and its readiness for the public health view, the zone reaction limit's fan-out budget, and the egress model
// the capacity script prints.
import { test } from "node:test";
import assert from "node:assert/strict";
// Stands in for `cloudflare:workers` (the host the Audience and the bridge import).
import "./cloudflare-host.mjs";

// Workers answer an upgrade with status 101, which Node's Response refuses; this one carries it as Workers do.
const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init = {}) {
    if (init && init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, "status", { value: 101 }); this.webSocket = init.webSocket; }
    else super(body, init);
  }
};
const socket = () => ({
  sent: [], readyState: 1, attachment: null, closed: null,
  send(text) { this.sent.push(JSON.parse(text)); },
  close(code, reason) { this.readyState = 3; this.closed = { code, reason }; },
  serializeAttachment(value) { this.attachment = value === null ? null : structuredClone(value); },
  deserializeAttachment() { return this.attachment; },
  accept() {},
});
globalThis.WebSocketPair = class { constructor() { this[0] = socket(); this[1] = socket(); } };
globalThis.WebSocketRequestResponsePair = class {};

const { metricLine, routeOf } = await import("../chat/src/metrics.js");
const { route } = await import("../chat/src/index.js");
const { forgetHello } = await import("../chat/src/bridge.js");
const { Audience } = await import("../src/audience.js");
const { zoneReactHz, FANOUT_DEFAULT } = await import("../src/audience-model.js");
const { readinessOps } = await import("../src/chat-bridge.js");
const { cleanReport } = await import("../src/inspector-logic.js");
const { egressGB, run } = await import("../../scripts/ooga-chat-capacity.mjs");

const answer = (status, extra = {}) => Object.assign({ status, headers: new Headers(extra.headers || {}) }, extra.closeCode ? { closeCode: extra.closeCode } : {});

test("a metric line names a route, a status and at most a refusal's code or a sign-in's result; nothing else", () => {
  const env = { ENVIRONMENT: "staging" };
  assert.equal(metricLine(env, "/api/bootstrap", answer(200)), null, "a public read that worked is not a line");
  assert.equal(metricLine(env, "/index.html", answer(200)), null, "the app's files are never lines");
  assert.deepEqual(JSON.parse(metricLine(env, "/api/bootstrap", answer(429))), { ooga: "chat", v: 1, env: "staging", route: "bootstrap", status: 429 });
  assert.deepEqual(JSON.parse(metricLine(env, "/api/chat/audience", answer(101, { closeCode: 4401 }))), { ooga: "chat", v: 1, env: "staging", route: "audience", status: 101, close: 4401 });
  const callback = JSON.parse(metricLine(env, "/auth/x/callback", answer(303, { headers: { location: "/?signin=denied&provider=x" } })));
  assert.deepEqual([callback.route, callback.signin], ["auth:x:callback", "denied"]);
  assert.equal(JSON.parse(metricLine(env, "/auth/github/callback", answer(303, { headers: { location: "/?signin=%3Cscript%3E" } }))).signin, undefined);
  assert.deepEqual([routeOf("/api/chat/media/publish/open"), routeOf("/api/chat/media/../x"), routeOf("/donations/socket"), routeOf("/auth/mastodon")],
    ["media:publish/open", "media:unknown", "donations:socket", "auth:unknown"]);
  assert.equal(JSON.parse(metricLine({ ENVIRONMENT: "<b>" }, "/api/chat/me", answer(503))).env, "", "only a known environment's name");
  // Whatever the answer carried, a line holds only these fields.
  const line = JSON.parse(metricLine(env, "/api/chat/commons", answer(101, { closeCode: 4403, headers: { location: "https://evil.example/?token=1", "set-cookie": "s=1" } })));
  assert.deepEqual(Object.keys(line).sort(), ["close", "env", "ooga", "route", "status", "v"]);
});

test("the edge logs one line a notable answer, through the request's own log alone", async () => {
  forgetHello();
  const lines = [];
  const deps = { fetch, waitUntil: null, cache: null, log: (l) => lines.push(JSON.parse(l)) };
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: "https://chat.example", FEATURES: "", ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
  await route(new Request("https://chat.example/api/bootstrap"), env, deps);
  const res = await route(new Request("https://chat.example/api/chat/audience", { headers: { upgrade: "websocket", origin: "https://chat.example" } }), env, deps);
  assert.equal(res.status, 101);
  assert.deepEqual(lines, [{ ooga: "chat", v: 1, env: "staging", route: "audience", status: 101, close: 4503 }], "the bootstrap read is quiet; the refused socket is a line");
  await route(new Request("https://chat.example/api/chat/audience", { headers: { upgrade: "websocket", origin: "https://chat.example" } }), env);
  assert.equal(lines.length, 1, "a check's own request (no host context) logs nothing");
});

const host = (env = {}) => {
  const storage = new Map(), sockets = [], tasks = [], reports = [];
  const ctx = {
    id: { name: "audience" },
    storage: { get: async (key) => structuredClone(storage.get(key)), put: async (key, value) => { storage.set(key, structuredClone(value)); },
      delete: async (key) => storage.delete(key), list: async () => new Map(), getAlarm: async () => null, setAlarm: async () => {} },
    setWebSocketAutoResponse() {}, waitUntil: (task) => tasks.push(task),
    blockConcurrencyWhile(fn) { this.ready = fn(); return this.ready; },
    acceptWebSocket: (ws, tags) => { ws.tags = tags; sockets.push(ws); },
    getWebSockets: () => sockets.filter((ws) => ws.readyState <= 1),
  };
  const inspector = { getByName: () => ({ report: async (r) => { reports.push(structuredClone(r)); return { watchUntil: 0 }; } }) };
  const fullEnv = { OOGA_CHAT_FEATURES: "bridge,outdoor", INSPECTOR: inspector, ROOM: { getByName: () => ({ audienceDelta: async () => {}, audienceListeners: async () => {}, audienceConfirmed: async () => {} }) }, ...env };
  const make = async (extra = {}) => { const a = new Audience(ctx, { ...fullEnv, ...extra }); await ctx.ready; return a; };
  const settle = async () => { await new Promise((r) => setTimeout(r, 0)); await Promise.all(tasks.splice(0)); };
  return { make, reports, settle };
};
const principal = (n) => ({ principal: `pr_${String(n).padStart(22, "a")}`, provider: "github", providerUserId: String(n), login: `amy${n}`,
  display: `Amy ${n}`, avatar: null, eligible: true, sessionExpiresAt: Date.now() + 3600000 });

test("the Audience reports counts and state to the owner's Inspector, never a person; nothing at all without INSPECTOR_IDS", async () => {
  const h = host({ INSPECTOR_IDS: "583231" });
  const a = await h.make();
  await h.settle();
  assert.equal(h.reports.length, 1, "a wake is reported");
  assert.deepEqual(h.reports[0].wake, { sockets: 0 });
  await a.fetch(new Request("https://audience.invalid/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(principal(1)) } }));
  const ws = [...a.sockets.values()][0];
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone: "main", protocol: 1 }));
  a.inspect.watch(Date.now() + 60000);
  await h.settle();
  const r = h.reports.at(-1);
  assert.ok(cleanReport(r), "the Inspector takes the Audience's report");
  assert.deepEqual([r.cls, r.name, r.counters.admitGithub, r.counters.snapshots, r.state.zones.main.listeners, r.state.status], ["Audience", "audience", 1, 1, 1, "serving"]);
  assert.deepEqual(r.state.limits, { listeners: 500, chatSpeakers: 8, connections: 1200 });
  const text = JSON.stringify(h.reports);
  for (const leak of ["amy1", "Amy 1", "pr_", "gh:1", "583231"]) assert.ok(!text.includes(leak), `no ${leak} in a report`);
  const off = host();
  const quiet = await off.make();
  await off.settle();
  assert.equal(quiet.inspect.on, false);
  assert.equal(off.reports.length, 0);
});

test("readiness: the SFU degraded after repeated failures with none since; the cleanup queue backlogged once a job waits", async () => {
  const a = await host({ REALTIME_APP_ID: "app", REALTIME_SECRET: "secret" }).make();
  assert.deepEqual(a.readiness(), { sfu: "ok", cleanup: "ok" });
  for (let i = 0; i < 3; i++) a.sfuMeasured(40, true, 429);
  assert.equal(a.readiness().sfu, "degraded");
  a.sfuMeasured(30, false, 200);
  assert.equal(a.readiness().sfu, "ok", "a success since the last failure");
  a.media.cleanup.push({ session: "s", mids: ["0"], all: false, at: Date.now() - 11 * 60 * 1000, tries: 3 });
  assert.equal(a.readiness().cleanup, "backlog");
  assert.deepEqual(await readinessOps.readiness.run({ AUDIENCE: { getByName: () => a } }), { sfu: "ok", cleanup: "backlog" });
  assert.equal((await host().make()).readiness().sfu, "off", "no SFU configured");
});

test("the kill switch: an Audience restarted with the bridge off closes every surviving socket and releases its media", async () => {
  const h = host({ REALTIME_APP_ID: "app", REALTIME_SECRET: "secret" });
  const a = await h.make();
  await a.fetch(new Request("https://audience.invalid/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(principal(2)) } }));
  const ws = [...a.sockets.values()][0];
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone: "main", protocol: 1 }));
  await h.settle();
  const restarted = await h.make({ OOGA_CHAT_FEATURES: "" });
  assert.deepEqual(ws.closed, { code: 4503, reason: "unavailable" });
  assert.deepEqual([restarted.sockets.size, restarted.model.conns.size, restarted.model.counts("main").listeners], [0, 0, 0]);
  const again = await h.make();
  assert.equal(again.sockets.size, 0, "with the bridge back on, nobody is quietly restored");
});

test("a zone's reactions shrink as it fills, under its fan-out budget; the egress model is the issue's formula", () => {
  assert.deepEqual([zoneReactHz(1), zoneReactHz(100), zoneReactHz(500), zoneReactHz(100000)], [30, 30, 10, 1]);
  assert.equal(zoneReactHz(500, 2500), 5);
  assert.ok(FANOUT_DEFAULT / 500 <= 10);
  assert.equal(+egressGB(500, 8, 32000, 3600).toFixed(1), 57.6, "the issue's own example: 500 listeners, 8 tracks, 32 kbps, an hour");
  const r = run(10, true);
  assert.deepEqual([r.connections, r.listeners.main, r.listeners.dsb], [20, 10, 10]);
  assert.ok(r.join.frames > 0 && r.snapshotBytes > 0);
});
