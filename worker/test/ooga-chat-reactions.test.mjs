// Ooga Chat's reactions, hands and cloud seats (#668): the model's seats and hands, the Audience's reaction fanout and
// limits through a fake host, the clouds it tells the Room, and the Room relaying both ways.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import "./cloudflare-host.mjs";

const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init = {}) { if (init && init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, "status", { value: 101 }); this.webSocket = init.webSocket; } else super(body, init); }
};
const fakeSocket = () => ({ sent: [], readyState: 1, attachment: null, send(t) { this.sent.push(JSON.parse(t)); }, close(code) { this.readyState = 3; this.closed = { code }; },
  serializeAttachment(v) { this.attachment = v === null ? null : structuredClone(v); }, deserializeAttachment() { return this.attachment; } });
globalThis.WebSocketPair = class { constructor() { this[0] = fakeSocket(); this[1] = fakeSocket(); } };
globalThis.WebSocketRequestResponsePair = class {};

const { createAudience } = await import("../src/audience-model.js");
const { SEATS, SEAT_REVISION } = await import("../src/cloud-seats.js");
const { Audience, REACTION_MS, REACT_BURST } = await import("../src/audience.js");
const protocol = await import("../src/protocol.js");
const P = globalThis.BL.reactionPolicy;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("seats: one a speaker from its zone's catalog, kept for the lease, freed with it; a full catalog is no speaker", () => {
  const a = createAudience({ epoch: 1 });
  const speakers = [];
  for (let i = 1; i <= SEATS.main.length + 1; i++) {
    a.connect({ connId: `c${i}`, id: `gh:${i}`, eligible: true }, { provider: "github", login: `p${i}` });
    a.join(`c${i}`, "main");
    a.requestSpeaker(`c${i}`, { eligible: true, generation: i, until: 1, character: `p${i}` });
    speakers.push(a.activate(`c${i}`, i));
  }
  // Eight seats a zone by default; the chat speaker cap and the catalog agree, so the ninth was refused earlier still.
  const seats = [...a.conns.values()].filter((c) => c.lease && c.lease.seat).map((c) => c.lease.seat);
  assert.equal(new Set(seats).size, seats.length, "never two on one seat");
  assert.ok(seats.every((seat) => SEATS.main.includes(seat)));
  const seat = a.conns.get("c1").lease.seat;
  a.setMic("c1", false);
  assert.equal(a.conns.get("c1").lease.seat, seat, "the same seat for the life of the lease");
  a.endLease("c1");
  assert.ok(!a.seatsTaken("main").has(seat));
  a.join("c2", "dsb");
  assert.ok(!a.seatsTaken("main").has("main-cloud-2"), "a real zone change gives the seat up");
  const small = createAudience({ epoch: 1, limits: { listeners: 500, chatSpeakers: 64, connectionsPerIdentity: 3, connections: 1200 } });
  for (let i = 1; i <= SEATS.dsb.length + 1; i++) {
    small.connect({ connId: `d${i}`, id: `gh:${i}`, eligible: true }, { provider: "github", login: `p${i}` });
    small.join(`d${i}`, "dsb");
    small.requestSpeaker(`d${i}`, { eligible: true, generation: i, until: 1 });
  }
  const results = [...small.conns.keys()].map((id, i) => small.activate(id, i + 1));
  assert.deepEqual(results.at(-1), { ok: false, code: "speaker_capacity", retryable: true }, "past the catalog, never a shared seat");
});

test("hands: an active speaker's alone, in the roster with its emoji, gone with the lease or a zone change, and lowering always works", () => {
  const a = createAudience({ epoch: 1 });
  a.connect({ connId: "c1", id: "gh:1", eligible: true }, { provider: "github", login: "amy" });
  a.join("c1", "main");
  a.commit();
  assert.equal(a.setHand("c1", "✋").code, "capability_required", "a listener raises nothing");
  assert.equal(a.setHand("c1", "").ok, true, "lowering is always safe");
  a.requestSpeaker("c1", { eligible: true, generation: 1, until: 1 });
  assert.equal(a.setHand("c1", "✋").code, "capability_required", "pending is not yet a speaker");
  a.activate("c1", 1);
  a.commit();
  assert.equal(a.setHand("c1", "🎤").ok, true);
  assert.equal(a.commit()[0].upsert[0].hand, "🎤");
  assert.equal(a.setHand("c1", "🎤").changed, false);
  a.join("c1", "dsb");
  a.commit();
  assert.equal(a.conns.get("c1").hand, "", "a real zone change lowers it");
});

const host = (features = "bridge,outdoor,cloud") => {
  const storage = new Map(), sockets = [], tasks = [], room = { reactions: [], clouds: [] };
  let alarm = null;
  const ctx = { id: { name: "audience" }, setWebSocketAutoResponse() {}, waitUntil: (t) => tasks.push(t), blockConcurrencyWhile(fn) { this.ready = fn(); },
    acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => ws.readyState <= 1),
    storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); }, delete: async (k) => storage.delete(k),
      list: async ({ prefix }) => new Map([...storage].filter(([k]) => k.startsWith(prefix))), getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } } };
  const env = { OOGA_CHAT_FEATURES: features, ROOM: { getByName: () => ({ audienceReaction: async (e) => room.reactions.push(e), audienceClouds: async (c) => room.clouds.push(c),
    audienceDelta: async () => {}, audienceSources: async () => {}, audienceListeners: async () => {}, audienceConfirmed: async () => {} }) } };
  const make = async () => {
    const a = new Audience(ctx, env);
    await ctx.ready;
    a.contributorFor = Object.assign(async (login) => (login.startsWith("dev") ? { handle: `${login}-ooga` } : null), { fresh: () => true });
    return a;
  };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  return { room, make, settle, storage };
};
const who = (n, extra = {}) => ({ principal: `pr_${String(n).padStart(22, "a")}`, provider: "github", providerUserId: String(n), login: `dev${n}`, display: `Dev ${n}`,
  avatar: null, eligible: true, sessionExpiresAt: Date.now() + 3600000, ...extra });
const join = async (a, principal, zone = "main") => {
  await a.fetch(new Request("https://a/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(principal) } }));
  const ws = [...a.sockets.values()].at(-1);
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone, protocol: 1 }));
  return ws;
};
const say = (a, ws, msg) => a.webSocketMessage(ws, JSON.stringify(msg));
const events = (ws) => ws.sent.filter((m) => m.type === "reaction");
const speakNow = async (a, ws) => {
  await say(a, ws, { type: "setRole", requestId: 900, role: "speaker" });
  const c = [...a.model.conns.values()].find((x) => a.sockets.get(x.connId) === ws);
  a.model.activate(c.connId, c.lease.generation);
  a.save(c.connId);
  await a.flush();
  return c;
};

test("reactions: from anyone in the zone, each occurrence its own event and lifetime, a retry never a second, nothing kept", async () => {
  const h = host(), a = await h.make();
  const x = await join(a, who(9, { provider: "x", providerUserId: "77", login: "xan", eligible: false }));
  const amy = await join(a, who(1)), far = await join(a, who(2), "dsb");
  await say(a, x, { type: "reaction", requestId: 1, emoji: "🔥" });
  await say(a, x, { type: "reaction", requestId: 2, emoji: "🔥" });
  await say(a, x, { type: "reaction", requestId: 2, emoji: "🔥" });
  const seen = events(amy);
  assert.equal(seen.length, 2, "two identical reactions are two events; the retried request is not a third");
  assert.notEqual(seen[0].eventId, seen[1].eventId);
  assert.deepEqual({ participantId: seen[0].participantId, zone: seen[0].zone, emoji: seen[0].emoji, life: seen[0].expiresAt - seen[0].at },
    { participantId: "x:77", zone: "main", emoji: "🔥", life: REACTION_MS }, "an X listener reacts too");
  assert.equal(events(far).length, 0, "the other zone sees nothing");
  for (const bad of ["<b>x</b>", "hello", "🔥🔥", ""]) {
    await say(a, x, { type: "reaction", requestId: 10 + bad.length, emoji: bad });
    assert.equal(x.sent.filter((m) => m.type === "result").at(-1).error.code, "malformed", bad);
  }
  for (let i = 0; i < REACT_BURST + 2; i++) await say(a, amy, { type: "reaction", requestId: 100 + i, emoji: P.toned("👍", 2) });
  assert.equal(events(x).filter((e) => e.participantId === "gh:1").length, REACT_BURST, "past the burst, refused");
  assert.equal(amy.sent.filter((m) => m.type === "result").at(-1).error.code, "rate_limited");
  // A reconnect's snapshot has hands, never old reactions.
  const late = await join(a, who(3));
  assert.equal(events(late).length, 0);
  assert.ok(!JSON.stringify(late.sent.find((m) => m.type === "snapshot")).includes("🔥"));
  await h.settle();
  assert.equal(h.room.reactions.length, 0, "the Room hears reactions only for a zone it shows");
});

test("hands over the wire: a listener's is refused, a speaker's is in everyone's roster in its tone, and it survives a wake", async () => {
  const h = host(), a = await h.make();
  const amy = await join(a, who(1)), bea = await join(a, who(2));
  await say(a, bea, { type: "hand", requestId: 1, on: true });
  assert.equal(bea.sent.filter((m) => m.type === "result").at(-1).error.code, "capability_required");
  await speakNow(a, amy);
  await say(a, amy, { type: "hand", requestId: 2, on: true, tone: 3 });
  const row = bea.sent.filter((m) => m.type === "delta").at(-1).upsert.find((r) => r.id === "gh:1");
  assert.equal(row.hand, P.toned(P.HAND, 3));
  await say(a, amy, { type: "hand", requestId: 3, on: true, emoji: "🎤" });
  assert.equal(bea.sent.filter((m) => m.type === "delta").at(-1).upsert[0].hand, "🎤", "a pinned emoji (hand-emoji-v1)");
  await say(a, amy, { type: "hand", requestId: 4, on: true, tone: 9 });
  assert.equal(amy.sent.filter((m) => m.type === "result").at(-1).error.code, "malformed");
  const woken = await h.make();
  assert.equal(woken.model.zones.main.rows.get("gh:1").hand, "🎤", "kept through hibernation, once");
  await say(woken, amy, { type: "setRole", requestId: 5, role: "listener" });
  assert.equal(woken.model.zones.main.rows.get("gh:1").hand, "", "leaving speaking lowers it");
});

test("clouds: an active speaker on a catalog seat with its canonical character goes to the Room; off with the switch", async () => {
  const h = host(), a = await h.make();
  const amy = await join(a, who(1));
  const c = await speakNow(a, amy);
  await h.settle();
  assert.deepEqual(plain(h.room.clouds.at(-1)), [{ id: "gh:1", character: "dev1-ooga", zone: "main", seat: "main-cloud-1", seatRevision: SEAT_REVISION,
    lease: c.lease.generation, mic: "muted", hand: "", login: "dev1", display: "Dev 1" }], "the island's character for that account, never one the client named");
  await say(a, amy, { type: "setMic", requestId: 2, muted: false });
  await h.settle();
  assert.equal(h.room.clouds.at(-1)[0].mic, "on");
  await say(a, amy, { type: "setRole", requestId: 3, role: "listener" });
  await h.settle();
  assert.deepEqual(h.room.clouds.at(-1), [], "the cloud goes with the lease");
  const off = host("bridge,outdoor"), b = await off.make();
  await speakNow(b, await join(b, who(2)));
  await off.settle();
  assert.equal(off.room.clouds.length, 0, "with the island's `cloud` switch off, no cloud is drawn");
});

// The Room's relay, run as the other Room checks run it.
const roomHarness = async (features = "bridge,outdoor,cloud") => {
  const accepted = [], saved = new Map();
  let ready = null;
  const sock = () => ({ sent: [], closed: null, store: null, send(t) { if (typeof t === "string") this.sent.push(JSON.parse(t)); }, close(code) { this.closed = { code }; },
    serializeAttachment(v) { this.store = JSON.parse(JSON.stringify(v)); }, deserializeAttachment() { return this.store; } });
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, sha256Hex: async () => "x", getPlayer: async () => null, sfuClient: () => null, deliverHighscores: async () => {},
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }], DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair: class { constructor() { this[0] = sock(); this[1] = sock(); } }, Response: class { constructor(b, i = {}) { this.status = i.status; } },
    WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView, Headers, Promise, ...(await import("../src/studio-policy.js")) };
  runInNewContext(source, context);
  const audience = { worlds: [], island: [] };
  const stub = { world: async (seq, speakers) => { audience.worlds.push(plain(speakers)); return { ok: true, pending: [] }; }, watch: async () => {},
    snapshot: async (zone) => ({ zone, epoch: 1, rev: 0, rows: [] }), islandReaction: async (e) => { audience.island.push(e); return { ok: true }; } };
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); }, acceptWebSocket: (ws) => accepted.push(ws), waitUntil() {},
    getWebSockets: () => accepted.filter((ws) => !ws.closed), storage: { get: async (k) => (Array.isArray(k) ? new Map() : saved.get(k)), put: async (k, v) => { saved.set(k, v); }, getAlarm: async () => null, setAlarm: async () => {} } };
  const env = { OOGA_CHAT_FEATURES: features, AUDIENCE: { getByName: () => stub } };
  const room = new context.Room(ctx, env);
  await ready;
  // The same Room woken from hibernation: a new object over the same storage.
  const wake = async () => { const woken = new context.Room(ctx, env); await ready; return woken; };
  room.sfu = { closeTracks: async (s, mids) => ({ tracks: mids.map((mid) => ({ mid })) }), getSession: async () => ({ tracks: [] }), newTracks: async () => ({ tracks: [] }) };
  const send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
  const join = async (id, login) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    const ws = accepted[before];
    room.players.get(id).voice = { pub: `pub${id}`, sub: `sub${id}`, track: "mic", gen: 1, mids: {}, pubMid: "0" };
    await send(ws, { t: "body", name: login });
    await send(ws, { t: "zone", name: "outside" });
    return ws;
  };
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
  return { room, join, send, audience, settle, wake, accepted };
};

test("the island: Ooga Chat reactions reach its panels and open grants once each; its speakers' reactions and hands reach Ooga Chat", async () => {
  const h = await roomHarness();
  const viewer = await h.join(1, "a"), speaker = await h.join(2, "b");
  assert.ok(viewer.sent.find((m) => m.t === "welcome").features.includes("cloud-seats-v1"));
  assert.deepEqual(viewer.sent.find((m) => m.t === "clouds"), { t: "clouds", v: 1, revision: 0, clouds: [] }, "a welcome is followed by the clouds now");
  await h.send(viewer, { t: "audience-view", v: 1, zone: "main" });
  await h.send(speaker, { t: "outdoor", v: 1, op: "enter", epoch: 1, scope: "main" });
  h.room.audienceReaction({ type: "reaction", eventId: "r9", participantId: "gh:77", zone: "main", epoch: 1, emoji: "🔥" });
  h.room.audienceReaction({ type: "reaction", eventId: "r10", participantId: "x:12345678901234567890", zone: "main", epoch: 1, emoji: "😂" });
  const panel = viewer.sent.filter((m) => m.t === "audience" && m.kind === "react");
  assert.deepEqual(panel.map((m) => [m.id, m.e, m.rid]), [["gh:77", "🔥", "r9"], ["x:12345678901234567890", "😂", "r10"]]);
  const outdoor = speaker.sent.filter((m) => m.t === "outdoor" && m.op === "react");
  assert.deepEqual(outdoor.map((m) => [m.id, m.e, m.rid, m.epoch]), [[77, "🔥", "r9", 1]], "the page's bridge takes account ids; an X id outgrows one, so it shows in the panel alone");
  h.room.audienceReaction({ type: "reaction", eventId: "r11", participantId: "gh:5", zone: "dsb", epoch: 1, emoji: "🔥" });
  assert.equal(viewer.sent.filter((m) => m.kind === "react").length, 2, "another zone's reaction is not this panel's");
  // The island's speaker reacts and raises a hand: Ooga Chat's listeners in its zone see both.
  await h.send(speaker, { t: "react", e: "👏" });
  await h.settle();
  assert.deepEqual(h.audience.island.map((e) => [e.participantId, e.zone, e.emoji]), [["gh:2", "main", "👏"]]);
  await h.send(speaker, { t: "hand", on: true, tone: 2, e: "" });
  await h.settle();
  assert.equal(h.audience.worlds.at(-1).find((s) => s.id === "gh:2").hand, P.toned(P.HAND, 2));
  // A reaction from a player with no grant stays on the island.
  await h.send(viewer, { t: "react", e: "👏" });
  await h.settle();
  assert.equal(h.audience.island.length, 1);
});

test("the island: clouds go to every page, with their seats and characters; the switch off keeps them out", async () => {
  const h = await roomHarness();
  const a = await h.join(1, "a");
  h.room.audienceClouds([{ id: "gh:9", character: "nine", zone: "main", seat: "main-cloud-1", seatRevision: SEAT_REVISION, lease: 5, mic: "on", hand: "" },
    { id: "x:9", character: "x", zone: "main", seat: "main-cloud-2" }]);
  const clouds = a.sent.filter((m) => m.t === "clouds").at(-1);
  assert.deepEqual(clouds.clouds.map((c) => [c.id, c.seat]), [["gh:9", "main-cloud-1"]], "only GitHub speakers sit on clouds");
  assert.ok(clouds.revision > 0);
  const off = await roomHarness("bridge,outdoor");
  const b = await off.join(1, "a");
  off.room.audienceClouds([{ id: "gh:9", character: "nine", zone: "main", seat: "main-cloud-1" }]);
  assert.equal(b.sent.filter((m) => m.t === "clouds").length, 0);
  assert.ok(!b.sent.find((m) => m.t === "welcome").features.includes("cloud-seats-v1"));
});

test("clouds outlast a Room's hibernation, at their revision; the Audience resends them when a send fails", async () => {
  const h = await roomHarness();
  const cloud = { id: "gh:9", character: "nine", zone: "main", seat: "main-cloud-1", seatRevision: SEAT_REVISION, lease: 5, mic: "on", hand: "" };
  await h.room.audienceClouds([cloud]);
  const rev = h.room.cloudsRev;
  const woken = await h.wake();
  assert.deepEqual([plain(woken.clouds), woken.cloudsRev], [[cloud], rev], "a woken Room still has them");
  await woken.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": "2", "x-player-login": "b", "x-player-contributor": "0" }) });
  const ws = h.accepted.at(-1);
  assert.equal(woken.players.get(2).ws, ws, "a page connected to the woken Room");
  const welcomed = ws.sent.filter((m) => m.t === "clouds").at(-1);
  assert.deepEqual([welcomed.revision, welcomed.clouds.map((c) => c.id)], [rev, ["gh:9"]], "and welcomes a page with them");
  const a = host();
  const aud = await a.make();
  const live = aud.env.ROOM;
  aud.env.ROOM = { getByName: () => ({ audienceClouds: async () => { throw new Error("room down"); } }) };
  aud.clouds = () => [cloud];
  aud.cloudsChanged();
  await a.settle();
  assert.equal(aud.cloudsSig, null, "a failed send is not counted as told");
  aud.env.ROOM = live;
  aud.cloudsChanged();
  await a.settle();
  assert.deepEqual(plain(a.room.clouds.at(-1)), [cloud]);
  assert.equal(a.storage.get("cloudsSig"), JSON.stringify([cloud]));
});
