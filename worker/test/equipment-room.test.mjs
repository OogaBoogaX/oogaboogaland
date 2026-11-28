// Real Room admission, hibernation and scope changes, with SQLite for durable account choices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { deletePlayer, getPlayer } from "../src/db.js";
import { equipmentHats } from "../src/equipment-hats.js";
import { equipmentRoom } from "../src/equipment-room.js";
import { equipmentWardrobe } from "../src/equipment-wardrobe.js";
import { equipmentAccount, equipmentDatabase, readEquipment, writeEquipment } from "./equipment-fixture.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
const NONE = { item: "none", version: null };
const hat = () => ({ item: equipmentHats.items[0].id, version: equipmentHats.items[0].current });
const helmet = () => ({ item: "johnstackton21m-helmet", version: equipmentHats.current("johnstackton21m-helmet") });
const frames = ws => ws.sent.filter(m => m.t === "equipment");
const host = async (t, enabled = true, cast = null) => {
  const db = equipmentDatabase(); t.after(() => db.sql.close());
  const accounts = await Promise.all([equipmentAccount(db, 1), equipmentAccount(db, 2), equipmentAccount(db, 3)]);
  const env = { DB: db, EQUIPMENT_ENABLED: enabled ? "1" : "0" }, stored = new Map(), sockets = [], timers = new Map(), errors = [];
  let ready, nextTimer = 0;
  const socket = () => ({ readyState: 1, sent: [], attachment: null, closed: null,
    send(text) { this.sent.push(typeof text === "string" ? JSON.parse(text) : text); },
    close(code, reason) { this.closed = { code, reason }; this.readyState = 3; },
    serializeAttachment(value) { this.attachment = structuredClone(value); }, deserializeAttachment() { return this.attachment; } });
  class Response { constructor(body, options = {}) { this.body = body; this.status = options.status || 200; this.webSocket = options.webSocket; } }
  const context = { ...protocol, ...studio, getPlayer, CAST_ROWS: cast || accounts.map(a => ({ handle: a.player.login, github_login: a.player.login })),
    Map, Set, ArrayBuffer, DataView, URL, Headers, Response, crypto, Date,
    console: { error: (...args) => errors.push(args) }, DurableObject: class { constructor(ctx, e) { this.ctx = ctx; this.env = e; } },
    WebSocketRequestResponsePair: class {}, WebSocketPair: class { constructor() { this[0] = socket(); this[1] = socket(); } },
    sfuClient: () => null, deliverHighscores: async () => {}, sha256Hex: async () => "hash",
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  runInNewContext(source, context);
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: fn => { ready = fn(); },
    acceptWebSocket: ws => sockets.push(ws), getWebSockets: () => sockets.filter(ws => ws.readyState === 1),
    getWebSocketAutoResponseTimestamp: () => new Date(), waitUntil() {},
    storage: { get: async key => structuredClone(stored.get(key)), put: async (key, value) => stored.set(key, structuredClone(value)),
      delete: async key => stored.delete(key), getAlarm: async () => null, setAlarm: async () => {} } };
  const h = { db, env, accounts, errors, sockets, ctx };
  h.wake = async () => { h.room = new context.Room(ctx, env); await ready; return h.room; };
  h.join = async (id = 1, resume = null) => {
    const count = sockets.length;
    const response = await h.room.fetch({ url: `https://island.test/room${resume ? "?resume=" + resume : ""}`, headers: new Headers({
      upgrade: "websocket", "x-player-id": String(id), "x-player-login": "owner" + id, "x-player-contributor": "1",
      "x-player-equipment-session": accounts[id - 1].session.token_hash }) });
    return { response, ws: sockets[count] };
  };
  h.send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg));
  h.save = (id, command) => h.room.equipmentFor(id, accounts[id - 1].session.token_hash, command);
  await h.wake(); return h;
};

test("equipment Room: hosted Studio save never takes over a socket; join, reconnect and wake retain choice", async t => {
  const h = await host(t);
  assert.equal((await h.save(1, { revision: 0, selection: hat(), size: 80 })).status, 200);
  const a = (await h.join()).ws, b = (await h.join(2)).ws;
  assert.equal(a.sent.find(m => m.t === "welcome").features.includes("equipment-v1"), true);
  assert.deepEqual(frames(a).find(m => m.equipment).equipment.selection, hat());
  assert.equal(frames(a).find(m => m.equipment).equipment.size, 80);
  assert.ok(a.sent.findIndex(m => m.t === "join" && m.p.id === 2) < a.sent.findIndex(m => m.t === "equipment" && m.id === 2));
  a.sent.length = b.sent.length = 0;
  await h.save(1, { revision: 1, selection: NONE });
  assert.equal(a.closed, null); assert.equal(h.room.players.get(1).ws, a);
  assert.equal(frames(a).filter(m => m.equipment).length, 1, "one self acknowledgement per saved change");
  assert.equal(frames(b).at(-1).revision, 2); assert.deepEqual(frames(b).at(-1).selection, NONE);
  assert.equal(frames(b).at(-1).size, 80);
  const resume = h.room.players.get(1).resumeKey;
  h.room.hold(h.room.players.get(1), { code: 1006 });
  const replacement = (await h.join(1, resume)).ws;
  assert.equal(replacement.sent.find(m => m.t === "welcome").resumed, true);
  assert.equal(frames(replacement).find(m => m.equipment).revision, 2);
  assert.equal(frames(replacement).find(m => m.equipment).size, 80);
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.revision, 2);
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), NONE);
  assert.equal(h.room.players.get(1).equipment.size, 80);
  assert.deepEqual(h.errors, []);
});

test("equipment Room: a fresh join whose equipment read fails is admitted in its own look and dressed by a later read", async t => {
  const h = await host(t);
  assert.equal((await h.save(1, { revision: 0, selection: hat(), size: 80 })).status, 200);
  const prepare = h.db.prepare;
  h.db.prepare = () => { throw new Error("D1 unavailable"); };
  const { ws } = await h.join();
  h.db.prepare = prepare;
  assert.equal(ws.closed, null);
  assert.equal(ws.sent.some(m => m.t === "kick"), false);
  assert.ok(ws.sent.some(m => m.t === "welcome"));
  assert.equal(h.room.players.get(1).ws, ws);
  await h.room.equipmentFor(1, h.accounts[0].session.token_hash, null);
  assert.equal(h.room.players.get(1).equipment.revision, 1);
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), hat());
});

test("equipment Room: appearance is scoped to visibility, catches up on entry and leaves on exit", async t => {
  const h = await host(t), a = (await h.join()).ws, b = (await h.join(2)).ws, c = (await h.join(3)).ws;
  h.send(c, { t: "zone", name: "mine" });
  a.sent.length = b.sent.length = c.sent.length = 0;
  await h.save(1, { revision: 0, selection: hat(), size: 120 });
  assert.equal(frames(b).some(m => m.id === 1 && m.revision === 1), true);
  assert.equal(frames(b).at(-1).size, 120);
  assert.equal(frames(c).some(m => m.id === 1), false, "private scene never receives the outside choice");
  h.send(a, { t: "zone", name: "mine" });
  assert.deepEqual(frames(b).at(-1), { t: "equipment", kind: "remove", ids: [1] });
  assert.equal(frames(c).at(-1).revision, 1);
  assert.equal(frames(c).at(-1).size, 120);
  const snapshot = frames(a).filter(m => m.kind === "snapshot").at(-1);
  assert.deepEqual(snapshot.rows.map(r => r.id), [3]);
  assert.equal(snapshot.rows[0].size, 100);
  h.send(a, { t: "zone", name: "outside" });
  assert.equal(frames(b).at(-1).revision, 1, "re-entry resends the existing revision");
  assert.equal(frames(b).at(-1).size, 120);
  assert.deepEqual(frames(c).at(-1), { t: "equipment", kind: "remove", ids: [1] });
});

test("equipment Room: crossing between two areas of one Valhodl scene keeps the look; the halls are apart", async t => {
  const h = await host(t), a = (await h.join()).ws, b = (await h.join(2)).ws;
  h.send(a, { t: "zone", name: "byzantine-keep" });
  h.send(b, { t: "zone", name: "byzantine-keep.y4r1" });
  await h.save(1, { revision: 0, selection: hat(), size: 120 });
  assert.equal(frames(b).some(m => m.id === 1 && m.revision === 1), true, "a neighbouring area sees the choice");
  b.sent.length = 0;
  h.send(a, { t: "zone", name: "byzantine-keep.y4r0" });
  assert.equal(frames(b).some(m => m.kind === "remove"), false, "an area's edge sends no remove");
  h.send(a, { t: "zone", name: "byzantine-keep.halls" });
  assert.deepEqual(frames(b).at(-1), { t: "equipment", kind: "remove", ids: [1] }, "the keep's halls are a scene of their own");
});

test("equipment Room: an older admission/sweep read cannot regress a concurrent save", async t => {
  const h = await host(t), { ws } = await h.join();
  await h.save(1, { revision: 0, selection: hat(), size: 80 });
  const stale = { ...hat(), size: 80, revision: 1, declined: null }, original = h.db.prepare;
  let resolve;
  h.db.prepare = query => {
    h.db.prepare = original;
    return { bind: () => ({ first: () => new Promise(done => { resolve = done; }) }) };
  };
  const reading = equipmentRoom.refresh(h.room, h.room.players.get(1));
  await h.save(1, { revision: 1, selection: NONE, size: 120 });
  resolve(stale); await reading;
  assert.equal(h.room.players.get(1).equipment.revision, 2);
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), NONE);
  assert.equal(frames(ws).at(-1).revision, 2);
  assert.equal(h.room.players.get(1).equipment.size, 120);
  assert.equal(frames(ws).at(-1).size, 120);
});

test("equipment Room: a commit interrupted before publication catches up after hibernation", async t => {
  const h = await host(t), { ws } = await h.join();
  await h.save(1, { revision: 0, selection: hat() });
  await writeEquipment(h.db, 1, h.accounts[0].session.token_hash, { revision: 1, selection: NONE, size: 110 });
  assert.equal(h.room.players.get(1).equipment.revision, 1);
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.revision, 2);
  assert.equal(frames(ws).at(-1).revision, 2);
  assert.equal(frames(ws).at(-1).size, 110);
  assert.deepEqual((await readEquipment(h.db, 1)).selection, NONE);
});

test("equipment Room: concurrent Studio saves use CAS and disabled deployments keep the old wire", async t => {
  const h = await host(t), { ws } = await h.join();
  const answers = await Promise.all([h.save(1, { revision: 0, selection: hat() }), h.save(1, { revision: 0, selection: NONE })]);
  assert.deepEqual(answers.map(a => a.status), [200, 409]);
  assert.equal(h.room.players.get(1).equipment.revision, 1); assert.equal(ws.closed, null);
  const disabled = await host(t, false), old = (await disabled.join()).ws;
  assert.equal(old.sent.find(m => m.t === "welcome").features.includes("equipment-v1"), false);
  assert.equal(frames(old).length, 0);
  assert.equal((await disabled.save(1, { revision: 0, selection: NONE })).status, 404);
});

test("equipment Room: a creator update offers acceptance and a declined version survives reload and deploy", async t => {
  const h = await host(t, true, [{ handle: "w-s-bitcoin", github_login: "owner1" }]), { ws } = await h.join(), chosen = helmet();
  await h.save(1, { revision: 0, selection: chosen, size: 110 });
  const v2 = "2".repeat(64), v3 = "3".repeat(64), original = equipmentHats.current;
  let offered = v2;
  equipmentHats.current = id => id === chosen.item ? offered : original(id);
  t.after(() => { equipmentHats.current = original; });
  await equipmentRoom.refreshAll(h.room);
  assert.equal(frames(ws).at(-1).equipment.update.version, v2);
  assert.equal(h.room.players.get(1).equipment.selection.version, chosen.version, "new metadata cannot change what is worn");
  const kept = await h.save(1, { revision: 1, decline: v2 });
  assert.equal(kept.equipment.declined, v2); assert.equal(kept.equipment.update, null);
  assert.equal(kept.equipment.size, 110);
  assert.equal(h.db.sql.prepare("SELECT declined FROM player_equipment WHERE player_id = 1").get().declined, v2);
  const unchanged = await h.save(1, { revision: 2, selection: chosen });
  assert.equal(unchanged.equipment.revision, 3);
  assert.equal(unchanged.equipment.declined, v2, "saving the same pinned selection does not undo Keep my version");
  assert.equal(unchanged.equipment.update, null);
  assert.equal(unchanged.equipment.size, 110);
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.update, null);
  assert.equal(h.room.players.get(1).equipment.selection.version, chosen.version);
  offered = v3;
  await h.wake();
  assert.equal(frames(ws).at(-1).equipment.update.version, v3, "the next creator version is offered after wake");
  const stale = await h.save(1, { revision: 3, decline: v2 });
  assert.equal(stale.status, 409, "a stale offer cannot suppress a newer revision");
  assert.equal(stale.equipment.update.version, v3, "the client can replace its obsolete offer");
  equipmentHats.accept(chosen.item, v3); // A future reviewed Worker retains v1 and adds the new immutable version.
  const accepted = await h.save(1, { revision: 3, selection: { item: chosen.item, version: v3 } });
  assert.equal(accepted.equipment.revision, 4); assert.equal(accepted.equipment.declined, null);
  assert.equal(accepted.equipment.size, 110);
  assert.equal(frames(ws).at(-1).selection.version, v3);
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.selection.version, v3);
  assert.equal(h.room.players.get(1).equipment.size, 110);
});

test("equipment Room: canonical ownership governs minimums and corrected legacy fits reach admission, peers and wake", async t => {
  const h = await host(t, true, [{ handle: "W-S-Bitcoin", github_login: "owner1" }, { handle: "owner2" }, { handle: "Bitcoin-Bill" }]);
  const resolver = (login, id) => h.room.equipmentCharacter(login, id);
  assert.equal(resolver("OWNER1", 1), "w-s-bitcoin", "the account login is not the rendered character handle");
  assert.equal(resolver("a-renamed-account", 185141343), "bitcoin-bill", "verified numeric ownership survives a renamed login");
  const renamed = await equipmentAccount(h.db, 185141343);
  const renamedSaved = await writeEquipment(h.db, 185141343, renamed.session.token_hash,
    { revision: 0, selection: helmet(), size: 80 }, resolver);
  assert.equal(renamedSaved.equipment.size, 80);
  await writeEquipment(h.db, 1, h.accounts[0].session.token_hash, { revision: 0, selection: helmet(), size: 80 });
  const peer = (await h.join(2)).ws, own = (await h.join()).ws;
  assert.equal(h.room.players.get(1).equipment.revision, 2);
  assert.equal(frames(own).find(m => m.equipment).size, 100);
  assert.equal(frames(peer).find(m => m.id === 1).size, 100);
  const legacy = { ...own.attachment.equipment, size: 80, revision: 3 };
  h.db.sql.prepare("UPDATE player_equipment SET size = 80, revision = 3 WHERE player_id = 1").run();
  own.attachment.equipment = legacy; own.sent.length = peer.sent.length = 0;
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.size, 100); assert.equal(h.room.players.get(1).equipment.revision, 4);
  assert.equal(frames(peer).find(m => m.id === 1).size, 100);
  assert.equal(frames(own).some(m => m.id === 1 && m.size < 100), false);
  const stale = await h.save(1, { revision: 3, size: 80 });
  assert.equal(stale.status, 409); assert.equal(stale.equipment.size, 100);
  const clamped = await h.save(1, { revision: 4, size: 80 });
  assert.equal(clamped.status, 200); assert.equal(clamped.equipment.size, 100);
  assert.equal(frames(peer).at(-1).size, 100);
  assert.deepEqual(h.errors, []);
});

test("equipment Room: an RPC refreshes catalog authority and an outage retains safe attachments without accepting unsafe fits", async t => {
  const h = await host(t, true, [{ handle: "w-s-bitcoin", github_login: "owner1" }]);
  await h.save(1, { revision: 0, selection: helmet(), size: 110 });
  const own = (await h.join()).ws, record = { ...h.room.players.get(1).equipment }, index = h.room.catalog.current();
  let current = null, refreshes = 0, notified = 0, recover = true;
  h.room.catalog = { enabled: true, current: () => current, refresh: async storage => {
    assert.equal(storage, h.ctx.storage); refreshes++; if (recover) current = index; return !!current;
  } };
  h.room.catalogChanged = () => { notified++; };
  assert.equal(equipmentRoom.saved(h.room, record, "owner1", 1).size, 110, "an already-safe helmet survives early restore without authority");
  assert.equal(equipmentRoom.saved(h.room, { ...record, selection: hat(), size: 80 }, "owner1", 1).size, 80);
  assert.equal(equipmentRoom.saved(h.room, { ...record, size: 80 }, "owner1", 1), null, "an ambiguous legacy helmet waits for D1 correction");
  await equipmentRoom.refreshAll(h.room, true);
  assert.equal(own.closed, null); assert.equal(h.room.players.get(1).equipment.size, 110);
  const saved = await h.save(1, { revision: 1, size: 80 });
  assert.equal(refreshes, 1); assert.equal(notified, 1); assert.equal(saved.equipment.size, 100);
  current = null; recover = false;
  await assert.rejects(h.save(1, { revision: 2, size: 80 }), error => error.code === "catalog_unavailable");
  assert.equal(h.db.sql.prepare("SELECT revision FROM player_equipment WHERE player_id = 1").get().revision, 2);
  await equipmentRoom.refreshAll(h.room, true);
  assert.equal(own.closed, null); assert.equal(h.room.players.get(1).equipment.size, 100);
  assert.deepEqual(h.errors, []);
});

test("equipment Room: size-only updates reach visible peers and old attachments normalize to 100", async t => {
  const h = await host(t), a = (await h.join()).ws, b = (await h.join(2)).ws;
  await h.save(1, { revision: 0, selection: hat() });
  a.sent.length = b.sent.length = 0;
  const answer = await h.save(1, { revision: 1, size: 115 });
  assert.equal(answer.status, 200); assert.equal(answer.equipment.revision, 2);
  assert.deepEqual(answer.equipment.selection, hat());
  assert.equal(frames(b).at(-1).size, 115); assert.equal(frames(a).at(-1).equipment.size, 115);
  assert.equal(a.attachment.equipment.size, 115);
  const legacy = { ...a.attachment.equipment }; delete legacy.size;
  assert.equal(equipmentRoom.saved(h.room, legacy, "owner1", 1).size, 100);
  assert.equal(equipmentRoom.saved(h.room, { ...legacy, size: 121 }, "owner1", 1), null);
  assert.equal(equipmentRoom.saved(h.room, { selection: null, revision: 0, declined: null, size: 80 }, "owner1", 1), null);
  delete a.attachment.equipment.size;
  await h.wake();
  assert.equal(h.room.players.get(1).equipment.size, 115, "D1 catches an old attachment up before it becomes authoritative");
});

test("equipment Room: deletion followed by recreation evicts the old socket before applying the reset revision", async t => {
  const h = await host(t), old = (await h.join()).ws, oldSession = h.accounts[0].session.token_hash;
  await h.save(1, { revision: 0, selection: hat() });
  await h.save(1, { revision: 1, selection: NONE });
  await h.save(1, { revision: 2, selection: hat() });
  await deletePlayer(h.db, 1);
  h.accounts[0] = await equipmentAccount(h.db, 1);
  // Deliberately omit the deletion notification, as if its RPC was interrupted after D1 committed.
  const saved = await h.save(1, { revision: 0, selection: NONE });
  assert.equal(saved.status, 200); assert.equal(saved.equipment.revision, 1);
  assert.equal(old.closed.reason, "revoked"); assert.equal(h.room.players.has(1), false);
  const fresh = (await h.join()).ws;
  assert.equal(h.room.players.get(1).equipment.revision, 1);
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), NONE);
  assert.equal(fresh.sent.some(m => JSON.stringify(m).includes(oldSession) || JSON.stringify(m).includes(h.accounts[0].session.token_hash)), false,
    "session digests stay private to admission and attachments");
  await h.room.forgetEquipment(1); // A delayed old notification can only force a harmless new reconnect.
  assert.equal(fresh.closed.reason, "revoked");
  await h.join();
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), NONE);
});

test("equipment Room: wake catches missed deletion cleanup and old unmarked sockets reconnect once", async t => {
  const h = await host(t), old = (await h.join()).ws;
  await h.save(1, { revision: 0, selection: hat() });
  await deletePlayer(h.db, 1);
  h.accounts[0] = await equipmentAccount(h.db, 1);
  await h.wake();
  assert.equal(old.closed.reason, "revoked");
  const fresh = (await h.join()).ws;
  assert.equal(h.room.players.get(1).equipment.revision, 0);
  assert.equal(h.room.players.get(1).equipment.selection, null);
  delete fresh.attachment.equipmentSession;
  await h.wake();
  assert.equal(fresh.closed.reason, "revoked");
  const marked = (await h.join()).ws;
  await h.wake();
  assert.equal(marked.closed, null);
  assert.deepEqual(h.errors, []);
});

test("equipment Room: what a player wears besides the hat reaches visible peers, survives a wake and an older page's hat save", async t => {
  const h = await host(t), shirt = { item: equipmentWardrobe.slotItems("shirt")[0].id, version: equipmentWardrobe.slotItems("shirt")[0].version };
  assert.equal((await h.save(1, { revision: 0, wardrobe: { shirt, shoes: NONE } })).status, 200);
  const a = (await h.join()).ws, b = (await h.join(2)).ws;
  assert.deepEqual(plain(frames(a).find(m => m.equipment).equipment.wardrobe), { shirt, shoes: NONE });
  assert.deepEqual(plain(frames(b).find(m => m.kind === "snapshot").rows.find(r => r.id === 1).wardrobe), { shirt, shoes: NONE });
  b.sent.length = 0;
  await h.save(1, { revision: 1, selection: hat() });
  assert.deepEqual(plain(frames(b).at(-1).wardrobe), { shirt, shoes: NONE }, "a hat save keeps the rest on the wire");
  await h.save(1, { revision: 2, wardrobe: null });
  assert.equal(frames(b).at(-1).wardrobe, null);
  await h.save(1, { revision: 3, wardrobe: { shirt } });
  await h.wake();
  assert.deepEqual(plain(h.room.players.get(1).equipment.wardrobe), { shirt });
  assert.deepEqual(plain(h.room.players.get(1).equipment.selection), hat());
  assert.deepEqual(h.errors, []);
});
