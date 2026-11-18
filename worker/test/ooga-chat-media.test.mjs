// Ooga Chat's media broker (#666): the Audience object's signalling against a fake Realtime SFU (every session, track,
// close and failure it sees), the durable cleanup, and the island Room pulling Ooga Chat speakers by the Audience's
// reference for its players with an open outdoor grant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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
  send(text) { this.sent.push(JSON.parse(text)); }, close(code, reason) { this.readyState = 3; this.closed = { code, reason }; },
  serializeAttachment(value) { this.attachment = value === null ? null : structuredClone(value); }, deserializeAttachment() { return this.attachment; }, accept() {},
});
globalThis.WebSocketPair = class { constructor() { this[0] = socket(); this[1] = socket(); } };
globalThis.WebSocketRequestResponsePair = class {};

// The SFU, faked behind fetch: sessions, their tracks by mid, every call, and failures on demand.
const sfu = { sessions: new Map(), calls: [], failClose: false, failNew: false, onNewTracks: null, failMids: new Set() };
let nextId = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  assert.equal(url.host, "rtc.live.cloudflare.com");
  // /v1/apps/<app>/sessions/...: what follows the app id.
  const rest = url.pathname.split("/").slice(4).join("/");
  const body = init.body ? JSON.parse(init.body) : null;
  const reply = (data, status = 200) => new NodeResponse(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  sfu.calls.push({ method: init.method || "GET", path: rest, body });
  if (rest === "sessions/new") {
    if (sfu.failNew) return reply({ errorCode: "busy" }, 503);
    const sessionId = `s${++nextId}`;
    sfu.sessions.set(sessionId, new Map());
    return reply({ sessionId });
  }
  const [, sessionId, what, verb] = rest.split("/");
  const tracks = sfu.sessions.get(sessionId);
  if (!tracks) return reply({ errorCode: "session_error" }, 404);
  if (what === "tracks" && verb === "new") {
    if (sfu.onNewTracks) await sfu.onNewTracks(sessionId, body);
    const out = body.tracks.map((t) => {
      const mid = t.location === "local" ? t.mid : `m${++nextId}`;
      tracks.set(mid, { ...t, status: "active" });
      return t.location === "local" ? { mid, trackName: t.trackName } : { mid, sessionId: t.sessionId, trackName: t.trackName };
    });
    return reply({ tracks: out, sessionDescription: { type: body.sessionDescription ? "answer" : "offer", sdp: "v=0" }, requiresImmediateRenegotiation: !body.sessionDescription });
  }
  if (what === "tracks" && verb === "close") {
    if (sfu.failClose) return reply({ errorCode: "busy" }, 500);
    return reply({ tracks: body.tracks.map(({ mid }) => {
      if (sfu.failMids.has(mid)) return { mid, errorCode: "busy" };
      if (tracks.has(mid)) tracks.get(mid).status = "inactive";
      return { mid };
    }) });
  }
  if (what === "renegotiate") return reply({});
  if (!what) return reply({ tracks: [...tracks].map(([mid, t]) => ({ mid, status: t.status })) });
  throw new Error(`unexpected SFU call ${rest}`);
};
const openMids = (session) => [...(sfu.sessions.get(session) || new Map())].filter(([, t]) => t.status === "active").map(([mid]) => mid);

const { Audience } = await import("../src/audience.js");
const protocol = await import("../src/protocol.js");

const host = () => {
  const storage = new Map(), sockets = [], tasks = [], room = { deltas: [], sources: [] };
  let alarm = null;
  const ctx = {
    id: { name: "audience" },
    storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); }, delete: async (k) => storage.delete(k),
      list: async ({ prefix }) => new Map([...storage].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])),
      getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } },
    setWebSocketAutoResponse() {}, waitUntil: (t) => tasks.push(t), blockConcurrencyWhile(fn) { this.ready = fn(); return this.ready; },
    acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => ws.readyState <= 1),
  };
  const env = { REALTIME_APP_ID: "app", REALTIME_SECRET: "secret", OOGA_CHAT_FEATURES: "bridge,outdoor",
    ROOM: { getByName: () => ({ audienceDelta: async (d) => room.deltas.push(d), audienceSources: async (list) => room.sources.push(list),
      audienceListeners: async (c) => (room.listeners = c), audienceConfirmed: async (ids) => (room.confirmed = (room.confirmed || []).concat(ids)) }) } };
  const make = async () => {
    const a = new Audience(ctx, env);
    await ctx.ready;
    a.contributorFor = Object.assign(async (login) => (login.startsWith("dev") ? { handle: login } : null), { fresh: () => true });
    return a;
  };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  return { storage, room, make, settle, get alarm() { return alarm; } };
};
const who = (n, extra = {}) => ({ principal: `pr_${String(n).padStart(22, "a")}`, provider: "github", providerUserId: String(n), login: `dev${n}`, display: `Dev ${n}`,
  avatar: null, eligible: true, sessionExpiresAt: Date.now() + 3600000, ...extra });
const connect = async (a, principal, zone = "main") => {
  await a.fetch(new Request("https://audience.invalid/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(principal) } }));
  const ws = [...a.sockets.values()].at(-1);
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone, protocol: 1 }));
  return { ws, connection: ws.sent.find((m) => m.type === "snapshot").connection, principal };
};
const media = async (a, client, op, body = {}, principal = client.principal) => {
  const res = await a.fetch(new Request(`https://audience.invalid/media/${op}`, { method: "POST", headers: { "x-audience-principal": JSON.stringify(principal) },
    body: JSON.stringify({ connection: client.connection, ...body }) }));
  return { status: res.status, body: await res.json() };
};
const speak = async (a, client, requestId = 1) => {
  await a.webSocketMessage(client.ws, JSON.stringify({ type: "setRole", requestId, role: "speaker" }));
  const c = a.model.conns.get(client.connection);
  const generation = c.lease.generation;
  assert.equal((await media(a, client, "publish/open", { generation })).status, 200);
  const offer = await media(a, client, "publish/offer", { generation, sdp: "v=0 offer", mid: "0" });
  assert.equal(offer.status, 200);
  const ready = await media(a, client, "publish/ready", { generation });
  assert.equal(ready.status, 200);
  return generation;
};

test("a listener pulls its zone's speakers by reference: island and Ooga Chat ones, never itself, never the other zone", async () => {
  const h = host(), a = await h.make();
  const listener = await connect(a, who(9, { provider: "x", providerUserId: "77", login: "xan", eligible: false }));
  const speaker = await connect(a, who(1));
  const far = await connect(a, who(2), "dsb");
  await speak(a, speaker);
  await speak(a, far);
  await a.world(5, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 3 } }], []);
  sfu.sessions.set("island-pub", new Map([["0", { location: "local", status: "active" }]]));
  assert.equal((await media(a, listener, "receive/open")).status, 200, "an X listener needs no microphone to hear");
  const sync = await media(a, listener, "receive/sync");
  assert.equal(sync.status, 200);
  assert.deepEqual(sync.body.tracks.map((t) => t.participant).sort(), ["gh:1", "gh:40"]);
  const pulled = sfu.calls.filter((c) => c.path.endsWith("tracks/new") && c.body.tracks[0].location === "remote").at(-1).body.tracks;
  assert.ok(pulled.some((t) => t.sessionId === "island-pub" && t.trackName === "mic"), "the island's publication, by the Room's reference");
  assert.ok(!JSON.stringify(sync.body).includes("island-pub"), "no upstream id reaches the client");
  const own = await media(a, speaker, "receive/open").then(() => media(a, speaker, "receive/sync"));
  assert.deepEqual(own.body.tracks.map((t) => t.participant), ["gh:40"], "a speaker never pulls itself");
  assert.equal((await media(a, listener, "receive/sync")).body.tracks.length, 0, "nothing twice");
  assert.deepEqual(h.room.sources.at(-1).map((s) => [s.id, s.zone]), [[1, "main"], [2, "dsb"]], "the Room hears Ooga Chat speakers by GitHub id and zone");
});

test("an OC speaker still counts as a receiver and hears island microphones without any listener-only accounts", async () => {
  const h = host(), a = await h.make(), speaker = await connect(a, who(1));
  await speak(a, speaker);
  await h.settle();
  assert.equal(a.model.counts("main").listeners, 0);
  assert.equal(h.room.listeners.main, 1, "joining voice must not tell the island that nobody can hear it");
  const world = await a.world(1, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-only", track: "mic", gen: 1 } }], ["gh:40"]);
  assert.equal(world.listeners.main, 1);
  await media(a, speaker, "receive/open");
  assert.deepEqual((await media(a, speaker, "receive/sync")).body.tracks.map((t) => t.participant), ["gh:40"]);
});

test("OC receivers replace a speaker's track in both handoff directions even when source generations coincide", async () => {
  const h = host(), a = await h.make(), speaker = await connect(a, who(1)), listener = await connect(a, who(2));
  await speak(a, speaker);
  const original = a.media.chatSources()[0], gen = original.gen;
  await media(a, listener, "receive/open");
  const first = (await media(a, listener, "receive/sync")).body.tracks[0];
  const sub = h.storage.get(`media:${listener.connection}`).sub;
  await a.world(1, [{ id: "gh:1", zone: "main", mic: "on", login: "dev1", pub: { session: "handoff-island", track: "mic", gen } }], ["gh:1"]);
  await h.settle();
  assert.ok(!openMids(sub).includes(first.mid), "the chat pull is retired when the island takes voice");
  const island = (await media(a, listener, "receive/sync")).body.tracks[0];
  assert.equal(island.participant, "gh:1");
  assert.equal(sfu.sessions.get(sub).get(island.mid).sessionId, "handoff-island");
  assert.ok(speaker.ws.sent.some((m) => m.type === "you" && m.reason === "moved"));
  await a.world(2, [], []);
  a.nextGeneration = () => gen;
  await speak(a, speaker, 2);
  await h.settle();
  assert.ok(!openMids(sub).includes(island.mid), "the island pull is retired when voice moves back");
  const back = (await media(a, listener, "receive/sync")).body.tracks[0];
  assert.equal(back.participant, "gh:1");
  assert.equal(sfu.sessions.get(sub).get(back.mid).sessionId, a.media.chatSources()[0].session);
  assert.equal((await media(a, listener, "receive/sync")).body.tracks.length, 0, "one playback per speaker");
});

test("publishing needs the caller's own lease of that generation; nothing is published or pulled for anyone else", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2));
  assert.equal((await media(a, amy, "publish/open", { generation: 1 })).body.error.code, "capability_required", "no lease, no publication");
  await a.webSocketMessage(amy.ws, JSON.stringify({ type: "setRole", requestId: 1, role: "speaker" }));
  const generation = a.model.conns.get(amy.connection).lease.generation;
  assert.equal((await media(a, amy, "publish/open", { generation: generation - 1 })).body.error.code, "capability_required");
  assert.equal((await media(a, amy, "publish/open", { generation }, bea.principal)).status, 409, "another principal never uses this connection");
  assert.equal((await media(a, { ...amy, connection: "nope" }, "receive/open")).status, 409);
  assert.equal((await media(a, amy, "teleport")).status, 404);
  await media(a, amy, "publish/open", { generation });
  assert.equal((await media(a, amy, "publish/ready", { generation })).body.error.code, "capability_required", "ready before an offer: nothing to announce");
  assert.equal(a.model.zones.main.rows.get("gh:1").role, "listener", "still a listener: no phantom speaker");
  await media(a, amy, "publish/offer", { generation, sdp: "v=0", mid: "0" });
  await media(a, amy, "publish/ready", { generation });
  assert.deepEqual([a.model.zones.main.rows.get("gh:1").role, a.model.zones.main.rows.get("gh:1").mic], ["speaker", "muted"], "live, and muted until unmuted");
  const local = sfu.calls.filter((c) => c.path.endsWith("tracks/new") && c.body.tracks[0].location === "local").at(-1).body.tracks;
  assert.deepEqual(local, [{ location: "local", mid: "0", trackName: "mic" }], "one track, the microphone alone");
});

test("a publication retired is out of the catalog at once and closed at the SFU, with every subscription to it", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2), "main");
  await speak(a, amy);
  const pub = a.media.states.get(amy.connection).pub;
  await media(a, bea, "receive/open");
  await media(a, bea, "receive/sync");
  const sub = a.media.states.get(bea.connection).sub;
  assert.equal(openMids(sub).length, 1);
  assert.equal((await media(a, amy, "publish/close")).status, 200);
  await h.settle();
  assert.deepEqual(openMids(pub), [], "the publisher's track is closed");
  assert.deepEqual(openMids(sub), [], "and every listener's pull of it, without waiting for the listener");
  assert.deepEqual(a.media.states.get(bea.connection).mids, {});
  assert.ok(bea.ws.sent.some((m) => m.type === "media" && m.op === "sync"), "the listener is told to sync");
  assert.equal(a.model.zones.main.rows.get("gh:1").role, "listener");
  assert.deepEqual(h.room.sources.at(-1), [], "the island stops hearing them too");
});

test("a receiver is told when its zone gains a voice and which of its mids were closed, so a page never polls (#654)", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2)), cyd = await connect(a, who(3), "dsb");
  for (const listener of [bea, cyd]) { await media(a, listener, "receive/open"); await media(a, listener, "receive/sync"); }
  const told = (client) => client.ws.sent.filter((m) => m.type === "media");
  const before = told(bea).length;
  await speak(a, amy);
  assert.equal(told(bea).length, before + 1, "a chat speaker going live: the listener in that zone is told to sync");
  assert.deepEqual(told(bea).at(-1), { type: "media", op: "sync" });
  assert.equal(told(cyd).length, 0, "the other zone hears nothing");
  assert.equal(told(amy).length, 0, "nor does anyone without a receiver");
  const sync = await media(a, bea, "receive/sync");
  const mid = sync.body.tracks[0].mid;
  await a.world(20, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 1 } }], []);
  assert.deepEqual(told(bea).at(-1), { type: "media", op: "sync" }, "and an island speaker's publication arriving");
  const quiet = told(bea).length;
  await a.world(21, [{ id: "gh:40", zone: "main", mic: "muted", login: "isle", pub: { session: "island-pub", track: "mic", gen: 1 } }], []);
  assert.equal(told(bea).length, quiet, "a mute changes no publication, so nobody is asked to sync");
  assert.equal((await media(a, amy, "publish/close")).status, 200);
  await h.settle();
  assert.ok(told(bea).some((m) => Array.isArray(m.closed) && m.closed.includes(mid)), "a retired voice's mid is named, so the page drops it at once");
});

test("an island speaker leaving the outdoors, or a listener changing zone, closes their pulls at once", async () => {
  const h = host(), a = await h.make();
  const bea = await connect(a, who(2));
  sfu.sessions.set("island-pub", new Map([["0", { status: "active" }]]));
  await a.world(10, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 3 } }], []);
  await media(a, bea, "receive/open");
  await media(a, bea, "receive/sync");
  const sub = a.media.states.get(bea.connection).sub;
  assert.equal(openMids(sub).length, 1);
  await a.world(11, [], ["gh:40"]);
  await h.settle();
  assert.deepEqual(openMids(sub), [], "an outdoor publication gone is unsubscribed for everyone, server-side");
  await a.world(12, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 3 } }], []);
  await media(a, bea, "receive/sync");
  assert.equal(openMids(sub).length, 1);
  await a.world(13, [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 4 } }], []);
  await h.settle();
  assert.deepEqual(openMids(sub), [], "a microphone published again is a new generation: the old pull goes");
  await media(a, bea, "receive/sync");
  await a.webSocketMessage(bea.ws, JSON.stringify({ type: "join", zone: "dsb", protocol: 1 }));
  await h.settle();
  assert.deepEqual(openMids(sub), [], "Main Island's voices are not DSB Land's to hear");
});

test("anything that changes while the SFU call is in flight keeps nothing it should not", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2));
  const generation = await speak(a, amy);
  await media(a, bea, "receive/open");
  const sub = a.media.states.get(bea.connection).sub;
  sfu.onNewTracks = async () => {
    sfu.onNewTracks = null;
    a.model.endLease(amy.connection, generation);
    await a.media.retirePublication(amy.connection);
  };
  const raced = await media(a, bea, "receive/sync");
  await h.settle();
  assert.equal(raced.status, 200);
  assert.deepEqual(raced.body.tracks, [], "the speaker left mid-call: no track kept");
  assert.deepEqual(openMids(sub), [], "and the one the SFU made is closed");
});

test("cleanup is durable: a failed close is kept, retried by the alarm after everyone left, and past its bound blocks new publishing only for sessions still held", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1));
  await speak(a, amy);
  const pub = a.media.states.get(amy.connection).pub;
  sfu.failClose = true;
  await media(a, amy, "publish/close");
  await h.settle();
  assert.equal(h.storage.get("mediaCleanup").length, 1, "kept in storage, not in memory alone");
  assert.equal(openMids(pub).length, 1);
  await a.webSocketClose(amy.ws);
  await h.settle();
  assert.ok(h.alarm > 0, "the alarm stays armed with no client left");
  const woken = await h.make();
  sfu.failClose = false;
  await woken.alarm();
  assert.deepEqual(openMids(pub), []);
  assert.deepEqual(h.storage.get("mediaCleanup"), []);
  // Past the bound, with every session still held by a live connection, publishing waits for cleanup while giving
  // things up still works.
  const bea = await connect(woken, who(2));
  for (let i = 0; i < 64; i++) {
    woken.media.cleanup.push({ session: `stuck${i}`, mids: ["0"], all: false, at: Date.now() - 64 + i, tries: 0 });
    woken.media.states.set(`holder${i}`, { sub: `stuck${i}`, mids: {}, pub: null, pubMid: null, pending: false, track: null, gen: 0, lease: 0 });
  }
  await woken.webSocketMessage(bea.ws, JSON.stringify({ type: "setRole", requestId: 1, role: "speaker" }));
  const generation = woken.model.conns.get(bea.connection).lease.generation;
  assert.equal((await media(woken, bea, "publish/open", { generation })).body.error.code, "cleanup_pending");
  // regression: a queue full of jobs for sessions nobody holds (their pages closed them, and the SFU stopped answering)
  // refused every speaker and listener for an hour. It lets go of the oldest such job instead, keeping its bound.
  for (let i = 0; i < 64; i += 2) woken.media.states.delete(`holder${i}`);
  assert.equal((await media(woken, bea, "publish/open", { generation })).status, 200);
  assert.equal(woken.media.cleanup.length, 63);
  assert.ok(!woken.media.cleanup.some((job) => job.session === "stuck0"), "the oldest job nobody holds is the one let go");
  assert.ok(woken.media.cleanup.some((job) => job.session === "stuck1"), "a held session's job is kept");
  assert.equal((await media(woken, bea, "leave")).status, 200);
  for (let i = 0; i < 64; i++) woken.media.states.delete(`holder${i}`);
  woken.media.cleanup.splice(0);
});

test("regression: a woken Audience asks no listener to sync for the Room's unchanged word, so an idle tab costs no wake a minute", async () => {
  const h = host(), a = await h.make();
  const bea = await connect(a, who(2));
  await media(a, bea, "receive/open");
  await media(a, bea, "receive/sync");
  const speakers = [{ id: "gh:40", zone: "main", mic: "on", login: "isle", pub: { session: "island-pub", track: "mic", gen: 1 } }];
  await a.world(20, speakers, []);
  const told = () => bea.ws.sent.filter((m) => m.type === "media").length;
  const before = told();
  const woken = await h.make();
  await woken.world(21, speakers, []);
  assert.equal(told(), before, "nothing changed while it slept, so nobody is asked to sync again");
  await woken.world(22, [{ ...speakers[0], pub: { ...speakers[0].pub, gen: 2 } }], []);
  assert.equal(told(), before + 1, "a new publication after the wake is still announced");
});

test("a wake restores each connection's media, and sweeps the sessions of a socket that went while it slept", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2));
  await speak(a, amy);
  await media(a, bea, "receive/open");
  await media(a, bea, "receive/sync");
  const sub = a.media.states.get(bea.connection).sub;
  bea.ws.readyState = 3;
  const woken = await h.make();
  assert.equal(woken.media.states.get(amy.connection).track, "mic", "the speaker's publication is still known");
  assert.equal(woken.media.states.has(bea.connection), false);
  await woken.alarm();
  assert.deepEqual(openMids(sub), [], "the gone socket's pulls are swept");
});

// The island Room, run as the other Room checks run it, with an Audience that has published one Ooga Chat speaker.
const roomHarness = async () => {
  const accepted = [], saved = new Map();
  let ready = null;
  const sock = () => ({ sent: [], closed: null, store: null, send(t) { if (typeof t === "string") this.sent.push(JSON.parse(t)); }, close(code) { this.closed = { code }; },
    serializeAttachment(v) { this.store = JSON.parse(JSON.stringify(v)); }, deserializeAttachment() { return this.store; } });
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, sha256Hex: async () => "x", getPlayer: async () => null, sfuClient: () => null, deliverHighscores: async () => {},
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair: class { constructor() { this[0] = sock(); this[1] = sock(); } }, Response: class { constructor(b, i = {}) { this.status = i.status; this.json = async () => JSON.parse(b); } },
    WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView, Headers,
    ...(await import("../src/studio-policy.js")) };
  runInNewContext(source, context);
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); }, acceptWebSocket: (ws) => accepted.push(ws), waitUntil() {},
    getWebSockets: () => accepted.filter((ws) => !ws.closed), storage: { get: async (k) => (Array.isArray(k) ? new Map() : saved.get(k)), put: async (k, v) => saved.set(k, v), getAlarm: async () => null, setAlarm: async () => {} } };
  const env = { OOGA_CHAT_FEATURES: "bridge,outdoor", AUDIENCE: { getByName: () => ({ world: async () => ({ ok: true, pending: [] }), watch: async () => {}, snapshot: async () => null }) } };
  const room = new context.Room(ctx, env);
  await ready;
  // The same Room woken from hibernation: a new object over the same storage.
  const wake = async () => { const woken = new context.Room(ctx, env); await ready; return woken; };
  const pulls = [], closes = [];
  room.sfu = { newTracks: async (session, body) => { pulls.push(body.tracks); return { tracks: body.tracks.map((t, i) => ({ mid: `r${i}`, sessionId: t.sessionId, trackName: t.trackName })) }; },
    closeTracks: async (session, mids) => { closes.push(mids); return { tracks: mids.map((mid) => ({ mid })) }; }, getSession: async () => ({ tracks: [] }) };
  const join = async (id, login) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    const ws = accepted[before];
    room.players.get(id).voice = { pub: `p${id}`, sub: `s${id}`, track: "mic", gen: 1, mids: {}, pubMid: null };
    await room.webSocketMessage(ws, JSON.stringify({ t: "body", name: login }));
    return ws;
  };
  return { room, join, pulls, closes, wake };
};

const plain = (value) => JSON.parse(JSON.stringify(value));

test("the island: a player with an open outdoor grant hears Ooga Chat speakers of that zone, pulled by the Audience's reference only", async () => {
  const h = await roomHarness();
  const a = await h.join(1, "a"), b = await h.join(2, "b");
  h.room.players.get(1).outdoor = { state: "open", scope: "main" };
  h.room.audienceSources([{ id: 777, zone: "main", session: "chat-pub", track: "mic", gen: 9 }, { id: 888, zone: "dsb", session: "dsb-pub", track: "mic", gen: 2 }]);
  const voice = (ws) => ws.sent.filter((m) => m.t === "voice").at(-1);
  assert.ok(voice(a).peers.includes(777), "the open grant's zone's chat speaker");
  assert.equal(voice(a).gens[voice(a).peers.indexOf(777)], -10, "chat publications have a separate generation range");
  assert.ok(!voice(a).peers.includes(888), "never the other zone's");
  assert.ok(!(voice(b) && voice(b).peers.includes(777)), "no grant, no Ooga Chat voices");
  const token = h.room.players.get(1).connectionToken;
  const pull = await h.room.voiceRequest("pull", { headers: new Headers({ "x-player-id": "1", "x-room-token": token }), json: async () => ({ ids: [777, 888] }) });
  assert.deepEqual(plain((await pull.json()).tracks), [{ id: 777, mid: "r0" }]);
  assert.deepEqual(plain(h.pulls.at(-1)), [{ location: "remote", sessionId: "chat-pub", trackName: "mic" }], "only the allowed source, by its reference");
  assert.deepEqual(plain(h.room.players.get(1).voice.mids), { r0: 777 });
  // The speaker leaves voice: the Audience's list drops them and the island listener's pull is closed.
  h.room.audienceSources([]);
  assert.deepEqual(plain(h.room.players.get(1).voice.mids), {});
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.closes.some((mids) => mids.includes("r0")), "closed at the SFU, not just forgotten");
});

test("the island follows the active microphone across both handoffs while the speaker remains signed in to OBL", async () => {
  const h = await roomHarness(), a = await h.join(1, "a"), b = await h.join(2, "b");
  const listener = h.room.players.get(1), speaker = h.room.players.get(2);
  listener.outdoor = speaker.outdoor = { state: "open", scope: "main" };
  const request = () => h.room.voiceRequest("pull", { headers: new Headers({ "x-player-id": "1", "x-room-token": listener.connectionToken }), json: async () => ({ ids: [2] }) });
  const generation = () => { const v = a.sent.filter((m) => m.t === "voice").at(-1); return v.gens[v.peers.indexOf(2)]; };
  h.room.updateVoice();
  const islandGen = generation();
  assert.equal((await (await request()).json()).tracks[0].id, 2);
  assert.equal(h.pulls.at(-1)[0].sessionId, "p2");
  await h.room.audienceHandoff(2);
  assert.equal(b.sent.filter((m) => m.t === "voice-moved").length, 1);
  // The island record and its old generation survive; its microphone does not.
  await h.room.audienceSources([{ id: 2, zone: "main", session: "chat-pub", track: "mic", gen: islandGen }]);
  assert.notEqual(generation(), islandGen, "equal clock counts still replace the source");
  assert.equal((await (await request()).json()).tracks[0].id, 2);
  assert.equal(h.pulls.at(-1)[0].sessionId, "chat-pub", "island presence cannot hide the chat microphone");
  // Rejoining OBL first opens a publication with no live track: OC remains the audible source until live.
  speaker.voice.pub = "back-on-island";
  assert.equal((await (await request()).json()).tracks[0].id, 2);
  assert.equal(h.pulls.at(-1)[0].sessionId, "chat-pub");
  speaker.voice.track = "mic";
  h.room.updateVoice();
  assert.equal(generation(), islandGen);
  assert.equal((await (await request()).json()).tracks[0].id, 2);
  assert.equal(h.pulls.at(-1)[0].sessionId, "back-on-island");
  // A delayed OC catalog entry must not authorize an island microphone that has since moved indoors.
  speaker.zone = "sphere-0"; speaker.outdoor = null;
  assert.deepEqual((await (await request()).json()).tracks, []);
});

test("the island discards an in-flight OC pull when that identity switches microphone before the SFU answers", async () => {
  const h = await roomHarness();
  await h.join(1, "a"); await h.join(2, "b");
  const listener = h.room.players.get(1), speaker = h.room.players.get(2);
  listener.outdoor = { state: "open", scope: "main" };
  speaker.voice.pub = speaker.voice.track = null;
  await h.room.audienceSources([{ id: 2, zone: "main", session: "old-chat", track: "mic", gen: 1 }]);
  h.room.sfu.newTracks = async () => {
    speaker.voice.pub = "new-island"; speaker.voice.track = "mic";
    return { tracks: [{ mid: "stale", sessionId: "old-chat", trackName: "mic" }] };
  };
  const res = await h.room.voiceRequest("pull", { headers: new Headers({ "x-player-id": "1", "x-room-token": listener.connectionToken }), json: async () => ({ ids: [2] }) });
  assert.deepEqual((await res.json()).tracks, []);
  assert.ok(h.closes.some((mids) => mids.includes("stale")), "the obsolete pull is closed at the SFU");
  assert.deepEqual(plain(listener.voice.mids), {});
});

test("a woken Room keeps the Audience's Ooga Chat speakers; the Audience resends only what changed, and again when not delivered", async () => {
  const h = await roomHarness();
  const list = [{ id: 777, zone: "main", session: "chat-pub", track: "mic", gen: 9 }];
  await h.room.audienceSources(list);
  const woken = await h.wake();
  assert.deepEqual(plain(woken.chatSources), list, "an island grant still hears the chat speaker after the Room slept");
  const a = host();
  await a.make();
  await a.settle();
  assert.deepEqual([a.room.sources.length, a.storage.get("sourcesSig")], [1, "[]"], "a first wake tells the Room once");
  const again = await a.make();
  await a.settle();
  assert.equal(a.room.sources.length, 1, "nothing changed while it slept: nothing resent");
  const live = again.env.ROOM;
  again.env.ROOM = { getByName: () => ({ audienceSources: async () => { throw new Error("room down"); } }) };
  again.media.chatSources = () => list;
  again.sourcesChanged();
  await a.settle();
  assert.deepEqual([again.sourcesSig, a.storage.get("sourcesSig")], [null, "[]"], "a failed send is not counted as told");
  again.env.ROOM = live;
  again.sourcesChanged();
  await a.settle();
  assert.deepEqual(plain(a.room.sources.at(-1)), list);
  assert.equal(a.storage.get("sourcesSig"), JSON.stringify(list));
});

test("cleanup: two runs over one job never remove another, and tracks found through getSession are retried until closed", async () => {
  const a = await host().make();
  for (const id of ["sA", "sB", "sC"]) sfu.sessions.set(id, new Map([["0", { status: "active" }], ["1", { status: "active" }]]));
  const jobA = { session: "sA", mids: ["0"], all: false, at: Date.now(), tries: 0 };
  const jobB = { session: "sB", mids: ["0"], all: false, at: Date.now(), tries: 0 };
  a.media.cleanup.push(jobA, jobB);
  await Promise.all([a.media.runCleanup(jobA), a.media.runCleanup(jobA)]);
  assert.deepEqual(a.media.cleanup.map((j) => j.session), ["sB"], "the second run's removal finds its job gone and touches nothing else");
  a.media.cleanup.splice(0);
  const jobC = { session: "sC", mids: [], all: true, at: Date.now(), tries: 0 };
  a.media.cleanup.push(jobC);
  sfu.failMids.add("1");
  await a.media.runCleanup(jobC);
  assert.deepEqual([a.media.cleanup.includes(jobC), jobC.mids, jobC.all], [true, ["1"], false], "a track getSession found that failed to close is kept");
  sfu.failMids.clear();
  await a.media.runCleanup(jobC);
  assert.deepEqual([a.media.cleanup.length, openMids("sC")], [0, []]);
});

test("regression: a retired publication leaves the island's sources before it is closed, so no island listener pulls a closed session", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1));
  await speak(a, amy);
  const pub = a.media.states.get(amy.connection).pub;
  assert.deepEqual(h.room.sources.at(-1).map((s) => s.id), [1]);
  let openWhenTold = null;
  const push = h.room.sources.push.bind(h.room.sources);
  h.room.sources.push = (list) => { if (openWhenTold === null && !list.length) openWhenTold = openMids(pub).length; return push(list); };
  assert.equal((await media(a, amy, "publish/close")).status, 200);
  await h.settle();
  assert.equal(openWhenTold, 1, "the Room heard it gone while the publication was still open");
  assert.deepEqual(openMids(pub), [], "and then it was closed");
});

test("regression: an Ooga Chat tab hears at once when the island's voice takes or gives back its account's standing", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2));
  const you = (client) => client.ws.sent.filter((m) => m.type === "you").at(-1);
  await a.world(30, [], ["gh:1"]);
  assert.equal(you(amy).you.speak, "denied", "in the island's voice: Join is held off here");
  assert.equal(you(bea), undefined, "nobody else is told anything");
  await a.world(31, [], []);
  assert.equal(you(amy).you.speak, "eligible", "out of it again: Join opens without waiting for anything else");
  const sent = amy.ws.sent.length;
  await a.world(32, [], []);
  assert.equal(amy.ws.sent.length, sent, "no change, no word");
});

test("regression (#767): relay credentials are answered while the connection's other calls are still at the SFU", async () => {
  const h = host(), a = await h.make();
  const amy = await connect(a, who(1)), bea = await connect(a, who(2));
  await speak(a, amy);
  await media(a, bea, "receive/open");
  let release = null;
  sfu.onNewTracks = () => new Promise((resolve) => { sfu.onNewTracks = null; release = resolve; });
  const syncing = media(a, bea, "receive/sync");
  const first = await Promise.race([media(a, bea, "ice"), syncing.then(() => "sync"), new Promise((resolve) => setTimeout(() => resolve("stuck"), 500))]);
  assert.equal(first.status, 200, "the credentials call does not wait for the sync");
  assert.deepEqual(first.body, {}, "no relay is set up here: an empty answer, and the page keeps its direct candidates");
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  assert.equal((await syncing).status, 200);
  await h.settle();
});
