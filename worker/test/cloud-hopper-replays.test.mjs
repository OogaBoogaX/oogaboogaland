import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { createSession, upsertPlayerFromGitHub } from "../src/db.js";
import { sha256Hex } from "../src/crypto.js";
import { routeFixture } from "./routes.mjs";

const SITE = "https://site.test", GAME = "cloud-hopper-l1", codec = globalThis.BL.cloudHopperReplayCodec;
const routes = routeFixture(), pose = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1];
const recording = (duration = 1, playerId = 1, username = "winner", game = GAME) => {
  const samples = new Float32Array(2 * codec.STRIDE);
  for (let i = 0; i < 2; i++) {
    samples[i * codec.STRIDE] = i * duration;
    for (let j = 0; j < 11; j++) samples.set(pose, i * codec.STRIDE + 1 + j * 14);
  }
  return { version: 1, game, playerId, username, name: username, duration, count: 2, samples, courseVersion: 1, seed: 42, driftTime: 0,
    appearance: { version: 1, nodes: [{ parent: -1, geometry: 0, pose }], parts: Array(11).fill(0),
      geometries: [{ verts: [0,0,0,1,0,0,0,1,0], faces: [{ i: [0,1,2], color: [200,100,50], emissive: 0 }], lines: [] }] } };
};
const database = () => {
  const sql = new DatabaseSync(":memory:"); sql.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0001_init", "0002_tess", "0003_highscores", "0004_highscore_notifications", "0005_cloud_hopper_levels", "0006_cloud_hopper_replays", "0007_cloud_hopper_runs", "0008_cabinet_runs", "0009_identity_collision_guard"])
    sql.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8"));
  const statement = (query, args = []) => {
    const execute = method => {
      const values = [], numbered = query.replace(/\?(\d+)/g, (_, n) => { values.push(args[Number(n)-1]); return "?"; });
      return sql.prepare(numbered)[method](...(values.length ? values : args));
    };
    return { bind: (...values) => statement(query, values), first: async () => execute("get") || null,
      all: async () => ({ results: execute("all") }), run: async () => ({ meta: execute("run") }), execute: () => ({ meta: execute("run") }) };
  };
  return { sql, prepare: q => statement(q), batch: async statements => {
    sql.exec("BEGIN");
    try { const out = statements.map(s => s.execute()); sql.exec("COMMIT"); return out; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
};
const setup = async t => {
  const DB = database(); t.after(() => DB.sql.close());
  const objects = new Map(); let fail = false, beforePut = null;
  const bucket = {
    async put(key, data) { if (beforePut) await beforePut(); if (fail) throw Error("storage failed"); objects.set(key, data.slice(0)); },
    async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; },
    async head(key) { return objects.has(key) ? {} : null; },
    async delete(key) { objects.delete(key); },
  };
  const env = { DB, CLOUD_HOPPER_REPLAYS: bucket, SITE_ORIGIN: SITE };
  const account = async (id = 1, login = "winner") => {
    await upsertPlayerFromGitHub(DB, { id, login });
    const token = await createSession(DB, id, "test"), hash = await sha256Hex(token);
    const found = { player: { id, login }, session: { token_hash: hash }, character: { handle: login } };
    return { handler: routes.createReplayHandler(async () => found), scores: routes.createHighscoreHandler(async () => found), hash };
  };
  const request = (game, action, body, token) => new Request(`${SITE}/api/cloud-hopper-replays/${game}/${action}`, {
    method: "POST", headers: { origin: SITE, "content-type": "application/octet-stream", ...(token ? { "x-cloud-hopper-ticket": token } : {}) }, body });
  const start = async (who, game = GAME) => {
    const response = await who.handler(request(game, "ticket"), env); assert.equal(response.status, 200);
    const { token } = await response.json();
    DB.sql.prepare("UPDATE cloud_hopper_replay_tickets SET created_at = created_at - 10000 WHERE token = ?").run(token);
    return token;
  };
  const finish = (who, r, token) => who.handler(request(r.game, "finish", codec.encode(r), token), env);
  const read = game => routes.handleHighscores(new Request(`${SITE}/api/highscores/${game}`), env).then(r => r.json());
  return { DB, objects, env, account, start, finish, read, request, fail: value => { fail = value; }, before: fn => { beforePut = fn; } };
};

test("binary roundtrip bounds duration, timestamps, finite poses, version, appearance topology and byte length", () => {
  const r = recording(), bytes = codec.encode(r), decoded = codec.decode(bytes);
  assert.equal(decoded.name, "winner"); assert.deepEqual(decoded.appearance, r.appearance);
  for (const mutate of [r => r.duration = 3601, r => r.version = 2, r => r.samples[1] = NaN,
    r => r.samples[codec.STRIDE] = 0, r => r.game = "cloud-hopper-l5", r => r.count = 12002,
    r => r.appearance.nodes[0].parent = 0, r => r.appearance.geometries[0].faces[0].i[0] = 100]) {
    const bad = structuredClone(r); mutate(bad); assert.equal(codec.encode(bad), null);
  }
  assert.equal(codec.decode(bytes.slice(0, -1)), null);
  assert.equal(codec.decode(new ArrayBuffer(codec.MAX_BYTES + 1)), null);
});

test("first signed-in finish bootstraps each empty level, guests fetch immutable recording, retries preserve earlier winner", async t => {
  const f = await setup(t), who = await f.account();
  for (let i = 1; i <= 4; i++) {
    const game = `cloud-hopper-l${i}`, token = await f.start(who, game), run = recording(i, 1, "winner", game);
    const response = await f.finish(who, run, token); assert.equal(response.status, 200);
    const first = await response.json(); assert.equal(first.replay.score, i * 1000);
    const again = await (await f.finish(who, run, token)).json(); assert.deepEqual(again, first);
    const download = await routes.handleCloudHopperReplays(new Request(`${SITE}/api/cloud-hopper-replays/${game}/${first.replay.hash}.bin`), f.env);
    assert.equal(download.status, 200); assert.match(download.headers.get("cache-control"), /immutable/);
    assert.equal(codec.decode(await download.arrayBuffer()).game, game);
  }
  assert.equal(f.objects.size, 4);
});

test("run tickets enforce origin, same account/session, version, identity, elapsed time and single payload", async t => {
  const f = await setup(t), who = await f.account(), token = await f.start(who), other = await f.account(2, "other");
  assert.equal((await routes.createReplayHandler(async () => null)(f.request(GAME, "ticket"), f.env)).status, 401);
  const cross = new Request(`${SITE}/api/cloud-hopper-replays/${GAME}/ticket`, { method: "POST", headers: { origin: "https://evil.test" } });
  assert.equal((await who.handler(cross, f.env)).status, 403);
  assert.equal((await f.finish(other, recording(1, 2, "other"), token)).status, 409);
  assert.equal((await f.finish(who, recording(1, 2, "winner"), token)).status, 400);
  const bad = recording(); bad.name = "someone-else"; assert.equal((await f.finish(who, bad, token)).status, 400);
  assert.equal((await f.finish(who, recording(20), token)).status, 400);
  assert.equal((await f.finish(who, recording(), token)).status, 200);
  assert.equal((await f.finish(who, recording(2), token)).status, 409);
  const fresh = await f.start(who); f.DB.sql.prepare("DELETE FROM sessions WHERE token_hash = ?").run(who.hash);
  await f.finish(who, recording(.5), fresh);
  assert.equal((await f.read(GAME)).highscores.winner, 1000);
});

test("ties keep original winner; faster concurrent finishes and score-only writes never pair a wrong replay", async t => {
  const f = await setup(t), a = await f.account(), b = await f.account(2, "other");
  await f.finish(a, recording(2), await f.start(a));
  await f.finish(b, recording(2, 2, "other"), await f.start(b));
  const first = (await f.read(GAME)).replay;
  assert.equal(first.username, "winner");
  const equal = recording(2); equal.seed = 99;
  await f.finish(a, equal, await f.start(a));
  assert.equal((await f.read(GAME)).replay.hash, first.hash); // Same owner/time cannot replace the original run.
  const ta = await f.start(a), tb = await f.start(b);
  await Promise.all([f.finish(a, recording(1), ta), f.finish(b, recording(.5, 2, "other"), tb)]);
  const won = await f.read(GAME); assert.equal(won.replay.username, "other"); assert.equal(won.replay.score, 500);
  const numeric = new Request(`${SITE}/api/highscores/${GAME}`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" },
    body: JSON.stringify({ machine: GAME, score: 200, version: 1, playerId: 1 }) });
  assert.equal((await a.scores(numeric, f.env)).status, 200);
  assert.equal((await f.read(GAME)).replay, null);
});

test("failed object writes leave no pointer; lost/missing objects recover with the identical accepted recording", async t => {
  const f = await setup(t), a = await f.account(), token = await f.start(a);
  f.fail(true); assert.equal((await f.finish(a, recording(), token)).status, 503);
  assert.deepEqual((await f.read(GAME)).highscores, {}); assert.equal((await f.read(GAME)).replay, null);
  f.fail(false); const result = await (await f.finish(a, recording(), token)).json(); assert.ok(result.replay);
  f.objects.clear();
  const url = `${SITE}/api/cloud-hopper-replays/${GAME}/${result.replay.hash}.bin`;
  assert.equal((await routes.handleCloudHopperReplays(new Request(url), f.env)).status, 404);
  await f.finish(a, recording(), token);
  assert.equal((await routes.handleCloudHopperReplays(new Request(url), f.env)).status, 200);
});

test("account deletion during R2 upload prevents both score and replay publication", async t => {
  const f = await setup(t), a = await f.account(), token = await f.start(a);
  f.before(() => { f.DB.sql.prepare("DELETE FROM players WHERE id = 1").run(); });
  await f.finish(a, recording(), token);
  assert.deepEqual((await f.read(GAME)).highscores, {}); assert.equal((await f.read(GAME)).replay, null);
});

test("retirement grace and orphan maintenance keep current winners and reclaim bounded old objects", async t => {
  const f = await setup(t), a = await f.account();
  const old = await (await f.finish(a, recording(2), await f.start(a))).json();
  await f.finish(a, recording(1), await f.start(a));
  f.DB.sql.prepare("UPDATE cloud_hopper_replay_objects SET expires_at = 0").run();
  await routes.pruneCloudHopperReplays(f.env);
  assert.equal(f.objects.size, 2); // First observation of retirement starts cache-safe grace.
  f.DB.sql.prepare("UPDATE cloud_hopper_replay_objects SET expires_at = 0 WHERE hash = ?").run(old.replay.hash);
  await routes.pruneCloudHopperReplays(f.env);
  assert.equal(f.objects.size, 1); assert.ok((await f.read(GAME)).replay);
  const query = f.DB.sql.prepare("INSERT INTO cloud_hopper_replay_objects(hash,game,player_id,score,bytes,course_version,expires_at,state) VALUES (?, ?, 1, 1000, 20, 1, 0, 'staged')");
  for (let i = 0; i < 127; i++) query.run(i.toString(16).padStart(64, "0"), GAME);
  assert.equal((await f.finish(a, recording(.5), await f.start(a))).status, 503);
  assert.equal(f.DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_replay_objects").get().n, 128);
  await routes.pruneCloudHopperReplays(f.env);
  assert.equal(f.DB.sql.prepare("SELECT count(*) n FROM cloud_hopper_replay_objects").get().n, 1);
});

test("client keeps the active ghost fixed while numeric boards and post-finish results stay live, loads lazily and clears on level/exit", async () => {
  const r = recording(), bytes = codec.encode(r), hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const pointer = { hash, score: 1000, username: "winner", courseVersion: 1 }, board = { game: GAME, highscores: { winner: 1000 }, achieved: { winner: 1 }, replay: pointer };
  const fetches = [], states = [], plays = [], boards = []; let hiding = 0, fail = false;
  const BL = { cloudHopperReplayCodec: codec };
  const context = { window: { BL, setTimeout, clearTimeout }, crypto: webcrypto, AbortController, Uint8Array,
    fetch: async (url, options) => { fetches.push({ url, options }); if (fail) throw Error("offline"); return new Response(bytes, { headers: { "content-type": "application/octet-stream" } }); } };
  runInNewContext(readFileSync(new URL("../../src/js/cloud-hopper-replays.js", import.meta.url), "utf8"), context);
  const player = BL.cloudHopperReplays.create({ onBoard: b => boards.push(b), onState: s => states.push(s), onPlay: r => plays.push(r), onHide: () => hiding++ });
  player.select(GAME, 1, board); player.start(); assert.equal(fetches.length, 0); assert.equal(states.at(-1), "off");
  await player.toggle(); assert.equal(fetches.length, 1); assert.equal(plays.length, 1); assert.equal(states.at(-1), "on");
  const next = { ...board, highscores: { other: 800, winner: 1000 }, achieved: { other: 2, winner: 1 },
    replay: { ...pointer, username: "other", score: 800, hash: "f".repeat(64) } };
  const beforeUpdate = hiding;
  player.update(next); assert.equal(boards.at(-1), next); assert.equal(states.at(-1), "on");
  assert.equal(hiding, beforeUpdate); assert.equal(plays.length, 1); assert.equal(player.frozen, true);
  await player.toggle(); await player.toggle(); assert.equal(fetches.length, 1); // Same immutable replay cached.
  assert.equal(plays.at(-1).username, "winner"); assert.equal(plays.at(-1).duration, 1);
  player.end(); assert.equal(player.frozen, false); assert.equal(player.enabled, false);
  assert.equal(boards.at(-1), next); assert.equal(states.at(-1), "off");
  // The player's accepted finish arrives asynchronously after the result card opened.
  const finished = { ...next, highscores: { other: 800, winner: 500 }, achieved: { other: 2, winner: 3 },
    replay: { ...pointer, score: 500, hash: "e".repeat(64) } };
  player.update(finished); assert.equal(boards.at(-1), finished); assert.equal(fetches.length, 1);
  player.start(); assert.equal(states.at(-1), "off"); assert.equal(boards.at(-1), finished);
  fail = true; await player.toggle(); assert.equal(states.at(-1), "error"); assert.equal(plays.length, 2);
  player.select("cloud-hopper-l2", 1, { replay: null }); await player.toggle(); assert.equal(states.at(-1), "unavailable");
  assert.equal(fetches.length, 2); player.clear(); assert.ok(hiding >= 4); assert.equal(player.enabled, false);
});

test("the actual recorder snapshots appearance, stages on elevated clouds without doubling height, and preserves world-space playback", () => {
  const context = { window: { BL: { cloudHopperReplayCodec: codec } }, Float32Array };
  for (const name of ["math", "scene", "models", "cloud-hopper-ghost"])
    runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), "utf8"), context);
  const BL = context.window.BL, S = BL.scene, root = S.createNode(), body = S.createNode(), head = S.createNode({ geometry: BL.models.box({ w: 1, h: 1, d: 1, color: "#ff0000" }) });
  S.addChild(body, head); S.addChild(root, body);
  BL.hubModels = { jetpack: () => BL.models.box({ w: 1, h: 1, d: 1, color: "#777777" }), jetFlame: () => BL.models.box({ w: .2, h: .2, d: .2, color: "#ffaa00" }) };
  BL.contributors = { traitsFor: () => { throw Error("Must use recorded appearance"); } };
  let released = 0;
  const ghost = BL.cloudHopperGhost.create({ root, renderer: { releaseGeometry: () => released++ } });
  const actor = { root: body, parts: { head }, traits: { name: "winner", height: 1 }, baseY: .75 };
  Object.assign(body.position, { x: 40, y: 200.75, z: 60 });
  ghost.begin(actor);
  const original = head.geometry.verts[0]; head.geometry.verts[0] = 50;
  for (let i = 1; i <= 12050; i++) ghost.record(i * .05, actor);
  const run = ghost.finish(602.55, actor);
  assert.ok(run.count <= 12001); assert.equal(run.samples[0], 0);
  assert.ok(Math.abs(run.samples[(run.count - 1) * codec.STRIDE] - 602.55) < .001);
  assert.equal(run.appearance.geometries[0].verts[0], original);
  const full = { ...run, version: 1, game: GAME, playerId: 1, courseVersion: 1, seed: 1, driftTime: 0 };
  assert.ok(codec.encode(full));
  const decoded = codec.decode(codec.encode(full)), originalSamples = decoded.samples.slice();
  ghost.play(decoded); assert.equal(root.children.length, 2);
  const rig = root.children[1];
  assert.deepEqual({ ...rig.position }, { x: 40, y: 200.75, z: 60 });
  ghost.play(decoded, { x: 42, y: 200, z: 62 }, .5);
  assert.deepEqual({ ...rig.position }, { x: 42, y: 200.75, z: 62 });
  for (const time of [0, .125, .25]) {
    ghost.update(time);
    assert.equal(rig.position.y, 200.75); // No fall from a doubled platform elevation during the blend.
  }
  assert.deepEqual({ ...rig.position }, { x: 40, y: 200.75, z: 60 });
  ghost.play(decoded, { x: 42, y: 350, z: 62 }, .5);
  assert.equal(rig.position.y, 350.75); // The same recording stages relative to the supplied cloud.
  ghost.play(decoded); ghost.update(100);
  assert.deepEqual({ ...rig.position }, { x: 40, y: 200.75, z: 60 });
  assert.deepEqual(decoded.samples, originalSamples);
  assert.deepEqual({ ...body.position }, { x: 40, y: 200.75, z: 60 }); // Capture never relocates the live actor.
  ghost.clear(); assert.equal(root.children.length, 1); assert.ok(released > 0);
});

test("late replay responses after level changes cannot resurrect the prior ghost", async () => {
  const bytes = codec.encode(recording()), hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex"), BL = { cloudHopperReplayCodec: codec };
  let resolve, plays = 0, state;
  const context = { window: { BL, setTimeout, clearTimeout }, crypto: webcrypto, AbortController, Uint8Array,
    fetch: () => new Promise(done => { resolve = done; }) };
  runInNewContext(readFileSync(new URL("../../src/js/cloud-hopper-replays.js", import.meta.url), "utf8"), context);
  const player = BL.cloudHopperReplays.create({ onBoard() {}, onState: s => { state = s; }, onPlay: () => plays++, onHide() {} });
  player.select(GAME, 1, { replay: { hash, score: 1000, username: "winner", courseVersion: 1 } });
  const pending = player.toggle(); player.select("cloud-hopper-l2", 1);
  resolve(new Response(bytes, { headers: { "content-type": "application/octet-stream" } })); await pending;
  assert.equal(plays, 0); assert.equal(state, "unavailable"); assert.equal(player.enabled, false);
});


test("replaced or expired run tickets during upload cannot publish scores or pointers", async t => {
  const f = await setup(t), a = await f.account(), token = await f.start(a);
  f.before(async () => { f.before(null); await f.start(a); });
  assert.equal((await f.finish(a, recording(), token)).status, 200);
  assert.deepEqual((await f.read(GAME)).highscores, {});
  assert.equal((await f.read(GAME)).replay, null);
  const next = await f.start(a);
  f.before(() => { f.DB.sql.prepare("UPDATE cloud_hopper_replay_tickets SET expires_at = 0").run(); });
  await f.finish(a, recording(.5), next);
  assert.deepEqual((await f.read(GAME)).highscores, {});
  assert.equal((await f.read(GAME)).replay, null);
});

test("D1 rollback leaves a tracked orphan, retry repairs it and pointer-only recovery advances notifications", async t => {
  const f = await setup(t), a = await f.account(), token = await f.start(a);
  f.DB.sql.exec("CREATE TRIGGER fail_publish BEFORE INSERT ON cloud_hopper_replay_winners BEGIN SELECT RAISE(ABORT, 'unavailable'); END");
  assert.equal((await f.finish(a, recording(), token)).status, 503);
  assert.deepEqual((await f.read(GAME)).highscores, {}); assert.equal(f.objects.size, 1);
  assert.equal(f.DB.sql.prepare("SELECT state FROM cloud_hopper_replay_objects").get().state, "staged");
  f.DB.sql.exec("DROP TRIGGER fail_publish");
  const recovered = await (await f.finish(a, recording(), token)).json();
  assert.ok(recovered.replay); assert.equal(recovered.revision, 3);
  assert.equal(f.DB.sql.prepare("SELECT revision FROM highscore_notifications WHERE game_id = ?").get(GAME).revision, 3);
  f.DB.sql.exec("DELETE FROM cloud_hopper_replay_winners");
  const repaired = await (await f.finish(a, recording(), token)).json();
  assert.equal(repaired.revision, 4); assert.deepEqual(repaired.replay, recovered.replay);
  const before = f.objects.size;
  const original = f.env.CLOUD_HOPPER_REPLAYS.delete;
  f.env.CLOUD_HOPPER_REPLAYS.delete = async () => { throw Error("storage unavailable"); };
  await f.finish(a, recording(.5), await f.start(a));
  await routes.pruneCloudHopperReplays(f.env);
  f.DB.sql.prepare("UPDATE cloud_hopper_replay_objects SET expires_at = 0 WHERE hash = ?").run(recovered.replay.hash);
  await assert.rejects(routes.pruneCloudHopperReplays(f.env), /storage unavailable/);
  assert.equal(f.objects.size, before + 1); assert.ok((await f.read(GAME)).replay);
  f.env.CLOUD_HOPPER_REPLAYS.delete = original;
  await routes.pruneCloudHopperReplays(f.env); assert.equal(f.objects.size, 1);
});


test("same-player replay finishes remain separate; upload retry and numeric fallback share one run", async t => {
  const f = await setup(t), a = await f.account();
  const first = await f.start(a);
  await f.finish(a, recording(2), first);
  const second = await f.start(a);
  const won = await (await f.finish(a, recording(1), second)).json();
  assert.deepEqual(won.runs.map(r => r.score), [1000, 2000]);
  assert.equal(won.replay.score, won.runs[0].score);
  assert.equal(won.replay.achieved, won.runs[0].achieved);
  await f.finish(a, recording(1), second);
  const numeric = score => new Request(`${SITE}/api/highscores/${GAME}`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" },
    body: JSON.stringify({ machine: GAME, score, version: 1, playerId: 1, runId: second }) });
  await a.scores(numeric(1000), f.env); await a.scores(numeric(100), f.env);
  assert.deepEqual(await f.read(GAME), won);
  await f.finish(a, recording(3), await f.start(a));
  const slower = await f.read(GAME);
  assert.deepEqual(slower.runs.map(r => r.score), [1000, 2000, 3000]);
  assert.deepEqual(slower.replay, won.replay);
  assert.equal(f.objects.size, 2); // Only the two successive winning recordings went to R2.
});
