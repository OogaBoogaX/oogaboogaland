import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { sfuClient } from "../src/sfu.js";
import { getPlayer } from "../src/db.js";

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
const roomClass = (extra = {}) => {
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }, WebSocketRequestResponsePair: class {}, sfuClient, CAST_ROWS: [{ handle: "YellowBrokeIt", github_login: "YellowBrokeIt" }], Date, Map, Set, Response, Promise, setTimeout, clearTimeout, ...extra };
  runInNewContext(source, context);
  return context.Room;
};
test("room broadcasts DSB zone changes, persists them and keeps ownership enforcement", () => {
  const Room = roomClass(), room = Object.create(Room.prototype), sent = [];
  room.players = new Map(); room.chatBuckets = new Map(); room.voiceSig = new Map();
  let attachment;
  const ws = { deserializeAttachment: () => ({ id: 1 }), serializeAttachment: value => { attachment = value; }, send: text => sent.push(JSON.parse(text)) };
  const player = room.record(ws, { id: 1, login: "YellowBrokeIt", display: "Yellow", body: "YellowBrokeIt", x: -45, y: 40, z: -43, yaw: 0 });
  room.players.set(1, player);
  room.webSocketMessage(ws, JSON.stringify({ t: "zone", name: "dsb-svrn" }));
  assert.equal(room.view(player).zone, "dsb-svrn");
  assert.equal(attachment.zone, "dsb-svrn");
  assert.ok(sent.some(m => m.t === "zone" && m.id === 1 && m.name === "dsb-svrn"));
  room.webSocketMessage(ws, JSON.stringify({ t: "body", name: "gorilla:YellowBrokeIt" }));
  assert.equal(player.body, "gorilla:YellowBrokeIt");
  assert.equal(attachment.body, player.body);
  const g = [4, 1.8, 12.5, 1, -0.5, 0];
  room.scheduleFlush = () => {};
  room.webSocketMessage(ws, JSON.stringify({ t: "pose", x: -45, y: 55, z: -43, yaw: 0.7, g }));
  assert.deepEqual(attachment.g, g);
  assert.deepEqual(room.view(player).g, g, "late joiners see the companion's current climbing stance");
  assert.equal(room.view(player).y, 55, "the room keeps an elevated companion pose");
  room.snapshot();
  const state = sent.filter(m => m.t === "state").at(-1);
  assert.deepEqual(state.ps, [1, -45, 55, -43, 0.7], "legacy position records keep five fields");
  assert.deepEqual(state.gs, [1, ...g]);
  room.webSocketMessage(ws, JSON.stringify({ t: "pose", x: -45, y: 55, z: -43, yaw: 0.7, g: [5, 0, 12.5, 0, 0, 0] }));
  assert.ok(room.dirty, "changing stance with no positional movement still schedules a snapshot");
  room.webSocketMessage(ws, JSON.stringify({ t: "body", name: "YellowBrokeIt" }));
  assert.equal(player.g, null, "switching back to the Ooga clears companion state");
  room.webSocketMessage(ws, JSON.stringify({ t: "pose", x: -45, y: 40, z: -43, yaw: 0, g }));
  assert.equal(player.g, null, "Ooga poses cannot install companion locomotion");
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
    room.players = new Map(); room.chatBuckets = new Map();
    for (const id of [1, 2]) if (stores[id].a) room.players.set(id, room.record(sockets[id], stores[id].a));
    return room;
  };
  const room = Object.create(Room.prototype);
  room.sfu = {};
  room.players = new Map(); room.chatBuckets = new Map();
  for (const id of [1, 2]) {
    const p = room.record(sockets[id], { id, login: `p${id}`, display: `p${id}`, body: id === 1 ? "gorilla:ooga-1" : "ooga-2", g: id === 1 ? [4, 1.8, 12, 1, 0, 0] : null, zone: "factory.hall", x: 0, y: 0, z: 0, yaw: 0 });
    p.voice = { pub: `pub${id}`, sub: `sub${id}`, track: "mic", gen: 10 + id };
    room.players.set(id, p);
    sockets[id].serializeAttachment(room.attachment(p));
  }
  room.updateVoice();
  const last = (id) => sockets[id].sent.filter((m) => m.t === "voice").at(-1);
  assert.deepEqual(last(1), { t: "voice", peers: [2], gens: [12] });
  // Asleep and woken: the room still knows what it sent, so nothing repeats...
  const woken = wake();
  assert.equal(woken.players.get(1).body, "gorilla:ooga-1");
  assert.deepEqual(woken.players.get(1).g, [4, 1.8, 12, 1, 0, 0], "hibernation preserves a companion's locomotion");
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
  room.players = new Map(); room.chatBuckets = new Map(); room.studio = studio.studioState(1000); room.env = { STUDIO_HOST_IDS: "1,3" }; room.cleanupJobs = [];
  room.doorQueue = []; room.doorActive = null; room.doorPasses = new Map(); room.sweepAt = 0;
  const pending = [], storage = new Map();
  room.ctx = { waitUntil: p => pending.push(p), storage: { put: async (k, v) => storage.set(k, structuredClone(v)), getAlarm: async () => null, setAlarm: async () => {} } };
  room.sfu = { closeTracks: async (_session, mids) => ({ tracks: mids.map(mid => ({ mid })) }), getSession: async () => ({ tracks: [] }) };
  const add = (id, fields = {}) => {
    const ws = { sent: [], send(text) { this.sent.push(JSON.parse(text)); }, serializeAttachment() {} };
    const p = room.record(ws, { id, login: `synthetic-${id}`, contributor: true, zone: studio.STUDIO_ZONE, x: -2.4, y: .75, z: -2.1, body: `synthetic-${id}`, connectionToken: `token-${id}`, ...fields });
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
  const { revision, epoch } = room.studio;
  room.studioCommand(host, { action: "claim", commandId: "claim2" });
  assert.equal(room.studio.revision, revision, "a second claim by the host (a double click) changes nothing"); assert.equal(room.studio.epoch, epoch);
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
  const hostVoice = () => host.ws.sent.filter(m => m.t === "voice").at(-1);
  assert.deepEqual(hostVoice().peers, []);
  assert.equal(hostVoice().listeners, 1, "a receive-only audience must keep the host microphone live");
  const sent = host.ws.sent.length;
  room.updateVoice(); assert.equal(host.ws.sent.length, sent, "unchanged listener counts are not rebroadcast");
  await call(listener, "leave", {});
  assert.equal(hostVoice().listeners, 0, "the final receiver departure is sent even with no publishers");
  await call(listener, "session", { kind: "sub" });
  assert.equal(hostVoice().listeners, 1, "receive-only rejoin updates the speaker's gate");
  await call(host, "leave", {});
  const beforeRestart = host.ws.sent.length;
  await call(host, "session", { kind: "sub" });
  assert.ok(host.ws.sent.length > beforeRestart, "a fresh receiver must receive its current audience even when the list is unchanged");
  assert.equal(hostVoice().listeners, 1);
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

test("simulated 8/16/32-account Studio sessions preserve audience, moderation, transfer and cleanup", async t => {
  for (const count of [8, 16, 32]) await t.test(`${count} authenticated fixture accounts; mocked SFU transport`, async () => {
    const { room, add, call, pending } = studioRoom();
    const players = Array.from({ length: count }, (_, i) => add(i + 1));
    const host = players[0], sessions = new Map(); let serial = 0;
    const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); await room.retryCleanup(); };
    room.sfu.newSession = async () => { const sessionId = `fixture-${++serial}`; sessions.set(sessionId, new Map()); return { sessionId }; };
    room.sfu.newTracks = async (session, body) => {
      const owned = sessions.get(session);
      const tracks = body.tracks.map(track => {
        const mid = track.location === "local" ? track.mid : `r${owned.size}`;
        owned.set(mid, { ...track, mid, status: "active" });
        return { ...track, mid };
      });
      return { tracks, sessionDescription: { type: "answer", sdp: "simulated SDP; no media transport" } };
    };
    room.sfu.closeTracks = async (session, mids) => ({ tracks: mids.map(mid => { const track = sessions.get(session)?.get(mid); if (track) track.status = "inactive"; return { mid }; }) });
    room.sfu.getSession = async session => ({ tracks: [...(sessions.get(session)?.values() || [])] });
    const publish = async p => {
      assert.equal((await call(p, "session", { kind: "pub" })).status, 200);
      assert.equal((await call(p, "publish", { mid: "0", sdp: "simulated offer" })).status, 200);
      assert.equal((await call(p, "live", {})).status, 200);
    };
    const pull = async p => {
      const already = new Set(Object.values(p.voice.mids || {}));
      const ids = protocol.voicePeers([...room.players.values()], room.studio).get(p.id).filter(id => !already.has(id));
      assert.equal((await call(p, "pull", { ids })).status, 200);
    };
    const active = location => [...sessions.values()].flatMap(tracks => [...tracks.values()]).filter(track => track.status === "active" && track.location === location).length;
    room.studioCommand(host, { action: "claim" });
    room.studioCommand(host, { action: "mode", mode: "presentation" });
    for (const p of players) assert.equal((await call(p, "session", { kind: "sub" })).status, 200);
    await publish(host);
    for (const p of players) await pull(p);
    assert.equal(active("remote"), count - 1);
    const hostState = () => host.ws.sent.filter(m => m.t === "voice").at(-1);
    assert.equal(hostState().listeners, count - 1);
    assert.deepEqual(hostState().peers, [], "a host can speak to a wholly receive-only audience");
    room.studioCommand(host, { action: "mode", mode: "discussion" });
    for (let i = 1; i < players.length; i++) {
      const p = players[i], seat = studio.studioSeats[i - 1]; Object.assign(p, seat);
      room.studioCommand(p, { action: "seat", seat: i - 1 });
      assert.equal(studio.studioCanSpeak(room.studio, p), true);
      await publish(p);
    }
    for (const p of players) { await pull(p); assert.equal(Object.keys(p.voice.mids).length, count - 1); }
    assert.equal(active("remote"), count * (count - 1));
    room.studioCommand(host, { action: "mode", mode: "presentation" }); await settle();
    assert.equal(active("local"), 1); assert.equal(active("remote"), count - 1);
    assert.ok(players.slice(1).every(p => !p.voice.pub && !p.voice.track));
    room.studioCommand(host, { action: "mode", mode: "qa" });
    const guest = players[1]; room.studioCommand(guest, { action: "raise" }); room.studioCommand(host, { action: "invite", id: guest.id });
    assert.equal(guest.voice.pub, null, "invitation never publishes without the guest's request");
    await publish(guest); for (const p of players) await pull(p);
    room.studioCommand(guest, { action: "lower" }); await settle();
    assert.equal(active("local"), 1); assert.equal(active("remote"), count - 1);
    const epoch = room.studio.epoch;
    room.studioCommand(host, { action: "transfer", id: 3 }); await settle();
    assert.equal(room.studio.hostId, 3); assert.equal(room.studio.epoch, epoch + 1);
    assert.ok(players.every(p => !p.voice.pub), "transfer requires fresh microphone consent");
    await publish(players[2]); for (const p of players) await pull(p);
    room.leaveStudio(players[2]); await settle();
    assert.equal(room.studio.mode, "suspended"); assert.equal(active("local"), 0); assert.equal(active("remote"), 0);
    for (const p of players) assert.equal((await call(p, "leave", {})).status, 200);
    await settle();
    assert.ok(room.cleanupJobs.every(job => job.inspect && job.mids.length === 0), "empty sessions retain ownership during the late-allocation inspection window");
    for (const job of room.cleanupJobs) job.inspectUntil = 0; // Advance beyond the existing bounded inspection window, without sleeping.
    await room.retryCleanup(); assert.equal(room.cleanupJobs.length, 0);
    assert.equal(active("local"), 0); assert.equal(active("remote"), 0);
  });
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
      { id: 1, login: "synthetic-host", contributor: true, zone: studio.STUDIO_ZONE, body: "synthetic-host" },
      { id: 2, login: "synthetic-attendee", contributor: true, zone: studio.STUDIO_ZONE, body: "synthetic-attendee", studioSeat: 0 }
    ];
    const sockets = attachments.map(a => ({ deserializeAttachment: () => a, serializeAttachment() {}, send() {} }));
    const ctx = { setWebSocketAutoResponse() {}, getWebSockets: () => sockets, blockConcurrencyWhile: fn => pending.push(fn()), waitUntil: p => pending.push(p), storage: { get: async key => Array.isArray(key) ? new Map() : key === "studio" ? structuredClone(saved) : null, put: async () => {} } };
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

// Regression: a table voice choice survives hibernation, but never a scene change.
test("room scopes poker voice to Ember Den and clears it on departure", () => {
  const Room = roomClass(), room = Object.create(Room.prototype);
  room.players = new Map(); room.chatBuckets = new Map(); room.sfu = {};
  let attachment;
  const ws = { deserializeAttachment: () => ({ id: 1 }), serializeAttachment: value => { attachment = value; }, send() {} };
  const player = room.record(ws, { id: 1, login: "YellowBrokeIt", display: "Fixture", body: "YellowBrokeIt", zone: "outside" });
  room.players.set(1, player);
  const send = message => room.webSocketMessage(ws, JSON.stringify(message));
  send({ t: "poker-voice", table: 2 }); assert.equal(player.pokerVoice, null);
  send({ t: "zone", name: "ember-den" }); send({ t: "poker-voice", table: 2 });
  assert.equal(attachment.pokerVoice, 2);
  assert.equal(room.record(ws, attachment).pokerVoice, 2);
  assert.equal(room.view(player).zone, "ember-den");
  send({ t: "zone", name: "outside" });
  assert.equal(attachment.pokerVoice, null);
  send({ t: "zone", name: "ember-den" }); assert.equal(player.pokerVoice, null);
});

// The merged rules: the Studio's bodiless listeners and permitted speakers, and Ember Den table voice, hold together.
test("voicePeers keeps Studio listener and speaker rules and Ember Den table isolation together", () => {
  const s = { ...studio.studioState(1000), hostId: 1, mode: "presentation" };
  const voice = (track = "mic") => ({ sub: "receive", pub: "publish", track });
  const players = [
    { id: 1, zone: studio.STUDIO_ZONE, body: "ooga-1", voice: voice() },
    { id: 2, zone: studio.STUDIO_ZONE, body: null, voice: voice(null) },
    { id: 3, zone: studio.STUDIO_ZONE, body: "ooga-3", studioSeat: 0, voice: voice() },
    { id: 4, zone: "ember-den", body: "ooga-4", pokerVoice: 1, voice: voice() },
    { id: 5, zone: "ember-den", body: "ooga-5", pokerVoice: 2, voice: voice() },
    { id: 6, zone: "ember-den", body: "ooga-6", pokerVoice: 1, voice: voice() },
    { id: 7, zone: "ember-den", body: "ooga-7", pokerVoice: null, voice: voice() },
    { id: 8, zone: "ember-den", body: null, pokerVoice: 1, voice: voice() },
  ];
  const peers = protocol.voicePeers(players, s);
  assert.deepEqual(peers.get(2), [1], "a bodiless Studio listener hears the host only, not an unpermitted attendee");
  assert.deepEqual(peers.get(3), [1]);
  assert.deepEqual(peers.get(1), [], "a presentation attendee microphone is not heard");
  assert.deepEqual(peers.get(4), [6], "same table hears each other");
  assert.deepEqual(peers.get(5), [], "a player at another table is not heard");
  assert.deepEqual(peers.get(7), [], "the walking floor does not hear the tables");
  assert.deepEqual(peers.get(8), [], "outside the Studio a bodiless page hears nobody");
  assert.ok(!peers.get(6).includes(8));
  s.mode = "discussion";
  assert.deepEqual(protocol.voicePeers(players, s).get(2), [1, 3], "a seated attendee is heard once discussion permits it");
  players[2].zone = "ember-den"; players[2].pokerVoice = 2;
  assert.deepEqual(protocol.voicePeers(players, s).get(5), [3], "Studio permission never widens Ember Den table voice");
});

test("a pull keeps still-eligible tracks, closes the rest through cleanup and records only kept MIDs", async () => {
  const { room, add, call, pending } = studioRoom();
  const listener = add(2, { zone: "ember-den", pokerVoice: 1 }), a = add(1, { zone: "ember-den", pokerVoice: 1 }), b = add(3, { zone: "ember-den", pokerVoice: 1 }), c = add(4, { zone: "ember-den", pokerVoice: 1 });
  listener.voice = { ...listener.voice, sub: "receive" };
  a.voice = { ...a.voice, pub: "pub-a", track: "mic", gen: 1 };
  b.voice = { ...b.voice, pub: "pub-b", track: "mic", gen: 1 };
  c.voice = { ...c.voice, pub: "pub-c", track: "mic", gen: 1 };
  let answer; room.sfu.newTracks = () => new Promise(resolve => { answer = resolve; });
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, [...mids]]); return { tracks: mids.map(mid => ({ mid })) }; };
  const request = call(listener, "pull", { ids: [1, 3, 4, 3] });
  await new Promise(resolve => setImmediate(resolve));
  b.pokerVoice = 2; // moved to another table while the SFU answered
  c.voice.pub = "pub-c2"; // published again
  answer({ tracks: [{ sessionId: "pub-a", mid: "a" }, { sessionId: "pub-b", mid: "b" }, { sessionId: "pub-c", mid: "c" }], sessionDescription: { type: "answer", sdp: "x" }, requiresImmediateRenegotiation: true });
  const response = await request, body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.tracks.map(t => [t.id, t.mid]), [[1, "a"]]);
  assert.equal(body.requiresImmediateRenegotiation, true);
  assert.deepEqual({ ...listener.voice.mids }, { a: 1 }, "only kept tracks occupy the receiver's slots");
  await Promise.all(pending);
  assert.deepEqual(closed, [["receive", ["b", "c"]]]);
  assert.equal(room.cleanupJobs.length, 0);
  // A receiver replaced mid-flight gets the whole request refused and every allocated track closed.
  room.sfu.newTracks = () => new Promise(resolve => { answer = resolve; });
  const replaced = call(listener, "pull", { ids: [1] });
  await new Promise(resolve => setImmediate(resolve));
  listener.voice.sub = "another"; listener.voice.version = (listener.voice.version || 0) + 1;
  answer({ tracks: [{ sessionId: "pub-a", mid: "z" }] });
  assert.equal((await replaced).status, 409);
  assert.deepEqual(closed.at(-1), ["receive", ["z"]]);
});

test("a Studio pull drops a microphone the host stopped permitting mid-flight", async () => {
  const { room, add, call } = studioRoom(), host = add(1), speaker = add(3, { studioSeat: 0 }), listener = add(2, { body: null });
  room.studio.hostId = 1; room.studio.mode = "discussion";
  host.voice = { ...host.voice, pub: "pub-host", track: "mic", gen: 1 };
  speaker.voice = { ...speaker.voice, pub: "pub-seat", track: "mic", gen: 1 };
  listener.voice = { ...listener.voice, sub: "receive" };
  let answer; room.sfu.newTracks = () => new Promise(resolve => { answer = resolve; });
  const closed = []; room.sfu.closeTracks = async (session, mids) => { closed.push([session, [...mids]]); return { tracks: mids.map(mid => ({ mid })) }; };
  const request = call(listener, "pull", { ids: [1, 3] });
  await new Promise(resolve => setImmediate(resolve));
  room.studioCommand(host, { action: "mode", mode: "presentation" });
  answer({ tracks: [{ sessionId: "pub-host", mid: "h" }, { sessionId: "pub-seat", mid: "s" }] });
  const body = await (await request).json();
  assert.deepEqual(body.tracks.map(t => t.id), [1]);
  assert.deepEqual({ ...listener.voice.mids }, { h: 1 });
  assert.ok(closed.some(([session, mids]) => session === "receive" && mids.includes("s")));
});

test("the alarm wakes at the earliest of sweep, door expiry and cleanup retry, and retries cleanup on every wake", async () => {
  const { room, add } = studioRoom(); add(1);
  const now = Date.now(), alarms = [];
  room.ctx.storage.setAlarm = async at => alarms.push(at);
  room.ctx.getWebSocketAutoResponseTimestamp = () => null;
  room.sweepAt = now + 60000;
  assert.equal(room.nextAlarm(now), now + 60000);
  room.doorPasses.set("cycle", { cycle: "cycle", door: "sphere-1", exp: now + 30000, id: 1 });
  assert.equal(room.nextAlarm(now), now + 30000);
  room.cleanupJobs = [{ session: "s", revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: false, inspectUntil: 0 }];
  room.cleanupAt = now + 5000;
  assert.equal(room.nextAlarm(now), now + 5000);
  // Cleanup that outlives every player still schedules its retry.
  const players = room.players; room.players = new Map();
  assert.equal(room.nextAlarm(now), now + 5000);
  room.cleanupJobs = []; assert.equal(room.nextAlarm(now), null);
  room.players = players;
  // An early wake (sweep not due) still retries cleanup, and failures keep a retry scheduled.
  let attempts = 0; room.sfu.closeTracks = async () => { attempts++; throw new Error("upstream"); };
  room.cleanupJobs = [{ session: "s", revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: false, inspectUntil: 0 }];
  room.cleanupAt = 0;
  await room.alarm();
  assert.equal(attempts, 1);
  assert.equal(room.sweepAt, now + 60000, "an early wake does not run the account sweep");
  assert.equal(room.cleanupJobs.length, 1);
  assert.ok(alarms.at(-1) <= room.cleanupAt && alarms.at(-1) <= now + 30000);
  room.doorPasses.clear(); room.sfu.closeTracks = async (_s, mids) => ({ tracks: mids.map(mid => ({ mid })) });
  await room.alarm();
  assert.equal(attempts, 1); assert.equal(room.cleanupJobs.length, 0); assert.equal(room.cleanupAt, 0);
  assert.equal(alarms.at(-1), room.sweepAt);
});

// Regression (#193 review): stored cleanup made SFU calls inside the constructor's blockConcurrencyWhile, where two
// stuck 10 s jobs pass the 30 s limit and reset the island's only room. The block loads the jobs; an alarm due now retries.
test("a woken room defers stored cleanup outside its constructor's block, and without an SFU sets no alarm for it", async () => {
  let inBlock = false, callsInBlock = 0, closed = 0, configured = false;
  const sfu = {
    getSession: async () => { if (inBlock) callsInBlock++; return { tracks: [] }; },
    closeTracks: async (_session, mids) => { if (inBlock) callsInBlock++; closed++; return { tracks: mids.map(mid => ({ mid })) }; },
  };
  const Room = roomClass({ sfuClient: () => configured ? sfu : null });
  const saved = new Map([["voiceCleanup", [{ session: "stored", revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: true, inspectUntil: 0 }]]]);
  const alarms = []; let block = null;
  const ctx = {
    setWebSocketAutoResponse() {}, getWebSockets: () => [], getWebSocketAutoResponseTimestamp: () => null, waitUntil() {},
    blockConcurrencyWhile: fn => { inBlock = true; block = fn().finally(() => { inBlock = false; }); return block; },
    storage: { get: async key => Array.isArray(key) ? new Map(key.filter(k => saved.has(k)).map(k => [k, structuredClone(saved.get(k))])) : structuredClone(saved.get(key)), put: async (k, v) => saved.set(k, structuredClone(v)), getAlarm: async () => alarms.at(-1) ?? null, setAlarm: async at => alarms.push(at) },
  };
  const disabled = new Room(ctx, {});
  await block;
  assert.equal(disabled.cleanupJobs.length, 1, "the stored job is loaded without an SFU");
  assert.equal(disabled.cleanupAt, 0, "missing SFU configuration leaves no immediate cleanup deadline");
  assert.equal(alarms.length, 0, "missing SFU configuration sets no immediate wake alarm");
  const now = Date.now();
  assert.equal(disabled.nextAlarm(now), null, "an empty room without an SFU has nothing to wake for");
  for (let i = 0; i < 2; i++) {
    await disabled.alarm();
    assert.equal(alarms.length, 0, "a wake sets no alarm for cleanup it cannot run, so it never spins");
    assert.equal(disabled.cleanupJobs.length, 1, "cleanup ownership is retained without an SFU");
    assert.deepEqual(disabled.cleanupJobs, saved.get("voiceCleanup"));
  }
  assert.equal(closed, 0);
  configured = true; alarms.length = 0;
  const before = Date.now(), room = new Room(ctx, {});
  await block;
  assert.equal(callsInBlock, 0, "no SFU call inside the block");
  assert.equal(room.cleanupJobs.length, 1, "the stored job is loaded");
  assert.ok(alarms.length && alarms.at(-1) <= Date.now() && alarms.at(-1) >= before, "an alarm is set for now");
  await room.alarm();
  assert.equal(closed, 1); assert.equal(room.cleanupJobs.length, 0); assert.deepEqual(saved.get("voiceCleanup"), []);
});

// Regression (#193 review): a job the SFU kept refusing was retried for good, waking a room nobody was in every minute.
test("cleanup the SFU keeps refusing is given up after CLEANUP_MS, and an empty room stops waking for it", async () => {
  const { room } = studioRoom(), alarms = [];
  room.ctx.storage.setAlarm = async at => alarms.push(at);
  room.ctx.getWebSocketAutoResponseTimestamp = () => null;
  let attempts = 0; room.sfu.closeTracks = async () => { attempts++; throw new Error("upstream"); };
  room.cleanupJobs = [{ session: "s", at: Date.now(), revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: false, inspectUntil: 0 }];
  await room.alarm();
  assert.equal(attempts, 1); assert.equal(room.cleanupJobs.length, 1, "a refused job is kept for its retry");
  assert.notEqual(room.nextAlarm(), null, "an empty room still wakes to retry it");
  room.cleanupJobs[0].at = Date.now() - protocol.CLEANUP_MS - 1;
  await room.alarm();
  assert.equal(attempts, 1, "a job past CLEANUP_MS is dropped without another SFU call");
  assert.equal(room.cleanupJobs.length, 0); assert.equal(room.nextAlarm(), null, "nothing is left to wake an empty room for");
});

// Regression (#193 review): command ids restart at studio-1 with each DSB visit's controller, and the room replayed the
// last visit's results for them, so a seat came back "ok" with nobody seated. Nothing resends a command; none is replayed.
test("a command id seen on an earlier visit is a new command: it acts, and nothing about it rides the attachment", () => {
  const { room, add } = studioRoom(), attendee = add(2);
  room.studioCommand(attendee, { action: "seat", seat: 0, commandId: "studio-1" }); assert.equal(attendee.studioSeat, 0);
  room.studioCommand(attendee, { action: "stand", commandId: "studio-2" }); assert.equal(attendee.studioSeat, undefined);
  room.studioCommand(attendee, { action: "seat", seat: 0, commandId: "studio-1" });
  assert.equal(attendee.studioSeat, 0, "the second visit's first command is not answered with the first visit's");
  const results = attendee.ws.sent.filter(m => m.t === "studio-result");
  assert.deepEqual(results.map(r => r.commandId), ["studio-1", "studio-2", "studio-1"], "each result still names its command");
  assert.equal("studioResults" in room.attachment(attendee), false);
});

// Regression (#193 review): every command carried the room-wide revision, which seats, stands and hands bump, so a host's
// pause failed whenever someone sat down, and two attendees sitting at once got one refusal. Only transport checks a view.
test("seat and hand changes never refuse host transport or another seat; a stale playback view is refused", () => {
  const { room, add } = studioRoom(), host = add(1), a = add(2), b = add(4);
  room.studioCommand(host, { action: "claim" });
  const view = { revision: room.studio.revision, playback: room.studio.playbackRevision };
  room.studioCommand(a, { action: "seat", seat: 0, ...view }); room.studioCommand(b, { action: "seat", seat: 1, ...view });
  assert.equal(a.studioSeat, 0); assert.equal(b.studioSeat, 1, "two attendees sitting from one view both sit");
  room.studioCommand(host, { action: "play", ...view }); assert.equal(room.studio.playing, true, "a seat change does not refuse play");
  room.studioCommand(host, { action: "pause", ...view });
  assert.equal(room.studio.playing, true, "a view from before the play is stale for transport");
  assert.equal(host.ws.sent.filter(m => m.t === "studio-result").at(-1).ok, false);
  room.studioCommand(host, { action: "pause", revision: room.studio.revision, playback: room.studio.playbackRevision }); assert.equal(room.studio.playing, false);
});

// Regression (#193 review): every Studio change sent studio-state to every player on the island.
test("Studio state goes to players in the Studio only; entering sends it", () => {
  const { room, add } = studioRoom(), host = add(1), outside = add(5, { zone: "dsb-outside" });
  room.studioCommand(host, { action: "claim" });
  room.studioCommand(host, { action: "mode", mode: "presentation" });
  assert.equal(outside.ws.sent.filter(m => m.t === "studio-state").length, 0);
  assert.ok(host.ws.sent.some(m => m.t === "studio-state"));
});

// Regression (#193 review): every Studio message read D1 before its rate limit, so a flood cost a D1 read a message.
test("a Studio command past the rate limit is refused before its account read", async () => {
  const { room, add, pending } = studioRoom(), attendee = add(2);
  let reads = 0;
  room.env.DB = { prepare: () => { reads++; return { bind: () => ({ first: async () => ({ id: 2, banned_at: null }) }) }; } };
  attendee.ws.deserializeAttachment = () => ({ id: 2 });
  for (let i = 0; i < 9; i++) room.webSocketMessage(attendee.ws, JSON.stringify({ t: "studio", action: "stand", commandId: `burst-${i}` }));
  await Promise.all(pending);
  assert.equal(reads, 8, "only commands within the limit read the account");
  const results = attendee.ws.sent.filter(m => m.t === "studio-result");
  assert.equal(results.length, 9, "every command still gets its result");
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.commandId), ["burst-8"]);
});
