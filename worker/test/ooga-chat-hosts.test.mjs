// Hosted chats (docs/ooga-chat-hosts.md) through their objects on a fake host: starting one in the directory, a chat's
// socket (protocol 2), a request answered, an invite taken up, a host's mute, removal, co-hosts' limits, the host's hold
// and succession, the end, one voice an account across chats, and the bridge reaching only a live chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./cloudflare-host.mjs";

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
// Closing the server's half closes the page's, as the runtime does, so a refusal's code reaches the check.
globalThis.WebSocketPair = class { constructor() { const client = socket(), server = socket(); const close = server.close; server.close = (code, reason) => { close.call(server, code, reason); client.close(code, reason); }; this[0] = client; this[1] = server; } };
globalThis.WebSocketRequestResponsePair = class {};

const { Audience, CHAT_PROTOCOL, QUIET_MS, SILENT_MS, SWEEP_MS, LATE_MS, CLOSE, HANDOFF_MS, chatName } = await import("../src/audience.js");
const { ChatDirectory, startChat, chatTitle, CHATS_MAX, START_GAP_MS } = await import("../src/chat-directory.js");
const { HOST_HOLD_MS, INVITE_MS, STAGE_HOLD_MS } = await import("../src/chat-roles.js");
const { bridgeFetch } = await import("../src/chat-bridge.js");
const { BRIDGE_VERSION } = await import("../src/chat-bridge-protocol.js");

let now = 1_000_000;
const realNow = Date.now;
Date.now = () => now;

const fakeCtx = () => {
  const storage = new Map(), sockets = [], tasks = [];
  let alarm = null;
  return {
    storage: { get: async (key) => structuredClone(storage.get(key)),
      put: async (key, value) => { if (typeof key === "object") for (const [k, v] of Object.entries(key)) storage.set(k, structuredClone(v)); else storage.set(key, structuredClone(value)); },
      delete: async (key) => Array.isArray(key) ? key.filter((k) => storage.delete(k)).length : storage.delete(key),
      list: async ({ prefix }) => new Map([...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
      getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } },
    setWebSocketAutoResponse() {}, waitUntil: (task) => tasks.push(task),
    blockConcurrencyWhile(fn) { this.ready = fn(); return this.ready; },
    acceptWebSocket: (ws, tags) => { ws.tags = tags; sockets.push(ws); },
    getWebSockets: () => sockets.filter((ws) => ws.readyState <= 2),
    // Every open page pings as the clock runs (the runtime answers for the object), unless a check stops one (`silentAt`).
    getWebSocketAutoResponseTimestamp: (ws) => ws.readyState === 1 ? new Date(ws.silentAt ?? now) : null,
    tasks, get alarm() { return alarm; },
  };
};

// One world: a directory and as many chat objects as are asked for, wired to each other by name.
const world = async () => {
  const objects = new Map();
  const env = { OOGA_CHAT_FEATURES: "bridge,chats", ENVIRONMENT: "staging" };
  const dirCtx = fakeCtx();
  const directory = new ChatDirectory(dirCtx, env);
  await dirCtx.ready;
  env.CHATS = { getByName: () => directory };
  env.AUDIENCE = { getByName: (name) => {
    if (!objects.has(name)) {
      const ctx = fakeCtx();
      const a = new Audience(ctx, env);
      a.contributorFor = Object.assign(async (login) => (["amy", "bea"].includes(login) ? { handle: login } : null), { fresh: () => true });
      // As the runtime holds every call until the constructor's blockConcurrencyWhile has finished.
      const held = new Proxy(a, { get: (t, k) => typeof t[k] === "function" ? async (...args) => { await ctx.ready; return t[k](...args); } : t[k] });
      objects.set(name, { a, ctx, held });
    }
    return objects.get(name).held;
  } };
  const settle = async () => { for (const { ctx } of objects.values()) { await ctx.ready; while (ctx.tasks.length) await ctx.tasks.shift(); } };
  return { env, directory, objects, settle };
};

const who = (n, extra = {}) => ({ principal: `pr_${String(n).padStart(22, "a")}`, provider: n >= 9 ? "x" : "github", providerUserId: String(n),
  login: ["", "amy", "bea", "cyd", "dot"][n] || `p${n}`, display: `P${n}`, avatar: null, eligible: n <= 2, sessionExpiresAt: now + 3600000, ...extra });
const idOf = (n) => `${n >= 9 ? "x" : "gh"}:${n}`;
const host = (n) => ({ id: idOf(n), login: who(n).login, display: who(n).display, character: null });

const connect = async (w, chat, n, extra = {}) => {
  const a = w.env.AUDIENCE.getByName(chatName(chat));
  await w.objects.get(chatName(chat)).ctx.ready;
  const before = new Set(a.sockets.keys());
  const res = await a.fetch(new Request(`https://audience.invalid/connect?chat=${chat}`, { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(who(n, extra)) } }));
  const connId = [...a.sockets.keys()].find((k) => !before.has(k));
  const ws = connId ? a.sockets.get(connId) : res.webSocket;
  if (connId) await a.webSocketMessage(ws, JSON.stringify({ type: "join", protocol: CHAT_PROTOCOL }));
  return { a, ws, connId };
};
let rid = 1;
const ask = async (p, msg) => { const requestId = rid++; await p.a.webSocketMessage(p.ws, JSON.stringify({ requestId, ...msg })); return p.ws.sent.find((m) => m.type === "result" && m.requestId === requestId); };
const notices = (p, kind) => p.ws.sent.filter((m) => m.type === "notice" && m.kind === kind);
const you = (p) => p.ws.sent.filter((m) => m.you).at(-1).you;
const rowOf = (p, id) => {
  let rows = new Map();
  for (const m of p.ws.sent) {
    if (m.type === "snapshot") rows = new Map(m.participants.map((r) => [r.id, r]));
    if (m.type === "delta") { for (const r of m.remove) rows.delete(r.id); for (const r of m.upsert) rows.set(r.id, r); }
  }
  return rows.get(id);
};

test("a title through the island's chat policy, at most 60 characters", () => {
  assert.equal(chatTitle("  Lightning dev call  "), "Lightning dev call");
  assert.equal(chatTitle(""), null);
  assert.equal(chatTitle("a‮b"), null, "no bidi overrides");
  assert.equal(chatTitle("x".repeat(61)), null);
  assert.equal(chatTitle(42), null);
});

test("the directory: one chat a host, a start every five minutes, at most twenty, listed busiest first", async () => {
  const w = await world();
  const first = await startChat(w.env, host(1), { title: "Amy's", zone: "main" });
  assert.equal(first.ok, true);
  assert.equal((await startChat(w.env, host(1), { title: "Again", zone: "dsb" })).code, "already_hosting");
  assert.equal((await startChat(w.env, host(2), { title: "", zone: "main" })).code, "bad_title");
  assert.equal((await startChat(w.env, host(2), { title: "Ok", zone: "moon" })).code, "zone_unavailable");
  await w.directory.end(first.chat.id);
  const soon = await startChat(w.env, host(1), { title: "Again", zone: "dsb" });
  assert.equal(soon.code, "rate_limited");
  assert.ok(soon.retryAfter > 0 && soon.retryAfter <= START_GAP_MS / 1000);
  now += START_GAP_MS;
  for (let i = 0; i < CHATS_MAX; i++) assert.equal((await startChat(w.env, host(100 + i), { title: `Chat ${i}`, zone: "main" })).ok, true);
  assert.equal((await startChat(w.env, host(1), { title: "One more", zone: "main" })).code, "chats_full");
  const list = w.directory.list();
  assert.equal(list.length, CHATS_MAX);
  assert.ok(list.every((c) => !("hostId" in c) && !("host" in c && "id" in c.host)), "no account ids in the list");
});

test("a chat: the host may speak, a listener asks, the host approves, the invite is taken up, and the queue empties", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Dev call", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  const snap = amy.ws.sent.find((m) => m.type === "snapshot");
  assert.deepEqual({ id: snap.chat.id, title: snap.chat.title, zone: snap.zone, host: snap.chat.host }, { id: chat.id, title: "Dev call", zone: "main", host: "gh:1" });
  assert.deepEqual([you(amy).rank, you(amy).speak], ["host", "eligible"]);
  assert.equal(rowOf(amy, "gh:1").rank, "host");
  const cyd = await connect(w, chat.id, 3);
  assert.deepEqual([you(cyd).rank, you(cyd).speak, you(cyd).request], ["", "none", ""], "joining is listening, not speaking");
  assert.equal((await ask(cyd, { type: "setRole", role: "speaker" })).error.code, "not_allowed");
  assert.equal((await ask(cyd, { type: "ask" })).ok, true);
  assert.deepEqual(notices(amy, "asked").map((n) => n.id), ["gh:3"]);
  assert.equal(rowOf(amy, "gh:3").request, "asked");
  assert.equal((await ask(cyd, { type: "invite", id: "gh:1" })).error.code, "not_host", "a listener manages nobody");
  assert.equal((await ask(amy, { type: "answer", id: "gh:3", approve: "yes" })).error.code, "malformed", "approve is a boolean");
  assert.equal((await ask(amy, { type: "answer", id: "gh:3", approve: true })).ok, true);
  assert.equal(notices(cyd, "invited").length, 1);
  assert.equal(notices(cyd, "invited")[0].until, now + INVITE_MS);
  assert.deepEqual([you(cyd).speak, you(cyd).request], ["eligible", "invited"]);
  const lease = await ask(cyd, { type: "setRole", role: "speaker" });
  assert.equal(lease.ok, true, "a non-contributor may speak once invited");
  assert.equal(lease.you.speak, "pending");
  await w.settle();
  assert.equal(rowOf(amy, "gh:3").request, undefined, "a speaker has no request");
  assert.equal(w.directory.voices.get("gh:3"), chat.id, "the account's voice is in this chat");
});

const speakerOn = async (w, chat, p) => {
  const c = p.a.model.conns.get(p.connId);
  p.a.model.activate(p.connId, c.lease.generation);
  p.a.model.setMic(p.connId, false);
  p.a.save(p.connId);
  await p.a.flush();
};

test("Go there's ticket: only a speaker on the stage gets one, and only another connection of the same account hands it back, once, in time, saying whether the microphone was open", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Handoff", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), dot = await connect(w, chat.id, 4);
  assert.equal((await ask(amy, { type: "handoff" })).error.code, "not_speaking", "not on the stage yet");
  await ask(amy, { type: "setRole", role: "speaker" });
  await speakerOn(w, chat, amy);
  assert.equal((await ask(dot, { type: "handoff" })).error.code, "not_speaking", "a listener gets none");
  const first = (await ask(amy, { type: "handoff" })).ticket;
  assert.match(first, /^[A-Za-z0-9_-]{22}$/);
  assert.equal((await ask(bea, { type: "redeem", ticket: first })).error.code, "handoff_invalid", "another account's page gets nothing");
  const island = await connect(w, chat.id, 1);
  assert.equal((await ask(island, { type: "redeem", ticket: first })).error.code, "handoff_invalid", "a ticket tried by anyone else is gone");
  const ticket = (await ask(amy, { type: "handoff" })).ticket;
  const again = (await ask(amy, { type: "handoff" })).ticket;
  assert.equal((await ask(island, { type: "redeem", ticket })).error.code, "handoff_invalid", "a fresh ticket replaces the account's last");
  const good = await ask(island, { type: "redeem", ticket: again });
  assert.deepEqual([good.ok, good.mic], [true, true], "the island's page of the same account: the microphone was open");
  assert.equal((await ask(island, { type: "redeem", ticket: again })).error.code, "handoff_invalid", "once");
  const late = (await ask(amy, { type: "handoff" })).ticket;
  now += HANDOFF_MS;
  assert.equal((await ask(island, { type: "redeem", ticket: late })).error.code, "handoff_invalid", "too late");
  assert.equal((await ask(island, { type: "redeem", ticket: "nope" })).error.code, "malformed");
});

test("a host mutes a speaker: muted for everyone and not pulled until they unmute themselves; a co-host never touches the host", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Mute", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), dot = await connect(w, chat.id, 4);
  assert.equal((await ask(amy, { type: "mute", id: "gh:2" })).error.code, "not_speaking");
  assert.equal((await ask(amy, { type: "cohost", id: "gh:2", on: true })).ok, true);
  assert.equal(you(bea).request, "cohost", "an offer, until they accept");
  assert.equal((await ask(bea, { type: "cohostAnswer", accept: true })).ok, true);
  assert.equal(you(bea).rank, "cohost");
  assert.equal(notices(bea, "cohost").length, 1);
  assert.equal((await ask(bea, { type: "remove", id: "gh:1" })).error.code, "not_allowed");
  assert.equal((await ask(bea, { type: "end" })).error.code, "not_host");
  assert.equal((await ask(bea, { type: "invite", id: "gh:4" })).ok, true, "a co-host invites");
  await ask(dot, { type: "setRole", role: "speaker" });
  await speakerOn(w, chat, dot);
  assert.equal(rowOf(amy, "gh:4").mic, "on");
  assert.equal((await ask(bea, { type: "mute", id: "gh:4" })).ok, true);
  assert.equal(rowOf(amy, "gh:4").mic, "muted");
  assert.equal(notices(dot, "muted").length, 1);
  const c = dot.a.model.conns.get(dot.connId);
  assert.equal(c.forced, true);
  assert.equal(dot.a.media.authorizedFor(dot.a.model.conns.get(amy.connId)).has("gh:4"), false, "a host-muted voice is not pulled");
  assert.equal((await ask(dot, { type: "setMic", muted: false })).ok, true, "only they unmute themselves");
  assert.equal(c.forced, false);
  assert.equal(rowOf(amy, "gh:4").mic, "on");
  assert.equal((await ask(bea, { type: "demote", id: "gh:4" })).ok, true);
  assert.equal(rowOf(amy, "gh:4").role, "listener");
  assert.equal(you(dot).speak, "none", "moved to listening, they must ask again");
});

test("removed from a chat: their sockets close, and they stay out until it ends", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Remove", zone: "main" });
  const amy = await connect(w, chat.id, 1), zed = await connect(w, chat.id, 9);
  assert.equal(you(zed).speak, "none");
  assert.equal((await ask(amy, { type: "remove", id: "x:9" })).ok, true);
  assert.equal(notices(zed, "removed").length, 1);
  assert.equal(zed.ws.closed.code, 4403);
  assert.equal(rowOf(amy, "x:9"), undefined);
  const again = await connect(w, chat.id, 9);
  assert.equal(again.connId, undefined);
  assert.equal(again.ws.closed.code, 4403);
});

test("the host's hold: a minute, then a co-host takes over; with none the chat ends for everyone and leaves the list", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Hold", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  await ask(amy, { type: "cohost", id: "gh:2", on: true });
  await ask(bea, { type: "cohostAnswer", accept: true });
  const { a, ctx } = w.objects.get(chatName(chat.id));
  const left = now;
  await a.webSocketClose(amy.ws);
  await w.settle();
  assert.equal(ctx.alarm, left + QUIET_MS, "the host's leaving sets the alarm itself: first for the quiet hold");
  assert.equal(rowOf(bea, "gh:1").rank, "host", "a host's drop shows nobody anything yet");
  now = left + QUIET_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.deepEqual([rowOf(bea, "gh:1").rank, rowOf(bea, "gh:1").reconnecting], ["host", true], "past the quiet moments: reconnecting, in place");
  assert.equal(ctx.alarm, left + QUIET_MS + SWEEP_MS, "then every SWEEP_MS while someone holds the stage, to look for a silent connection");
  now = left + HOST_HOLD_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.deepEqual(notices(bea, "host").map((n) => n.id), ["gh:2"]);
  assert.equal(you(bea).rank, "host");
  assert.equal(rowOf(bea, "gh:2").rank, "host");
  await a.webSocketClose(bea.ws);
  await w.settle();
  now += HOST_HOLD_MS;
  await a.alarm();
  await w.settle();
  assert.equal(w.directory.has(chat.id), false, "an ended chat leaves the list");
  const late = await connect(w, chat.id, 3);
  assert.equal(late.ws.closed.code, 4404);
});

test("a host gone silent (airplane mode: no close, no pings): found by the alarm's sweep, and the hold counts from the last ping", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Silent", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  await ask(amy, { type: "cohost", id: "gh:2", on: true });
  await ask(bea, { type: "cohostAnswer", accept: true });
  await w.settle();
  const { a, ctx } = w.objects.get(chatName(chat.id));
  assert.ok(ctx.alarm <= now + SWEEP_MS, "someone on the stage: the alarm looks every SWEEP_MS");
  const quiet = now;
  amy.ws.silentAt = quiet;
  // The sweeps before SILENT_MS change nothing; the first one past it closes the host's socket as silent.
  for (let t = SWEEP_MS; t < SILENT_MS; t += SWEEP_MS) {
    now = quiet + t;
    await ctx.storage.setAlarm(null);
    await a.alarm();
    await w.settle();
    assert.equal(amy.ws.closed, null, "not yet silent long enough");
  }
  now = quiet + SILENT_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.equal(amy.ws.closed.code, CLOSE.silent);
  assert.deepEqual([rowOf(bea, "gh:1").rank, rowOf(bea, "gh:1").reconnecting], ["host", true], "reconnecting at once: the quiet moments counted from the last ping");
  // Two minutes after the last ping, not after the sweep found it, the co-host hosts.
  now = quiet + HOST_HOLD_MS - 1;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.equal(you(bea).rank, "cohost", "not before the minute");
  now = quiet + HOST_HOLD_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.deepEqual(notices(bea, "host").map((n) => n.id), ["gh:2"]);
  assert.equal(you(bea).rank, "host");
});

test("a drop the runtime reports late counts from the last ping too; one reported at once counts from then", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Late", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  await ask(amy, { type: "cohost", id: "gh:2", on: true });
  await ask(bea, { type: "cohostAnswer", accept: true });
  await w.settle();
  const { a, ctx } = w.objects.get(chatName(chat.id));
  const quiet = now;
  amy.ws.silentAt = quiet;
  // The runtime notices the dead connection 30 s later, before the sweep would have.
  now = quiet + LATE_MS + 10000;
  await a.webSocketClose(amy.ws);
  await w.settle();
  now = quiet + HOST_HOLD_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.equal(you(bea).rank, "host", "a minute from the last ping");
  // A clean close counts from the moment it came: the old host back, made a co-host by the new one, who then leaves.
  const cyd = await connect(w, chat.id, 1);
  await ask(bea, { type: "cohost", id: "gh:1", on: true });
  await ask(cyd, { type: "cohostAnswer", accept: true });
  await w.settle();
  assert.equal(you(cyd).rank, "cohost");
  const left = now;
  await a.webSocketClose(bea.ws);
  await w.settle();
  now = left + HOST_HOLD_MS - 1;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.equal(you(cyd).rank, "cohost", "a close reported at once holds the full minute");
});

test("Go there from Ooga Chat: the same account taking its own voice to the island's page keeps a co-host's rank and the stage", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Handoff", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  const a = w.objects.get(chatName(chat.id)).a;
  await ask(amy, { type: "cohost", id: "gh:2", on: true });
  await ask(bea, { type: "cohostAnswer", accept: true });
  assert.equal((await ask(bea, { type: "setRole", role: "speaker" })).ok, true);
  await speakerOn(w, chat.id, bea);
  const offers = notices(bea, "cohost_offer").length;
  // Bea's island page (its `ob_` principal) takes her voice on her word.
  const island = await connect(w, chat.id, 2, { principal: "ob_2" });
  const taken = await ask(island, { type: "setRole", role: "speaker", takeover: true });
  await w.settle();
  assert.equal(taken.ok, true);
  assert.equal(a.roles.rankOf("gh:2"), "cohost", "still a co-host");
  assert.equal(notices(bea, "cohost_offer").length, offers, "no offer card: she did not leave the stage");
  assert.ok(bea.ws.sent.some((m) => m.type === "you" && m.reason === "moved"), "Ooga Chat's page hears its voice moved");
  assert.equal(a.model.conns.get(island.connId).lease.state, "pending", "the island page holds the lease");
});

test("a speaker found silent holds their place on the stage from the last ping, not from when the sweep found them", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Held", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  const { a, ctx } = w.objects.get(chatName(chat.id));
  await ask(amy, { type: "invite", id: "gh:2" });
  assert.equal((await ask(bea, { type: "setRole", role: "speaker" })).ok, true);
  await speakerOn(w, chat.id, bea);
  const quiet = now;
  bea.ws.silentAt = quiet;
  now = quiet + SILENT_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.equal(bea.ws.closed.code, CLOSE.silent);
  assert.deepEqual(a.roles.held(quiet + STAGE_HOLD_MS - 1), ["gh:2"], "held until a minute after the last ping");
  assert.deepEqual(a.roles.held(quiet + STAGE_HOLD_MS), [], "and no longer");
});

test("End chat: everyone hears it, every socket closes, and the list forgets it", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "End", zone: "dsb" });
  const amy = await connect(w, chat.id, 1), cyd = await connect(w, chat.id, 3);
  assert.equal(cyd.ws.sent.find((m) => m.type === "snapshot").zone, "dsb", "a chat's zone is its own");
  await ask(amy, { type: "end" });
  assert.equal(notices(cyd, "ended").length, 1);
  assert.equal(cyd.ws.closed.code, 4404);
  assert.equal(amy.ws.closed.code, 4404);
  await w.settle();
  assert.equal(w.directory.has(chat.id), false);
});

test("one voice an account: taking the stage in a second chat ends the lease in the first", async () => {
  now += START_GAP_MS;
  const w = await world();
  const one = (await startChat(w.env, host(1), { title: "One", zone: "main" })).chat;
  const two = (await startChat(w.env, host(2), { title: "Two", zone: "main" })).chat;
  const amy = await connect(w, one.id, 1);
  await ask(amy, { type: "setRole", role: "speaker" });
  await w.settle();
  assert.equal(w.directory.voices.get("gh:1"), one.id);
  await connect(w, two.id, 2);
  const amyThere = await connect(w, two.id, 1);
  await ask(amyThere, { type: "ask" });
  const bea = { a: w.env.AUDIENCE.getByName(chatName(two.id)), ws: [...w.env.AUDIENCE.getByName(chatName(two.id)).sockets.values()][0] };
  await ask(bea, { type: "invite", id: "gh:1" });
  await ask(amyThere, { type: "setRole", role: "speaker" });
  await w.settle();
  assert.equal(w.directory.voices.get("gh:1"), two.id);
  assert.equal(amy.a.model.conns.get(amy.connId).lease, null, "the first chat's lease ended");
  assert.ok(amy.ws.sent.some((m) => m.type === "you" && m.reason === "moved"), "and says it moved");
});

test("the bridge reaches a chat only while the directory lists it", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Bridge", zone: "main" });
  const p = who(1);
  const assertion = JSON.stringify({ v: BRIDGE_VERSION, env: "staging", principal: { id: p.principal, provider: "github", providerUserId: "1", login: "amy", display: "Amy" },
    eligible: true, sessionExpiresAt: now + 3600000 });
  const req = (id) => new Request("https://chat-bridge.invalid/audience", { headers: { upgrade: "websocket", "x-ooga-chat-assertion": assertion, "x-chat-id": id } });
  assert.equal((await bridgeFetch(w.env, req(chat.id))).status, 101);
  assert.equal((await bridgeFetch(w.env, req("AAAAAAAAAAAAAAAA"))).status, 404, "an unknown chat makes no object");
  assert.equal((await bridgeFetch(w.env, req("bad"))).status, 404);
  assert.equal((await bridgeFetch({ ...w.env, OOGA_CHAT_FEATURES: "bridge" }, req(chat.id))).status, 503, "chats switched off");
});



test("the island's call mark: a page says it is in a chat's voice, only as a boolean, and the room offers it only with chats on", async () => {
  const { parseClientMessage, callFeatures } = await import("../src/protocol.js");
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "call", on: true })), { t: "call", on: true });
  assert.equal(parseClientMessage(JSON.stringify({ t: "call", on: "yes" })), null);
  assert.deepEqual(callFeatures({ OOGA_CHAT_FEATURES: "chats" }), ["call-v1"]);
  assert.deepEqual(callFeatures({ OOGA_CHAT_FEATURES: "bridge" }), []);
});

test("a chat seats thirty-two speakers by default, none of whom needs one of the zone's eight cloud seats", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Big stage", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  assert.equal(amy.ws.sent.find((m) => m.type === "snapshot").limits.chatSpeakers, 32);
  const people = [amy];
  for (let n = 20; n < 31; n++) {
    const p = await connect(w, chat.id, n);
    await ask(amy, { type: "invite", id: idOf(n) });
    people.push(p);
  }
  await ask(amy, { type: "setRole", role: "speaker" });
  for (const p of people.slice(1)) await ask(p, { type: "setRole", role: "speaker" });
  for (const p of people) {
    const c = p.a.model.conns.get(p.connId);
    assert.equal(p.a.model.activate(p.connId, c.lease.generation).ok, true, "a ninth speaker and beyond still speaks");
    assert.equal(c.lease.seat, null, "no cloud seat over the real island");
  }
});

test("allow back: the removed list reaches hosts and co-hosts alone, and an allowed account joins again as a listener", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Allow", zone: "main" });
  const amy = await connect(w, chat.id, 1), cyd = await connect(w, chat.id, 3), zed = await connect(w, chat.id, 9);
  await ask(amy, { type: "remove", id: "x:9" });
  const list = amy.ws.sent.filter((m) => m.type === "removed").at(-1).list;
  assert.deepEqual(list.map((r) => [r.id, r.login]), [["x:9", "p9"]]);
  assert.equal(cyd.ws.sent.some((m) => m.type === "removed"), false, "a listener never sees who was removed");
  assert.equal((await ask(cyd, { type: "allow", id: "x:9" })).error.code, "not_host");
  await ask(amy, { type: "cohost", id: "gh:3", on: true });
  await ask(cyd, { type: "cohostAnswer", accept: true });
  assert.equal(cyd.ws.sent.filter((m) => m.type === "removed").at(-1).list.length, 1, "a new co-host is told who is removed");
  assert.equal((await ask(cyd, { type: "allow", id: "x:9" })).ok, true);
  assert.deepEqual(amy.ws.sent.filter((m) => m.type === "removed").at(-1).list, []);
  const back = await connect(w, chat.id, 9);
  assert.ok(back.connId, "allowed back in");
  assert.deepEqual([you(back).speak, you(back).request, rowOf(amy, "x:9").role], ["none", "", "listener"]);
  assert.equal(zed.ws.closed.code, 4403);
});

test("rows say how long each has held their place and which app they came from, so a roster can put the longest first", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Order", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  now += 1000;
  const cyd = await connect(w, chat.id, 3);
  now += 1000;
  await ask(amy, { type: "cohost", id: "gh:3", on: true });
  await ask(cyd, { type: "cohostAnswer", accept: true });
  const a = w.env.AUDIENCE.getByName(chatName(chat.id));
  const islandIn = await a.fetch(new Request(`https://audience.invalid/connect?chat=${chat.id}`, { headers: { upgrade: "websocket",
    "x-audience-principal": JSON.stringify({ ...who(4), principal: "ob_4", avatar: null }) } }));
  assert.equal(islandIn.status, 101);
  const ws = [...a.sockets.values()].at(-1);
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", protocol: CHAT_PROTOCOL }));
  const row = (id) => rowOf(amy, id);
  assert.ok(row("gh:1").since < row("gh:3").since, "joined earlier, listed earlier");
  assert.equal(row("gh:3").rankSince, now, "a co-host since they were made one");
  assert.deepEqual([row("gh:1").via, row("gh:4").via], ["app", "island"], "an island page's connection is the island's");
  await ask(amy, { type: "setRole", role: "speaker" });
  const c = amy.a.model.conns.get(amy.connId);
  now += 1000;
  amy.a.model.activate(amy.connId, c.lease.generation);
  await amy.a.flush();
  assert.equal(row("gh:1").since, now, "a speaker since they took the stage");
});



test("one voice an account with the island: a chat tells the island room when a GitHub account takes and leaves its stage", async () => {
  now += START_GAP_MS;
  const w = await world();
  const told = [];
  w.env.ROOM = { getByName: () => ({ chatVoice: async (id, chat, on) => { told.push([id, chat, on]); return { ok: true }; } }) };
  const { chat } = await startChat(w.env, host(1), { title: "Island", zone: "main" });
  const amy = await connect(w, chat.id, 1), zed = await connect(w, chat.id, 9);
  await ask(amy, { type: "setRole", role: "speaker" });
  await w.settle();
  assert.deepEqual(told, [[1, chat.id, true]], "the island hears the account took the stage");
  await ask(amy, { type: "invite", id: "x:9" });
  await ask(zed, { type: "setRole", role: "speaker" });
  await w.settle();
  assert.equal(told.length, 1, "an X account has no island voice to end");
  await ask(amy, { type: "setRole", role: "listener" });
  await w.settle();
  assert.deepEqual(told.at(-1), [1, chat.id, false], "and that it left it");
});



test("the island room: an account on a chat's stage leaves island voice, shows in a call everywhere, and taking voice back ends the chat's lease", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const protocol = await import("../src/protocol.js");
  const studio = await import("../src/studio-policy.js");
  const { getPlayer } = await import("../src/db.js");
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class {}, WebSocketRequestResponsePair: class {}, sfuClient: () => null, CAST_ROWS: [], Date, Map, Set, Response, Promise };
  runInNewContext(source, context);
  context.Room.prototype.inspect = protocol.inspectReporter(null, {}, "Room", () => "", () => null);
  context.Room.prototype.world = protocol.worldReporter(null, {}, () => null);
  context.Room.prototype.catalog = protocol.roomCatalog.create({}, [], protocol.castIndex);
  const room = Object.create(context.Room.prototype);
  const stored = new Map(), yielded = [];
  room.ctx = { storage: { put: async (k, v) => { stored.set(k, v); } }, waitUntil: (task) => task };
  room.env = { OOGA_CHAT_FEATURES: "chats", AUDIENCE: { getByName: (name) => ({ yieldVoice: async (id) => { yielded.push([name, id]); } }) } };
  room.sockets = new Map(); room.players = new Map(); room.chatBuckets = new Map(); room.pinTries = new Map(); room.chat = protocol.chatLog(); room.chatVoices = new Map();
  room.studio = studio.studioState(0);
  room.clearVoice = async (p) => { p.voice.track = null; p.voice.pub = null; };
  room.updateVoice = () => {};
  const join = (id) => {
    const ws = { sent: [], deserializeAttachment: () => ({ id }), serializeAttachment() {}, send: (text) => ws.sent.push(JSON.parse(text)) };
    const p = room.record(ws, { id, login: `p${id}`, display: `P${id}`, contributor: true, body: `p${id}`, x: 0, y: 0, z: 0, yaw: 0 });
    room.players.set(id, p);
    return { ws, p };
  };
  const amy = join(1), bea = join(2);
  amy.p.voice.track = "mic"; amy.p.voice.pub = "s1";
  assert.equal((await room.chatVoice(1, "AAAAAAAAAAAAAAAA", true)).ok, true);
  assert.equal(protocol.inVoice(amy.p), false, "island voice ended");
  assert.ok(amy.ws.sent.some((m) => m.t === "voice-moved"));
  assert.ok(amy.ws.sent.some((m) => m.t === "voice-elsewhere" && m.on === true), "her page can offer Switch here");
  assert.ok(bea.ws.sent.some((m) => m.t === "call" && m.id === 1 && m.on === true), "everyone sees her in a call");
  assert.equal(room.view(amy.p).call, true);
  assert.equal(JSON.stringify(stored.get("chatVoices")), '[[1,"AAAAAAAAAAAAAAAA"]]', "kept across a nap");
  amy.p.voice.track = "mic";
  let refuse = true;
  room.env.AUDIENCE = { getByName: (name) => ({ yieldVoice: async (id) => { if (refuse) throw new Error("unreachable"); yielded.push([name, id]); } }) };
  room.voiceState(amy.p);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(room.chatVoices.get(1), "AAAAAAAAAAAAAAAA", "a chat that could not be reached keeps the entry, to be asked again");
  refuse = false;
  await room.takeVoiceBack(amy.p);
  assert.deepEqual(yielded, [["chat:AAAAAAAAAAAAAAAA", "gh:1"]], "taking island voice back ends the chat's lease");
  assert.equal(room.view(amy.p).call, undefined);
  assert.ok(amy.ws.sent.some((m) => m.t === "voice-elsewhere" && m.on === false), "and her page hears its voice is here again");
  assert.equal((await room.chatVoice(1, "AAAAAAAAAAAAAAAA", false)).ok, true, "the chat's own word after is harmless");
  await room.chatVoice(1, "BBBBBBBBBBBBBBBB", true);
  await room.chatVoice(1, "CCCCCCCCCCCCCCCC", false);
  assert.equal(room.chatVoices.get(1), "BBBBBBBBBBBBBBBB", "a stale chat never clears a newer one");
});



test("the preview: a chat's stage and counts, before joining; an open stage invites an asker at once and everyone hears it opened", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Preview", zone: "main" });
  const amy = await connect(w, chat.id, 1), cyd = await connect(w, chat.id, 3);
  await connect(w, chat.id, 4);
  await ask(cyd, { type: "ask" });
  const { previewChat } = await import("../src/chat-directory.js");
  const look = await previewChat(w.env, chat.id);
  assert.deepEqual({ title: look.chat.title, open: look.chat.open, stage: look.stage.map((r) => [r.id, r.rank]), listeners: look.listeners, requests: look.requests },
    { title: "Preview", open: false, stage: [["gh:1", "host"]], listeners: 2, requests: 1 });
  assert.equal(look.stage.some((r) => "self" in r), false);
  assert.equal(await previewChat(w.env, "AAAAAAAAAAAAAAAA"), null, "an unknown chat makes no object");
  assert.equal((await ask(cyd, { type: "open", on: true })).error.code, "not_host");
  assert.equal((await ask(amy, { type: "open", on: true })).ok, true);
  assert.deepEqual(cyd.ws.sent.filter((m) => m.type === "chat").at(-1).chat.open, true, "everyone hears the stage opened");
  assert.equal(notices(cyd, "invited").at(-1).open, true, "the waiting asker is approved");
  assert.equal(you(cyd).speak, "eligible");
  const dot = { a: cyd.a, ws: [...cyd.a.sockets.values()].at(-1) };
  assert.equal((await ask(dot, { type: "ask" })).ok, true);
  assert.equal(notices(dot, "invited").length, 1, "an ask on an open stage is an invite");
  assert.equal(notices(amy, "asked").length, 1, "and asks no host");
  await w.settle();
  assert.equal(w.directory.list()[0].open, true, "the list shows an open stage");
});



test("leave is asked again after the waits; a ban that can't be read refuses; Leave voice gives the stage up; leaving drops a request; an ended chat keeps nothing", async () => {
  now += START_GAP_MS;
  const w = await world();
  Object.assign(w.env, { REALTIME_APP_ID: "app", REALTIME_SECRET: "secret" });
  const { chat } = await startChat(w.env, host(1), { title: "Fixes", zone: "main" });
  const amy = await connect(w, chat.id, 1), cyd = await connect(w, chat.id, 3), dot = await connect(w, chat.id, 4);
  const a = w.objects.get(chatName(chat.id)).a;
  // An invite that lapses while the island is asked about the account is no lease.
  await ask(amy, { type: "invite", id: "gh:3" });
  const contributorFor = a.contributorFor;
  a.contributorFor = Object.assign(async (login) => { now += INVITE_MS; return contributorFor(login); }, { fresh: () => true });
  assert.equal((await ask(cyd, { type: "setRole", role: "speaker" })).error.code, "not_allowed");
  a.contributorFor = contributorFor;
  // A ban that could not be read refuses, even in a chat.
  a.env.DB = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("d1 down"); } }) }) };
  await ask(amy, { type: "invite", id: "gh:3" });
  const refused = await ask(cyd, { type: "setRole", role: "speaker" });
  assert.deepEqual([refused.error.code, refused.error.retryable], ["capability_unavailable", true]);
  delete a.env.DB;
  // Leave voice (publish/close) gives the place on the stage up.
  assert.equal((await ask(cyd, { type: "setRole", role: "speaker" })).ok, true);
  assert.equal(a.roles.mayLease("gh:3", now), true);
  const res = await a.mediaRequest("publish/close", new Request("https://audience.invalid/media/publish/close", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(who(3)) }, body: JSON.stringify({ connection: cyd.connId }) }));
  assert.equal(res.status, 200);
  assert.equal(new Map(a.roles.save().stage).has("gh:3"), false, "going back to listening on their own word gives the place up");
  assert.equal(a.roles.mayLease("gh:3", now), true, "but, once let on, they come back with Join voice and no approval");
  // A listener who leaves takes their request with them.
  await ask(dot, { type: "ask" });
  assert.deepEqual(a.roles.queue().map((q) => q.id), ["gh:4"]);
  await a.webSocketClose(dot.ws);
  assert.deepEqual(a.roles.queue(), []);
  // An ended chat keeps nothing but media cleanup's bookkeeping.
  await ask(amy, { type: "end" });
  for (const key of ["chat", "roles", "meta"]) assert.equal(await w.objects.get(chatName(chat.id)).ctx.storage.get(key), undefined, key);
});

test("a word the island room missed is kept and sent again from the alarm", async () => {
  now += START_GAP_MS;
  const w = await world();
  let up = false;
  const told = [];
  w.env.ROOM = { getByName: () => ({ chatVoice: async (id, chat, on) => { if (!up) throw new Error("room away"); told.push([id, on]); return { ok: true }; } }) };
  const { chat } = await startChat(w.env, host(1), { title: "Retry", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  await ask(amy, { type: "setRole", role: "speaker" });
  await w.settle();
  const { a, ctx } = w.objects.get(chatName(chat.id));
  assert.deepEqual([...a.islandWords], [["gh:1", { on: true, chat: chat.id }]], "kept, with the chat it names");
  assert.ok(ctx.alarm <= now + 30000, "and the alarm will try again");
  up = true;
  await a.alarm();
  assert.deepEqual(told, [[1, true]]);
  assert.equal(a.islandWords.size, 0);
});



test("a chat's copy: speakers alone may walk it, walkers' rows say so, the clouds seat the rest, and leaving the stage, removal and the end reach the copy", async () => {
  now += START_GAP_MS;
  const w = await world();
  const calls = [];
  let copyUp = true;
  const copy = { copyRevoke: async (id, reason) => calls.push(["revoke", id, reason]), copyEnd: async () => { if (!copyUp) throw new Error("copy away"); calls.push(["end"]); },
    copyClouds: async (list) => calls.push(["clouds", list.map((c) => [c.id, c.seat, c.character])]) };
  w.env.ROOM = { getByName: (name) => name.startsWith("chat:") ? copy : { chatVoice: async () => ({ ok: true }) } };
  const { chat } = await startChat(w.env, host(1), { title: "Copy", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), zed = await connect(w, chat.id, 9);
  const a = w.objects.get(chatName(chat.id)).a;
  assert.deepEqual(await a.copyMember("gh:1"), { ok: false, reason: "not-speaker" }, "the host walks only once on stage");
  await ask(amy, { type: "setRole", role: "speaker" });
  await ask(amy, { type: "invite", id: "gh:2" }); await ask(bea, { type: "setRole", role: "speaker" });
  await ask(amy, { type: "invite", id: "x:9" }); await ask(zed, { type: "setRole", role: "speaker" });
  for (const p of [amy, bea, zed]) { const c = a.model.conns.get(p.connId); a.model.activate(p.connId, c.lease.generation); }
  await a.flush();
  const member = await a.copyMember("gh:1");
  assert.equal(member.ok, true);
  assert.deepEqual(member.clouds.map((c) => [c.id, c.seat]), [["gh:1", "main-cloud-1"], ["gh:2", "main-cloud-2"], ["x:9", "main-cloud-3"]], "every speaker on a cloud, a seat each");
  assert.equal(member.clouds[2].character, "guest/x-p9", "an X account sits there as a default Ooga no login can be");
  assert.equal(member.clouds[0].seatRevision, "cloud-seats-v2");
  await a.walking(["gh:1"]);
  await w.settle();
  assert.equal(rowOf(bea, "gh:1").walking, true, "a walker's row says so");
  assert.deepEqual(calls.at(-1), ["clouds", [["gh:2", "main-cloud-2", "bea"], ["x:9", "main-cloud-3", "guest/x-p9"]]], "a walker's cloud stands empty; the copy hears the rest");
  assert.deepEqual(a.copyCheck(["gh:1", "gh:4"]), ["gh:4"], "the sweep's check names who may no longer walk");
  await a.walking(["gh:1", "gh:2"]);
  await ask(amy, { type: "demote", id: "gh:2" });
  await w.settle();
  assert.ok(calls.some((c) => c[0] === "revoke" && c[1] === 2 && c[2] === "stage"), "moved to listening, sent home");
  await ask(amy, { type: "setRole", role: "listener" });
  await w.settle();
  assert.ok(calls.some((c) => c[0] === "revoke" && c[1] === 1), "leaving the stage on one's own word sends one home too");
  // The end, with the copy away: owed, kept, and said again from the alarm until the copy takes it.
  copyUp = false;
  await ask(amy, { type: "end" });
  await w.settle();
  const { ctx } = w.objects.get(chatName(chat.id));
  assert.equal(await ctx.storage.get("copyGone"), chat.id, "kept across a nap");
  assert.ok(ctx.alarm && ctx.alarm <= now + 30000, "and the alarm will try again");
  copyUp = true;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.deepEqual(calls.at(-1), ["end"], "the end sends everyone home and the copy forgets itself");
  assert.equal(await ctx.storage.get("copyGone"), undefined);
});

test("a DSB Land chat has no copy yet", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "DSB", zone: "dsb" });
  const amy = await connect(w, chat.id, 1);
  await ask(amy, { type: "setRole", role: "speaker" });
  assert.deepEqual(await w.objects.get(chatName(chat.id)).a.copyMember("gh:1"), { ok: false, reason: "zone" });
});



test("the island view's feed: walkers' positions to those who asked, twice a second unless they ask for more, nobody else's and nothing out of bounds", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "View", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), cyd = await connect(w, chat.id, 3);
  const a = w.objects.get(chatName(chat.id)).a;
  await a.walking(["gh:1"]);
  assert.deepEqual(a.walk(1, [1], [1, 2, 3, 0.5]), { ok: true, sent: false, ms: 500 }, "nobody asked: nothing sent");
  await bea.a.webSocketMessage(bea.ws, JSON.stringify({ type: "view", on: true }));
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true }));
  now += 1000;
  assert.deepEqual(a.walk(2, [1], [1.234, 2, -3.06, 0.512]), { ok: true, sent: true, ms: 500 }, "the copy told to report twice a second");
  const frame = bea.ws.sent.filter((m) => m.type === "walk").at(-1);
  assert.deepEqual(frame, { type: "walk", seq: 2, p: ["gh:1", 1.2, 2, -3.1, 0.51] });
  assert.equal(amy.ws.sent.some((m) => m.type === "walk"), false, "only those who asked");
  assert.equal(a.walk(3, [1], [1, 2, 3, 0]).sent, false, "half a second at the soonest");
  now += 600;
  assert.equal(a.walk(2, [1], [1, 2, 3, 0]).ok, false, "an older frame is dropped");
  assert.equal(a.walk(4, [2], [1, 2, 3, 0]).ok, false, "a walker the chat does not know drops the frame");
  assert.equal(a.walk(5, [1], [1e6, 2, 3, 0]).ok, false, "as does a value out of bounds");
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: false }));
  now += 600;
  const before = cyd.ws.sent.length;
  assert.equal(a.walk(6, [1], [1, 2, 3, 0]).sent, true);
  assert.equal(cyd.ws.sent.length, before, "turned off, none come");
  // Both ask for six a second: Bea, a contributor (the 3D view's), gets them; Cyd, who is not, is held to two. Each is
  // sent at their own rate, and the copy is told to report six times.
  await bea.a.webSocketMessage(bea.ws, JSON.stringify({ type: "view", on: true, hz: 6 }));
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true, hz: 6 }));
  const got = (p) => p.ws.sent.filter((m) => m.type === "walk").length, [b0, c0] = [got(bea), got(cyd)];
  let seq = 10, ms = 0;
  for (let k = 0; k < 6; k++) { now += 167; ms = a.walk(seq++, [1], [1, 2, 3, 0]).ms; }
  assert.equal(ms, 167, "the copy reports as often as the fastest viewer is sent to");
  assert.deepEqual([got(bea) - b0, got(cyd) - c0], [6, 2], "a second: six frames to Bea, two to Cyd, who is no contributor");
  await bea.a.webSocketMessage(bea.ws, JSON.stringify({ type: "view", on: true, hz: 60 }));
  now += 167;
  assert.equal(a.walk(seq++, [1], [1, 2, 3, 0]).ms, 500, "a rate it does not offer is two a second");
});

test("the island view's looks: to viewers alone, on change, the last to a viewer starting, kept across a nap, and nothing malformed", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Looks", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), cyd = await connect(w, chat.id, 3);
  const a = w.objects.get(chatName(chat.id)).a, looksOf = (p) => p.ws.sent.filter((m) => m.type === "looks");
  await a.walking(["gh:1"]);
  await bea.a.webSocketMessage(bea.ws, JSON.stringify({ type: "view", on: true }));
  assert.equal(looksOf(bea).length, 0, "nothing said yet: nothing to start with");
  const hat = { item: "bc1gui-green-beanie", version: "5fdd8f47b975be5461f88b2bb9464ad08a106a50064e2d783751ef96101aa86c" };
  const look = { "gh:1": { e: { selection: hat, size: 110, wardrobe: { pet: { item: "custom", version: null, size: 120 } } }, w: 2, j: 1 } };
  assert.deepEqual(await a.looks(5, look), { ok: true });
  assert.deepEqual(looksOf(bea).at(-1), { type: "looks", looks: look }, "a viewer hears them");
  assert.equal(looksOf(amy).length + looksOf(cyd).length, 0, "only those viewing");
  assert.deepEqual(await a.looks(6, look), { ok: true });
  assert.equal(looksOf(bea).length, 1, "unchanged: nothing sent");
  assert.equal((await a.looks(6, { "gh:1": {} })).ok, false, "an older call is dropped");
  for (const bad of [{ "gh:1": { w: 3 } }, { "gh:1": { e: { selection: { item: "Bad Hat", version: null } } } }, { "gh:1": { e: { size: 200 } } }, { "x:1": {} },
    { "gh:1": { e: { wardrobe: { shirt: { item: "shirt-1", version: "nothex" } } } } }, { "gh:1": { owner: 1 } }, { "gh:1": { e: { wardrobe: { shirt: { item: "x".repeat(5000) } } } } }])
    assert.equal((await a.looks(7, bad)).ok, false, `malformed: ${JSON.stringify(bad).slice(0, 60)}`);
  assert.equal(looksOf(bea).length, 1, "and none relayed");
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true }));
  assert.deepEqual(looksOf(cyd), [{ type: "looks", looks: look }], "a viewer starting hears the last");
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true, hz: 4 }));
  assert.equal(looksOf(cyd).length, 1, "a rate change is no new start");
  assert.deepEqual(await a.looks(8, {}), { ok: true });
  assert.deepEqual(looksOf(bea).at(-1), { type: "looks", looks: {} }, "nobody walking: nobody to dress");
  await a.looks(9, look);
  const { ctx } = w.objects.get(chatName(chat.id)), again = new Audience(ctx, w.env);
  await ctx.ready;
  assert.equal(again.looksText, JSON.stringify(look), "kept across a nap");
});

test("the island view's clouds: who sits where to viewers alone, on change, whether or not anyone walks, with the server's clock, and to a viewer starting", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Clouds", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2), cyd = await connect(w, chat.id, 3);
  const a = w.objects.get(chatName(chat.id)).a, cloudsOf = (p) => p.ws.sent.filter((m) => m.type === "clouds");
  await bea.a.webSocketMessage(bea.ws, JSON.stringify({ type: "view", on: true }));
  assert.deepEqual(cloudsOf(bea), [{ type: "clouds", at: now, clouds: [] }], "a viewer starting hears who sits there now: nobody yet");
  await ask(amy, { type: "setRole", role: "speaker" });
  a.model.activate(amy.connId, a.model.conns.get(amy.connId).lease.generation);
  await a.flush();
  assert.deepEqual(cloudsOf(bea).at(-1).clouds, [{ id: "gh:1", character: "amy", seat: "main-cloud-1" }], "a speaker on the stage sits on a cloud, with nobody walking");
  assert.equal(cloudsOf(amy).length + cloudsOf(cyd).length, 0, "only those viewing");
  const told = cloudsOf(bea).length;
  await ask(amy, { type: "setMic", muted: false });
  await a.flush();
  assert.equal(cloudsOf(bea).length, told, "a microphone changes nothing the view draws: nothing sent");
  await a.walking(["gh:1"]);
  assert.deepEqual(cloudsOf(bea).at(-1).clouds, [], "walking the copy, off the cloud");
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true }));
  assert.deepEqual(cloudsOf(cyd), [{ type: "clouds", at: now, clouds: [] }], "a viewer starting hears the list as it stands");
  await cyd.a.webSocketMessage(cyd.ws, JSON.stringify({ type: "view", on: true, hz: 4 }));
  assert.equal(cloudsOf(cyd).length, 1, "a rate change is no new start");
  await a.walking([]);
  assert.equal(cloudsOf(cyd).at(-1).clouds[0].seat, "main-cloud-1", "back from the copy, the same seat");
});

test("a chat with no land: Ooga Chat voice alone, its roster in the main zone's frames, its land none in the list and the chat", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Just talk", zone: "none" });
  assert.equal(chat.zone, "none");
  assert.equal(w.directory.list().find((c) => c.id === chat.id).zone, "none");
  const amy = await connect(w, chat.id, 1);
  const snap = amy.ws.sent.find((m) => m.type === "snapshot");
  assert.deepEqual([snap.zone, snap.chat.zone], ["main", "none"], "the frames name the roster's zone; the chat names its land");
  await ask(amy, { type: "setRole", role: "speaker" });
  assert.equal((await ask(amy, { type: "setRole", role: "speaker" })).ok, true, "people speak as in any chat");
  assert.equal((await startChat(w.env, host(2), { title: "Moon", zone: "moon" })).code, "zone_unavailable");
});



test("a co-host offer through the chat: the person hears it, accepting puts them on stage, Leave voice brings the offer back", async () => {
  now += START_GAP_MS;
  const w = await world();
  Object.assign(w.env, { REALTIME_APP_ID: "app", REALTIME_SECRET: "secret" });
  const { chat } = await startChat(w.env, host(1), { title: "Offer", zone: "main" });
  const amy = await connect(w, chat.id, 1), cyd = await connect(w, chat.id, 3);
  const a = w.objects.get(chatName(chat.id)).a;
  await ask(amy, { type: "cohost", id: "gh:3", on: true });
  assert.equal(notices(cyd, "cohost_offer").length, 1);
  assert.deepEqual(cyd.ws.sent.filter((m) => m.type === "chat").at(-1).chat.offers, ["gh:3"], "everyone's chat says who holds an offer");
  assert.equal((await ask(cyd, { type: "cohostAnswer", accept: "yes" })).error.code, "malformed");
  assert.equal((await ask(cyd, { type: "cohostAnswer", accept: true })).ok, true);
  assert.equal(notices(amy, "cohost").at(-1).id, "gh:3", "the host hears it accepted");
  assert.equal(you(cyd).speak, "eligible", "a co-host may take the stage at once");
  assert.equal((await ask(cyd, { type: "setRole", role: "speaker" })).ok, true);
  await a.mediaRequest("publish/close", new Request("https://audience.invalid/media/publish/close", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(who(3)) }, body: JSON.stringify({ connection: cyd.connId }) }));
  await w.settle();
  assert.deepEqual([you(cyd).rank, you(cyd).request], ["", "cohost"], "Leave voice: a listener with the offer back");
  assert.ok(notices(cyd, "cohost_offer").at(-1).again, "and told so");
  await ask(amy, { type: "cohost", id: "gh:3", on: false });
  assert.equal(notices(cyd, "cohost_retracted").length, 1, "the host withdraws it");
});

test.after(() => { Date.now = realNow; });

test("a short drop shows nobody anything: the speaker's tile stands, their place is kept for the cap, and back on stage they keep their place in the order", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Quiet", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  const { a, ctx } = w.objects.get(chatName(chat.id));
  await ask(amy, { type: "invite", id: "gh:2" });
  assert.equal((await ask(bea, { type: "setRole", role: "speaker" })).ok, true);
  await speakerOn(w, chat.id, bea);
  const since = rowOf(amy, "gh:2").since;
  const naming = () => amy.ws.sent.filter((m) => m.type === "delta" && [...m.upsert, ...m.remove].some((r) => r.id === "gh:2")).length;
  const before = naming();
  now += 1000;
  await a.webSocketClose(bea.ws);
  await w.settle();
  assert.equal(naming(), before, "nothing about them reaches anyone");
  assert.equal(rowOf(amy, "gh:2").role, "speaker");
  assert.equal(a.model.counts("main").chatSpeakers, 1, "their place counts against the speaker cap");
  now += 5000;
  const back = await connect(w, chat.id, 2);
  assert.equal(naming(), before, "back as a listener first: still nothing shows");
  now += 25000;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.deepEqual([rowOf(amy, "gh:2").role, rowOf(amy, "gh:2").reconnecting], ["speaker", undefined], "a slow way back to the stage still stands in place, not reconnecting");
  assert.equal((await ask(back, { type: "setRole", role: "speaker" })).ok, true, "and on stage again with no approval");
  await speakerOn(w, chat.id, back);
  assert.equal(rowOf(amy, "gh:2").since, since, "where they stood in the order");
  await w.settle();
  assert.equal(await ctx.storage.get("quiet"), undefined, "and the hold it ended is gone from storage, so a wake can't bring it back");
  // A drop that lasts: the roster says so once the quiet hold passes, and Join voice still needs no approval.
  const left = now;
  await a.webSocketClose(back.ws);
  await w.settle();
  assert.equal(rowOf(amy, "gh:2").role, "speaker");
  now = left + QUIET_MS - 1;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.equal(rowOf(amy, "gh:2").reconnecting, undefined, "nothing for the first moments");
  now = left + QUIET_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.deepEqual([rowOf(amy, "gh:2").role, rowOf(amy, "gh:2").reconnecting, rowOf(amy, "gh:2").since], ["speaker", true, since], "then reconnecting, in place");
  assert.equal(ctx.alarm, Math.min(left + STAGE_HOLD_MS, now + SWEEP_MS), "for the held place, or sooner for the host's sweep");
  now = left + STAGE_HOLD_MS;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.equal(rowOf(amy, "gh:2"), undefined, "gone from the roster once their place lapses");
  now += HOST_HOLD_MS;
  const later = await connect(w, chat.id, 2);
  assert.equal(you(later).speak, "eligible", "once let on, they come back without asking");
  // Moved to listening by a host: they ask again.
  assert.equal((await ask(later, { type: "setRole", role: "speaker" })).ok, true);
  await ask(amy, { type: "demote", id: "gh:2" });
  assert.equal(you(later).speak, "none", "Request to speak again");
});

test("a microphone publishing again keeps a co-host's rank and tile; Leave voice gives them up for the offer card", async () => {
  now += START_GAP_MS;
  const w = await world();
  Object.assign(w.env, { REALTIME_APP_ID: "app", REALTIME_SECRET: "secret" });
  const { chat } = await startChat(w.env, host(1), { title: "Recover", zone: "main" });
  const amy = await connect(w, chat.id, 1), bea = await connect(w, chat.id, 2);
  const a = w.objects.get(chatName(chat.id)).a;
  await ask(amy, { type: "cohost", id: "gh:2", on: true });
  await ask(bea, { type: "cohostAnswer", accept: true });
  assert.equal((await ask(bea, { type: "setRole", role: "speaker" })).ok, true);
  await speakerOn(w, chat.id, bea);
  const offers = notices(bea, "cohost_offer").length;
  const close = (body) => a.mediaRequest("publish/close", new Request("https://audience.invalid/media/publish/close", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(who(2)) }, body: JSON.stringify({ connection: bea.connId, ...body }) }));
  assert.equal((await close({ recover: true })).status, 200);
  await w.settle();
  assert.equal(a.roles.rankOf("gh:2"), "cohost", "publishing again is not leaving");
  assert.equal(notices(bea, "cohost_offer").length, offers, "no offer card");
  assert.deepEqual([rowOf(amy, "gh:2").role, rowOf(amy, "gh:2").rank], ["speaker", "cohost"], "and the tile stands meanwhile");
  const { ctx } = w.objects.get(chatName(chat.id));
  now += QUIET_MS * 4;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  await w.settle();
  assert.equal(rowOf(amy, "gh:2").role, "speaker", "a slow recovery is still a speaker in place");
  assert.equal((await ask(bea, { type: "setRole", role: "speaker" })).ok, true);
  await speakerOn(w, chat.id, bea);
  assert.equal((await close({})).status, 200);
  assert.equal(a.roles.rankOf("gh:2"), "");
  assert.equal(notices(bea, "cohost_offer").at(-1).again, true, "Leave voice: a listener with the offer back");
});

test("a host signed out everywhere starts the hold, and the alarm is set for it", async () => {
  now += START_GAP_MS;
  const w = await world();
  const { chat } = await startChat(w.env, host(1), { title: "Signed out", zone: "main" });
  await connect(w, chat.id, 1);
  const { a, ctx } = w.objects.get(chatName(chat.id));
  await ctx.storage.setAlarm(null);
  assert.equal((await a.revoke({ id: who(1).principal }, "logout-all")).revoked, 1);
  assert.equal(ctx.alarm, now + HOST_HOLD_MS);
});

test("a chat ending while the island room is away still frees its speakers' island voice, from the alarm", async () => {
  now += START_GAP_MS;
  const w = await world();
  let up = false;
  const told = [];
  w.env.ROOM = { getByName: () => ({ chatVoice: async (id, chat, on) => { if (!up) throw new Error("room away"); told.push([id, chat, on]); return { ok: true }; } }) };
  const { chat } = await startChat(w.env, host(1), { title: "Away", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  await ask(amy, { type: "setRole", role: "speaker" });
  await speakerOn(w, chat.id, amy);
  await ask(amy, { type: "end" });
  await w.settle();
  const { a, ctx } = w.objects.get(chatName(chat.id));
  assert.deepEqual([...a.islandWords], [["gh:1", { on: false, chat: chat.id }]], "the last word is kept");
  assert.equal(await ctx.storage.get("chat"), undefined, "nothing else of the chat");
  assert.ok((await ctx.storage.get("islandWords")).length);
  up = true;
  await ctx.storage.setAlarm(null);
  await a.alarm();
  assert.deepEqual(told, [[1, chat.id, false]]);
  assert.equal(a.islandWords.size, 0);
});

test("the island's Online Oogas: a chat reports its title and counts (speaking, listening, and who through Ooga Chat's app, by name) as they change, at most every 2 s, and its end's zeros are kept until the Room takes them", async () => {
  now += START_GAP_MS;
  const { MEMBERS_GAP_MS } = await import("../src/audience.js");
  const w = await world();
  let up = true, lastIds = null, lastPeople = null;
  const reports = [];
  w.env.ROOM = { getByName: () => ({ chatVoice: async () => ({ ok: true }),
    chatMembers: async (...args) => { if (!up) throw new Error("room away"); const [chat, title, speakers, listeners, ids, people] = args; reports.push({ chat, title, speakers, listeners, app: Array.isArray(ids) ? ids.length : -1, args: args.length }); lastIds = ids; lastPeople = people; return { ok: true }; } }) };
  const { chat } = await startChat(w.env, host(1), { title: "Members", zone: "main" });
  const amy = await connect(w, chat.id, 1);
  await w.settle();
  const { a, ctx } = w.objects.get(chatName(chat.id));
  assert.deepEqual(reports, [{ chat: chat.id, title: "Members", speakers: 1, listeners: 0, app: 1, args: 6 }], "the first change goes at once, six plain values: the host speaks, on stage or not");
  await connect(w, chat.id, 3);
  await connect(w, chat.id, 9);
  // Dot joins from the island's page (its `ob_` principal): counted, but not as Ooga Chat's.
  await connect(w, chat.id, 4, { principal: "ob_4" });
  await w.settle();
  assert.equal(reports.length, 1, "a burst waits out the gap");
  assert.ok(a.members.timer, "with one timer for its last change");
  // The timer's turn, without waiting for it.
  const fire = async () => { clearTimeout(a.members.timer); a.members.timer = 0; now += MEMBERS_GAP_MS; a.reportMembers(); await w.settle(); };
  await fire();
  assert.deepEqual(reports.at(-1), { chat: chat.id, title: "Members", speakers: 1, listeners: 3, app: 3, args: 6 }, "the whole burst in one report, the island's own not in `app`");
  assert.deepEqual([...lastIds].sort(), ["gh:1", "gh:3", "x:9"], "the app's accounts by id, for the Room to count each once");
  assert.deepEqual(lastPeople.map((p) => [p.id, p.login, p.display, p.speaking]), [["gh:1", "amy", "P1", true], ["gh:3", "cyd", "P3", false], ["x:9", "p9", "P9", false]],
    "and by name for Online Oogas, speakers first; the island page's own account (Dot) is not among them");
  assert.deepEqual([w.directory.list().find((c) => c.id === chat.id).speakers, w.directory.list().find((c) => c.id === chat.id).listeners], [1, 3], "the Chats list counts the same way");
  await ask(amy, { type: "setRole", role: "speaker" });
  await speakerOn(w, chat.id, amy);
  await w.settle();
  await fire();
  assert.deepEqual([reports.at(-1).speakers, reports.at(-1).listeners, reports.at(-1).app], [1, 3, 3], "the host taking the stage changes no count");
  const told = reports.length;
  // A microphone muted changes no count: nothing is sent.
  await ask(amy, { type: "setMic", muted: true });
  await w.settle();
  now += MEMBERS_GAP_MS;
  a.reportMembers();
  await w.settle();
  assert.equal(reports.length, told, "nothing while the counts are what the Room was told");
  // A report the Room misses goes again with the next change.
  up = false;
  await connect(w, chat.id, 5);
  await w.settle();
  if (a.members.timer) await fire();
  assert.equal(a.members.failed, true);
  up = true;
  now += MEMBERS_GAP_MS;
  await a.flush();
  await w.settle();
  assert.equal(reports.at(-1).listeners, 4, "the missed report is sent again");
  // The end, with the Room away: the zeros are kept and the alarm says them again.
  up = false;
  await ask(amy, { type: "end" });
  await w.settle();
  assert.equal(a.members.gone, chat.id);
  assert.equal(await ctx.storage.get("membersGone"), chat.id, "kept across a nap");
  assert.ok(ctx.alarm && ctx.alarm <= now + 30000, "and the alarm will try again");
  up = true;
  await a.alarm();
  assert.deepEqual(reports.at(-1), { chat: chat.id, title: "", speakers: 0, listeners: 0, app: 0, args: 6 }, "the Room hears the chat is over");
  assert.deepEqual(lastIds, []);
  assert.deepEqual(lastPeople, []);
  assert.equal(a.members.gone, null);
  assert.equal(await ctx.storage.get("membersGone"), undefined);
});


test("the island room keeps each chat's title, counts and app accounts for Online Oogas: stored, in the welcome only with the feature, every change broadcast, gone with nobody in it, kept over a wake, and dropped at the sweep once the directory no longer lists the chat", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const protocol = await import("../src/protocol.js");
  const studio = await import("../src/studio-policy.js");
  const { getPlayer } = await import("../src/db.js");
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class {}, WebSocketRequestResponsePair: class {}, sfuClient: () => null, CAST_ROWS: [], Date, Map, Set, Response, Promise };
  runInNewContext(source, context);
  context.Room.prototype.inspect = protocol.inspectReporter(null, {}, "Room", () => "", () => null);
  context.Room.prototype.world = protocol.worldReporter(null, {}, () => null);
  context.Room.prototype.catalog = protocol.roomCatalog.create({}, [], protocol.castIndex);
  const { chatMembersRoom, CHATS_KEPT } = await import("../src/room-chat-members.js");
  const stored = new Map();
  let listed = ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"], readable = true;
  const make = (features) => {
    const room = Object.create(context.Room.prototype);
    room.ctx = { storage: { put: async (k, v) => { stored.set(k, structuredClone(v)); } }, waitUntil: (task) => task };
    room.env = { OOGA_CHAT_FEATURES: features, CHATS: { getByName: () => ({ list: async () => { if (!readable) throw new Error("away"); return listed.map((id) => ({ id })); } }) } };
    room.sockets = new Map(); room.players = new Map(); room.chatBuckets = new Map(); room.pinTries = new Map(); room.chat = protocol.chatLog(); room.chatVoices = new Map(); room.chatRosters = new Map();
    room.studio = studio.studioState(0);
    return room;
  };
  const room = make("chats");
  const join = (id) => {
    const ws = { sent: [], deserializeAttachment: () => ({ id }), serializeAttachment() {}, send: (text) => ws.sent.push(JSON.parse(text)) };
    const p = room.record(ws, { id, login: `p${id}`, display: `P${id}`, contributor: true, body: `p${id}`, x: 0, y: 0, z: 0, yaw: 0 });
    room.players.set(id, p);
    return { ws, p };
  };
  const bea = join(2);
  const heard = () => bea.ws.sent.filter((m) => m.t === "chat-summary");
  const online = () => bea.ws.sent.filter((m) => m.t === "chat-online").map((m) => m.n);
  assert.equal((await room.chatMembers("AAAAAAAAAAAAAAAA", "Dev call", 3, 12, ["gh:5", "gh:2", "x:9", "gh:5", "Amy"])).ok, true);
  assert.deepEqual(heard().at(-1), { t: "chat-summary", chat: "AAAAAAAAAAAAAAAA", title: "Dev call", speakers: 3, listeners: 12 }, "every page hears its title and counts, never an id");
  assert.deepEqual(online(), [2], "one number for N online: each app account once, the island's own player (Bea) left out, nothing that is not an id");
  await room.chatMembers("BBBBBBBBBBBBBBBB", "Crowd\u0007", -1, 2.5e6, ["x:9", "gh:7"]);
  assert.deepEqual(heard().at(-1), { t: "chat-summary", chat: "BBBBBBBBBBBBBBBB", title: "", speakers: 0, listeners: 1e6 }, "each value checked");
  assert.deepEqual(online(), [2, 3], "an account in two chats counted once");
  const count = heard().length;
  await room.chatMembers("BBBBBBBBBBBBBBBB", "Crowd\u0007", -1, 2.5e6, ["x:9", "gh:7"]);
  assert.equal(heard().length, count, "the same again tells nobody");
  const gh5 = join(5);
  chatMembersRoom.players(room);
  assert.deepEqual(online().at(-1), 2, "one of them come to the island is a player, no longer counted twice");
  room.players.delete(5);
  chatMembersRoom.players(room);
  assert.deepEqual(online().at(-1), 3);
  void gh5;
  assert.equal((await room.chatMembers("not a chat", "", 0, 0, [])).ok, false);
  assert.deepEqual(stored.get("chatMembers").map(([id, e]) => [id, Object.keys(e).sort().join()]), [["AAAAAAAAAAAAAAAA", "ids,listeners,people,speakers,title"], ["BBBBBBBBBBBBBBBB", "ids,listeners,people,speakers,title"]],
    "kept in storage: a title, counts, the app's account ids and their names");
  // Who they are, for Online Oogas: each app account once across chats, speaking if anywhere, the island's players left
  // out, anything malformed dropped, by name.
  const people = () => bea.ws.sent.filter((m) => m.t === "chat-people").map((m) => m.people);
  await room.chatMembers("BBBBBBBBBBBBBBBB", "Crowd", 1, 2, ["x:9", "gh:7", "gh:2"], [{ id: "x:9", login: "zed", display: "Zed", speaking: false },
    { id: "gh:7", login: "gus", display: "Gus\u0007", speaking: true }, { id: "gh:2", login: "p2", display: "P2" }, { id: "gh:8", login: "nobody", display: "Not in ids" }, { id: "Amy", login: "amy" }]);
  assert.deepEqual(people().at(-1), [{ id: "gh:7", login: "gus", display: "gus", speaking: true }, { id: "x:9", login: "zed", display: "Zed", speaking: false }],
    "by name, a name with a control character shown as the login, nobody outside the chat's ids, the island's own player (Bea) left out");
  const shown = people().length;
  await room.chatMembers("BBBBBBBBBBBBBBBB", "Crowd", 1, 2, ["x:9", "gh:7", "gh:2"], [{ id: "x:9", login: "zed", display: "Zed" }, { id: "gh:7", login: "gus", display: "Gus\u0007", speaking: true }]);
  assert.equal(people().length, shown, "the same list again tells nobody");
  assert.deepEqual(chatMembersRoom.welcome(room).chatPeople.map((p) => p.id), ["gh:7", "x:9"], "and the welcome carries it");
  await room.chatMembers("BBBBBBBBBBBBBBBB", "Crowd\u0007", -1, 2.5e6, ["x:9", "gh:7"]);
  assert.deepEqual(people().at(-1), [], "a chat whose report names nobody lists nobody");
  // The welcome carries every chat's, only with the feature.
  assert.ok(protocol.chatMembersRoom === chatMembersRoom || protocol.chatMembersRoom.FEATURE === chatMembersRoom.FEATURE);
  assert.deepEqual(chatMembersRoom.features(room), ["chat-summary-v1"]);
  room.chalk = protocol.CHALK.board(); room.loopEpoch = 0; room.roomLocks = new Map(); room.links = new Map(); room.cabinetSeats = new Map();
  room.welcome(bea.p, false);
  const welcome = bea.ws.sent.findLast((m) => m.t === "welcome");
  assert.ok(welcome.features.includes("chat-summary-v1") && welcome.features.includes("call-v1"), "the feature beside call-v1");
  assert.deepEqual(welcome.chatSummaries.map((c) => [c.chat, c.title, c.speakers, c.listeners, c.app]), [["AAAAAAAAAAAAAAAA", "Dev call", 3, 12, undefined], ["BBBBBBBBBBBBBBBB", "", 0, 1e6, undefined]], "a page's welcome carries every chat's");
  assert.equal(welcome.chatOnline, 3, "and the number in chats");
  const off = make("");
  chatMembersRoom.restore(off, stored.get("chatMembers"));
  assert.deepEqual([chatMembersRoom.features(off), chatMembersRoom.welcome(off)], [[], {}], "with the chats switch off, no feature and nothing in the welcome");
  // A wake: the stored entries come back as they were; one stored with names before keeps only its counts.
  const woke = make("chats");
  chatMembersRoom.restore(woke, [...structuredClone(stored.get("chatMembers")),
    ["CCCCCCCCCCCCCCCC", { title: "Old", members: [{ id: "gh:1", login: "amy", display: "Amy", role: "speaker" }, { id: "x:9", login: "zed", display: "Zed", role: "listener" }], more: 3 }]]);
  assert.deepEqual([...woke.chatRosters.keys()], ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB", "CCCCCCCCCCCCCCCC"]);
  assert.deepEqual(woke.chatRosters.get("CCCCCCCCCCCCCCCC"), { title: "Old", speakers: 1, listeners: 4, ids: [], people: [] }, "an older entry's names are let go");
  assert.ok(CHATS_KEPT >= 2);
  // Nobody in it drops the chat, and every page hears it.
  await room.chatMembers("AAAAAAAAAAAAAAAA", "", 0, 0, []);
  assert.deepEqual(heard().at(-1), { t: "chat-summary", chat: "AAAAAAAAAAAAAAAA", title: "", speakers: 0, listeners: 0 });
  assert.equal(online().at(-1), 2, "its accounts no longer counted");
  assert.equal(room.chatRosters.has("AAAAAAAAAAAAAAAA"), false);
  assert.deepEqual(stored.get("chatMembers").map(([id]) => id), ["BBBBBBBBBBBBBBBB"]);
  // The sweep drops a chat the directory no longer lists, and never one it could not read.
  listed = [];
  readable = false;
  await chatMembersRoom.sweep(room);
  assert.equal(room.chatRosters.has("BBBBBBBBBBBBBBBB"), true, "a directory that can't be read drops nothing");
  readable = true;
  await chatMembersRoom.sweep(room);
  assert.equal(room.chatRosters.size, 0);
  assert.deepEqual(heard().at(-1), { t: "chat-summary", chat: "BBBBBBBBBBBBBBBB", title: "", speakers: 0, listeners: 0 });
  assert.equal(online().at(-1), 0);
  // A big chat: every app account counts, past 500.
  const many = Array.from({ length: 600 }, (_, i) => `x:${i + 1}`);
  await room.chatMembers("CCCCCCCCCCCCCCCC", "Big", 1, 599, many);
  assert.equal(online().at(-1), 600);
  // After a wake the number is worked out afresh at the next change, never from before the players came back.
  const later = make("chats");
  chatMembersRoom.restore(later, structuredClone(stored.get("chatMembers")));
  later.players.set(77, {});
  const sent = [];
  later.broadcast = (m) => sent.push(m);
  chatMembersRoom.players(later);
  assert.deepEqual(sent, [{ t: "chat-online", n: 600 }], "the first change after a wake tells every page");
});



test("the bridge's /catalog: only Ooga Chat's edge of the same environment, answered as the island's own catalog route", async () => {
  const env = { ENVIRONMENT: "staging" };
  assert.equal((await bridgeFetch(env, new Request("https://chat-bridge.invalid/catalog"))).status, 403, "no environment header");
  assert.equal((await bridgeFetch(env, new Request("https://chat-bridge.invalid/catalog", { headers: { "x-ooga-chat-environment": "production" } }))).status, 403);
  const off = await bridgeFetch(env, new Request("https://chat-bridge.invalid/catalog", { headers: { "x-ooga-chat-environment": "staging" } }));
  assert.equal(off.status, 404, "no catalog bound: the island's own catalog_disabled");
  assert.equal((await off.json()).error, "catalog_disabled");
});
