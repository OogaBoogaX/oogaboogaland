// Finite local-only combined cost/recovery measurement. Uses an already cached
// Miniflare package; never installs, authenticates or loads account configuration.
// HOST_RUNTIME_PACKAGE=/existing/miniflare/package.json node worker/eval/host-cycle.mjs [--smoke]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { HOST } from "../src/virtual-host.js";
const smoke = process.argv.includes("--smoke"), pairs = smoke ? 1 : 53, viewers = smoke ? 2 : 32, samples = smoke ? 2 : 12;
if (!process.env.HOST_RUNTIME_PACKAGE) throw Error("Set HOST_RUNTIME_PACKAGE to an existing Miniflare package.json");
const packagePath = resolve(process.env.HOST_RUNTIME_PACKAGE), requireRuntime = createRequire(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8")); assert.equal(manifest.name, "miniflare");
const runtime = await import(pathToFileURL(join(dirname(packagePath), manifest.main))), { build } = requireRuntime("esbuild");
const dir = await mkdtemp(join(tmpdir(), "host-cycle-")), bundle = join(dir, "fixture.mjs"), disk = join(dir, "storage");
// Optional copies of exactly these two files permit a matched local comparison
// without resetting a checkout. Imports still resolve against this source tree.
const sourceDirectory = process.env.HOST_CYCLE_SOURCE ? resolve(process.env.HOST_CYCLE_SOURCE) : null;
const sourceHashes = {};
for (const name of ["virtual-host.js", "host-room.js"]) {
  const path = sourceDirectory ? join(sourceDirectory, name) : fileURLToPath(new URL(`../src/${name}`, import.meta.url));
  sourceHashes[name] = createHash("sha256").update(await readFile(path)).digest("hex");
}
let mf, deniedEgress = 0, now = Date.now(), maxCheckpoint = 0, maxFrame = 0, lastPublish = 0;
const logs = [], failures = [], sockets = [], times = [], counters = { attemptedHostWrites: 0, attemptedHostWriteBytes: 0, deliveredBytes: 0, deliveredFrames: 0 };
const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("local runtime operation exceeded 15 seconds")), 15000); })]); }
  finally { clearTimeout(timer); }
};
const until = async predicate => { const end = performance.now() + 5000; while (!predicate()) { if (performance.now() > end) throw Error("bounded socket wait expired"); await delay(10); } };
const start = async () => {
  const options = { name: "host-cycle-local", modules: true, scriptPath: bundle, modulesRoot: dir,
    compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"], host: "127.0.0.1", port: 0, cf: false,
    telemetry: { enabled: false }, logRequests: false, log: new runtime.Log(runtime.LogLevel.ERROR), handleStructuredLogs: l => logs.push(l),
    durableObjects: { HOST: { className: "CycleHost", useSQLite: true }, ROOM: { className: "Room", useSQLite: true } },
    bindings: { VIRTUAL_HOST_PREVIEW: "1", VIRTUAL_HOST_MIXED_PREVIEW: "1" },
    resourcePersistencePath: disk, isolatedResourcePersistencePath: disk,
    outboundService: () => { deniedEgress++; return new Response("external network forbidden", { status: 503 }); } };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  await bounded(mf.ready);
};
const call = async (command, fields = {}, error = null) => {
  const response = await bounded(mf.dispatchFetch("http://fixture.invalid/host", { method: "POST", body: JSON.stringify({ command, pairs, now, ...fields }) }));
  assert.equal(response.status, 200); const out = await response.json();
  if (error) assert.match(out.error, error); else assert.equal(out.error, null);
  assert.ok(out.checkpointBytes <= HOST.checkpointBytes); maxCheckpoint = Math.max(maxCheckpoint, out.checkpointBytes);
  counters.attemptedHostWrites += out.writes; counters.attemptedHostWriteBytes += out.writeBytes; return out;
};
const joinViewer = async (id, ack = true) => {
  const response = await bounded(mf.dispatchFetch("http://fixture.invalid/room?npc-authority=2", { headers: { upgrade: "websocket",
    "x-player-id": String(id), "x-player-login": `fixture${id}`, "x-player-contributor": "1" } }));
  assert.equal(response.status, 101); const socket = response.webSocket, row = { socket, frames: [], authority: null, errors: [], reader: globalThis.BL.npcAuthority.create({ mixed: true }) };
  socket.accept(); sockets.push(row);
  socket.addEventListener("message", event => {
    try {
      if (typeof event.data === "string") { const message = JSON.parse(event.data); if (message.t === "npc-authority") { assert.ok(row.reader.accept(message.authority)); row.authority = message.authority; } return; }
      const data = event.data; assert.ok(data instanceof ArrayBuffer); const header = new DataView(data);
      assert.ok(row.authority); const frame = row.reader.frame(data); assert.ok(frame);
      maxFrame = Math.max(maxFrame, frame.byteLength); counters.deliveredBytes += data.byteLength; counters.deliveredFrames++;
      row.frames.push(frame); assert.ok(row.frames.length <= samples + 5);
      if (ack) socket.send(JSON.stringify({ t: "npc-ack", revision: header.getFloat64(8, true), sequence: header.getFloat64(24, true) }));
    } catch (error) { row.errors.push(error.message); }
  });
  socket.send(JSON.stringify({ t: "hub", on: true })); return row;
};
const distribution = values => { const a = [...values].sort((a, b) => a - b); return { samples: a.length, p50ms: a[Math.floor(a.length / 2)], p95ms: a[Math.floor(a.length * .95)], maxMs: a.at(-1) }; };
let result;
try {
  await build({ entryPoints: [fileURLToPath(new URL("host-cycle-worker.mjs", import.meta.url))], bundle: true, outfile: bundle,
    format: "esm", platform: "neutral", external: ["node:*", "cloudflare:*"], define: { window: "globalThis" }, logLevel: "silent",
    plugins: [{ name: "fixture-cast-only", setup(build) {
      build.onResolve({ filter: /^\.\/characters\.gen\.json$/ }, () => ({ path: "fixture-cast", namespace: "cycle-fixture" }));
      build.onLoad({ filter: /^fixture-cast$/, namespace: "cycle-fixture" }, () => ({ loader: "json",
        contents: JSON.stringify(Array.from({ length: 33 }, (_, i) => ({ handle: `fixture${i + 1}`, github_login: `fixture${i + 1}` }))) }));
    } }, { name: "matched-host-source", setup(build) {
      if (sourceDirectory) build.onLoad({ filter: /[/\\]worker[/\\]src[/\\](virtual-host|host-room)\.js$/ }, async args => ({
        contents: await readFile(join(sourceDirectory, args.path.split(/[/\\]/).at(-1)), "utf8"), loader: "js", resolveDir: dirname(args.path) }));
    } }] });
  const boot = performance.now(); await start(); now = Date.now();
  let ticket = (await call("begin")).result;
  const joins = (await call("join", { ticket })).result.result; assert.equal(joins.length, 30); assert.ok(joins.every(j => j.ok));
  const refs = joins.map(j => j.session), tokens = refs.map(r => r.token), bootMs = performance.now() - boot;
  for (let i = 1; i <= viewers; i++) await joinViewer(i, i !== viewers);
  await call("publish", { ticket, acquire: true }); lastPublish = performance.now();
  await until(() => sockets.every(s => s.frames.length === 1 || s.errors.length));
  assert.ok(sockets.every(s => s.errors.length === 0));
  const before = (await call("inspect")).saved; now += 250;
  await call("fail-tick", { ticket, tokens }, /injected cycle rollback/); assert.deepEqual((await call("inspect")).saved, before);
  for (let i = 0; i < samples; i++) {
    if (i) now += 250;
    const startAt = performance.now(), tick = await call("tick", { ticket, tokens }), tickMs = performance.now() - startAt;
    assert.equal(tick.result.steps, 1); assert.equal(tick.result.lagMs, 0);
    // Conservative wall-clock pacing for Room's four-frame/s ceiling. This wait
    // is reported separately and is not included in active tick+publication cost.
    const waitAt = performance.now(); await delay(250 - (waitAt - lastPublish)); const pacingMs = performance.now() - waitAt;
    const publishAt = performance.now(); await call("publish", { ticket }); const publishMs = performance.now() - publishAt; lastPublish = performance.now();
    times.push({ tickMs, publishMs, activeMs: tickMs + publishMs, pacingMs });
    await until(() => sockets.slice(0, -1).every(s => s.frames.length === i + 2 || s.errors.length));
    assert.ok(sockets.every(s => s.errors.length === 0)); assert.equal(sockets.at(-1).frames.length, 1);
    for (const s of sockets.slice(1, -1)) assert.deepEqual(s.frames.at(-1), sockets[0].frames.at(-1));
  }
  const expected = (await call("poses", { ticket })).result.frame; assert.deepEqual(Array.from(new Uint8Array(sockets[0].frames.at(-1))), expected);
  await call("disconnect", { ticket, tokens, refs }); const disconnected = (await call("inspect")).saved;
  for (const row of sockets) row.socket.close(); await mf.dispose(); mf = null;
  const restartAt = performance.now(); await start(); assert.deepEqual((await call("inspect")).saved, disconnected);
  now += HOST.leaseMs + 1; ticket = (await call("claim")).result;
  const reclaimed = await call("connect", { ticket, index: 29 });
  assert.equal(reclaimed.result.result.resumed, true); assert.deepEqual(reclaimed.result.result.view.equipment, disconnected.sessions.sessions[29].equipment);
  assert.equal(reclaimed.result.result.view.bodyId, disconnected.sessions.sessions[29].bodyId);
  const restartReclaimMs = performance.now() - restartAt, after = (await call("inspect")).saved;
  assert.deepEqual(after.simulation, disconnected.simulation); assert.equal(after.sessions.sessions[0].deadline, disconnected.sessions.sessions[0].deadline);
  await call("tick", { ticket: { ...ticket, fence: ticket.fence - 1 }, tokens: [] }, /fenced/);
  const late = await joinViewer(1, false); await until(() => late.frames.length === 1 || late.errors.length);
  assert.deepEqual(late.errors, []); assert.deepEqual(Array.from(new Uint8Array(late.frames[0])), expected);
  result = { pairs, actors: pairs * 2, rigs: pairs, viewers, sessions: 30, samples, bootMs, restartReclaimMs,
    maxCheckpointBytes: maxCheckpoint, maxFrameBytes: maxFrame, tick: distribution(times.map(x => x.tickMs)),
    publication: distribution(times.map(x => x.publishMs)), combinedActive: distribution(times.map(x => x.activeMs)),
    pacing: distribution(times.map(x => x.pacingMs)), counters, rollback: true, persistedRestart: true, timelyReclaim: true,
    exactLateJoin: true, stalledFramesBeforeRestart: 1, rows: times };
  assert.equal(deniedEgress, 0); assert.equal(logs.length, 0);
} catch (error) { failures.push(error.stack); process.exitCode = 1; }
finally { for (const row of sockets) try { row.socket.close(); } catch {} if (mf) await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
console.log(JSON.stringify({ scope: "finite local workerd/SQLite host and actual Room RPC/WebSockets; authored simulation clock/world and Ooga display",
  measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, sourceHashes,
  miniflare: manifest.version, workerd: requireRuntime("workerd/package.json").version, result, failures, deniedEgress, logs,
  limitations: ["cached runtime differs from repository Wrangler range; not production-runtime certification",
    "timings include local dispatch, storage, RPC, diagnostic responses and observer validation in one Node process; not DO CPU or billed duration",
    "full outer AI, player bodies, island geometry, browser rendering, voice and phone costs remain excluded",
    "authored accounts and cast; no production auth, data, account configuration or network requests",
    "orderly workerd reconstruction; not abrupt-kill or Cloudflare eviction", "no production billing/usage or permanent loop"] }, null, 2));
