// Contract: public reads, session-owned writes, per-machine records and the actual migration/SQL.
// SQLite stands in for D1; every comparison, trigger and bound-board replacement is production code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { deletePlayer, upsertPlayerFromGitHub } from "../src/db.js";
import { createSession } from "../src/db.js";
import { sha256Hex } from "../src/crypto.js";
import { routeFixture } from "./routes.mjs";
import { deliverHighscores } from "../src/highscore-store.js";

const SITE = "https://site.test", RULES = globalThis.BL.highscoreRules;
const { createHighscoreHandler } = routeFixture();
const database = () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0001_init.sql", "0002_tess.sql", "0003_highscores.sql", "0004_highscore_notifications.sql", "0005_cloud_hopper_levels.sql"]) {
    sql.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  const statement = (query, args = []) => {
    const execute = (method) => {
      const values = [];
      const numbered = query.replace(/\?(\d+)/g, (_match, n) => { values.push(args[Number(n) - 1]); return "?"; });
      return sql.prepare(numbered)[method](...(values.length ? values : args));
    };
    return {
      bind: (...values) => statement(query, values),
      first: async (column) => {
        const row = execute("get");
        return row ? column ? row[column] : { ...row } : null;
      },
      all: async () => ({ success: true, results: execute("all").map(row => ({ ...row })) }),
      execute: () => ({ success: true, meta: execute("run") }),
      run: async () => ({ success: true, meta: execute("run") }),
    };
  };
  return { sql, prepare: query => statement(query), batch: async (statements) => {
    sql.exec("BEGIN");
    try { const result = statements.map(s => s.execute()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
};
const player = async (db, id = 1, login = "player-one") => upsertPlayerFromGitHub(db, { id, login });
const authenticated = async (db, account) => {
  const token = await createSession(db, account.id, "test"), token_hash = await sha256Hex(token);
  return createHighscoreHandler(async () => ({ player: account, session: { token_hash } }));
};
const read = (game) => new Request(`${SITE}/api/highscores/${game}`);
const write = (game, machine, score, overrides = {}, headers = {}) => new Request(`${SITE}/api/highscores/${game}`, {
  method: "POST", headers: { origin: SITE, "content-type": "application/json", ...headers },
  body: JSON.stringify({ machine, score, version: 1, playerId: 1, ...overrides }),
});
const setup = async (t, id = 1, login = "player-one") => {
  const DB = database(); t.after(() => DB.sql.close());
  const account = await player(DB, id, login);
  return { DB, env: { SITE_ORIGIN: SITE, DB }, handler: await authenticated(DB, account) };
};
const scores = async (handler, env, game) => (await handler(read(game), env)).json();

test("every allowed game has a migrated row; excluded games and unknown machines cannot write", async (t) => {
  const { DB, handler, env } = await setup(t);
  const rows = DB.sql.prepare("SELECT game_id, score_type, direction, unit, rules_version FROM game_highscores").all();
  assert.deepEqual(rows.map(row => row.game_id).sort(), Object.keys(RULES.games).sort());
  for (const row of rows) {
    const rule = RULES.get(row.game_id), response = await handler(read(row.game_id), env);
    assert.equal(row.score_type, rule.scoreType);
    assert.equal(row.direction, rule.direction);
    assert.equal(row.unit, rule.unit);
    assert.equal(row.rules_version, rule.version);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).highscores, {});
  }
  for (const game of ["ghost", "poker", "dsb", "constructor", "unknown", "darts/extra"]) {
    assert.equal((await handler(read(game), env)).status, 404);
    assert.equal((await handler(write(game, "darts-1", 10), env)).status, 404);
  }
  for (const machine of ["darts-0", "darts-3", "__proto__", "$.darts-1", "pinball-1"]) {
    assert.equal((await handler(write("darts", machine, 10), env)).status, 400);
  }
});

test("reads need no session; writes require same origin, eligible session and the captured account", async (t) => {
  const { DB, env } = await setup(t);
  const routes = routeFixture({ cast: [{ handle: "player-one", github_login: "player-one", joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" }] });
  assert.equal((await routes.worker.fetch(read("darts"), env)).status, 200);
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 20), env)).status, 401);
  const token = await createSession(DB, 1, "test"), cookie = { cookie: `__Host-obl_session=${token}` };
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 20, {}, cookie), env)).status, 200);
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 30, { playerId: 2 }, cookie), env)).status, 409);
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 30, { username: "victim" }, cookie), env)).status, 400);
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 30, {}, { ...cookie, origin: "https://elsewhere.test" }), env)).status, 403);
  DB.sql.prepare("UPDATE players SET banned_at = 1 WHERE id = 1").run();
  assert.equal((await routes.worker.fetch(write("darts", "darts-1", 30, {}, cookie), env)).status, 401);
  assert.deepEqual((await scores(routes.handleHighscores, env, "darts")).highscores, { "darts-1": 20 });
});

test("duplicate machines never share records; concurrent improvements and retries keep the maximum", async (t) => {
  const { handler, env } = await setup(t);
  await Promise.all([40, 200, 80, 200].map(score => handler(write("darts", "darts-1", score), env)));
  await handler(write("darts", "darts-2", 50), env);
  const before = await scores(handler, env, "darts");
  assert.deepEqual(before.highscores, { "darts-1": 200, "darts-2": 50 });
  await handler(write("darts", "darts-1", 200), env);
  await handler(write("darts", "darts-1", 100), env);
  assert.deepEqual(await scores(handler, env, "darts"), before);
  const response = await handler(read("darts"), env);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Cloud Hopper's levels use the GitHub login and fastest time; rename and deletion follow the numeric identity", async (t) => {
  const { DB, handler, env } = await setup(t, 1, "Original-Name");
  await handler(write("cloud-hopper-l2", "cloud-hopper-l2", 51000), env);
  await handler(write("cloud-hopper-l2", "cloud-hopper-l2", 47000), env);
  await handler(write("cloud-hopper-l2", "cloud-hopper-l2", 53000), env);
  const before = await scores(handler, env, "cloud-hopper-l2");
  assert.deepEqual(before.highscores, { "original-name": 47000 });
  assert.ok(!("owners" in before));
  await player(DB, 1, "Renamed-Player");
  const renamed = await scores(handler, env, "cloud-hopper-l2");
  assert.deepEqual(renamed.highscores, { "renamed-player": 47000 });
  assert.equal(renamed.achieved["renamed-player"], before.achieved["original-name"]);
  assert.ok(renamed.revision > before.revision);
  const renamedHandler = await authenticated(DB, { id: 1, login: "Renamed-Player" });
  await renamedHandler(write("darts", "darts-1", 180), env);
  await deletePlayer(DB, 1);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l2")).highscores, {});
  assert.deepEqual((await scores(handler, env, "darts")).highscores, { "darts-1": 180 });
  // A request authenticated just before deletion cannot resurrect either type of record.
  await renamedHandler(write("cloud-hopper-l2", "cloud-hopper-l2", 1000), env);
  await renamedHandler(write("darts", "darts-1", 250), env);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l2")).highscores, {});
  assert.equal((await scores(handler, env, "darts")).highscores["darts-1"], 180);
});

test("Cloud Hopper's levels keep separate boards; the board from before them reads, never writes, and follows identity", async (t) => {
  const { DB, handler, env } = await setup(t, 1, "Level-Runner");
  DB.sql.prepare("UPDATE game_highscores SET highscores = ?, owners = ?, achieved = ? WHERE game_id = 'cloud-hopper'")
    .run(JSON.stringify({ "level-runner": 40000 }), JSON.stringify({ "level-runner": 1 }), JSON.stringify({ "level-runner": 5 }));
  assert.equal((await handler(write("cloud-hopper", "cloud-hopper-1", 30000), env)).status, 400);
  assert.deepEqual((await scores(handler, env, "cloud-hopper")).highscores, { "level-runner": 40000 });
  const times = [61000, 92000, 140000, 210000], boards = times.map((_, i) => `cloud-hopper-l${i + 1}`);
  for (let i = 0; i < boards.length; i++) await handler(write(boards[i], boards[i], times[i]), env);
  assert.equal((await handler(write(boards[0], boards[1], 1000), env)).status, 400);
  for (let i = 0; i < boards.length; i++) assert.deepEqual((await scores(handler, env, boards[i])).highscores, { "level-runner": times[i] });
  await player(DB, 1, "Renamed-Runner");
  for (let i = 0; i < boards.length; i++) assert.deepEqual((await scores(handler, env, boards[i])).highscores, { "renamed-runner": times[i] });
  assert.deepEqual((await scores(handler, env, "cloud-hopper")).highscores, { "renamed-runner": 40000 });
  await deletePlayer(DB, 1);
  for (const board of ["cloud-hopper", ...boards]) assert.deepEqual((await scores(handler, env, board)).highscores, {});
});

test("a reused GitHub login cannot inherit a different account's record", async (t) => {
  const { DB, handler, env } = await setup(t, 1, "reused-name");
  await handler(write("cloud-hopper-l1", "cloud-hopper-l1", 47000), env);
  await player(DB, 2, "Reused-Name");
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, {});
  // A stale request that authenticated before the claim still cannot use its revoked session.
  await handler(write("cloud-hopper-l1", "cloud-hopper-l1", 1000), env);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, {});
  const next = await authenticated(DB, { id: 2, login: "Reused-Name" });
  await next(write("cloud-hopper-l1", "cloud-hopper-l1", 53000, { playerId: 2 }), env);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, { "reused-name": 53000 });
  await handler(write("cloud-hopper-l1", "cloud-hopper-l1", 1000), env);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, { "reused-name": 53000 });
  await deletePlayer(DB, 1);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, { "reused-name": 53000 });
});

test("Rally lap, race, track and mirror records remain independent and keep the minimum", async (t) => {
  const { handler, env } = await setup(t);
  const machines = RULES.get("race").machines;
  assert.equal(machines.length, 12);
  for (let i = 0; i < machines.length; i++) await handler(write("race", machines[i], 100000 + i), env);
  await handler(write("race", machines[0], 90000), env);
  await handler(write("race", machines[0], 110000), env);
  const board = (await scores(handler, env, "race")).highscores;
  assert.equal(board[machines[0]], 90000);
  for (let i = 1; i < machines.length; i++) assert.equal(board[machines[i]], 100000 + i);
});

test("an attributed board stays bounded while allowing a newcomer to beat its last place", async (t) => {
  const { DB, handler, env } = await setup(t, 5000, "newcomer");
  const highscores = {}, owners = {}, achieved = {};
  for (let i = 0; i < RULES.MAX_PLAYERS; i++) {
    highscores["player-" + i] = 10000 + i; owners["player-" + i] = i + 1; achieved["player-" + i] = i;
  }
  DB.sql.prepare("UPDATE game_highscores SET highscores = ?, owners = ?, achieved = ? WHERE game_id = 'cloud-hopper-l3'")
    .run(JSON.stringify(highscores), JSON.stringify(owners), JSON.stringify(achieved));
  await handler(write("cloud-hopper-l3", "cloud-hopper-l3", 20000, { playerId: 5000 }), env);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l3")).highscores, highscores);
  await handler(write("cloud-hopper-l3", "cloud-hopper-l3", 9000, { playerId: 5000 }), env);
  const after = await scores(handler, env, "cloud-hopper-l3");
  assert.equal(Object.keys(after.highscores).length, RULES.MAX_PLAYERS);
  assert.equal(after.highscores.newcomer, 9000);
  assert.equal(after.highscores["player-" + (RULES.MAX_PLAYERS - 1)], undefined);
  const row = DB.sql.prepare("SELECT owners, achieved FROM game_highscores WHERE game_id = 'cloud-hopper-l3'").get();
  assert.equal(Object.keys(JSON.parse(row.owners)).length, RULES.MAX_PLAYERS);
  assert.equal(Object.keys(JSON.parse(row.achieved)).length, RULES.MAX_PLAYERS);
});

test("invalid numbers, versions, content types and oversized streaming bodies never alter scores", async (t) => {
  const { handler, env } = await setup(t);
  for (const score of [0, -1, 1.5, "50", null, RULES.get("darts").max + 1]) {
    assert.equal((await handler(write("darts", "darts-1", score), env)).status, 400);
  }
  assert.equal((await handler(write("darts", "darts-1", 50, { version: 2 }), env)).status, 400);
  assert.equal((await handler(write("darts", "darts-1", 50, {}, { "content-type": "text/plain" }), env)).status, 415);
  let canceled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(600)); }, cancel() { canceled = true; } });
  const large = new Request(`${SITE}/api/highscores/darts`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body, duplex: "half" });
  assert.equal((await handler(large, env)).status, 413);
  assert.equal(canceled, true);
  assert.deepEqual((await scores(handler, env, "darts")).highscores, {});
});

test("the limiter separates public reads and account writes, and missing storage fails closed", async (t) => {
  const { handler, env } = await setup(t), keys = [];
  const limited = { ...env, HIGHSCORE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
  assert.equal((await handler(read("darts"), limited)).status, 429);
  assert.equal((await handler(write("darts", "darts-1", 50), limited)).status, 429);
  assert.deepEqual(keys, ["read:local", "write:1"]);
  assert.equal((await handler(read("darts"), { SITE_ORIGIN: SITE })).status, 503);
  const broken = { ...env, DB: { prepare() { throw new Error("unavailable"); } } };
  assert.equal((await handler(read("darts"), broken)).status, 503);
});

test("Arcade snapshot coalesces misses, shares public data across cookies, and live reads bypass it", async t => {
  const { DB, env, handler } = await setup(t);
  const cache = new Map(); let puts = 0, reads = 0;
  const prepare = DB.prepare;
  DB.prepare = query => { if (query.includes("game_id IN")) reads++; return prepare(query); };
  const publicHandler = createHighscoreHandler(() => { throw new Error("Public read asked for identity"); }, () => ({
    match: async key => cache.get(key.url)?.clone(),
    put: async (key, response) => { puts++; assert.equal([...key.headers].length, 0); cache.set(key.url, response.clone()); },
  }));
  const request = cookie => new Request(`${SITE}/api/highscores/arcade`, { headers: { cookie, authorization: "Bearer ignored" } });
  const responses = await Promise.all(Array.from({ length: 17 }, (_, i) => publicHandler(request(`session=${i}`), env)));
  assert.equal(reads, 1); assert.equal(puts, 1);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    const data = await response.json();
    assert.deepEqual(data.boards.map(b => b.game).sort(), [...RULES.arcade].sort());
    assert.ok(data.refreshAfterMs > 0 && data.refreshAfterMs <= 30000);
    assert.ok(data.boards.every(b => !Object.hasOwn(b, "owners") && !Object.hasOwn(b, "playerId")));
  }
  await handler(write("darts", "darts-1", 99), env);
  const cached = await (await publicHandler(request("new-cookie"), env)).json();
  assert.deepEqual(cached.boards.find(b => b.game === "darts").highscores, {});
  assert.equal(reads, 1);
  const live = await (await publicHandler(read("arcade-live"), env)).json();
  assert.equal(live.boards.find(b => b.game === "darts").highscores["darts-1"], 99);
  assert.equal(reads, 2); assert.equal(puts, 1);
  const [key, response] = [...cache][0], saved = await response.json();
  saved.expiresAt = Date.now() - 1; cache.set(key, Response.json(saved));
  assert.equal((await (await publicHandler(request(""), env)).json()).boards.find(b => b.game === "darts").highscores["darts-1"], 99);
  assert.equal(reads, 3); assert.equal(puts, 2);
  t.diagnostic("Measured: 17 concurrent guest HTTP calls -> 1 aggregate SELECT returning 17 rows; subsequent cache hit -> 0 D1 score reads.");
});

test("snapshot errors, unsupported methods, queries and rate limits never fill the cache", async t => {
  const { DB, env } = await setup(t); let puts = 0;
  const handler = createHighscoreHandler(async () => null, () => ({ match: async () => null, put: async () => puts++ }));
  assert.equal((await handler(write("arcade", "darts-1", 10), env)).status, 405);
  assert.equal((await handler(new Request(`${SITE}/api/highscores/arcade?personal=1`), env)).status, 404);
  assert.equal((await handler(read("arcade"), { ...env, HIGHSCORE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  DB.sql.prepare("DELETE FROM game_highscores WHERE game_id = 'darts'").run();
  assert.equal((await handler(read("arcade"), env)).status, 503);
  assert.equal(puts, 0);
});

test("committed improvements notify the binding only; unchanged or rejected scores never wake the room", async t => {
  const { DB, handler, env } = await setup(t), notifications = [], pending = [];
  env.ROOM = { getByName(name) { assert.equal(name, "island"); return { refreshHighscores: async game => {
    assert.equal(DB.sql.prepare("SELECT revision FROM highscore_notifications WHERE game_id = ?").get(game).revision, 1);
    assert.deepEqual(JSON.parse(DB.sql.prepare("SELECT highscores FROM game_highscores WHERE game_id = ?").get(game).highscores), { "darts-1": 100 });
    notifications.push(game); throw new Error("Room temporarily unavailable");
  } }; } };
  const response = await handler(write("darts", "darts-1", 100), env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(response.status, 200); assert.deepEqual(notifications, ["darts"]);
  for (const score of [100, 90, 0, 999999]) await handler(write("darts", "darts-1", score), env);
  assert.deepEqual(notifications, ["darts"]);
  assert.equal(DB.sql.prepare("SELECT count(*) AS n FROM highscore_notifications").get().n, 1);
  const delivered = [];
  await deliverHighscores(DB, board => { delivered.push(board); return true; });
  assert.equal(delivered[0].highscores["darts-1"], 100);
  assert.equal(DB.sql.prepare("SELECT count(*) AS n FROM highscore_notifications").get().n, 0);
});

test("outbox rollback, failed delivery and commit during acknowledgement cannot lose a revision", async t => {
  const { DB, handler, env } = await setup(t);
  DB.sql.exec("CREATE TRIGGER reject_score AFTER UPDATE ON game_highscores BEGIN SELECT RAISE(ABORT, 'unavailable'); END");
  assert.equal((await handler(write("darts", "darts-1", 100), env)).status, 503);
  assert.equal(DB.sql.prepare("SELECT count(*) AS n FROM highscore_notifications").get().n, 0);
  DB.sql.exec("DROP TRIGGER reject_score");
  await handler(write("darts", "darts-1", 100), env);
  await assert.rejects(deliverHighscores(DB, () => { throw new Error("delivery failed"); }));
  assert.equal(DB.sql.prepare("SELECT revision FROM highscore_notifications").get().revision, 1);
  await deliverHighscores(DB, () => false);
  assert.equal(DB.sql.prepare("SELECT count(*) AS n FROM highscore_notifications").get().n, 1);
  await deliverHighscores(DB, board => {
    assert.equal(board.revision, 1);
    DB.sql.exec("UPDATE game_highscores SET revision = revision + 1, highscores = '{\"darts-1\":200}' WHERE game_id = 'darts'");
    return true;
  });
  assert.equal(DB.sql.prepare("SELECT revision FROM highscore_notifications").get().revision, 2);
  const delivered = [];
  await deliverHighscores(DB, board => { delivered.push(board); return true; });
  assert.equal(delivered[0].revision, 2); assert.equal(delivered[0].highscores["darts-1"], 200);
  await deliverHighscores(DB, () => assert.fail("Already acknowledged"));
});

test("rename and account removal enqueue authoritative boards without growing an event history", async t => {
  const { DB, handler, env } = await setup(t);
  assert.equal((await handler(write("cloud-hopper-l1", "cloud-hopper-l1", 10000), env)).status, 200);
  await player(DB, 1, "renamed-player");
  assert.equal(DB.sql.prepare("SELECT count(*) AS n FROM highscore_notifications").get().n, 1);
  const boards = [];
  await deliverHighscores(DB, board => { boards.push(board); return true; });
  assert.deepEqual(boards[0].highscores, { "renamed-player": 10000 });
  await deletePlayer(DB, 1);
  await deliverHighscores(DB, board => { boards.push(board); return true; });
  assert.deepEqual(boards[1].highscores, {});
  assert.ok(boards[1].revision > boards[0].revision);
});
