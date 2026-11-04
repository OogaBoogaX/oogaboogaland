// Contract: public reads, session-owned writes, per-machine records and the actual migration/SQL.
// SQLite stands in for D1; every comparison, trigger and bound-board replacement is production code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { deletePlayer, getSession, upsertPlayerFromGitHub } from "../src/db.js";
import { createSession } from "../src/db.js";
import { sha256Hex } from "../src/crypto.js";
import { routeFixture } from "./routes.mjs";
import { deliverHighscores } from "../src/highscore-store.js";

const SITE = "https://site.test", RULES = globalThis.BL.highscoreRules;
const { createHighscoreHandler } = routeFixture();
const database = (runs = true, cabinets = true, guard = runs && cabinets) => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0001_init.sql", "0002_tess.sql", "0003_highscores.sql", "0004_highscore_notifications.sql", "0005_cloud_hopper_levels.sql", "0006_cloud_hopper_replays.sql", ...(runs ? ["0007_cloud_hopper_runs.sql"] : []), ...(cabinets ? ["0008_cabinet_runs.sql"] : []), ...(guard ? ["0009_identity_collision_guard.sql"] : [])]) {
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
  assert.deepEqual(rows.filter(row => row.game_id !== "hockey").map(row => row.game_id).sort(), Object.keys(RULES.games).sort());
  for (const row of rows.filter(row => row.game_id !== "hockey")) {
    const rule = RULES.get(row.game_id), response = await handler(read(row.game_id), env);
    assert.equal(row.score_type, rule.scoreType);
    assert.equal(row.direction, rule.direction);
    assert.equal(row.unit, rule.unit);
    assert.equal(row.rules_version, rule.version);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).highscores, {});
  }
  for (const game of ["hockey", "ghost", "poker", "dsb", "constructor", "unknown", "darts/extra"]) {
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
  await assert.rejects(player(DB, 2, "Reused-Name"), /identity collision/);
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l1")).highscores, { "reused-name": 47000 });
  await player(DB, 1, "refreshed-name");
  await player(DB, 2, "Reused-Name");
  await deletePlayer(DB, 1);
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


const runId = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
test("distinct Cloud Hopper finishes share a username, retries are idempotent and only the fastest ten are public", async t => {
  const { DB, handler, env } = await setup(t), game = "cloud-hopper-l1";
  const submit = (n, score) => handler(write(game, game, score, { runId: runId(n) }), env);
  await submit(1, 30742); await submit(2, 29000); await submit(3, 31000);
  let board = await scores(handler, env, game);
  assert.deepEqual(board.runs.map(r => [r.username, r.score]), [["player-one", 29000], ["player-one", 30742], ["player-one", 31000]]);
  assert.equal(board.runs[0].achieved, board.achieved["player-one"]);
  assert.equal(board.runs[0].id, await sha256Hex(JSON.stringify([game, 1, runId(2)])));
  await submit(2, 29000); await submit(2, 100); // A reused ID cannot change the accepted run or personal best.
  assert.deepEqual(await scores(handler, env, game), board);
  const other = await authenticated(DB, await player(DB, 2, "other"));
  await other(write(game, game, 29000, { playerId: 2, runId: runId(2) }), env);
  await submit(4, 29000); // Equal times from distinct runs remain distinct and preserve first achievement.
  board = await scores(handler, env, game);
  assert.deepEqual(board.runs.slice(0, 3).map(r => r.username), ["player-one", "other", "player-one"]);
  for (let i = 5; i < 16; i++) await submit(i, 32000 + i);
  board = await scores(handler, env, game);
  assert.equal(board.runs.length, 10);
  assert.equal(board.runs.at(-1).score, 32009);
  assert.ok(board.runs.every(r => Object.keys(r).sort().join() === "achieved,id,score,username"));
  assert.deepEqual((await scores(handler, env, "cloud-hopper-l2")).runs, []);
  await player(DB, 1, "renamed");
  board = await scores(handler, env, game);
  assert.ok(board.runs.every(r => r.username === "renamed" || r.username === "other"));
  const beforeClaim = DB.sql.prepare("SELECT * FROM cloud_hopper_runs ORDER BY game, player_id, run_id").all();
  await assert.rejects(player(DB, 3, "renamed"), /identity collision/);
  assert.deepEqual(DB.sql.prepare("SELECT * FROM cloud_hopper_runs ORDER BY game, player_id, run_id").all(), beforeClaim);
  await player(DB, 1, "current-name");
  await player(DB, 3, "renamed");
  await deletePlayer(DB, 1); // Only explicit account deletion removes that account's runs.
  assert.deepEqual((await scores(handler, env, game)).runs.map(r => r.username), ["other"]);
  await deletePlayer(DB, 2);
  assert.deepEqual((await scores(handler, env, game)).runs, []);
  await submit(20, 1000); // Stale session cannot resurrect rows after the username claim.
  assert.deepEqual((await scores(handler, env, game)).runs, []);
  for (const id of ["", "injected", 7, null]) assert.equal((await handler(write(game, game, 100, { runId: id }), env)).status, 400);
  assert.equal((await handler(write("darts", "darts-1", 100, { runId: runId(1) }), env)).status, 400);
});

test("run retention stays bounded, ties retain existing runs, and slower accepted runs notify watchers", async t => {
  const { DB, handler, env } = await setup(t), game = "cloud-hopper-l1";
  const insert = DB.sql.prepare("INSERT INTO cloud_hopper_runs(game, run_id, player_id, score, achieved) VALUES (?, ?, 1, ?, ?)");
  for (let i = 0; i < 1024; i++) insert.run(game, runId(i), 10000 + i, i);
  await handler(write(game, game, 11023, { runId: runId(1024) }), env);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_runs").get().n, 1024);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_runs WHERE run_id = ?").get(runId(1024)).n, 0);
  await handler(write(game, game, 9999, { runId: runId(1025) }), env);
  assert.equal(DB.sql.prepare("SELECT MAX(score) worst FROM cloud_hopper_runs").get().worst, 11022);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_runs").get().n, 1024);
  const notifications = [];
  env.ROOM = { getByName: () => ({ refreshHighscores: async g => notifications.push(g) }) };
  await handler(write(game, game, 10001, { runId: runId(1026) }), env);
  assert.deepEqual(notifications, [game]);
  const delivered = [];
  await deliverHighscores(DB, board => { delivered.push(board); return true; }, game);
  assert.equal(delivered[0].runs.filter(r => r.score === 10001).length, 2);
});

test("run migration preserves the existing score, timestamp and replay pointer without inventing history", async t => {
  const DB = database(false); t.after(() => DB.sql.close());
  const handler = await authenticated(DB, await player(DB)), game = "cloud-hopper-l1";
  DB.sql.prepare("UPDATE game_highscores SET highscores = ?, owners = ?, achieved = ?, revision = 8 WHERE game_id = ?")
    .run('{"player-one":29000}', '{"player-one":1}', '{"player-one":1234}', game);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_objects(hash, game, player_id, score, bytes, course_version, expires_at, state) VALUES (?, ?, 1, 29000, 100, 1, 999999, 'ready')")
    .run("a".repeat(64), game);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_winners(game, player_id, score, achieved, hash) VALUES (?, 1, 29000, 1234, ?)").run(game, "a".repeat(64));
  const before = DB.sql.prepare("SELECT * FROM game_highscores WHERE game_id = ?").get(game);
  DB.sql.exec(readFileSync(new URL("../migrations/0007_cloud_hopper_runs.sql", import.meta.url), "utf8"));
  assert.deepEqual(DB.sql.prepare("SELECT * FROM game_highscores WHERE game_id = ?").get(game), before);
  const response = await handler(read(game), { DB, CLOUD_HOPPER_REPLAYS: {} });
  const board = await response.json();
  assert.deepEqual(board.runs.map(({ id, ...run }) => run), [{ username: "player-one", score: 29000, achieved: 1234 }]);
  assert.equal(board.replay.hash, "a".repeat(64));
});


test("retained personal bests still fill the board after a player's faster run history is deleted", async t => {
  const { DB, handler, env } = await setup(t), game = "cloud-hopper-l1";
  const other = await authenticated(DB, await player(DB, 2, "other"));
  await other(write(game, game, 50000, { playerId: 2, runId: runId(3000) }), env);
  const insert = DB.sql.prepare("INSERT INTO cloud_hopper_runs(game, run_id, player_id, score, achieved) VALUES (?, ?, 1, ?, ?)");
  for (let i = 0; i < 1024; i++) insert.run(game, runId(i), 10000 + i, i);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_runs WHERE player_id = 2").get().n, 0);
  await deletePlayer(DB, 1);
  const board = await scores(handler, env, game);
  assert.deepEqual(board.runs.map(({ id, ...run }) => run), [{ username: "other", score: 50000, achieved: board.achieved.other }]);
});

test("historical hockey records remain stored but cannot be read, updated or included in Arcade boards", async t => {
  const { DB, handler, env } = await setup(t);
  DB.sql.exec(`UPDATE game_highscores SET highscores='{"hockey-1":120}' WHERE game_id='hockey'`);
  assert.equal((await handler(read("hockey"),env)).status,404);
  assert.equal((await handler(write("hockey","hockey-1",7),env)).status,404);
  const snapshot=await scores(handler,env,"arcade");assert.ok(snapshot.boards.every(board=>board.game!=="hockey"));
  assert.equal(DB.sql.prepare("SELECT highscores FROM game_highscores WHERE game_id='hockey'").get().highscores,'{"hockey-1":120}');
});


test("identity guard installs without data changes and preserves every board through claimant-first writes and rename", async t => {
  const DB = database(true, true, false); t.after(() => DB.sql.close());
  const handler = await authenticated(DB, await player(DB, 1, "original")), env = { DB, SITE_ORIGIN: SITE };
  for (const game of ["cloud-hopper-l1", "cloud-hopper-l2", "cloud-hopper-l3", "cloud-hopper-l4"])
    await handler(write(game, game, 47000, { runId: runId(1) }), env);
  const other = await authenticated(DB, await player(DB, 2, "other"));
  for (const game of RULES.cabinets) {
    const machine = RULES.get(game).machines[0];
    await handler(write(game, machine, 3000, { runId: runId(1) }), env);
    await handler(write(game, machine, 2000, { runId: runId(2) }), env);
    await other(write(game, machine, 4000, { playerId: 2, runId: runId(1) }), env);
  }
  const tables = ["players", "sessions", "game_highscores", "cloud_hopper_runs", "cabinet_runs", "cloud_hopper_replay_objects", "cloud_hopper_replay_winners", "cloud_hopper_replay_tickets", "highscore_notifications"];
  const snapshot = () => tables.map(table => DB.sql.prepare(`SELECT * FROM ${table}`).all());
  const before = snapshot();
  DB.sql.exec(readFileSync(new URL("../migrations/0009_identity_collision_guard.sql", import.meta.url), "utf8"));
  assert.deepEqual(snapshot(), before);
  await assert.rejects(player(DB, 3, "ORIGINAL"), /identity collision/);
  assert.deepEqual(snapshot(), before);
  await assert.rejects(player(DB, 2, "Original"), /identity collision/);
  assert.deepEqual(snapshot(), before);
  await assert.rejects(player(DB, 1, "OTHER"), /identity collision/);
  assert.deepEqual(snapshot(), before);
  const cabinets = await Promise.all(RULES.cabinets.map(game => scores(handler, env, game)));
  await player(DB, 1, "new-name");
  await player(DB, 3, "original");
  for (const game of ["cloud-hopper-l1", "cloud-hopper-l2", "cloud-hopper-l3", "cloud-hopper-l4"])
    assert.deepEqual((await scores(handler, env, game)).highscores, { "new-name": 47000 });
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_runs WHERE player_id=1").get().n, 4);
  for (const table of ["sessions", "cloud_hopper_runs", "cabinet_runs", "cloud_hopper_replay_objects", "cloud_hopper_replay_winners", "cloud_hopper_replay_tickets"])
    assert.deepEqual(DB.sql.prepare(`SELECT * FROM ${table}`).all(), before[tables.indexOf(table)]);
  const live = await scores(handler, env, "arcade-live"), publicSnapshot = await scores(handler, env, "arcade"), notices = [];
  await deliverHighscores(DB, board => { notices.push(board); return true; });
  for (const previous of cabinets) {
    const expected = previous.runs.map(run => ({ ...run, username: run.username === "original" ? "new-name" : run.username }));
    const board = await scores(handler, env, previous.game);
    assert.deepEqual(board.runs, expected);
    assert.deepEqual(board.highscores, previous.highscores);
    assert.deepEqual(board.achieved, previous.achieved);
    assert.ok(board.revision > previous.revision);
    assert.deepEqual(notices.find(b => b.game === previous.game).runs, expected);
    if (RULES.arcade.includes(previous.game)) for (const boards of [live.boards, publicSnapshot.boards])
      assert.deepEqual(boards.find(b => b.game === previous.game).runs, expected);
  }
});

test("returning players with legacy duplicate logins revoke stale sessions but preserve every owner's history and reject new claims", async t => {
  const DB = database(true, true, false); t.after(() => DB.sql.close());
  await player(DB, 1, "Shared"); await player(DB, 2, "shared"); await player(DB, 4, "other");
  const tokens = new Map();
  for (const id of [1,2,4]) tokens.set(id,await createSession(DB,id,"existing"));
  DB.sql.exec(`UPDATE game_highscores SET highscores='{"shared":47000}',owners='{"shared":1}',achieved='{"shared":10}' WHERE game_id='cloud-hopper-l1'`);
  for (const id of [1,2,4]) {
    DB.sql.prepare("INSERT INTO cloud_hopper_runs(game,run_id,player_id,score,achieved) VALUES('cloud-hopper-l1',?,?,?,?)").run(runId(id),id,46000+id*1000,10*id);
    for (const game of RULES.cabinets)
      DB.sql.prepare("INSERT INTO cabinet_runs(game,run_id,player_id,score,achieved) VALUES(?,?,?,?,?)").run(game,runId(id),id,1000*id,10*id);
  }
  const hash = "b".repeat(64);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_objects(hash,game,player_id,score,bytes,course_version,expires_at,state) VALUES (?,'cloud-hopper-l1',1,47000,100,1,9999999999999,'ready')").run(hash);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_winners(game,player_id,score,achieved,hash) VALUES ('cloud-hopper-l1',1,47000,10,?)").run(hash);
  const tables = ["sessions","game_highscores","cloud_hopper_runs","cabinet_runs","cloud_hopper_replay_objects","cloud_hopper_replay_winners","cloud_hopper_replay_tickets","highscore_notifications"];
  const snapshot = () => tables.map(table => DB.sql.prepare(`SELECT * FROM ${table}`).all());
  const before = snapshot();
  DB.sql.exec(readFileSync(new URL("../migrations/0009_identity_collision_guard.sql",import.meta.url),"utf8"));
  assert.deepEqual(snapshot(),before);
  const refreshed = before.map((rows,i) => tables[i] === "sessions" ? rows.filter(row => row.player_id !== 1) : rows);
  for (const [id,login] of [[2,"shared"],[2,"SHARED"]]) {
    await player(DB,id,login);
    assert.deepEqual(snapshot(),refreshed);
    assert.equal(await getSession(DB,tokens.get(1)),null);
    assert.equal((await getSession(DB,tokens.get(2))).player.id,2);
    assert.equal((await getSession(DB,tokens.get(4))).player.id,4);
  }
  await assert.rejects(player(DB,3,"shared"),/identity collision/);
  await assert.rejects(player(DB,4,"SHARED"),/identity collision/);
  assert.deepEqual(snapshot(),refreshed);
  await player(DB,1,"current-name");
  for (const table of ["sessions","cloud_hopper_runs","cabinet_runs","cloud_hopper_replay_objects","cloud_hopper_replay_winners","cloud_hopper_replay_tickets"])
    assert.deepEqual(DB.sql.prepare(`SELECT * FROM ${table}`).all(),refreshed[tables.indexOf(table)]);
  assert.deepEqual(JSON.parse(DB.sql.prepare("SELECT highscores FROM game_highscores WHERE game_id='cloud-hopper-l1'").get().highscores),{"current-name":47000});
});

test("same-ID duplicate names retain the faster score, original timestamp and replay pointer", async t => {
  const { DB, handler, env } = await setup(t, 1, "old");
  const game = "cloud-hopper-l1", hash = "a".repeat(64);
  DB.sql.prepare("UPDATE game_highscores SET highscores=?,owners=?,achieved=? WHERE game_id=?")
    .run('{"old":50000,"new":40000,"other":60000}', '{"old":1,"new":1,"other":2}', '{"old":10,"new":20,"other":30}', game);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_objects(hash,game,player_id,score,bytes,course_version,expires_at,state) VALUES (?,?,1,40000,100,1,9999999999999,'ready')").run(hash,game);
  DB.sql.prepare("INSERT INTO cloud_hopper_replay_winners(game,player_id,score,achieved,hash) VALUES (?,1,40000,20,?)").run(game,hash);
  const before = DB.sql.prepare("SELECT * FROM cloud_hopper_replay_winners").all();
  await player(DB, 1, "new");
  const board = await scores(handler, env, game);
  assert.deepEqual(board.highscores, { new: 40000, other: 60000 });
  assert.deepEqual(board.achieved, { new: 20, other: 30 });
  assert.deepEqual(DB.sql.prepare("SELECT * FROM cloud_hopper_replay_winners").all(), before);
});


test("same-account score merge respects both directions, earliest ties, and refuses another score owner", async t => {
  for (const [direction, oldScore, newScore, oldAt, newAt, score, achieved] of [
    ["asc", 30, 40, 20, 10, 30, 20], ["desc", 30, 40, 20, 10, 40, 10],
    ["desc", 40, 30, 20, 10, 40, 20], ["asc", 30, 30, 20, 10, 30, 10],
    ["desc", 30, 30, 10, 20, 30, 10],
  ]) {
    const { DB } = await setup(t, 1, "old"), game = "cloud-hopper-l1";
    DB.sql.prepare("UPDATE game_highscores SET direction=?,highscores=?,owners=?,achieved=? WHERE game_id=?")
      .run(direction, JSON.stringify({ old: oldScore, new: newScore }), '{"old":1,"new":1}', JSON.stringify({ old: oldAt, new: newAt }), game);
    await player(DB, 1, "new");
    const row = DB.sql.prepare("SELECT highscores,achieved FROM game_highscores WHERE game_id=?").get(game);
    assert.deepEqual(JSON.parse(row.highscores), { new: score });
    assert.deepEqual(JSON.parse(row.achieved), { new: achieved });
  }
  const { DB } = await setup(t, 1, "old");
  DB.sql.prepare("UPDATE game_highscores SET highscores=?,owners=?,achieved=? WHERE game_id='cloud-hopper-l1'")
    .run('{"destination":123}', '{"destination":99}', '{"destination":10}');
  const before = DB.sql.prepare("SELECT * FROM game_highscores").all();
  await assert.rejects(player(DB, 1, "destination"), /identity collision/);
  assert.deepEqual(DB.sql.prepare("SELECT * FROM game_highscores").all(), before);
  assert.equal(DB.sql.prepare("SELECT login FROM players WHERE id=1").get().login, "old");
});

test("all eleven video cabinets publish attributed top runs without changing legacy machine records", async t => {
  const { handler, env } = await setup(t);
  assert.equal(RULES.cabinets.length, 11);
  for (const game of RULES.cabinets) {
    const machine = RULES.get(game).machines[0];
    await handler(write(game, machine, 9000), env); // Historical/legacy record has no invented owner.
    assert.deepEqual((await scores(handler, env, game)).runs, []);
    await Promise.all([1000, 2000, 1500].map((score, i) => handler(write(game, machine, score, { runId: runId(i) }), env)));
    const board = await scores(handler, env, game);
    assert.deepEqual(board.highscores, { [machine]: 9000 });
    assert.deepEqual(board.runs.map(r => [r.username, r.score]), [["player-one", 2000], ["player-one", 1500], ["player-one", 1000]]);
    assert.ok(board.runs.every(r => Object.keys(r).sort().join() === "achieved,id,score,username"));
    assert.equal(board.runs[0].id, await sha256Hex(JSON.stringify([game, 1, runId(1)])));
  }
  const snapshot = await scores(handler, env, "arcade-live");
  for (const board of snapshot.boards) {
    if (RULES.cabinets.includes(board.game)) assert.deepEqual(board.runs, (await scores(handler, env, board.game)).runs);
    else assert.equal(board.runs, undefined);
  }
  const cached = await scores(handler, env, "arcade");
  assert.deepEqual(cached.boards.find(b => b.game === "snake").runs, snapshot.boards.find(b => b.game === "snake").runs);
  assert.equal((await scores(handler, env, "race")).runs, undefined);
});

test("cabinet run retries, top-ten ordering, identity changes and notifications preserve authoritative results", async t => {
  const { DB, handler, env } = await setup(t), game = "drop", machine = "drop-1";
  const submit = (n, score) => handler(write(game, machine, score, { runId: runId(n) }), env);
  await submit(1, 500); await submit(2, 900); await submit(3, 700);
  let board = await scores(handler, env, game);
  assert.deepEqual(board.runs.map(r => r.score), [900, 700, 500]);
  await submit(2, 900); await submit(2, 99999);
  assert.deepEqual(await scores(handler, env, game), board);
  const other = await authenticated(DB, await player(DB, 2, "other"));
  await other(write(game, machine, 900, { playerId: 2, runId: runId(2) }), env);
  await submit(4, 900);
  board = await scores(handler, env, game);
  assert.deepEqual(board.runs.slice(0, 3).map(r => r.username), ["player-one", "other", "player-one"]);
  for (let n = 5; n < 16; n++) await submit(n, 100 + n);
  board = await scores(handler, env, game);
  assert.equal(board.runs.length, 10);
  assert.deepEqual(board.runs.map(r => r.score), [900, 900, 900, 700, 500, 115, 114, 113, 112, 111]);
  const notices = [];
  env.ROOM = { getByName: () => ({ refreshHighscores: async id => notices.push(id) }) };
  await submit(16, 800); // Not a machine best, but a new ranked finish still wakes clients.
  assert.deepEqual(notices, [game]);
  const delivered = [];
  await deliverHighscores(DB, data => { delivered.push(data); return true; }, game);
  assert.equal(delivered[0].runs[3].score, 800);
  await player(DB, 1, "renamed");
  board = await scores(handler, env, game);
  assert.ok(board.runs.every(r => r.username === "renamed" || r.username === "other"));
  assert.ok(board.revision > delivered[0].revision);
  const beforeClaim = DB.sql.prepare("SELECT * FROM cabinet_runs ORDER BY game, player_id, run_id").all();
  await assert.rejects(player(DB, 3, "renamed"), /identity collision/);
  assert.deepEqual(DB.sql.prepare("SELECT * FROM cabinet_runs ORDER BY game, player_id, run_id").all(), beforeClaim);
  await player(DB, 1, "current-name");
  await player(DB, 3, "renamed");
  assert.deepEqual(DB.sql.prepare("SELECT * FROM cabinet_runs ORDER BY game, player_id, run_id").all(), beforeClaim);
  await deletePlayer(DB, 1); // Only explicit account deletion removes this account's runs and session.
  assert.deepEqual((await scores(handler, env, game)).runs.map(r => r.username), ["other"]);
  await submit(20, 1000); // A revoked old session cannot restore attributed rows or improve the record.
  assert.deepEqual((await scores(handler, env, game)).highscores, { [machine]: 900 });
  await deletePlayer(DB, 2);
  board = await scores(handler, env, game);
  assert.deepEqual(board.runs, []);
  assert.deepEqual(board.highscores, { [machine]: 900 });
  for (const id of ["", "injected", 7, null]) assert.equal((await handler(write(game, machine, 100, { runId: id }), env)).status, 400);
  assert.equal((await handler(write(game, machine, 100, { runId: runId(30), playerId: 2 }), env)).status, 409);
});

test("cabinet run retention keeps the best 1024, stable ties and private account ownership", async t => {
  const { DB, handler, env } = await setup(t), game = "snake";
  const insert = DB.sql.prepare("INSERT INTO cabinet_runs(game, run_id, player_id, score, achieved) VALUES (?, ?, 1, ?, ?)");
  for (let i = 1; i <= 1024; i++) insert.run(game, runId(i), i, i);
  await handler(write(game, "snake-1", 1, { runId: runId(1025) }), env);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cabinet_runs").get().n, 1024);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cabinet_runs WHERE run_id = ?").get(runId(1025)).n, 0);
  await handler(write(game, "snake-1", 2000, { runId: runId(1026) }), env);
  assert.equal(DB.sql.prepare("SELECT MIN(score) worst FROM cabinet_runs").get().worst, 2);
  assert.equal(DB.sql.prepare("SELECT count(*) n FROM cabinet_runs").get().n, 1024);
  const board = await scores(handler, env, game);
  assert.deepEqual(board.runs.map(r => r.score), [2000, 1024, 1023, 1022, 1021, 1020, 1019, 1018, 1017, 1016]);
  DB.sql.prepare("DELETE FROM sessions WHERE player_id = 1").run();
  await handler(write(game, "snake-1", 3000, { runId: runId(1027) }), env);
  assert.deepEqual(await scores(handler, env, game), board);
  await player(DB, 2, "other");
  const tied = DB.sql.prepare("INSERT INTO cabinet_runs(game, run_id, player_id, score, achieved) VALUES ('mine', ?, ?, 3000, 10)");
  tied.run(runId(2), 2); tied.run(runId(9), 1); tied.run(runId(8), 1);
  const ties = await scores(handler, env, "mine");
  assert.deepEqual(ties.runs.map(r => r.username), ["player-one", "player-one", "other"]);
  assert.equal(ties.runs[0].id, await sha256Hex(JSON.stringify(["mine", 1, runId(8)])));
});

test("cabinet migration leaves unattributed historical records intact and starts an empty run list", async t => {
  const DB = database(true, false); t.after(() => DB.sql.close());
  const handler = await authenticated(DB, await player(DB));
  DB.sql.exec(`UPDATE game_highscores SET highscores='{"mine-1":15000}', achieved='{"mine-1":123}', revision=7 WHERE game_id='mine'`);
  const before = DB.sql.prepare("SELECT * FROM game_highscores WHERE game_id='mine'").get();
  DB.sql.exec(readFileSync(new URL("../migrations/0008_cabinet_runs.sql", import.meta.url), "utf8"));
  assert.deepEqual(DB.sql.prepare("SELECT * FROM game_highscores WHERE game_id='mine'").get(), before);
  const board = await scores(handler, { DB }, "mine");
  assert.deepEqual(board.highscores, { "mine-1": 15000 });
  assert.deepEqual(board.runs, []);
});
