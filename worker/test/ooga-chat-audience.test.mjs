// Ooga Chat's audience (#665): the roster model as functions, the Audience object through a fake host (sockets,
// storage, alarm, a hibernation wake), the Room's relay to the island's panel, the bridge's socket path and the edge's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryD1 } from "./cloudflare-host.mjs";

// Workers answer an upgrade with status 101, which Node's Response refuses; this one carries it as Workers do.
const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init = {}) {
    if (init && init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, "status", { value: 101 }); this.webSocket = init.webSocket; }
    else super(body, init);
  }
};
const socket = () => ({
  sent: [], readyState: 1, attachment: null, closed: null, accepted: false,
  send(text) { this.sent.push(JSON.parse(text)); },
  close(code, reason) { this.readyState = 3; this.closed = { code, reason }; },
  serializeAttachment(value) { this.attachment = value === null ? null : structuredClone(value); },
  deserializeAttachment() { return this.attachment; },
  accept() { this.accepted = true; },
});
globalThis.WebSocketPair = class { constructor() { this[0] = socket(); this[1] = socket(); } };
globalThis.WebSocketRequestResponsePair = class {};

const { createAudience, appRow, islandRow, DEFAULT_LIMITS } = await import("../src/audience-model.js");
const { Audience, AUDIENCE_PROTOCOL, PENDING_MS, readPrincipal } = await import("../src/audience.js");
const { audienceRoom, PART_ROWS } = await import("../src/room-audience.js");
const { bridgeFetch } = await import("../src/chat-bridge.js");
const { BRIDGE_VERSION } = await import("../src/chat-bridge-protocol.js");
const { route } = await import("../chat/src/index.js");
const { forgetHello } = await import("../chat/src/bridge.js");
const { createSession, upsertPrincipal } = await import("../chat/src/session.js");

const info = (login, extra = {}) => ({ provider: "github", login, display: login, avatar: null, ...extra });
let clockAt = 1000;
const clock = () => clockAt;

test("one row a person: tabs collapse, the revision moves once a commit, every delta follows its base", () => {
  const a = createAudience({ epoch: 7, clock });
  a.connect({ connId: "c1", id: "gh:1", eligible: true }, info("amy"));
  a.connect({ connId: "c2", id: "gh:1", eligible: true }, info("amy"));
  a.connect({ connId: "c3", id: "x:9" }, { provider: "x", login: "zed", display: "Zed" });
  assert.deepEqual(a.commit(), [], "a connection is not in a zone until it joins");
  a.join("c1", "main"); a.join("c2", "main"); a.join("c3", "main");
  const [d1] = a.commit();
  assert.deepEqual({ zone: d1.zone, epoch: d1.epoch, base: d1.base, rev: d1.rev }, { zone: "main", epoch: 7, base: 0, rev: 1 });
  assert.deepEqual(d1.upsert.map((r) => [r.id, r.role]), [["gh:1", "listener"], ["x:9", "listener"]], "two tabs, one row");
  assert.deepEqual(a.join("c1", "main"), { ok: true, changed: false }, "the zone already chosen changes nothing");
  assert.deepEqual(a.commit(), []);
  a.disconnect("c1");
  assert.deepEqual(a.commit(), [], "the other tab keeps the row");
  a.disconnect("c2");
  const [d2] = a.commit();
  assert.deepEqual({ base: d2.base, rev: d2.rev, remove: d2.remove.map((r) => r.id), upsert: d2.upsert.length }, { base: 1, rev: 2, remove: ["gh:1"], upsert: 0 });
  assert.equal(a.snapshot("main").rows.length, 1);
  assert.equal(a.snapshot("dsb").rev, 0, "the other zone never moved");
});

test("a lease is pending (still a listener), then an active muted speaker; ending it is a listener again with a new generation", () => {
  clockAt = 5000;
  const a = createAudience({ epoch: 1, clock });
  a.connect({ connId: "c1", id: "gh:1", eligible: true }, info("amy"));
  a.join("c1", "main");
  const [first] = a.commit();
  const listenerGen = first.upsert[0].generation;
  assert.deepEqual(a.requestSpeaker("c1", { eligible: true, generation: 11, until: 99 }).lease, { state: "pending", generation: 11, until: 99, character: null });
  assert.deepEqual(a.commit(), [], "pending is not public: no phantom speaker while the microphone is asked for");
  assert.equal(a.youOf("c1").speak, "pending");
  assert.equal(a.activate("c1", 10).code, "stale_epoch", "another lease's acknowledgement does nothing");
  clockAt = 6000;
  assert.equal(a.activate("c1", 11).ok, true);
  const [spoke] = a.commit();
  assert.deepEqual({ role: spoke.upsert[0].role, source: spoke.upsert[0].source, mic: spoke.upsert[0].mic }, { role: "speaker", source: "chat", mic: "muted" });
  assert.ok(spoke.upsert[0].generation > listenerGen);
  assert.equal(a.youOf("c1").speak, "active");
  a.setMic("c1", false);
  assert.equal(a.commit()[0].upsert[0].mic, "on");
  assert.equal(a.setMic("c1", false).changed, false);
  clockAt = 7000;
  a.endLease("c1");
  const [back] = a.commit();
  assert.deepEqual({ role: back.upsert[0].role, mic: back.upsert[0].mic }, { role: "listener", mic: "off" });
  assert.ok(back.upsert[0].generation > spoke.upsert[0].generation);
  assert.equal(a.setMic("c1", false).code, "capability_required", "a listener has no microphone to unmute");
});

test("leases: one an identity across tabs and zones, a cap a zone, nothing for X or the ineligible, and a zone change ends it", () => {
  const a = createAudience({ epoch: 1, clock, limits: { ...DEFAULT_LIMITS, chatSpeakers: 1 } });
  a.connect({ connId: "a1", id: "gh:1", eligible: true }, info("amy"));
  a.connect({ connId: "a2", id: "gh:1", eligible: true }, info("amy"));
  a.connect({ connId: "b1", id: "gh:2", eligible: true }, info("bea"));
  a.connect({ connId: "x1", id: "x:3" }, { provider: "x", login: "xan" });
  for (const id of ["a1", "a2", "b1", "x1"]) a.join(id, "main");
  assert.equal(a.requestSpeaker("x1", { eligible: false, generation: 1, until: 1 }).code, "capability_required");
  assert.equal(a.youOf("x1").speak, "none");
  assert.equal(a.requestSpeaker("a1", { eligible: true, generation: 1, until: 1 }).ok, true);
  assert.equal(a.requestSpeaker("a2", { eligible: true, generation: 2, until: 1 }).code, "source_in_use", "a second tab never publishes the same person");
  assert.equal(a.requestSpeaker("b1", { eligible: true, generation: 3, until: 1 }).code, "speaker_capacity");
  const moved = a.join("a1", "dsb");
  assert.equal(moved.endedLease.generation, 1, "a real zone change ends the old lease");
  assert.equal(a.youOf("a1").speak, "eligible");
  assert.equal(a.requestSpeaker("b1", { eligible: true, generation: 4, until: 1 }).ok, true, "the seat it held is free again");
  // Listener capacity counts people, not sockets.
  const small = createAudience({ epoch: 1, clock, limits: { ...DEFAULT_LIMITS, listeners: 1, connectionsPerIdentity: 3 } });
  small.connect({ connId: "p1", id: "gh:1" }, info("amy"));
  small.connect({ connId: "p2", id: "gh:1" }, info("amy"));
  small.connect({ connId: "q1", id: "gh:2" }, info("bea"));
  assert.equal(small.join("p1", "main").ok, true);
  assert.equal(small.join("p2", "main").ok, true, "a second tab of someone already here is no new listener");
  assert.equal(small.join("q1", "main").code, "audience_full");
  assert.equal(small.connect({ connId: "p3", id: "gh:1" }, info("amy")).ok, true);
  assert.equal(small.connect({ connId: "p4", id: "gh:1" }, info("amy")).code, "too_many_connections");
});

test("the island's source wins: a world speaker is one row, its arrival ends a chat lease, its leaving gives the listener back", () => {
  clockAt = 10000;
  const a = createAudience({ epoch: 1, clock });
  a.connect({ connId: "c1", id: "gh:1", eligible: true }, info("amy", { avatar: "/api/chat/avatar/pr_aaaaaaaaaaaaaaaaaaaaaa/0123456789abcdef" }));
  a.join("c1", "main");
  a.requestSpeaker("c1", { eligible: true, generation: 5, until: 1 });
  a.activate("c1", 5);
  a.commit();
  clockAt = 11000;
  const ended = a.setWorld([{ id: "gh:1", zone: "main", mic: "on", character: "amy", info: { provider: "github", login: "amy", display: "Amy", contributions: 42 } }], []);
  assert.deepEqual(ended.map((e) => e.connId), ["c1"], "the chat lease ends before the island's source is listed");
  const [d] = a.commit();
  assert.deepEqual(d.upsert.map((r) => [r.id, r.source, r.mic, r.character, r.contributions]), [["gh:1", "world", "on", "amy", 42]]);
  assert.equal(a.zones.main.rows.size, 1, "one row, never two");
  assert.equal(a.youOf("c1").speak, "denied", "while the island has them, no chat speaking");
  assert.equal(a.requestSpeaker("c1", { eligible: true, generation: 6, until: 1 }).code, "source_in_use");
  // Merely in the island's voice somewhere (an interior): still no chat source, and nothing about where is listed.
  a.setWorld([], ["gh:1"]);
  const [gone] = a.commit();
  assert.deepEqual(gone.upsert.map((r) => [r.id, r.role]), [["gh:1", "listener"]]);
  assert.equal(a.requestSpeaker("c1", { eligible: true, generation: 7, until: 1 }).code, "source_in_use");
  a.setWorld([], []);
  assert.equal(a.requestSpeaker("c1", { eligible: true, generation: 8, until: 1 }).ok, true);
  // A world speaker nobody watches from Ooga Chat is still listed, and kept out of the other zone.
  a.setWorld([{ id: "gh:2", zone: "dsb", mic: "muted", info: { provider: "github", login: "bea" } }], []);
  const deltas = a.commit();
  assert.deepEqual(deltas.map((x) => x.zone), ["dsb"]);
  assert.equal(a.zones.main.rows.has("gh:2"), false);
});

test("the two clients' shapes of a row", () => {
  const row = { id: "gh:1", generation: 5, provider: "github", login: "amy", display: "Amy", avatar: null, contributions: 12,
    role: "speaker", source: "world", mic: "muted", hand: "", speaking: false, character: "amy" };
  assert.deepEqual(appRow(row, "gh:1"), { id: "gh:1", generation: 5, source: "world", role: "speaker", login: "amy", display: "Amy", face: null,
    contributions: 12, muted: true, provider: "github", character: "amy", mic: "muted", speaking: false, hand: "", self: true });
  assert.equal(appRow({ ...row, source: "chat" }).source, "app");
  assert.deepEqual(islandRow(row, "gh:2"), { id: "gh:1", login: "amy", display: "Amy", provider: "github", role: "speaker", source: "world",
    mic: "muted", speaking: false, hand: "", character: "amy", contributions: 12 });
  const listener = islandRow({ ...row, role: "listener", source: "chat", contributions: null, character: null, avatar: "/api/chat/avatar/pr_x/1" }, "gh:1");
  assert.deepEqual(listener, { id: "gh:1", login: "amy", display: "Amy", provider: "github", role: "listener", avatar: "/api/chat/avatar/pr_x/1", self: true });
});

// The Audience object on a fake host: sockets, a stored map, an alarm, and the Room it pushes deltas to.
const host = (env = {}) => {
  const storage = new Map(), sockets = [], tasks = [], roomDeltas = [];
  let alarm = null;
  const ctx = {
    id: { name: "audience" },
    storage: { get: async (key) => structuredClone(storage.get(key)), put: async (key, value) => { storage.set(key, structuredClone(value)); },
      delete: async (key) => storage.delete(key),
      list: async ({ prefix }) => new Map([...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
      getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } },
    setWebSocketAutoResponse() {}, waitUntil: (task) => tasks.push(task),
    blockConcurrencyWhile(fn) { this.ready = fn(); return this.ready; },
    acceptWebSocket: (ws, tags) => { ws.tags = tags; sockets.push(ws); },
    // As the runtime does, a socket whose close is still to be delivered is listed (CLOSING, 2); a closed one is not.
    getWebSockets: () => sockets.filter((ws) => ws.readyState <= 2),
  };
  const fullEnv = { OOGA_CHAT_FEATURES: "bridge,outdoor", ROOM: { getByName: () => ({ audienceDelta: async (delta) => { roomDeltas.push(delta); }, audienceListeners: async () => {}, audienceConfirmed: async () => {} }) }, ...env };
  const make = async () => {
    const audience = new Audience(ctx, fullEnv);
    await ctx.ready;
    audience.contributorFor = Object.assign(async (login) => (["amy", "bea"].includes(login) ? { handle: login } : null), { fresh: () => true });
    return audience;
  };
  return { ctx, storage, sockets, tasks, roomDeltas, make, get alarm() { return alarm; } };
};
const principal = (n, extra = {}) => ({ principal: `pr_${String(n).padStart(22, "a")}`, provider: "github", providerUserId: String(n), login: ["", "amy", "bea", "cyd"][n] || `p${n}`,
  display: `P${n}`, avatar: null, eligible: true, sessionExpiresAt: Date.now() + 3600000, ...extra });
const open = async (audience, who) => {
  const res = await audience.fetch(new Request("https://audience.invalid/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(who) } }));
  return { res, ws: audience.sockets.get([...audience.sockets.keys()].at(-1)) };
};
const say = (audience, ws, msg) => audience.webSocketMessage(ws, JSON.stringify(msg));
const last = (ws, type) => ws.sent.filter((m) => m.type === type).at(-1);

test("the Audience: join answers a snapshot, others hear a delta, resync answers again, bad frames and protocols close", async () => {
  const h = host();
  const audience = await h.make();
  const { res, ws: amy } = await open(audience, principal(1));
  assert.equal(res.status, 101);
  await say(audience, amy, { type: "join", zone: "main", protocol: AUDIENCE_PROTOCOL });
  const snap = last(amy, "snapshot");
  assert.deepEqual({ zone: snap.zone, revision: snap.revision, ids: snap.participants.map((p) => [p.id, p.self]), you: snap.you },
    { zone: "main", revision: 1, ids: [["gh:1", true]], you: { id: "gh:1", speak: "eligible" } });
  assert.deepEqual(snap.limits, { listeners: 500, chatSpeakers: 8 });
  const { ws: bea } = await open(audience, principal(2));
  await say(audience, bea, { type: "join", zone: "main", protocol: 1 });
  const delta = last(amy, "delta");
  assert.deepEqual({ base: delta.base, revision: delta.revision, ids: delta.upsert.map((p) => p.id) }, { base: 1, revision: 2, ids: ["gh:2"] });
  assert.equal(delta.upsert[0].self, undefined, "another's row is never marked as yours");
  assert.equal(last(bea, "delta").upsert[0].self, true, "your own row is");
  await say(audience, amy, { type: "resync", zone: "main" });
  assert.equal(amy.sent.filter((m) => m.type === "snapshot").length, 2);
  const { ws: old } = await open(audience, principal(3));
  await say(audience, old, { type: "join", zone: "main", protocol: 2 });
  assert.equal(old.closed.code, 4426);
  const { ws: noisy } = await open(audience, principal(3));
  await audience.webSocketMessage(noisy, "{not json");
  assert.equal(noisy.closed.code, 4400);
  assert.deepEqual(audience.stats().zones.main, { listeners: 2, chatSpeakers: 0, rows: 2, rev: 2 });
  // A forged or expired principal never becomes a socket.
  assert.equal((await audience.fetch(new Request("https://audience.invalid/connect", { headers: { upgrade: "websocket", "x-audience-principal": "{}" } }))).status, 403);
  assert.equal(readPrincipal(JSON.stringify(principal(1, { sessionExpiresAt: 5 }))), null);
  assert.equal(readPrincipal(JSON.stringify(principal(1, { provider: "x", eligible: true }))).eligible, false, "an X account is never eligible, whatever it is told");
});

test("the Audience: a speaker lease is decided by the island now, refused without it, expires unacknowledged, and is retried idempotently", async () => {
  const h = host();
  const audience = await h.make();
  const { ws: amy } = await open(audience, principal(1));
  await say(audience, amy, { type: "join", zone: "main" });
  await say(audience, amy, { type: "setRole", requestId: 1, role: "speaker" });
  const granted = last(amy, "result");
  assert.ok(Number.isSafeInteger(granted.you.lease) && granted.you.lease > 0, "the page hears its lease's generation, to name it in its media calls");
  assert.deepEqual(granted, { type: "result", requestId: 1, ok: true, you: { id: "gh:1", speak: "pending", lease: granted.you.lease } });
  await say(audience, amy, { type: "setRole", requestId: 1, role: "speaker" });
  assert.equal(amy.sent.filter((m) => m.type === "result").length, 2, "a retried request is answered again");
  assert.ok(h.alarm > 0, "the pending lease's expiry is the alarm");
  const { ws: cyd } = await open(audience, principal(3));
  await say(audience, cyd, { type: "join", zone: "main" });
  await say(audience, cyd, { type: "setRole", requestId: 9, role: "speaker" });
  assert.deepEqual(last(cyd, "result").error, { code: "capability_required", retryable: false }, "the edge said eligible; the island says no");
  // Unacknowledged past PENDING_MS: back to a listener, told so.
  const c = [...audience.model.conns.values()].find((x) => x.id === "gh:1");
  c.lease.until = Date.now() - 1;
  await audience.alarm();
  assert.equal(last(amy, "you").you.speak, "eligible");
  // Acknowledged (the media broker's step, #666): a muted speaker everyone sees.
  await say(audience, amy, { type: "setRole", requestId: 2, role: "speaker" });
  audience.model.activate(c.connId, c.lease.generation);
  await audience.flush();
  const seen = last(cyd, "delta").upsert.find((p) => p.id === "gh:1");
  assert.deepEqual({ role: seen.role, source: seen.source, muted: seen.muted }, { role: "speaker", source: "app", muted: true });
  await say(audience, amy, { type: "setMic", requestId: 3, muted: false });
  assert.equal(last(cyd, "delta").upsert[0].muted, false);
  await say(audience, cyd, { type: "setMic", requestId: 4, muted: false });
  assert.equal(last(cyd, "result").error.code, "capability_required", "a listener cannot unmute");
  await say(audience, amy, { type: "setRole", requestId: 5, role: "listener" });
  assert.equal(last(cyd, "delta").upsert[0].role, "listener");
});

test("the Audience: the island's word ends a chat lease, reaches clients, and is kept in order", async () => {
  const h = host();
  const audience = await h.make();
  const { ws: amy } = await open(audience, principal(1));
  await say(audience, amy, { type: "join", zone: "main" });
  await say(audience, amy, { type: "setRole", requestId: 1, role: "speaker" });
  assert.equal((await audience.world(5, [{ id: "gh:1", zone: "main", mic: "on", login: "amy", character: "amy" }], [])).ok, true);
  assert.equal(last(amy, "you").you.speak, "denied");
  assert.equal(last(amy, "delta").upsert[0].source, "world");
  assert.equal((await audience.world(4, [], [])).ok, false, "an older word changes nothing");
  assert.equal(audience.model.zones.main.rows.get("gh:1").source, "world");
  await audience.world(6, [], []);
  assert.equal(audience.model.zones.main.rows.get("gh:1").role, "listener");
  assert.deepEqual(h.storage.get("world").seq, 6);
});

test("the Audience: a hibernation wake restores the same roster at the same revision and sends nothing", async () => {
  const h = host();
  const first = await h.make();
  const { ws: amy } = await open(first, principal(1));
  const { ws: bea } = await open(first, principal(2));
  await say(first, amy, { type: "join", zone: "main" });
  await say(first, bea, { type: "join", zone: "dsb" });
  await first.world(3, [{ id: "gh:7", zone: "main", mic: "on", login: "gus" }], []);
  const before = { main: first.model.zones.main.rev, dsb: first.model.zones.dsb.rev };
  const sent = amy.sent.length + bea.sent.length;
  const woken = await h.make();
  assert.deepEqual({ main: woken.model.zones.main.rev, dsb: woken.model.zones.dsb.rev }, before);
  assert.deepEqual([...woken.model.zones.main.rows.keys()].sort(), ["gh:1", "gh:7"]);
  assert.equal(woken.model.epoch, first.model.epoch);
  assert.equal(amy.sent.length + bea.sent.length, sent, "waking sends nothing");
  const { ws: cyd } = await open(woken, principal(3));
  await say(woken, cyd, { type: "join", zone: "main" });
  const delta = last(amy, "delta");
  assert.equal(delta.base, before.main, "the next delta follows on from what clients hold");
  // Generations follow the clock, so a woken object's rows never look older than what clients have.
  const row = woken.model.zones.main.rows.get("gh:1");
  assert.ok(row.generation >= first.model.zones.main.rows.get("gh:1").generation);
});

test("the Audience: a socket that closed while the object slept leaves with a delta when its close wakes it", async () => {
  const h = host();
  const first = await h.make();
  const { ws: amy } = await open(first, principal(1));
  const { ws: bea } = await open(first, principal(2));
  await say(first, amy, { type: "join", zone: "main" });
  await say(first, bea, { type: "join", zone: "main" });
  const rev = first.model.zones.main.rev;
  amy.readyState = 2;
  const woken = await h.make();
  assert.deepEqual([...woken.model.zones.main.rows.keys()].sort(), ["gh:1", "gh:2"], "restored, so its close can drop it");
  assert.equal(woken.model.zones.main.rev, rev);
  await woken.webSocketClose(amy);
  const delta = last(bea, "delta");
  assert.deepEqual({ base: delta.base, revision: delta.revision, remove: delta.remove.map((r) => r.id) }, { base: rev, revision: rev + 1, remove: ["gh:1"] });
  assert.deepEqual([...woken.model.zones.main.rows.keys()], ["gh:2"]);
});

test("the Audience: signing out closes every socket of that principal; losing eligibility keeps them listening; expiry closes too", async () => {
  const h = host();
  const audience = await h.make();
  const { ws: tab1 } = await open(audience, principal(1));
  const { ws: tab2 } = await open(audience, principal(1));
  const { ws: other } = await open(audience, principal(2));
  for (const ws of [tab1, tab2, other]) await say(audience, ws, { type: "join", zone: "main" });
  await say(audience, tab1, { type: "setRole", requestId: 1, role: "speaker" });
  assert.deepEqual(await audience.revoke({ id: principal(1).principal }, "eligibility"), { revoked: 2 });
  assert.equal(tab1.closed, null, "still listening");
  assert.equal(last(tab1, "you").you.speak, "none");
  await say(audience, tab1, { type: "setRole", requestId: 2, role: "speaker" });
  assert.equal(last(tab1, "result").error.code, "capability_required");
  assert.deepEqual(await audience.revoke({ id: principal(1).principal }, "logout"), { revoked: 2 });
  assert.deepEqual([tab1.closed.code, tab2.closed.code], [4401, 4401]);
  assert.equal(other.closed, null);
  assert.deepEqual(await audience.revoke({ id: "nope" }, "logout"), { revoked: 0 });
  const c = [...audience.model.conns.values()][0];
  c.authUntil = Date.now() - 1;
  await audience.alarm();
  assert.equal(other.closed.code, 4401, "a session's deadline is checked again, even if no notification came");
});

test("regression: a media call carries a connection's authorisation on, so the hourly re-authentication never closes a socket that keeps calling (a speaker's lease)", async () => {
  const h = host();
  const audience = await h.make();
  const who = principal(1, { sessionExpiresAt: Date.now() + 3 * 3600000 });
  const { ws } = await open(audience, who);
  await say(audience, ws, { type: "join", zone: "main" });
  const c = [...audience.model.conns.values()][0];
  c.authUntil = Date.now() + 1000;
  const res = await audience.fetch(new Request("https://audience.invalid/media/ice", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(who) }, body: JSON.stringify({ connection: c.connId }) }));
  assert.ok(res.status < 400, `ice answered ${res.status}`);
  assert.ok(c.authUntil > Date.now() + 30 * 60000, "carried on by the call");
  await audience.alarm();
  assert.equal(ws.closed, null, "still open");
  const other = principal(2);
  const stranger = await audience.fetch(new Request("https://audience.invalid/media/ice", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(other) }, body: JSON.stringify({ connection: c.connId }) }));
  assert.equal(stranger.status, 409, "another principal's call carries nothing on");
  // No longer eligible at the edge: a call carries nothing on, and the hourly check closes the socket as before.
  const lapsed = principal(3, { eligible: false, sessionExpiresAt: Date.now() + 3 * 3600000 });
  const { ws: gone } = await open(audience, lapsed);
  await say(audience, gone, { type: "join", zone: "main" });
  const g = [...audience.model.conns.values()].find((x) => x.principal === lapsed.principal);
  g.authUntil = Date.now() + 1000;
  const until = g.authUntil;
  const ignored = await audience.fetch(new Request("https://audience.invalid/media/ice", { method: "POST",
    headers: { "x-audience-principal": JSON.stringify(lapsed) }, body: JSON.stringify({ connection: g.connId }) }));
  assert.ok(ignored.status < 400, `ice answered ${ignored.status}`);
  assert.equal(g.authUntil, until, "an ineligible principal's call carries nothing on");
  g.authUntil = Date.now() - 1;
  await audience.alarm();
  assert.equal(gone.closed.code, 4401, "and the hourly check still closes it");
});

test("the Audience: deltas reach a watching Room in order, and only for the zones it watches", async () => {
  const h = host();
  const audience = await h.make();
  await audience.watch(["dsb", "bogus"]);
  assert.deepEqual(h.storage.get("watch"), ["dsb"]);
  const { ws: amy } = await open(audience, principal(1));
  await say(audience, amy, { type: "join", zone: "main" });
  await say(audience, amy, { type: "join", zone: "dsb" });
  const { ws: bea } = await open(audience, principal(2));
  await say(audience, bea, { type: "join", zone: "dsb" });
  await Promise.all(h.tasks);
  assert.deepEqual(h.roomDeltas.map((d) => [d.zone, d.base, d.rev]), [["dsb", 0, 1], ["dsb", 1, 2]]);
});

// The Room's side, on a minimal room.
const fakeRoom = (players, enabled = true) => {
  const calls = { watch: [], world: [], snapshot: [] };
  const audienceStub = { watch: async (zones) => { calls.watch.push(zones); }, world: async (seq, s, a) => { calls.world.push({ seq, s, a }); return { ok: true }; },
    snapshot: async (zone) => { calls.snapshot.push(zone); return { zone, epoch: 3, rev: 9, rows: Array.from({ length: 250 }, (_, i) => ({ id: `gh:${i + 1}`, generation: 1,
      provider: "github", login: `p${i + 1}`, display: `P${i + 1}`, avatar: null, contributions: null, role: "listener", source: "chat", mic: "off", hand: "", speaking: false, character: null })) }; } };
  const room = {
    env: enabled ? { AUDIENCE: { getByName: () => audienceStub }, OOGA_CHAT_FEATURES: "bridge,outdoor" } : {},
    players: new Map(players.map((p) => [p.id, p])),
    sent: [], send(ws, msg) { ws.sent.push(msg); }, saveAttachment() {}, background(task) { return task; },
  };
  return { room, calls };
};
const player = (id, extra = {}) => ({ id, login: `p${id}`, display: `P${id}`, ws: { sent: [] }, voice: { track: null, pub: null, sub: null }, muted: false, ...extra });

test("the Room: audience-v1 only with the bridge on; a panel's view is chunked whole, deltas carry each panel's self", async () => {
  assert.deepEqual(audienceRoom.features(fakeRoom([], false).room), []);
  assert.deepEqual(audienceRoom.parse({ t: "audience-view", v: 1, zone: "dsb", extra: 1 }), { t: "audience-view", zone: "dsb" });
  for (const bad of [{ t: "audience-view", v: 2, zone: "main" }, { t: "audience-view", v: 1, zone: "hq" }, { t: "audience-resync", v: 1 }]) assert.equal(audienceRoom.parse(bad), null);
  const one = player(1), two = player(2);
  const { room, calls } = fakeRoom([one, two]);
  assert.deepEqual(audienceRoom.features(room), ["audience-v1", "outdoor-voice-v1"], "the outdoor handshake with the island's `outdoor` switch");
  await audienceRoom.view(room, one, "main");
  assert.deepEqual(calls.watch, [["main"]]);
  const parts = one.ws.sent;
  assert.equal(parts.length, Math.ceil(250 / PART_ROWS));
  assert.deepEqual(parts.map((m) => [m.kind, m.part, m.parts, m.rev, m.rows.length]), [["snapshot", 0, 3, 9, 100], ["snapshot", 1, 3, 9, 100], ["snapshot", 2, 3, 9, 50]]);
  assert.equal(parts[0].rows[0].self, true, "the panel's own row (gh:1) is marked");
  assert.deepEqual(parts[0].you, { speak: "eligible" });
  await audienceRoom.view(room, one, "main");
  assert.equal(one.ws.sent.length, 3, "the zone already viewed sends nothing new");
  await audienceRoom.view(room, one, "main", true);
  assert.equal(one.ws.sent.length, 6, "a resync sends it again");
  audienceRoom.delta(room, { zone: "main", epoch: 3, base: 9, rev: 10, upsert: [{ id: "gh:2", generation: 2, provider: "github", login: "p2", display: "P2", avatar: null,
    contributions: 3, role: "speaker", source: "world", mic: "on", hand: "", speaking: false, character: "p2" }], remove: [{ id: "gh:5", generation: 1 }] });
  const d = one.ws.sent.at(-1);
  assert.deepEqual({ kind: d.kind, base: d.base, rev: d.rev, remove: d.remove, self: d.upsert[0].self }, { kind: "delta", base: 9, rev: 10, remove: ["gh:5"], self: undefined });
  assert.equal(two.ws.sent.length, 0, "a panel not on that zone hears nothing");
});

test("the Room: its word on its players goes only when it changes, and only an opened outdoor grant lists a speaker", () => {
  const one = player(1, { voice: { track: "mic", pub: "s" }, body: "amy" }), two = player(2);
  const { room, calls } = fakeRoom([one, two]);
  audienceRoom.world(room);
  assert.deepEqual(calls.world.at(-1).s, [], "in voice but no outdoor grant: not listed");
  assert.deepEqual(calls.world.at(-1).a, ["gh:1"], "yet its source holds the identity");
  audienceRoom.world(room);
  assert.equal(calls.world.length, 1, "nothing changed, nothing sent");
  one.outdoor = { state: "open", scope: "dsb" };
  audienceRoom.world(room);
  assert.deepEqual(calls.world.at(-1).s, [{ id: "gh:1", zone: "dsb", mic: "on", login: "p1", display: "P1", character: "amy", hand: "",
    pub: { session: "s", track: "mic", gen: 0 } }], "with its publication by reference, for the Audience alone");
  assert.ok(calls.world.at(-1).seq > calls.world[0].seq);
  one.voice.track = one.voice.pub = null;
  audienceRoom.world(room);
  assert.deepEqual([calls.world.at(-1).s, calls.world.at(-1).a], [[], []], "out of voice: neither");
});

test("regression: the island panel's footer calls a player active only while in the island's voice with an open grant, never for the grant alone", () => {
  const p = player(3, { voice: {}, outdoor: { state: "open", scope: "main" } });
  assert.deepEqual(audienceRoom.you(p), { speak: "eligible" }, "outdoors out of voice (the grant opens anyway): Join stays open");
  p.voice = { track: "mic", pub: "s" };
  assert.deepEqual(audienceRoom.you(p), { speak: "active" });
  p.outdoor = { state: "none" };
  assert.deepEqual(audienceRoom.you(p), { speak: "eligible" }, "in voice indoors: its own voice, not the public one");
});

test("the bridge hands an audience socket on only for this environment and version, with the switch on, and only socket headers", async () => {
  const forwarded = [];
  const env = { ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "bridge", AUDIENCE: { getByName: () => ({ fetch: async (request) => { forwarded.push(request); return new Response("ok"); } }) } };
  const assertion = { v: BRIDGE_VERSION, env: "staging", principal: { id: principal(1).principal, provider: "github", providerUserId: "1", login: "amy", display: "Amy", avatar: null },
    eligible: true, character: "amy", sessionExpiresAt: Date.now() + 1000 };
  const ask = (a, headers = {}) => bridgeFetch(env, new Request("https://chat-bridge.invalid/audience", { headers: { upgrade: "websocket", "sec-websocket-key": "k",
    cookie: "x=1", "x-ooga-chat-assertion": JSON.stringify(a), ...headers } }));
  assert.equal((await ask(assertion)).status, 200);
  const sent = forwarded.at(-1);
  assert.deepEqual([...sent.headers.keys()].sort(), ["sec-websocket-key", "upgrade", "x-audience-principal"]);
  assert.deepEqual(JSON.parse(sent.headers.get("x-audience-principal")), { principal: principal(1).principal, provider: "github", providerUserId: "1", login: "amy",
    display: "Amy", avatar: null, character: "amy", eligible: true, sessionExpiresAt: assertion.sessionExpiresAt });
  assert.equal((await ask({ ...assertion, env: "production" })).status, 403);
  assert.equal((await ask({ ...assertion, v: 99 })).status, 403);
  assert.equal((await ask(null)).status, 403);
  assert.equal((await bridgeFetch({ ...env, OOGA_CHAT_FEATURES: "" }, new Request("https://b/audience", { headers: { upgrade: "websocket", "x-ooga-chat-assertion": JSON.stringify(assertion) } }))).status, 503);
  assert.equal((await bridgeFetch(env, new Request("https://b/elsewhere", { headers: { upgrade: "websocket" } }))).status, 404);
});

test("the edge's audience socket: a session, the app's own page, listening on; refusals are sockets closed with the protocol's codes", async () => {
  forgetHello();
  const reached = [];
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: "https://chat.example", DB: memoryD1(new URL("../chat/migrations/", import.meta.url)), FEATURES: "github,listen",
    GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "s", ASSETS: { fetch: async () => new Response("app") },
    OBL: { call: async (envelope) => envelope.op === "hello" ? { ok: true, requestId: envelope.requestId, result: { version: BRIDGE_VERSION, environment: "staging", features: { bridge: true }, voice: true } }
      : envelope.op === "capability" ? { ok: true, requestId: envelope.requestId, result: { state: "eligible", character: "amy", policy: "p", checkedAt: Date.now() } } : { ok: false, error: { code: "unknown_operation" } },
    fetch: async (request) => { reached.push(request); return new Response("bridged"); } } };
  const p = await upsertPrincipal(env.DB, { provider: "github", providerUserId: "1", login: "amy", display: "Amy", avatarUrl: null });
  const token = await createSession(env.DB, p.id, "t");
  const deps = { fetch, waitUntil: null, cache: null };
  const ask = (headers, e = env) => route(new Request("https://chat.example/api/chat/audience", { headers: { upgrade: "websocket", origin: "https://chat.example", ...headers } }), e, deps);
  const closedWith = (res) => res.webSocket && res.webSocket.closed === null ? null : res.webSocket;
  const anon = await ask({});
  assert.equal(anon.status, 101);
  // The client end is what the browser gets; its server end was closed with the code.
  assert.equal(reached.length, 0);
  assert.equal(closedWith(anon) !== undefined, true);
  assert.equal((await ask({ origin: "https://evil.example", cookie: `__Host-ooga_chat_session=${token}` })).status, 403);
  assert.equal((await route(new Request("https://chat.example/api/chat/audience", { headers: { origin: "https://chat.example" } }), env, deps)).status, 426);
  const ok = await ask({ cookie: `__Host-ooga_chat_session=${token}`, "x-ooga-chat-assertion": "{\"forged\":true}", "sec-websocket-key": "k" });
  assert.equal(await ok.text(), "bridged");
  const assertion = JSON.parse(reached.at(-1).headers.get("x-ooga-chat-assertion"));
  assert.deepEqual({ v: assertion.v, env: assertion.env, id: assertion.principal.id, eligible: assertion.eligible, character: assertion.character },
    { v: BRIDGE_VERSION, env: "staging", id: p.id, eligible: true, character: "amy" }, "the edge's own assertion, never the browser's");
  assert.equal(reached.at(-1).headers.get("cookie"), null);
  const off = await ask({ cookie: `__Host-ooga_chat_session=${token}` }, { ...env, FEATURES: "github" });
  assert.equal(off.status, 101);
  assert.equal(reached.length, 1, "listening off: nothing reaches the island");
});
