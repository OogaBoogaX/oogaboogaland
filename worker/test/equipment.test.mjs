import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { deletePlayer } from "../src/db.js";
import { equipmentHats, equipmentHatArchive } from "../src/equipment-hats.js";
import { equipmentCommand, equipmentRecord, nextEquipment } from "../src/equipment-model.js";
import { equipmentRoom } from "../src/equipment-room.js";
import { equipmentAccount, equipmentDatabase, readEquipment, writeEquipment } from "./equipment-fixture.mjs";
import { routeFixture } from "./routes.mjs";

const SITE = "https://equipment.test", NONE = { item: "none", version: null };
const hat = () => ({ item: equipmentHats.items[0].id, version: equipmentHats.items[0].current });
const helmet = () => ({ item: "johnstackton21m-helmet", version: equipmentHats.current("johnstackton21m-helmet") });
const setup = async t => { const db = equipmentDatabase(); t.after(() => db.sql.close()); return { db, account: await equipmentAccount(db) }; };
const variantModel = () => {
  const base = equipmentHats.items.find(row => row.id === "johnstackton21m-helmet"), content = "c".repeat(64);
  const profile = equipmentHats.legacyProfile(base.id), parent = { item: base.id, version: base.current };
  const revision = (item, profile, parent, content) => {
    const value = { format: 2, item, profile, parent, content };
    return [createHash("sha256").update(equipmentHats.encode(value)).digest("hex"), { item, profile, parent, content }];
  };
  const [next, nextDescriptor] = revision(base.id, profile, null, content);
  const [fork, forkDescriptor] = revision("another-space-helmet", profile, parent, content);
  const [changed, changedDescriptor] = revision("another-space-helmet", equipmentHats.legacyProfile(equipmentHats.items[0].id), parent, "d".repeat(64));
  const rows = [{ ...base, parent: null, current: next, versions: [base.current, next] },
    { id: "another-space-helmet", label: "Another helmet", creator: "AnotherCreator", parent, current: changed, versions: [fork, changed] }];
  const revisions = { [base.current]: { item: base.id, profile, parent: null, content: "e".repeat(64) },
    [next]: nextDescriptor, [fork]: forkDescriptor, [changed]: changedDescriptor };
  const context = vm.createContext({ rows: JSON.stringify(rows), revisions: JSON.stringify(revisions) });
  vm.runInContext(readFileSync(new URL("../../src/js/equipment-hats.js", import.meta.url), "utf8"), context);
  vm.runInContext("BL.equipmentHats.register(JSON.parse(rows),JSON.parse(revisions))", context);
  const source = readFileSync(new URL("../src/equipment-model.js", import.meta.url), "utf8")
    .replace(/import[^;]+;/, "").replace(/export const /g, "const ");
  const model = vm.compileFunction(source + "\nreturn { equipmentRecord, equipmentCommand, nextEquipment };", ["equipmentHats"])(context.BL.equipmentHats);
  return { ...model, base: parent, next, fork: { item: "another-space-helmet", version: fork }, changed };
};

test("equipment: SQL CAS admits one concurrent save and deletion cascades", async t => {
  const { db, account } = await setup(t), token = account.session.token_hash;
  assert.deepEqual(await readEquipment(db, 1, token), { selection: null, size: 100, revision: 0, declined: null, update: null });
  const answers = await Promise.all([writeEquipment(db, 1, token, { revision: 0, selection: hat() }),
    writeEquipment(db, 1, token, { revision: 0, selection: NONE })]);
  assert.deepEqual(answers.map(a => a.status).sort(), [200, 409]);
  const current = await readEquipment(db, 1, token);
  assert.equal(current.revision, 1);
  assert.deepEqual(answers.find(a => a.status === 409).equipment, current);
  const next = await writeEquipment(db, 1, token, { revision: 1, selection: null });
  assert.equal(next.equipment.revision, 2); assert.equal(next.equipment.selection, null);
  await deletePlayer(db, 1);
  assert.equal(db.sql.prepare("SELECT count(*) AS n FROM player_equipment").get().n, 0);
  assert.equal((await writeEquipment(db, 1, token, { revision: 0, selection: NONE })).status, 401);
  await equipmentAccount(db, 1);
  assert.equal((await writeEquipment(db, 1, token, { revision: 0, selection: NONE })).status, 401, "a recreated account does not revive a removed session");
});

test("equipment: session removal between read and write cannot save", async t => {
  const { db, account } = await setup(t), token = account.session.token_hash, base = db.prepare;
  db.prepare = query => {
    if (query.startsWith("INSERT INTO player_equipment")) db.sql.prepare("DELETE FROM sessions WHERE token_hash = ?").run(token);
    return base(query);
  };
  assert.equal((await writeEquipment(db, 1, token, { revision: 0, selection: NONE })).status, 401);
  assert.equal(db.sql.prepare("SELECT count(*) AS n FROM player_equipment").get().n, 0);
});

test("equipment: size migration preserves saved pins and enforces whole percentages", t => {
  const sql = new DatabaseSync(":memory:"); t.after(() => sql.close());
  for (const file of ["0001_init.sql", "0012_player_equipment.sql"])
    sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  sql.prepare("INSERT INTO players (id, login, created_at, last_login_at) VALUES (1, 'owner1', 1, 1)").run();
  const chosen = hat();
  sql.prepare("INSERT INTO player_equipment (player_id, item, version, revision, declined, updated_at) VALUES (1, ?, ?, 4, NULL, 1)")
    .run(chosen.item, chosen.version);
  sql.exec(readFileSync(new URL("../migrations/0013_player_equipment_size.sql", import.meta.url), "utf8"));
  const row = sql.prepare("SELECT item, version, revision, size FROM player_equipment").get();
  assert.deepEqual({ ...row }, { item: chosen.item, version: chosen.version, revision: 4, size: 100 });
  for (const size of [79, 121, 100.5, null, "bad"])
    assert.throws(() => sql.prepare("UPDATE player_equipment SET size = ?").run(size));
  sql.prepare("UPDATE player_equipment SET size = 120").run();
  sql.prepare("UPDATE player_equipment SET item = NULL, version = NULL, revision = revision + 1").run();
  assert.equal(sql.prepare("SELECT size FROM player_equipment").get().size, 120, "an old Worker can still save without knowing about size");
});

test("equipment: resize shares selection CAS and old clients preserve the remembered size", async t => {
  const { db, account } = await setup(t), token = account.session.token_hash;
  assert.equal((await writeEquipment(db, 1, token, { revision: 0, selection: hat(), size: 80 })).equipment.size, 80);
  const answers = await Promise.all([writeEquipment(db, 1, token, { revision: 1, size: 120 }),
    writeEquipment(db, 1, token, { revision: 1, selection: NONE, size: 90 })]);
  assert.deepEqual(answers.map(a => a.status).sort(), [200, 409]);
  let current = await readEquipment(db, 1, token);
  assert.equal(current.revision, 2);
  assert.deepEqual(current, answers.find(a => a.status === 200).equipment);
  assert.deepEqual(current, answers.find(a => a.status === 409).equipment);
  const size = current.size;
  for (const selection of [NONE, null, hat()]) {
    const saved = await writeEquipment(db, 1, token, { revision: current.revision, selection });
    assert.equal(saved.status, 200); assert.equal(saved.equipment.size, size);
    current = saved.equipment;
  }
  const reset = await writeEquipment(db, 1, token, { revision: current.revision, size: 100 });
  assert.equal(reset.equipment.size, 100); assert.deepEqual(reset.equipment.selection, hat());
  assert.equal(db.sql.prepare("SELECT size FROM player_equipment WHERE player_id = 1").get().size, 100);
});

test("equipment: the apple helmet minimum corrects legacy saves once and clamps old-client changes durably", async t => {
  const { db, account } = await setup(t), token = account.session.token_hash, character = () => "W-S-Bitcoin";
  await writeEquipment(db, 1, token, { revision: 0, selection: helmet(), size: 80 }); // Before this fitting rule.
  const declined = "d".repeat(64);
  db.sql.prepare("UPDATE player_equipment SET declined = ? WHERE player_id = 1").run(declined);
  const [a, b] = await Promise.all([readEquipment(db, 1, token, character), readEquipment(db, 1, token, character)]);
  assert.equal(a.revision, 2); assert.deepEqual(a, b); assert.equal(a.size, 100);
  assert.deepEqual(a.selection, helmet()); assert.equal(a.declined, declined);
  assert.equal((await readEquipment(db, 1, token, character)).revision, 2, "ordinary reads do not repeat correction");
  const stale = await writeEquipment(db, 1, token, { revision: 1, size: 80 }, character);
  assert.equal(stale.status, 409); assert.deepEqual(stale.equipment, a);
  const resized = await writeEquipment(db, 1, token, { revision: 2, size: 80 }, character);
  assert.equal(resized.equipment.size, 100); assert.equal(resized.equipment.declined, declined);
  const other = await writeEquipment(db, 1, token, { revision: 3, selection: hat(), size: 80 }, character);
  assert.equal(other.equipment.size, 80, "other hats keep their 80 percent minimum");
  const omitted = await writeEquipment(db, 1, token, { revision: 4, selection: helmet() }, character);
  assert.equal(omitted.equipment.size, 100, "an old client cannot reuse a smaller previous hat's size");
  assert.equal(db.sql.prepare("SELECT size FROM player_equipment WHERE player_id = 1").get().size, 100);
  const ordinary = await writeEquipment(db, 1, token, { revision: 5, selection: helmet(), size: 80 }, () => "another-ooga");
  assert.equal(ordinary.equipment.size, 80, "the same helmet remains adjustable on another character");
});

test("equipment: legacy fit correction cannot overwrite a concurrent selection or a removed session", async t => {
  const { db, account } = await setup(t), token = account.session.token_hash, character = () => "w-s-bitcoin", original = db.prepare;
  await writeEquipment(db, 1, token, { revision: 0, selection: helmet(), size: 80 });
  db.prepare = query => {
    if (query.startsWith("UPDATE player_equipment SET size")) {
      db.prepare = original;
      db.sql.prepare("UPDATE player_equipment SET item = 'none', version = NULL, revision = revision + 1 WHERE player_id = 1").run();
    }
    return original(query);
  };
  const winner = await readEquipment(db, 1, token, character);
  assert.deepEqual(winner.selection, NONE); assert.equal(winner.size, 80); assert.equal(winner.revision, 2);
  await writeEquipment(db, 1, token, { revision: 2, selection: helmet(), size: 80 });
  db.prepare = query => {
    if (query.startsWith("UPDATE player_equipment SET size")) db.sql.prepare("DELETE FROM sessions WHERE token_hash = ?").run(token);
    return original(query);
  };
  assert.equal(await readEquipment(db, 1, token, character), null);
  assert.equal(db.sql.prepare("SELECT size FROM player_equipment WHERE player_id = 1").get().size, 80);
});

test("equipment: pinned version and declined update survive newer metadata", () => {
  const v1 = "1".repeat(64), v2 = "2".repeat(64), v3 = "3".repeat(64);
  let current = v2;
  const hats = { current: () => current, has: (id, v) => id === "test-hat" && [v1, v2, v3].includes(v) };
  const stored = { item: "test-hat", version: v1, size: 85, revision: 1, declined: null };
  let record = equipmentRecord(stored, hats);
  assert.deepEqual(record.selection, { item: "test-hat", version: v1 });
  assert.deepEqual(record.update, { item: "test-hat", version: v2 });
  const declined = nextEquipment(record, equipmentCommand({ revision: 1, decline: v2 }, hats));
  assert.equal(declined.size, 85);
  record = equipmentRecord({ ...stored, revision: 2, declined: declined.declined }, hats);
  assert.equal(record.update, null); assert.equal(record.selection.version, v1);
  const resized = nextEquipment(record, equipmentCommand({ revision: 2, size: 110 }, hats));
  assert.equal(resized.size, 110); assert.equal(resized.declined, v2); assert.deepEqual(resized.selection, record.selection);
  current = v3;
  record = equipmentRecord({ ...stored, revision: 2, declined: declined.declined }, hats);
  assert.equal(record.update.version, v3); assert.equal(record.selection.version, v1);
  const accepted = nextEquipment(record, equipmentCommand({ revision: 2, selection: { item: "test-hat", version: v3 } }, hats));
  assert.equal(accepted.selection.version, v3); assert.equal(accepted.declined, null);
  assert.equal(accepted.size, 85, "Accept changes the creator version without resetting fit");
  assert.throws(() => nextEquipment(record, { revision: 2, decline: v2 }), /no longer offered/);
  assert.equal(nextEquipment(record, { revision: 1, selection: null }), null);
  const apple = { ...record, selection: helmet(), size: 80, update: { ...helmet(), version: v3 } };
  assert.equal(nextEquipment(apple, { revision: 2, decline: v3 }, "w-s-bitcoin").size, 100);
});

test("equipment: shared geometry keeps independent item pins and Accept or Keep choices", () => {
  const f = variantModel();
  const stored = { item: f.base.item, version: f.base.version, size: 110, revision: 7, declined: null };
  const own = f.equipmentRecord(stored), fork = f.equipmentRecord({ ...stored, ...f.fork });
  assert.deepEqual(own.selection, f.base);
  assert.deepEqual(own.update, { item: f.base.item, version: f.next });
  assert.deepEqual(fork.selection, f.fork);
  assert.deepEqual(fork.update, { item: f.fork.item, version: f.changed });
  const keep = f.nextEquipment(own, f.equipmentCommand({ revision: 7, decline: f.next }));
  assert.deepEqual(keep, { selection: f.base, size: 110, declined: f.next });
  assert.equal(f.equipmentRecord({ ...stored, revision: 8, declined: keep.declined }).update, null);
  assert.throws(() => f.nextEquipment(fork, { revision: 7, decline: f.next }), /no longer offered/,
    "a source item's decision cannot dismiss a variant's update");
  const accept = f.nextEquipment(fork, f.equipmentCommand({ revision: 7, selection: fork.update }));
  assert.deepEqual(accept, { selection: fork.update, size: 110, declined: null });
  assert.deepEqual(own.selection, f.base, "accepting a variant never rewrites the source item's pin");
  assert.equal(f.nextEquipment(fork, { revision: 6, selection: fork.update }), null);
  assert.throws(() => f.equipmentCommand({ revision: 7, selection: { item: f.base.item, version: f.fork.version } }), /Unknown hat version/);
});

test("equipment: a variant's pinned fit profile governs minimum size before its update is accepted", () => {
  const f = variantModel(), stored = { ...f.fork, size: 80, revision: 2, declined: null };
  const record = f.equipmentRecord(stored);
  const keep = f.nextEquipment(record, { revision: 2, decline: f.changed }, "w-s-bitcoin");
  assert.equal(keep.size, 100, "the retained enclosing helmet keeps the safe apple minimum");
  assert.deepEqual(keep.selection, f.fork);
  const accept = f.nextEquipment(record, { revision: 2, selection: record.update }, "w-s-bitcoin");
  assert.equal(accept.size, 80, "the newly accepted profile, not the item's latest metadata, controls fitting");
  assert.equal(f.nextEquipment(record, { revision: 2, size: 80 }, "another-ooga").size, 80);
});

test("equipment: immutable selections reject unknown versions and unbounded/extra input", () => {
  for (const input of [{ revision: -1, selection: null }, { revision: 0, selection: { item: "none", version: "a".repeat(64) } },
    { revision: 0, selection: { ...hat(), version: "f".repeat(64) } }, { revision: 0, selection: null, id: 2 },
    { revision: Number.MAX_SAFE_INTEGER, selection: null }, { revision: 0, decline: "x" }]) assert.throws(() => equipmentCommand(input));
  assert.deepEqual(equipmentCommand({ revision: 0, selection: NONE }), { revision: 0, selection: NONE });
  for (const size of [79, 121, 99.5, "100", null, undefined, NaN, Infinity]) {
    assert.throws(() => equipmentCommand({ revision: 0, size }));
    assert.throws(() => equipmentCommand({ revision: 0, selection: hat(), size }));
  }
  for (const size of [80, 100, 120]) {
    assert.deepEqual(equipmentCommand({ revision: 0, size }), { revision: 0, size });
    assert.deepEqual(equipmentCommand({ revision: 0, selection: hat(), size }), { revision: 0, selection: hat(), size });
  }
  assert.throws(() => equipmentCommand({ revision: 0, decline: "a".repeat(64), size: 100 }));
  assert.throws(() => equipmentCommand({ revision: 0, size: 100, id: 2 }));
  assert.throws(() => equipmentRecord({ item: null, version: null, revision: 1, declined: null, size: 100.5 }));
});

test("equipment: HTTP authentication, bounds, flag and server-owned identity", async t => {
  const { db, account } = await setup(t), routes = routeFixture({ cast: [{ handle: "owner1" }] });
  const room = { env: { DB: db, EQUIPMENT_ENABLED: "1" }, players: new Map(), equipmentCharacter: login => login };
  const env = { SITE_ORIGIN: SITE, DB: db, EQUIPMENT_ENABLED: "1", ROOM: { getByName: name => {
    assert.equal(name, "island"); return { equipmentFor: (...args) => equipmentRoom.request(room, ...args) };
  } } };
  const send = (body, options = {}) => routes.worker.fetch(new Request(SITE + "/api/equipment", { method: options.method || "PUT",
    headers: { origin: SITE, cookie: `__Host-obl_session=${account.token}`, "content-type": "application/json", ...options.headers },
    ...((options.method || "PUT") === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }), options.env || env);
  assert.equal((await send({ revision: 0, selection: NONE }, { env: { ...env, EQUIPMENT_ENABLED: "0" } })).status, 404);
  assert.equal((await send({ revision: 0, selection: NONE }, { headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await send({ revision: 0, selection: NONE }, { headers: { cookie: "" } })).status, 401);
  assert.equal((await send(" ".repeat(513))).status, 413);
  assert.equal((await send({ revision: 0, selection: NONE, id: 2 })).status, 400);
  const response = await send({ revision: 0, selection: NONE });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { equipment: { selection: NONE, size: 100, revision: 1, declined: null, update: null } });
  const conflict = await send({ revision: 0, selection: null });
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).equipment.revision, 1);
  assert.equal((await send(null, { method: "GET" })).status, 200);
  assert.equal((await send({ revision: 1, selection: null }, { env: { ...env, EQUIPMENT_LIMITER: { limit: async () => ({ success: false }) } } })).status, 429);
  assert.equal((await send({ revision: 1, size: 120.5 })).status, 400);
  const resized = await send({ revision: 1, selection: hat(), size: 120 });
  assert.equal(resized.status, 200); assert.equal((await resized.json()).equipment.size, 120);
  const reset = await send({ revision: 2, size: 100 });
  assert.equal(reset.status, 200); assert.equal((await reset.json()).equipment.size, 100);
  room.equipmentCharacter = () => "w-s-bitcoin";
  const fitted = await send({ revision: 3, selection: helmet(), size: 80 });
  assert.equal(fitted.status, 200); assert.equal((await fitted.json()).equipment.size, 100);
  assert.equal(db.sql.prepare("SELECT size FROM player_equipment WHERE player_id = 1").get().size, 100);
});

test("equipment: only known immutable hat archives are public, digest checked and cacheable", async () => {
  const routes = routeFixture(), version = hat().version, env = { EQUIPMENT_ENABLED: "1" };
  const url = SITE + "/api/equipment/hats/" + version + ".json";
  const response = await routes.worker.fetch(new Request(url), env), body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(createHash("sha256").update(body).digest("hex"), version);
  assert.equal(body, equipmentHatArchive(version));
  assert.match(response.headers.get("cache-control"), /immutable/);
  assert.equal((await routes.worker.fetch(new Request(url, { headers: { "if-none-match": `"${version}"` } }), env)).status, 304);
  assert.equal(await (await routes.worker.fetch(new Request(url, { method: "HEAD" }), env)).text(), "");
  assert.equal((await routes.worker.fetch(new Request(url), { EQUIPMENT_ENABLED: "0" })).status, 404);
  assert.equal((await routes.worker.fetch(new Request(url.replace(version, "f".repeat(64))), env)).status, 404);
});

test("equipment: Room admission receives only the authenticated session digest", async t => {
  const { db, account } = await setup(t), routes = routeFixture({ cast: [{ handle: "owner1" }] });
  let forwarded;
  const env = { SITE_ORIGIN: SITE, DB: db, EQUIPMENT_ENABLED: "1", ROOM: { getByName: () => ({ fetch: async request => {
    forwarded = request; return new Response("accepted");
  } }) } };
  const request = () => new Request(SITE + "/room", { headers: { origin: SITE, upgrade: "websocket",
    cookie: `__Host-obl_session=${account.token}`, "x-player-equipment-session": "f".repeat(64) } });
  assert.equal((await routes.worker.fetch(request(), env)).status, 200);
  assert.equal(forwarded.headers.get("x-player-equipment-session"), account.session.token_hash);
  assert.notEqual(forwarded.headers.get("x-player-equipment-session"), account.token);
  assert.equal((await routes.worker.fetch(request(), { ...env, EQUIPMENT_ENABLED: "0" })).status, 200);
  assert.equal(forwarded.headers.get("x-player-equipment-session"), null, "disabled deployment neither trusts nor sends the header");
});

test("equipment: public retention catalog remains available while disabled and exposes only immutable history", async () => {
  const routes = routeFixture(), url = SITE + "/api/equipment/catalog";
  const expected = { format: 1, items: equipmentHats.items.map(({ id, versions }) => ({ id, versions })) };
  for (const enabled of ["0", "1", undefined]) {
    const env = { EQUIPMENT_ENABLED: enabled };
    const response = await routes.worker.fetch(new Request(url), env);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), expected);
    const head = await routes.worker.fetch(new Request(url, { method: "HEAD" }), env);
    assert.equal(head.status, 200); assert.equal(head.headers.get("cache-control"), "no-store"); assert.equal(await head.text(), "");
    const refused = await routes.worker.fetch(new Request(url, { method: "PUT", body: "{}" }), env);
    assert.equal(refused.status, 405); assert.equal(refused.headers.get("allow"), "GET, HEAD");
  }
  assert.ok(expected.items.length <= 32);
  assert.ok(expected.items.reduce((sum, item) => sum + item.versions.length, 0) <= 256);
});
