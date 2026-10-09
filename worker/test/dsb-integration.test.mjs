import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { sfuClient } from "../src/sfu.js";

const zones = ["dsb-outside", "dsb-studio", "dsb-maxis", "dsb-without-rulers", "dsb-proof-of-ink", "dsb-big-bitcoin", "dsb-meme-factory", "dsb-stackchain", "dsb-svrn"];
test("every DSB venue isolates voice from other venues, hub and Bifrost", () => {
  const player = (id, zone) => ({ id, zone, body: `ooga-${id}`, voice: { sub: "receive", track: "mic" } });
  for (const zone of zones) {
    assert.deepEqual(protocol.parseClientMessage(JSON.stringify({ t: "zone", name: zone })), { t: "zone", name: zone });
    const peers = [player(1, zone), player(2, zone), ...zones.filter(z => z !== zone).map((z, i) => player(i + 3, z)), player(20, "outside"), player(21, "scene-bifrost")];
    assert.deepEqual(protocol.voicePeers(peers).get(1), [2]);
    peers[0].zone = "scene-bifrost";
    assert.deepEqual(protocol.voicePeers(peers).get(1), [21]);
    peers[0].body = null;
    assert.deepEqual(protocol.voicePeers(peers).get(1), []);
  }
});

// Execute the real room methods with a minimal Cloudflare host, sockets and SFU mocked.
const roomClass = () => {
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }, WebSocketRequestResponsePair: class {}, sfuClient, CAST_ROWS: [{ handle: "YellowBrokeIt", github_login: "YellowBrokeIt" }], Date, Map, Set, Response, Promise, setTimeout, clearTimeout };
  runInNewContext(source, context);
  return context.Room;
};
test("room broadcasts DSB zone changes, persists them and keeps ownership enforcement", () => {
  const Room = roomClass(), room = Object.create(Room.prototype), sent = [];
  room.players = new Map(); room.voiceSig = new Map();
  let attachment;
  const ws = { deserializeAttachment: () => ({ id: 1 }), serializeAttachment: value => { attachment = value; }, send: text => sent.push(JSON.parse(text)) };
  const player = room.record(ws, { id: 1, login: "YellowBrokeIt", display: "Yellow", body: "YellowBrokeIt", x: -45, y: 40, z: -43, yaw: 0 });
  room.players.set(1, player);
  room.webSocketMessage(ws, JSON.stringify({ t: "zone", name: "dsb-svrn" }));
  assert.equal(room.view(player).zone, "dsb-svrn");
  assert.equal(attachment.zone, "dsb-svrn");
  assert.ok(sent.some(m => m.t === "zone" && m.id === 1 && m.name === "dsb-svrn"));
  room.webSocketMessage(ws, JSON.stringify({ t: "body", name: "someone-else" }));
  assert.equal(player.body, null);
  assert.ok(sent.some(m => m.t === "release" && m.reason === "not-yours"));
  room.webSocketMessage(ws, JSON.stringify({ t: "zone", name: "scene-bifrost" }));
  assert.equal(room.view(player).zone, "scene-bifrost");
});

test("voice lists survive the room sleeping and follow a microphone published again", () => {
  const Room = roomClass();
  const socket = (id, store) => ({ sent: [], deserializeAttachment: () => store.a, serializeAttachment(value) { store.a = JSON.parse(JSON.stringify(value)); }, send(text) { this.sent.push(JSON.parse(text)); } });
  const stores = { 1: {}, 2: {} }, sockets = { 1: socket(1, stores[1]), 2: socket(2, stores[2]) };
  const wake = () => {
    const room = Object.create(Room.prototype);
    room.sfu = {};
    room.players = new Map();
    for (const id of [1, 2]) if (stores[id].a) room.players.set(id, room.record(sockets[id], stores[id].a));
    return room;
  };
  const room = Object.create(Room.prototype);
  room.sfu = {};
  room.players = new Map();
  for (const id of [1, 2]) {
    const p = room.record(sockets[id], { id, login: `p${id}`, display: `p${id}`, body: `ooga-${id}`, zone: "factory.hall", x: 0, y: 0, z: 0, yaw: 0 });
    p.voice = { pub: `pub${id}`, sub: `sub${id}`, track: "mic", gen: 10 + id };
    room.players.set(id, p);
    sockets[id].serializeAttachment(room.attachment(p));
  }
  room.updateVoice();
  const last = (id) => sockets[id].sent.filter((m) => m.t === "voice").at(-1);
  assert.deepEqual(last(1), { t: "voice", peers: [2], gens: [12] });
  // Asleep and woken: the room still knows what it sent, so nothing repeats...
  const woken = wake();
  const before = sockets[1].sent.length;
  woken.updateVoice();
  assert.equal(sockets[1].sent.length, before);
  // ...and when the other leaves, the list that just went empty is sent (it used to be assumed sent).
  woken.players.delete(2);
  woken.updateVoice();
  assert.deepEqual(last(1), { t: "voice", peers: [], gens: [] });
  // The other back with a microphone published again: a new count, so the listener pulls it anew.
  const back = woken.record(sockets[2], { id: 2, login: "p2", display: "p2", body: "ooga-2", zone: "factory", x: 0, y: 0, z: 0, yaw: 0 });
  back.voice = { pub: "pub2b", sub: "sub2b", track: "mic", gen: 99 };
  woken.players.set(2, back);
  woken.updateVoice();
  assert.deepEqual(last(1), { t: "voice", peers: [2], gens: [99] }, "the tunnel and the hall share voice");
});

test("SFU stays unavailable without secrets and uses bounded upstream calls with mocked transport", async () => {
  assert.equal(sfuClient({}), null);
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ sessionId: "fixture" }) }; };
  try {
    const client = sfuClient({ REALTIME_APP_ID: "fixture-app", REALTIME_SECRET: "fixture-only" });
    await client.newSession(); await client.newTracks("fixture", { tracks: [] });
    await client.renegotiate("fixture", "fixture-sdp"); await client.closeTracks("fixture", ["0"]);
    assert.deepEqual(calls.map(c => c.options.method), ["POST", "POST", "PUT", "PUT"]);
    assert.ok(calls.every(c => c.url.startsWith("https://rtc.live.cloudflare.com/v1/apps/fixture-app/sessions/")));
    assert.equal(JSON.parse(calls[3].options.body).force, true);
  } finally { globalThis.fetch = original; }
});

const studioRoom = () => {
  const Room = roomClass(), room = Object.create(Room.prototype);
  room.players = new Map(); room.studio = studio.studioState(1000); room.env = { STUDIO_HOST_IDS: "1,3" }; room.cleanupJobs = [];
  const pending = [], storage = new Map();
  room.ctx = { waitUntil: p => pending.push(p), storage: { put: async (k, v) => storage.set(k, structuredClone(v)), getAlarm: async () => null, setAlarm: async () => {} } };
  room.sfu = { closeTracks: async (_session, mids) => ({ tracks: mids.map(mid => ({ mid })) }), getSession: async () => ({ tracks: [] }) };
  const add = (id, fields = {}) => {
    const ws = { sent: [], send(text) { this.sent.push(JSON.parse(text)); }, serializeAttachment() {} };
    const p = room.record(ws, { id, login: `synthetic-${id}`, zone: studio.STUDIO_ZONE, x: -2.4, y: .75, z: -2.1, body: `synthetic-${id}`, connectionToken: `token-${id}`, ...fields });
    room.players.set(id, p); return p;
  };
  const call = (p, op, body) => room.voiceRequest(op, new Request(`https://example.test/voice/${op}`, { method: "POST", headers: { "x-player-id": String(p.id), "x-room-token": p.connectionToken }, body: JSON.stringify(body) }));
  return { room, add, call, pending, storage };
};

test("Studio host, seat, playback and transfer permissions remain separate from NPC host", () => {
  const { room, add } = studioRoom(), host = add(1), attendee = add(2), next = add(3);
  room.hostId = 2;
  room.studioCommand(attendee, { action: "claim" }); assert.equal(room.studio.hostId, 0);
  room.studioCommand(host, { action: "claim", commandId: "claim1" }); assert.equal(room.studio.hostId, 1);
  const revision = room.studio.revision;
  room.studioCommand(host, { action: "claim", commandId: "claim1" }); assert.equal(room.studio.revision, revision);
  room.studioCommand(attendee, { action: "seat", seat: 0 }); assert.equal(attendee.studioSeat, 0);
  room.studioCommand(next, { action: "seat", seat: 0 }); assert.equal(next.studioSeat, undefined);
  assert.equal(studio.studioCanSpeak(room.studio, attendee), true);
  room.studioCommand(host, { action: "mode", mode: "presentation" });
  assert.equal(studio.studioCanSpeak(room.studio, attendee), false);
  room.studioCommand(attendee, { action: "play" }); assert.equal(room.studio.playing, false);
  room.studioCommand(host, { action: "transfer", id: 2 }); assert.equal(room.studio.hostId, 1);
  room.studioCommand(host, { action: "transfer", id: 3 }); assert.equal(room.studio.hostId, 3);
  room.leaveStudio(next); assert.equal(room.studio.mode, "suspended"); assert.equal(room.studio.playing, false);
});

test("Studio receive-only listener hears host but unseated/presentation microphones are denied", async () => {
  const { room, add, call } = studioRoom(), host = add(1), listener = add(2, { body: null });
  room.studio.hostId = 1; room.studio.mode = "presentation";
  host.voice = { pub: "host", track: "mic", sub: "h", gen: 1 };
  room.sfu.newSession = async () => ({ sessionId: "listener" });
  assert.equal((await call(listener, "session", { kind: "sub" })).status, 200);
  assert.deepEqual(protocol.voicePeers([...room.players.values()], room.studio).get(2), [1]);
  assert.equal((await call(listener, "session", { kind: "pub" })).status, 403);
  const stale = await room.voiceRequest("session", new Request("https://example.test", { method: "POST", headers: { "x-player-id": "2", "x-room-token": "old-tab" }, body: '{}' }));
  assert.equal(stale.status, 409);
});

test("presentation revokes existing publications and subscriptions without trusting attendees", async () => {
  const { room, add, pending } = studioRoom(), host = add(1), speaker = add(2), listener = add(3);
  room.studio.hostId = 1; room.studio.mode = "discussion"; speaker.studioSeat = 0;
  speaker.voice = { pub: "speaker-session", pubMid: "0", track: "mic", gen: 1, mids: {} };
  listener.voice = { sub: "listener-session", mids: { "7": 2 }, gen: 0 };
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, mids]); return { tracks: mids.map(mid => ({ mid })) }; };
  room.studioCommand(host, { action: "mode", mode: "presentation" });
  assert.equal(speaker.voice.pub, null); assert.equal(speaker.voice.track, null);
  await Promise.all(pending); await room.retryCleanup();
  assert.ok(closed.some(([s, mids]) => s === "speaker-session" && mids.includes("0")));
  assert.ok(closed.some(([s, mids]) => s === "listener-session" && mids.includes("7")));
});

test("late publication cannot resurrect a revoked microphone and its allocated MID is closed", async () => {
  const { room, add, call } = studioRoom(), host = add(1), speaker = add(2);
  room.studio.hostId = 1; room.studio.mode = "discussion"; speaker.studioSeat = 0;
  speaker.voice.pub = "pending-session";
  let finish; room.sfu.newTracks = () => new Promise(resolve => { finish = resolve; });
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, mids]); return { tracks: mids.map(mid => ({ mid })) }; };
  const request = call(speaker, "publish", { sdp: "synthetic", mid: "0" });
  await new Promise(resolve => setImmediate(resolve));
  room.studioCommand(host, { action: "mode", mode: "presentation" });
  finish({ tracks: [{ mid: "9" }], sessionDescription: { type: "answer", sdp: "synthetic" } });
  assert.equal((await request).status, 409); await room.retryCleanup();
  assert.equal(speaker.voice.track, null);
  assert.ok(closed.some(([s, mids]) => s === "pending-session" && mids.includes("9")));
});

test("failed and uncertain closures retain durable cleanup ownership for retry", async () => {
  const { room, storage } = studioRoom();
  room.sfu.closeTracks = async () => ({ tracks: [{ mid: "0", errorCode: "temporarily_unavailable" }] });
  await room.queueClose("synthetic-session", ["0"]);
  assert.equal(room.cleanupJobs.length, 1); assert.equal(storage.get("voiceCleanup").length, 1);
  room.sfu.closeTracks = async () => ({ tracks: [{ mid: "0" }] });
  await room.retryCleanup(); assert.equal(room.cleanupJobs.length, 0);
  let active = true;
  room.sfu.getSession = async () => ({ tracks: [{ mid: "4", status: active ? "active" : "inactive" }] });
  room.sfu.closeTracks = async (_session, mids) => { active = false; return { tracks: mids.map(mid => ({ mid })) }; };
  await room.queueClose("uncertain-session", [], true);
  assert.equal(room.cleanupJobs.length, 1); assert.deepEqual([...room.cleanupJobs[0].mids], []);
  room.cleanupJobs[0].inspectUntil = 0; await room.retryCleanup(); assert.equal(room.cleanupJobs.length, 0);
});

test("receive-only Studio departure forcibly closes subscriptions and moderation survives reentry", async () => {
  const { room, add, pending } = studioRoom(), host = add(1), listener = add(2, { body: null });
  room.studio.hostId = 1; room.studio.mode = "discussion";
  host.voice = { pub: "host-pub", pubMid: "0", track: "mic", gen: 1 };
  listener.voice = { sub: "listener-sub", mids: { "5": 1 }, gen: 0 };
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, mids]); return { tracks: mids.map(mid => ({ mid })) }; };
  listener.ws.deserializeAttachment = () => ({ id: 2 });
  room.webSocketMessage(listener.ws, JSON.stringify({ t: "zone", name: "outside" }));
  await Promise.all(pending); await room.retryCleanup();
  assert.ok(closed.some(([session, mids]) => session === "listener-sub" && mids.includes("5")));
  listener.zone = studio.STUDIO_ZONE; listener.body = "synthetic"; listener.studioSeat = 0;
  room.studioCommand(host, { action: "revoke", id: 2 });
  room.leaveStudio(listener); listener.zone = studio.STUDIO_ZONE; listener.studioSeat = 0;
  assert.equal(studio.studioCanSpeak(room.studio, listener), false);
  const rejoined = { ...listener, studioRevoked: false }; assert.equal(studio.studioCanSpeak(room.studio, rejoined), false);
});

test("banned accounts lose their socket and media on the bounded account sweep", async () => {
  const { room, add, pending } = studioRoom(), host = add(1);
  room.studio.hostId = 1; room.studio.mode = "presentation";
  host.voice = { pub: "banned-pub", pubMid: "0", track: "mic", gen: 1 };
  host.ws.close = () => {};
  room.ctx.getWebSocketAutoResponseTimestamp = () => null;
  room.env.DB = { prepare: () => ({ bind: () => ({ first: async () => ({ id: 1, banned_at: 1 }) }) }) };
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, mids]); return { tracks: mids.map(mid => ({ mid })) }; };
  await room.alarm(); await Promise.all(pending); await room.retryCleanup();
  assert.equal(room.players.size, 0); assert.equal(room.studio.mode, "suspended");
  assert.ok(closed.some(([session]) => session === "banned-pub"));
});

test("transfer closes both host microphones and rejects the old in-flight publication", async () => {
  const { room, add, call, pending } = studioRoom(), host = add(1), next = add(3);
  room.studio.hostId = 1; room.studio.mode = "discussion"; host.studioSeat = 0;
  host.voice.pub = "old-host"; next.voice.pub = "new-host"; next.voice.pubMid = "1";
  let finish; room.sfu.newTracks = () => new Promise(resolve => { finish = resolve; });
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, mids]); return { tracks: mids.map(mid => ({ mid })) }; };
  const request = call(host, "publish", { sdp: "synthetic", mid: "0" });
  await new Promise(resolve => setImmediate(resolve));
  room.studioCommand(host, { action: "transfer", id: 3 });
  finish({ tracks: [{ mid: "0" }] });
  assert.equal((await request).status, 409); await Promise.all(pending); await room.retryCleanup();
  assert.equal(host.voice.track, null); assert.equal(next.voice.pub, null);
  assert.ok(closed.some(([session]) => session === "new-host"));
});

test("inspection retention never closes successful MIDs twice and partial results retain only failures", async () => {
  const { room } = studioRoom(), active = new Set(["0", "1"]), calls = [];
  room.sfu.getSession = async () => ({ tracks: [...active].map(mid => ({ mid, status: "active" })) });
  let first = true;
  room.sfu.closeTracks = async (_session, mids) => {
    calls.push([...mids]);
    return { tracks: mids.map(mid => {
      assert.ok(active.has(mid), "must not close an already inactive MID");
      if (mid === "1" && first) return { mid, errorCode: "retry" };
      active.delete(mid); return { mid };
    }) };
  };
  await room.queueClose("synthetic", ["0", "1"], true);
  assert.deepEqual([...room.cleanupJobs[0].mids], ["1"]);
  first = false; await room.retryCleanup();
  assert.deepEqual(calls, [["0", "1"], ["1"]]);
  assert.deepEqual([...room.cleanupJobs[0].mids], []);
  room.cleanupJobs[0].inspectUntil = 0; await room.retryCleanup();
  assert.equal(room.cleanupJobs.length, 0); assert.equal(calls.length, 2);
  room.sfu.closeTracks = async () => ({});
  await room.queueClose("malformed", ["2"]);
  assert.deepEqual([...room.cleanupJobs[0].mids], ["2"], "missing acknowledgements retain ownership");
});

test("reviewed catalogue rejects arbitrary sources and playback uses each clip's duration", () => {
  assert.deepEqual(studio.STUDIO_SOURCES.map(row => row.id), ["sample", "sample-quiet"]);
  const sample = studio.STUDIO_SOURCES[0];
  for (const changed of [{ url: "https://unapproved.invalid/video.mp4" }, { url: "/media/../secret.mp4" }, { duration: Infinity }, { duration: -1 }, { captions: "https://unapproved.invalid/captions.vtt" }]) assert.deepEqual(studio.validateStudioCatalogue([{ ...sample, ...changed }]), []);
  assert.deepEqual(studio.validateStudioCatalogue([sample, sample]), []);
  assert.equal(protocol.parseClientMessage(JSON.stringify({ t: "studio", action: "source", source: "https://unapproved.invalid/video.mp4" })), null);
  const { room, add } = studioRoom(), host = add(1);
  room.studioCommand(host, { action: "claim" });
  room.studioCommand(host, { action: "source", source: "sample-quiet" });
  assert.equal(room.studio.source, "sample-quiet");
  room.studioCommand(host, { action: "seek", position: 10 }); assert.equal(room.studio.position, 0);
  room.studioCommand(host, { action: "seek", position: 8 }); assert.equal(room.studio.position, 8);
  room.studioCommand(host, { action: "play" }); assert.equal(room.studio.position, 0);
  assert.equal(studio.studioPosition({ ...room.studio, position: 7, at: 1000, playing: true }, 4000), 8);
});

test("explicit empty or malformed host configuration fails closed, including an existing host", async () => {
  assert.equal(studio.studioHostAllowed({}, 321615163), false, "missing configuration never grants an implicit host");
  for (const value of ["", " ", "1,bad", "1,", "0,1", "-1,1", "1.0", "9007199254740992", 1]) assert.equal(studio.studioHostAllowed({ STUDIO_HOST_IDS: value }, 1), false);
  assert.equal(studio.studioHostAllowed({ STUDIO_HOST_IDS: "1, 3" }, 3), true);
  const { room, add, call } = studioRoom(), host = add(1);
  room.studio.hostId = 1; room.studio.mode = "presentation";
  room.env.STUDIO_HOST_IDS = "";
  room.studioCommand(host, { action: "play" }); assert.equal(room.studio.hostId, 0); assert.equal(room.studio.playing, false);
  room.studio.hostId = 1; room.studio.mode = "presentation";
  assert.equal((await call(host, "session", { kind: "pub" })).status, 403); assert.equal(room.studio.mode, "suspended");
});

test("Q&A requires a raised hand and host invitation, with explicit restoration and fresh mic consent", async () => {
  const { room, add, call } = studioRoom(), host = add(1), speaker = add(2), next = add(3);
  const command = (p, msg) => { p.studioBucket = null; room.studioCommand(p, msg); };
  command(host, { action: "claim" }); command(speaker, { action: "seat", seat: 0 });
  command(host, { action: "mode", mode: "qa" });
  assert.equal(studio.studioCanSpeak(room.studio, speaker), false);
  assert.equal((await call(speaker, "session", { kind: "pub" })).status, 403);
  command(host, { action: "invite", id: 2 }); assert.deepEqual([...room.studio.invited], []);
  command(speaker, { action: "raise" }); command(speaker, { action: "raise" }); assert.deepEqual([...room.studio.hands], [2]);
  command(speaker, { action: "invite", id: 2 }); assert.equal(studio.studioCanSpeak(room.studio, speaker), false);
  command(host, { action: "invite", id: 2 }); assert.equal(studio.studioCanSpeak(room.studio, speaker), true); assert.equal(speaker.voice.pub, null);
  assert.deepEqual([...room.studio.hands], []);
  command(speaker, { action: "lower" }); assert.equal(studio.studioCanSpeak(room.studio, speaker), false);
  command(speaker, { action: "raise" }); command(host, { action: "invite", id: 2 });
  command(host, { action: "revoke", id: 2 }); assert.deepEqual([...room.studio.invited], []); assert.equal(studio.studioCanSpeak(room.studio, speaker), false);
  command(speaker, { action: "restore", id: 2 }); assert.equal(studio.studioCanSpeak(room.studio, speaker), false);
  command(host, { action: "restore", id: 2 }); assert.equal(speaker.studioRevoked, false); assert.equal(studio.studioCanSpeak(room.studio, speaker), false, "restore does not invite or activate a mic");
  command(speaker, { action: "raise" }); command(host, { action: "invite", id: 2 });
  command(speaker, { action: "stand" }); assert.deepEqual([...room.studio.invited], []); assert.deepEqual([...room.studio.hands], []);
  command(speaker, { action: "seat", seat: 0 }); command(speaker, { action: "raise" }); command(host, { action: "invite", id: 2 });
  command(host, { action: "revoke", id: 3 }); command(host, { action: "transfer", id: 3 }); assert.equal(room.studio.hostId, 1, "revoked target requires explicit restore before transfer");
  command(host, { action: "restore", id: 3 }); command(host, { action: "transfer", id: 3 }); assert.equal(room.studio.hostId, next.id); assert.deepEqual([...room.studio.invited], []); assert.deepEqual([...room.studio.hands], []);
});

test("Studio wake migrates old snapshots, clamps catalogue edits and rechecks configured host permissions", async () => {
  const Room = roomClass();
  const wake = async (saved, ids) => {
    const pending = [];
    const attachments = [
      { id: 1, login: "synthetic-host", zone: studio.STUDIO_ZONE, body: "synthetic-host" },
      { id: 2, login: "synthetic-attendee", zone: studio.STUDIO_ZONE, body: "synthetic-attendee", studioSeat: 0 }
    ];
    const sockets = attachments.map(a => ({ deserializeAttachment: () => a, serializeAttachment() {}, send() {} }));
    const ctx = { setWebSocketAutoResponse() {}, getWebSockets: () => sockets, blockConcurrencyWhile: fn => pending.push(fn()), waitUntil: p => pending.push(p), storage: { get: async key => key === "studio" ? structuredClone(saved) : null, put: async () => {} } };
    const room = new Room(ctx, { STUDIO_HOST_IDS: ids }); await Promise.all(pending); return room;
  };
  const legacy = { ...studio.studioState(1000), hostId: 1, mode: "presentation", source: "sample-quiet", position: 99, playing: false };
  delete legacy.hands; delete legacy.invited;
  const disabled = await wake(legacy, "");
  assert.equal(disabled.studio.hostId, 0); assert.equal(disabled.studio.mode, "suspended"); assert.equal(disabled.studio.position, 8);
  assert.deepEqual([...disabled.studio.hands], []); assert.deepEqual([...disabled.studio.invited], []);
  const qa = await wake({ ...studio.studioState(1000), hostId: 1, mode: "qa", hands: [99], invited: [2, 99] }, "1");
  assert.deepEqual([...qa.studio.hands], []); assert.deepEqual([...qa.studio.invited], [2]); assert.equal(studio.studioCanSpeak(qa.studio, qa.players.get(2)), true);
  const removed = await wake({ ...legacy, source: "removed-video", playing: true }, "1");
  assert.equal(removed.studio.source, studio.STUDIO_SOURCES[0].id); assert.equal(removed.studio.playing, false); assert.equal(removed.studio.position, 0);
});
