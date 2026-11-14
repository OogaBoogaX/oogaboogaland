// Actual route validation and retention/rate SQL, using SQLite for the D1 contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createSession, deletePlayer, upsertPlayerFromGitHub } from "../src/db.js";
import { routeFixture } from "./routes.mjs";

const SITE = "https://site.test";
const { createConnectionReportHandler, validConnectionReport, pruneConnectionReports } = routeFixture();
const database = () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0001_init.sql", "0011_connection_reports.sql"])
    sql.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
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

const payload = () => ({ v: 1, consent: true, kind: "room-close", clientBuild: "1234abcd", gapMs: 0,
  events: [{ kind: "socket-close", ageMs: 2000, room: "live", hidden: false, remotes: 2,
    unanswered: 0, voiceEnabled: true, voiceMuted: false, lastMessageAge: 200, lastPongAge: null,
    code: 1006, clean: false }] });
const request = (body = payload(), headers = {}, method = "POST") => new Request(`${SITE}/api/connection-reports`, {
  method, headers: { origin: SITE, "content-type": "application/json", ...headers },
  ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});
const setup = async t => {
  const DB = database(); t.after(() => DB.sql.close());
  const account = await upsertPlayerFromGitHub(DB, { id: 1, login: "player-one" });
  const env = { SITE_ORIGIN: SITE, DB, CONNECTION_REPORT_LIMITER: { limit: async () => ({ success: true }) },
    CF_VERSION_METADATA: { id: "worker-deployment" } };
  return { DB, env, handler: createConnectionReportHandler(async () => ({ player: account })) };
};
const count = DB => DB.sql.prepare("SELECT COUNT(*) AS n FROM connection_reports").get().n;
const insert = (DB, age, id = 1) => DB.sql.prepare(`INSERT INTO connection_reports
  (player_id, created_at, kind, client_build, worker_version, payload) VALUES (?, unixepoch() - ?, 'room-close', '', '', '{}')`).run(id, age);

test("dropout reports: authenticated same-origin POST stores server-owned account/version and bounded payload", async t => {
  const { DB, env } = await setup(t);
  const routes = routeFixture({ cast: [{ handle: "player-one", github_login: "player-one",
    joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" }] });
  assert.equal((await routes.worker.fetch(request(), env)).status, 401);
  const token = await createSession(DB, 1, "test"), cookie = { cookie: `__Host-obl_session=${token}` };
  assert.equal((await routes.worker.fetch(request(payload(), { ...cookie, origin: "https://elsewhere.test" }), env)).status, 403);
  assert.equal((await routes.worker.fetch(request(null, cookie, "GET"), env)).status, 405);
  assert.equal((await routes.worker.fetch(request(payload(), cookie), env)).status, 201);
  const row = DB.sql.prepare("SELECT * FROM connection_reports").get();
  assert.equal(row.player_id, 1); assert.equal(row.worker_version, "worker-deployment");
  assert.deepEqual(JSON.parse(row.payload), payload());
  assert.ok(Math.abs(row.created_at - Date.now() / 1000) < 5);
  DB.sql.prepare("UPDATE players SET banned_at = 1 WHERE id = 1").run();
  assert.equal((await routes.worker.fetch(request(payload(), cookie), env)).status, 401);
  assert.equal(count(DB), 1);
});

test("dropout reports: explicit consent and exact schemas reject private or arbitrary error data", () => {
  assert.equal(validConnectionReport(payload()), true);
  for (const body of [null, [], {}, { ...payload(), consent: false }, { ...payload(), playerId: 2 },
    { ...payload(), message: "private error" }, { ...payload(), kind: "generic-error" },
    { ...payload(), clientBuild: "https://private.invalid/path" }, { ...payload(), gapMs: 1 },
    { ...payload(), events: [] }, { ...payload(), events: Array(17).fill(payload().events[0]) }])
    assert.equal(validConnectionReport(body), false);
  for (const extra of [{ id: 2 }, { login: "private" }, { x: 1 }, { reason: "private text" },
    { code: 5000 }, { clean: "yes" }, { lastMessageAge: undefined }, { lastPongAge: -1 },
    { hidden: 1 }, { ageMs: 120001 }, { remotes: 1001 }, { kind: "arbitrary" }]) {
    const body = payload(); Object.assign(body.events[0], extra);
    assert.equal(validConnectionReport(body), false, JSON.stringify(extra));
  }
  for (const [kind, event] of [["heartbeat-timeout", "heartbeat-timeout"], ["room-kick", "kick"], ["peer-return", "peer-return"]]) {
    const body = payload(); body.kind = kind; body.events[0].kind = event;
    delete body.events[0].code; delete body.events[0].clean;
    if (event !== "heartbeat-timeout") body.events[0].reason = "stale";
    assert.equal(validConnectionReport(body), true);
  }
});

test("dropout reports: body bounds, fail-closed binding, limiter and schema prevent writes", async t => {
  const { DB, env, handler } = await setup(t);
  assert.equal((await handler(request(), { ...env, CONNECTION_REPORT_LIMITER: null })).status, 503);
  assert.equal((await handler(request(), { ...env, CONNECTION_REPORT_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal((await handler(request(payload(), { "content-type": "text/plain" }), env)).status, 415);
  assert.equal((await handler(request("x".repeat(8193)), env)).status, 413);
  assert.equal((await handler(request("{"), env)).status, 400);
  assert.equal((await handler(request({ ...payload(), consent: false }), env)).status, 400);
  assert.equal((await createConnectionReportHandler(async () => { throw new Error("private"); })(request(), env)).status, 503);
  assert.equal(count(DB), 0);
});

test("dropout reports: atomic account limits survive concurrent submissions", async t => {
  const { DB, env, handler } = await setup(t);
  const statuses = await Promise.all(Array.from({ length: 8 }, async () => (await handler(request(), env)).status));
  assert.equal(statuses.filter(s => s === 201).length, 1);
  assert.equal(statuses.filter(s => s === 429).length, 7);
  DB.sql.exec("DELETE FROM connection_reports");
  for (let i = 0; i < 6; i++) insert(DB, 100 + i * 100);
  assert.equal((await handler(request(), env)).status, 429);
  DB.sql.exec("DELETE FROM connection_reports");
  for (let i = 0; i < 20; i++) insert(DB, 4000 + i * 100);
  assert.equal((await handler(request(), env)).status, 429);
});

test("dropout reports: hard global cap, upload/daily pruning and account deletion bound storage", async t => {
  const { DB, env, handler } = await setup(t);
  await upsertPlayerFromGitHub(DB, { id: 2, login: "player-two" });
  DB.sql.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10000)
    INSERT INTO connection_reports(player_id, created_at, kind, client_build, worker_version, payload)
    SELECT 2, unixepoch(), 'room-close', '', '', '{}' FROM n`);
  assert.equal((await handler(request(), env)).status, 429); assert.equal(count(DB), 10000);
  DB.sql.exec("UPDATE connection_reports SET created_at = unixepoch() - 604801");
  assert.equal((await handler(request(), env)).status, 201); assert.equal(count(DB), 1);
  insert(DB, 604801, 2); await pruneConnectionReports(DB); assert.equal(count(DB), 1);
  await deletePlayer(DB, 1); assert.equal(count(DB), 0);
});

test("dropout reports: missing migration fails privately and cannot affect the room route", async t => {
  const { DB, env, handler } = await setup(t);
  DB.sql.exec("DROP TABLE connection_reports");
  const response = await handler(request(), env);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "unavailable" });
});
