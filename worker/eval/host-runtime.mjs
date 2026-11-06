// Finite, local workerd/SQLite experiment. Use an ALREADY INSTALLED Miniflare
// package; never install, authenticate, deploy, or load a Wrangler account config.
// HOST_RUNTIME_PACKAGE=/path/to/miniflare/package.json node worker/eval/host-runtime.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOST } from "../src/virtual-host.js";

if (!process.env.HOST_RUNTIME_PACKAGE) throw Error("Set HOST_RUNTIME_PACKAGE to an existing Miniflare package.json; this evaluator never installs dependencies");
const packagePath = resolve(process.env.HOST_RUNTIME_PACKAGE), requireRuntime = createRequire(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8"));
assert.equal(manifest.name, "miniflare");
const runtime = await import(pathToFileURL(join(dirname(packagePath), manifest.main))), { build } = requireRuntime("esbuild");
const workerdVersion = requireRuntime("workerd/package.json").version;
const dir = await mkdtemp(join(tmpdir(), "virtual-host-runtime-")), bundle = join(dir, "fixture.mjs");
const rows = [], failures = [], unexpectedLogs = [];
let mf, deniedEgress = 0;
const start = async storagePath => {
  // The generated bundle is outside cwd. Its module root must be that temporary
  // directory so workerd receives a canonical module name without parent segments.
  const options = { name: "host-runtime-fixture", modules: true, scriptPath: bundle, modulesRoot: dir,
    compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
    host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false }, logRequests: false,
    log: new runtime.Log(runtime.LogLevel.ERROR),
    handleStructuredLogs: log => unexpectedLogs.push(log),
    durableObjects: { HOST: { className: "HostRuntimeFixture", useSQLite: true } },
    resourcePersistencePath: storagePath, isolatedResourcePersistencePath: storagePath,
    outboundService: () => { deniedEgress++; return new Response("evaluator forbids external network", { status: 503 }); } };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  await mf.ready;
};
const diskBytes = async path => {
  let size = 0;
  for (const file of await readdir(path, { withFileTypes: true })) {
    const child = join(path, file.name); size += file.isDirectory() ? await diskBytes(child) : (await stat(child)).size;
  }
  return size;
};
const distribution = times => {
  times.sort((a, b) => a - b);
  return { samples: times.length, p50ms: times[Math.floor(times.length / 2)], p95ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1) };
};
try {
  await build({ entryPoints: [fileURLToPath(new URL("host-runtime-worker.mjs", import.meta.url))], bundle: true,
    outfile: bundle, format: "esm", platform: "neutral", external: ["node:*"], logLevel: "silent" });
  for (const pairs of process.argv.includes("--smoke") ? [1] : [16, 53]) {
    const storagePath = join(dir, `storage-${pairs}`), budget = (pairs === 53 ? 64 : 30) * 1024;
    let now = 100000, peakBytes = 0;
    const call = async (command, fields = {}, expectedError = null) => {
      const response = await mf.dispatchFetch(`http://fixture.invalid/profile-${pairs}`, { method: "POST",
        body: JSON.stringify({ command, now, pairs, budget, ...fields }) });
      assert.equal(response.status, 200);
      const out = await response.json();
      if (expectedError) assert.match(out.error, expectedError); else assert.equal(out.error, null);
      assert.ok(out.checkpointBytes <= HOST.checkpointBytes); peakBytes = Math.max(peakBytes, out.checkpointBytes); return out;
    };
    const bootAt = performance.now(); await start(storagePath);
    let ticket = (await call("begin", { owner: "first" })).result;
    const bootMs = performance.now() - bootAt, joined = await call("join", { ticket });
    const joins = joined.result.result, slots = joined.retainedSlots;
    assert.equal(joins.length, slots + 1); assert.equal(joins.at(-1).reason, "full");
    assert.ok(joins.slice(0, slots).every(j => j.ok));
    const refs = joins.slice(0, slots).map(j => j.session), liveTokens = refs.map(r => r.token);
    const before = (await call("inspect")).saved; now += 250;
    const rollback = await call("fail-tick", { ticket, liveTokens }, /injected transaction rollback/);
    assert.equal(rollback.attemptedWrites, 1); assert.deepEqual((await call("inspect")).saved, before);
    const times = []; let activeWrites = 0, activeBytes = 0;
    for (let i = 0; i < (process.argv.includes("--smoke") ? 2 : 120); i++) {
      if (i) now += 250;
      const at = performance.now(), out = await call("tick", { ticket, liveTokens }); times.push(performance.now() - at);
      assert.equal(out.result.snapshot.npcs.length, pairs * 2); activeWrites += out.attemptedWrites; activeBytes += out.attemptedBytes;
    }
    await call("disconnect", { ticket, liveTokens, refs });
    const disconnected = (await call("inspect")).saved, originalDeadline = now + 60000;
    await mf.dispose(); mf = null;
    const restartAt = performance.now(); await start(storagePath);
    assert.deepEqual((await call("inspect")).saved, disconnected, "SQLite checkpoint survives a new workerd process");
    now = originalDeadline - 1; ticket = (await call("claim", { owner: "replacement" })).result;
    const restartMs = performance.now() - restartAt;
    const reclaimed = await call("connect", { ticket, liveTokens: [], index: slots - 1 });
    assert.equal(reclaimed.result.result.resumed, true); assert.equal(reclaimed.result.result.view.motion.grounded, true);
    assert.deepEqual(reclaimed.result.result.view.equipment, disconnected.sessions.sessions.at(-1).equipment);
    assert.equal(reclaimed.result.result.view.bodyId, disconnected.sessions.sessions.at(-1).bodyId);
    assert.notEqual(reclaimed.result.result.session.token, refs.at(-1).token);
    const reclaimedToken = reclaimed.result.result.session.token;
    now = originalDeadline;
    await call("tick", { ticket: { ...ticket, owner: "first", fence: ticket.fence - 1 }, liveTokens: [] }, /fenced/);
    const recoveryTimes = []; let result, recoveryWrites = 0, recoveryBytes = 0, attemptedSteps = reclaimed.result.work.attemptedSteps;
    let passiveMs = reclaimed.passiveMs;
    do {
      const at = performance.now(), out = await call("tick", { ticket, liveTokens: [reclaimedToken] });
      recoveryTimes.push(performance.now() - at); result = out.result;
      assert.ok(result.work.attemptedSteps <= HOST.passiveSteps); attemptedSteps += result.work.attemptedSteps;
      passiveMs += out.passiveMs;
      recoveryWrites += out.attemptedWrites; recoveryBytes += out.attemptedBytes;
      assert.ok(recoveryTimes.length <= 19);
    } while (result.work.pendingSteps);
    const final = (await call("inspect")).saved;
    assert.equal(final.sessions.pending.length, slots - 1);
    assert.ok(final.sessions.pending.every(p => p.at === originalDeadline && p.applied && p.handback === null));
    assert.deepEqual(final.simulation, disconnected.simulation, "outage cannot replay NPC decisions");
    // The reclaim observes some other bodies at deadline-1ms, splitting their
    // last 50ms integration interval. Count actual calls, but assert the exact
    // elapsed physics time: every grace ends at 60s except the reclaimed body's 59.999s.
    assert.equal(passiveMs, slots * 60000 - 1);
    rows.push({ actors: pairs * 2, retainedSlots: slots, bootMs, restartMs, peakBytes,
      active: { ...distribution(times), writes: activeWrites, serializedBytes: activeBytes },
      recoveryAfterPriorityReclaim: { ...distribution(recoveryTimes), writes: recoveryWrites, serializedBytes: recoveryBytes,
        totalPassiveSteps: attemptedSteps, totalPassiveMs: passiveMs },
      sqliteDirectoryBytes: await diskBytes(storagePath), rollback: true, persistedRestart: true, timelyReclaim: true, oldOwnerFenced: true });
    await mf.dispose(); mf = null;
  }
  assert.equal(deniedEgress, 0, "the evaluator must attempt no external network");
  assert.equal(unexpectedLogs.length, 0, "the runtime must produce no unexpected console output");
} catch (error) { failures.push(error.stack); process.exitCode = 1; }
finally {
  try { if (mf) await mf.dispose(); } catch (error) { failures.push(`runtime disposal: ${error.message}`); process.exitCode = 1; }
  await rm(dir, { recursive: true, force: true });
}
console.log(JSON.stringify({ scope: "local workerd, real SQLite Durable Object transactions, authored roster/world and clock",
  miniflare: manifest.version, workerd: workerdVersion, compatibilityDate: "2026-10-01", rows, failures,
  deniedEgress, unexpectedLogs,
  limitations: ["cached runtime version differs from repository Wrangler range; not a locked deployment-runtime pass",
    "wall times include local dispatch, serialization, SQLite and response; they are not DO CPU or billed duration",
    "restart disposes and reconstructs workerd; not an abrupt process-kill or Cloudflare eviction test",
    "fixture actor state is incomplete; no full island, browser render, production network or account costs",
    "local SQLite directory size includes runtime files and is not a billable-storage metric"] }, null, 2));
