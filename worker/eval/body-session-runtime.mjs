// Finite local SQLite/workerd test. Existing cached runtime only; no account,
// deployment, paid API, production bindings or permanent loop.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { BODY_STORAGE } from '../src/host-body-storage.js';
import { LatestHostPublication } from '../src/host-publication.js';
if (!process.env.HOST_RUNTIME_PACKAGE) throw Error('Use an existing Miniflare package.json');
const packagePath = resolve(process.env.HOST_RUNTIME_PACKAGE), requireRuntime = createRequire(packagePath);
const manifest = JSON.parse(await readFile(packagePath, 'utf8')); assert.equal(manifest.name, 'miniflare');
const runtime = await import(pathToFileURL(join(dirname(packagePath), manifest.main))), { build } = requireRuntime('esbuild');
const dir = await mkdtemp(join(tmpdir(), 'body-session-runtime-')), bundle = join(dir, 'worker.mjs');
const roaming = process.argv.includes('--roaming'), steady = process.argv.includes('--steady'), deliver = process.argv.includes('--deliver');
const events = process.argv.includes('--events');
const cleanupAck = process.argv.includes('--cleanup-ack');
assert.ok(!cleanupAck || events, '--cleanup-ack requires --events');
const closeStorm = process.argv.includes('--close-storm');
assert.ok(!closeStorm || !events && !steady && !deliver, '--close-storm measures finite explicit closes only');
assert.ok(!events || !steady && !deliver, '--events measures finite lifecycle recovery only');
assert.ok(!deliver || steady && roaming, '--deliver requires --steady --roaming');
const pipeline = process.argv.includes('--pipeline'), cachedRoom = process.argv.includes('--cached-room');
assert.ok(!cachedRoom || pipeline, '--cached-room requires --pipeline');
const rolling = process.argv.includes('--rolling'), burst = process.argv.includes('--burst');
const projectNearGate = process.argv.includes('--project-near-gate');
assert.ok(!projectNearGate || pipeline && !rolling && !burst, '--project-near-gate requires the strict pipeline');
assert.ok(!burst || pipeline && !rolling, '--burst requires --pipeline and excludes --rolling');
assert.ok(!rolling || pipeline, '--rolling requires --pipeline');
assert.ok(!pipeline || deliver, '--pipeline requires --deliver');
const frameCount = Number(process.argv.find(a => a.startsWith('--frames='))?.split('=')[1] || 40);
const clientDelayMs = Number(process.argv.find(a => a.startsWith('--client-delay-ms='))?.split('=')[1] || 0);
assert.ok([40, 120].includes(frameCount));
assert.ok(Number.isInteger(clientDelayMs) && clientDelayMs >= 0 && clientDelayMs <= 100);
assert.ok(!clientDelayMs || pipeline, 'client delay requires finite pipeline');
const clientDecoders = Number(process.argv.find(a => a.startsWith('--client-decoders='))?.split('=')[1] || 31);
assert.ok([1, 31].includes(clientDecoders));
const bodyLoads = Number(process.argv.find(a => a.startsWith('--body-loads='))?.split('=')[1] || 1);
assert.ok(Number.isSafeInteger(bodyLoads) && bodyLoads >= 1 && bodyLoads <= 4);
const sourceOverride = process.env.HOST_ROAMING_SOURCE ? resolve(process.env.HOST_ROAMING_SOURCE) : null;
const results = [], sourceHashes = {}, logs = [];
let mf, deniedEgress = 0, publicationRunner = null, publicationTimer = null;
const sockets = [];
let deliveredBytes = 0, deliveredFrames = 0, clientWorkMs = 0;
for (const path of ['./body-session-runtime.mjs', './body-session-runtime-worker.mjs', '../src/clanker-roaming.js', '../src/clanker-body-sessions.js',
  '../src/host-body-storage.js', '../src/host-body-operations.js', '../src/room-body-handoff.js', '../src/protocol.js',
  '../src/host-sessions.js', '../src/virtual-host.js', '../../src/js/clankers.js',
  '../src/room.js', '../src/host-cadence.js', '../src/room-npc-authority.js', '../src/host-room.js', '../src/host-publication.js', './clanker-roaming-simulation.mjs'])
  sourceHashes[path] = createHash('sha256').update(await readFile(sourceOverride && path === './clanker-roaming-simulation.mjs'
    ? sourceOverride : new URL(path, import.meta.url))).digest('hex');
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('local operation exceeded 30 seconds')), 30000); })]); }
  finally { clearTimeout(timer); }
};
const start = async disk => {
  const options = { name: 'body-session-local', modules: true, scriptPath: bundle, modulesRoot: dir,
    compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port: 0, cf: false,
    telemetry: { enabled: false }, logRequests: false, log: new runtime.Log(runtime.LogLevel.ERROR), handleStructuredLogs: l => logs.push(l),
    durableObjects: { BODY: { className: 'BodySessionHost', useSQLite: true }, ROOM: { className: 'MeasuredRoom', useSQLite: true } },
    bindings: { VIRTUAL_HOST_PREVIEW: '1', VIRTUAL_HOST_MIXED_PREVIEW: '1', ...(rolling ? { VIRTUAL_HOST_ROLLING_PREVIEW: '1' } : {}), ...(burst ? { VIRTUAL_HOST_BURST_PREVIEW: '1' } : {}) },
    resourcePersistencePath: disk, isolatedResourcePersistencePath: disk,
    outboundService: () => { deniedEgress++; return new Response('forbidden', { status: 503 }); } };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  await bounded(mf.ready);
};
const stats = values => { const a = [...values].sort((a, b) => a - b);
  return { samples: a.length, p50: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)], max: a.at(-1) }; };
try {
  await build({ entryPoints: [fileURLToPath(new URL('./body-session-runtime-worker.mjs', import.meta.url))], bundle: true,
    outfile: bundle, format: 'esm', platform: 'neutral', external: ['node:*', 'cloudflare:*'], define: { window: 'globalThis' }, logLevel: 'silent',
    plugins: [{ name: 'matched-roaming-source', setup(build) {
      if (sourceOverride) build.onLoad({ filter: /[/\\]clanker-roaming-simulation\.mjs$/ }, async args => ({
        contents: await readFile(sourceOverride, 'utf8'), loader: 'js', resolveDir: dirname(args.path) }));
    } }, { name: 'fixture-cast-only', setup(build) {
      build.onResolve({ filter: /^\.\/characters\.gen\.json$/ }, () => ({ path: 'fixture-cast', namespace: 'body-fixture' }));
      build.onLoad({ filter: /^fixture-cast$/, namespace: 'body-fixture' }, () => ({ loader: 'json',
        contents: JSON.stringify(Array.from({ length: 32 }, (_, i) => ({ handle: `fixture${i + 1}`, github_login: `fixture${i + 1}` }))) }));
    } }] });
  for (const scenario of closeStorm ? ['serial-1', 'serial-15', 'serial-30', 'batch-30'] : steady ? ['steady'] : process.argv.includes('--medium') ? ['unknown-medium'] : ['known-long', 'unknown-long', 'unknown-short']) {
    const disk = join(dir, scenario), short = scenario.endsWith('short'), medium = scenario.endsWith('medium'), expired = !short && !medium; const epoch = deliver ? Date.now() : 100000; let now = epoch;
    const call = async (command, fields = {}, expectedError = null) => {
      const at = performance.now();
      const response = await bounded(mf.dispatchFetch('http://fixture.invalid', { method: 'POST',
        body: JSON.stringify({ command, roaming, bodyLoads, rolling, burst, projectNearGate, frameCount, epoch, now, ...fields }) }));
      if (response.status !== 200) throw Error(`local status ${response.status}: ${await response.text()}`);
      const out = await response.json(); out.wallMs = performance.now() - at;
      if (expectedError) assert.match(out.error, expectedError); else assert.equal(out.error, null);
      assert.ok(out.rootBytes <= BODY_STORAGE.rootBytes);
      assert.ok(out.rowBytes.every(n => n <= BODY_STORAGE.rowBytes));
      assert.equal(out.constructed, out.disposed); assert.ok(out.constructed <= bodyLoads); return out;
    };
    const bootAt = performance.now(); await start(disk);
    let ticket = (await call('begin')).result; const coldBeginMs = performance.now() - bootAt;
    const refs = [], admissions = [];
    for (let index = 0; index < 30; index++) {
      const joined = await call('join', { ticket, index, tokens: refs.map(r => r.token) });
      assert.equal(joined.result.result.ok, true); refs.push(joined.result.result.session); admissions.push(joined.wallMs);
    }
    let closeMs = null;
    if (scenario === 'known-long') closeMs = (await call('close', { ticket, refs, tokens: refs.map(r => r.token) })).wallMs;
    const before = (await call('inspect')).saved;
    if (closeStorm) {
      const count = Number(scenario.split('-')[1]), batch = scenario.startsWith('batch');
      const closes = refs.slice(0, count).map(ref => ({
        ref: { accountId: ref.accountId, generation: ref.generation, token: ref.token }, at: epoch + 250,
      }));
      const survivors = refs.slice(count).map(ref => ref.token), observations = [];
      now = epoch + 500;
      if (batch) observations.push(await call('event', { ticket, tokens: survivors, closes }));
      else for (const close of closes) observations.push(await call('retained-close', { ticket, ref: close.ref, closedAt: close.at }));
      const saved = (await call('inspect')).saved, records = saved.host.sessions.sessions;
      assert.equal(records.length, 30);
      assert.equal(records.filter(s => s.state === 'grace').length, count);
      assert.equal(records.filter(s => s.state === 'live').length, 30 - count);
      assert.deepEqual(saved.host.simulation, before.host.simulation, 'closes do no NPC work');
      assert.equal(saved.host.runUntil, before.host.runUntil);
      assert.equal(saved.host.leaseUntil, before.host.leaseUntil);
      for (const record of records) {
        const original = before.host.sessions.sessions.find(s => s.accountId === record.accountId);
        for (const key of ['x', 'y', 'z', 'yaw', 'grounded']) assert.equal(record.motion[key], original.motion[key]);
        if (record.state === 'grace') {
          assert.equal(record.deadline, epoch + 60250);
          assert.equal(record.motion.vx, 0); assert.equal(record.motion.vy, 0); assert.equal(record.motion.vz, 0);
        }
      }
      assert.ok(observations.every(o => o.constructed === 0), 'no per-close body construction');
      const duplicates = [];
      for (const close of closes) duplicates.push(await call('retained-close', { ticket, ref: close.ref, closedAt: close.at }));
      assert.ok(duplicates.every(o => o.writes === 0 && o.result.changed === false));
      assert.deepEqual((await call('inspect')).saved, saved);
      await mf.dispose(); mf = null; await start(disk);
      assert.deepEqual((await call('inspect')).saved, saved, 'all frozen records survive reconstruction');
      const verified = await call('verify', { reference: before.host.simulation });
      assert.equal(verified.result.verified, 30); assert.equal(verified.result.npcSteps, 0);
      results.push({ scenario, closedBodies: count, survivingLiveBodies: 30 - count,
        operations: observations.length, operationMs: stats(observations.map(o => o.operationMs)),
        wallMs: stats(observations.map(o => o.wallMs)), totalWallMs: observations.reduce((n, o) => n + o.wallMs, 0),
        writes: observations.reduce((n, o) => n + o.writes, 0), writeBytes: observations.reduce((n, o) => n + o.writeBytes, 0),
        reads: observations.reduce((n, o) => n + o.reads, 0), readBytes: observations.reduce((n, o) => n + o.readBytes, 0),
        duplicateOperations: duplicates.length, duplicateWrites: 0, verifiedBodies: verified.result.verified,
        persistedRestart: true, npcSteps: 0, bodyConstructions: 0,
        observations: observations.map(({ operationMs, wallMs, reads, readBytes, writes, writeBytes, rootBytes, rowBytes }) =>
          ({ operationMs, wallMs, reads, readBytes, writes, writeBytes, rootBytes, rowBytes })) });
      await mf.dispose(); mf = null; continue;
    }
    if (steady) {
      const until = async predicate => {
        const end = performance.now() + 5000;
        while (!predicate()) {
          assert.ok(performance.now() < end, 'bounded socket delivery wait');
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.ok(sockets.every(s => !s.error), sockets.find(s => s.error)?.error);
      };
      let lastPublish = -Infinity, roomState;
      if (deliver) {
        for (let id = 1; id <= 32; id++) {
          const response = await bounded(mf.dispatchFetch('http://fixture.invalid/room?npc-authority=2', { headers: {
            upgrade: 'websocket', 'x-player-id': String(id), 'x-player-login': `fixture${id}`, 'x-player-contributor': '1' } }));
          assert.equal(response.status, 101);
          const socket = response.webSocket, row = { socket, frames: 0, latest: null, latestPacket: null, error: null,
            reader: globalThis.BL.npcAuthority.create({ mixed: true }), observations: [], pending: null };
          sockets.push(row); socket.accept();
          const receive = (event, transportAt) => {
            const started = performance.now();
            try {
              if (typeof event.data === 'string') {
                const message = JSON.parse(event.data);
                if (message.t === 'npc-authority') assert.ok(row.reader.accept(message.authority));
                return;
              }
              // One canonical decoder still validates every delivered frame;
              // transport-only peers must receive byte-identical envelopes.
              // This separates one-process client CPU from host/Room work.
              const frame = id <= clientDecoders ? row.reader.frame(event.data) : null;
              if (id <= clientDecoders) assert.ok(frame);
              row.latest = frame; row.latestPacket = event.data;
              const observed = { sequence: new DataView(event.data).getFloat64(24, true), transportAt, decodeStartedAt: started, receivedAt: performance.now() };
              row.observations.push(observed); assert.ok(row.observations.length <= frameCount + 1);
              row.frames++; deliveredFrames++; deliveredBytes += event.data.byteLength;
              if (id < 32) {
                const header = new DataView(event.data);
                socket.send(JSON.stringify({ t: 'npc-ack', revision: header.getFloat64(8, true), sequence: header.getFloat64(24, true) }));
              }
            } catch (error) { row.error = error.message; }
            finally { clientWorkMs += performance.now() - started; }
          };
          socket.addEventListener('message', event => {
            const transportAt = performance.now();
            if (!clientDelayMs || typeof event.data === 'string') return receive(event, transportAt);
            // Synthetic one-way latency, not browser/network certification.
            // Room ACK credit must bound delayed client data to one frame.
            if (row.pending !== null) { row.error = 'more than one delayed frame'; return; }
            row.pending = setTimeout(() => { row.pending = null; receive(event, transportAt); }, clientDelayMs);
          });
          socket.send(JSON.stringify({ t: 'hub', on: true }));
        }
        const warmup = (await call('publish', { ticket, acquire: true })).result;
        lastPublish = warmup.publishedAt; if (cachedRoom) roomState = warmup.roomState;
        assert.ok(Number.isSafeInteger(lastPublish));
        await until(() => sockets.every(s => s.frames === 1 || s.error));
        // A completed warm-up publication precedes the measured arrival stream
        // by one cadence. This is reported separately, never hidden in samples.
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      // A bounded number of complete sweeps on a 250 ms arrival schedule. Overruns stay in the
      // measured queue rather than resetting the clock and hiding backlog.
      const frames = [], started = performance.now(), offered = new Map(), publications = [];
      let worldBusy = false, publicationTask = null, publicationFailure = null;
      const drive = () => {
        if (!pipeline || worldBusy || publicationTask || publicationFailure) return;
        const state = publicationRunner.state();
        if (state.closed || !state.pending) return;
        const wait = Math.max(0, state.nextAt - Date.now());
        if (wait) {
          if (publicationTimer === null) publicationTimer = setTimeout(() => { publicationTimer = null; drive(); }, wait);
          return;
        }
        if (publicationTimer !== null) { clearTimeout(publicationTimer); publicationTimer = null; }
        publicationTask = publicationRunner.flush().catch(error => { publicationFailure = error; })
          .finally(() => { publicationTask = null; drive(); });
      };
      if (pipeline) publicationRunner = new LatestHostPublication({ ...(rolling || burst ? { cadence: burst ? 'rate-4-burst-2-v1' : 'rolling-4-v1' } : {}), until: Date.now() + frameCount * 250 + 10000, publish: async ({ notBefore }) => {
        const at = performance.now(), publication = await call('publish', { ticket, notBefore, ...(cachedRoom ? { roomState } : {}) });
        if (cachedRoom && publication.result.roomState) roomState = publication.result.roomState;
        const finishedAt = performance.now();
        publications.push({ ...publication.result, startedAt: at, finishedAt, wallMs: finishedAt - at,
          diagnosticMs: publication.diagnosticMs, phases: publication.phases, timing: publication.publicationTiming });
        assert.ok(publications.length <= frameCount * 2, 'finite publication attempt bound');
        return publication.result;
      } });
      for (let frame = 1; frame <= frameCount; frame++) {
        const scheduled = started + (frame - 1) * 250;
        // Timers may wake early; do not credit that time as scheduling margin.
        while (performance.now() < scheduled)
          await new Promise(resolve => setTimeout(resolve, scheduled - performance.now()));
        now = epoch + frame * 250;
        assert.equal(publicationFailure, null);
        const frameAt = performance.now(), clientWorkBefore = clientWorkMs, batches = [];
        worldBusy = true; let completeSequence = null;
        for (let i = 0; i < 30; i++) {
          const out = await call('tick', { ticket, tokens: [] });
          assert.ok(out.result.steps <= (roaming ? 4 : 8));
          batches.push({ wallMs: out.wallMs, steps: out.result.work.steps, npcSteps: out.result.steps,
            writes: out.writes, writeBytes: out.writeBytes, constructed: out.constructed, diagnosticMs: out.diagnosticMs });
          if (!out.result.work.pendingSteps && out.result.lagMs < 250) { completeSequence = out.result.snapshot.sequence; break; }
          assert.equal(out.result.snapshot, null, 'partial body sweeps must not publish');
        }
        assert.equal(batches.reduce((n, b) => n + b.steps, 0), 0, 'frozen bodies do no recurring physics');
        assert.equal(batches.reduce((n, b) => n + b.npcSteps, 0), 1);
        worldBusy = false;
        offered.set(completeSequence, { frame, scheduled, completedAt: performance.now() });
        if (pipeline) { publicationRunner.offer(completeSequence); drive(); }
        let publicationMs = 0, publicationPacingMs = 0, phases = {};
        if (deliver && !pipeline) {
          const publishAt = performance.now();
          const publication = await call('publish', { ticket, notBefore: lastPublish + 250 });
          lastPublish = publication.result.publishedAt; phases = publication.phases;
          assert.ok(Number.isSafeInteger(lastPublish));
          await until(() => sockets.slice(0, -1).every(s => s.frames === frame + 1 || s.error));
          publicationPacingMs = (phases['runner.pacing'] || []).reduce((a, b) => a + b, 0);
          publicationMs = Math.max(0, performance.now() - publishAt - publicationPacingMs);
          assert.equal(sockets.at(-1).frames, 1, 'stalled follower retains only one unacknowledged frame');
          for (const row of sockets.slice(1, -1)) assert.deepEqual(row.latestPacket, sockets[0].latestPacket);
        }
        const finished = performance.now();
        frames.push({ frame, phases, clientWorkMs: clientWorkMs - clientWorkBefore, publicationMs, publicationPacingMs, activeMs: finished - frameAt - publicationPacingMs, serviceMs: finished - frameAt, completionMs: finished - scheduled,
          queueMs: frameAt - scheduled, missedDeadline: finished > scheduled + 250, batches });
      }
      let delivery = null;
      if (pipeline) {
        drive();
        await until(() => publicationFailure || !publicationTask && !publicationRunner.state().pending);
        assert.equal(publicationFailure, null);
        const sequence = Math.max(...offered.keys());
        await until(() => sockets.slice(0, -1).every(row => row.observations.at(-1)?.sequence === sequence || row.error));
        const observed = sockets[0].observations.filter(row => offered.has(row.sequence));
        const firstClientAges = observed.map(row => row.receivedAt - offered.get(row.sequence).scheduled);
        for (const row of sockets.slice(1, -1)) {
          assert.deepEqual(row.observations.map(v => v.sequence), sockets[0].observations.map(v => v.sequence));
          assert.deepEqual(row.latestPacket, sockets[0].latestPacket);
        }
        assert.equal(sockets.at(-1).frames, 1);
        // The gate includes the last acknowledging client, not only the first
        // decoder in this single Node process. Keep both spans for diagnosis.
        const ages = observed.map(row => Math.max(...sockets.slice(0, -1).map(peer =>
          peer.observations.find(v => v.sequence === row.sequence).receivedAt)) - offered.get(row.sequence).scheduled);
        const gaps = observed.slice(1).map((row, i) => row.receivedAt - observed[i].receivedAt);
        // Paired spans share Node's monotonic origin. Preserve per-sequence data;
        // subtracting separate p95s does not identify where a late frame waited.
        const samples = observed.map(row => {
          const production = offered.get(row.sequence);
          const peers = sockets.slice(0, -1).map(peer => peer.observations.find(v => v.sequence === row.sequence));
          const last = Math.max(...peers.map(p => p.receivedAt));
          const publication = publications.find(p => p.sequence === row.sequence && ["published", "reconciled"].includes(p.status));
          assert.ok(publication, "delivered frame must have committed publication evidence");
          return { frame: production.frame, sequence: row.sequence,
            completedMs: production.completedAt - production.scheduled,
            publicationStartedMs: publication.startedAt - production.scheduled,
            publicationReturnedMs: publication.finishedAt - production.scheduled,
            waitBeforePublicationMs: publication.startedAt - production.completedAt,
            publicationToFirstTransportMs: row.transportAt - publication.startedAt,
            publicationDiagnosticMs: publication.diagnosticMs,
            firstTransportMs: row.transportAt - production.scheduled,
            firstDecodeStartMs: row.decodeStartedAt - production.scheduled,
            firstReceivedMs: row.receivedAt - production.scheduled,
            lastReceivedMs: last - production.scheduled,
            completionToFirstTransportMs: row.transportAt - production.completedAt,
            firstDecodeMs: row.receivedAt - row.decodeStartedAt,
            firstToLastMs: last - row.receivedAt,
            largestPeerTimerOvershootMs: Math.max(...peers.map(p => p.decodeStartedAt - p.transportAt - clientDelayMs)) };
        });
        delivery = { emittedSweeps: observed.length, omittedSweeps: frameCount - observed.length,
          ageMs: stats(ages), firstClientAgeMs: stats(firstClientAges), gapMs: stats(gaps), lateEmittedSweeps: ages.filter(ms => ms > 250).length,
          allSweepsTimely: observed.length === frameCount && ages.every(ms => ms <= 250),
          state: publicationRunner.state(), publications, samples,
          pairedSpans: Object.fromEntries(["waitBeforePublicationMs", "publicationToFirstTransportMs", "publicationDiagnosticMs", "completionToFirstTransportMs", "firstDecodeMs", "firstToLastMs", "largestPeerTimerOvershootMs"]
            .map(key => [key, stats(samples.map(s => s[key]))])) };
        publicationRunner.close();
      }
      const saved = (await call('inspect')).saved;
      assert.equal(saved.host.sessions.sessions.length, 30);
      assert.ok(saved.host.sessions.sessions.every(s => s.state === 'grace' && s.deadline === epoch + 60000 && s.stepAt === epoch));
      const verified = await call('verify', { reference: before.host.simulation });
      assert.equal(verified.result.verified, 30); if (roaming) assert.equal(verified.result.npcSteps, frameCount);
      // Rollback and restart are outside the throughput window and preserve the
      // same final checkpoint; no failed speculative frame can move a body.
      now += 250; await call('fail-tick', { ticket, tokens: [] }, /injected body rollback/);
      assert.deepEqual((await call('inspect')).saved, saved);
      for (const row of sockets) row.socket.close();
      await mf.dispose(); mf = null; await start(disk);
      assert.deepEqual((await call('inspect')).saved, saved);
      const restored = await call('verify', { reference: before.host.simulation });
      assert.deepEqual(restored.result, verified.result);
      const batches = frames.flatMap(f => f.batches), writes = batches.reduce((n, b) => n + b.writes, 0);
      results.push({ scenario, pipeline, delivery, coldBeginMs, admissionsMs: stats(admissions),
        deliveredFrames, deliveredBytes, viewers: deliver ? 32 : 0, clientDecoders, publicationWarmupGapMs: deliver ? 250 : 0,
        clientWorkMs: stats(frames.map(f => f.clientWorkMs)),
        phases: Object.fromEntries([...new Set(frames.flatMap(f => Object.keys(f.phases)))].map(key =>
          [key, stats(frames.map(f => (f.phases[key] || []).reduce((a, b) => a + b, 0)))])),
        publicationMs: stats(frames.map(f => f.publicationMs)), publicationPacingMs: stats(frames.map(f => f.publicationPacingMs)),
        activeMs: stats(frames.map(f => f.activeMs)), serviceMs: stats(frames.map(f => f.serviceMs)), completionMs: stats(frames.map(f => f.completionMs)),
        transactionMs: stats(batches.map(b => b.wallMs)), missedDeadlines: frames.filter(f => f.missedDeadline).length,
        throughputGate: frames.every(f => !f.missedDeadline) && (!pipeline || delivery.allSweepsTimely), transactions: batches.length, writes,
        serializedWriteBytes: batches.reduce((n, b) => n + b.writeBytes, 0),
        hostWritesPerTargetSecond: writes / (frameCount / 4), verifiedBodies: verified.result.verified, verifiedNpcSteps: verified.result.npcSteps,
        rollback: true, persistedRestart: true, frames });
      await mf.dispose(); mf = null; continue;
    }
    now = epoch + 250;
    // A known-close no-op correctly writes nothing, so there is no event write
    // to fault. Unknown closes still exercise atomic event rollback.
    await call(events && scenario !== 'known-long' ? 'fail-event' : 'fail-tick', { ticket, tokens: [] }, /injected body rollback/);
    assert.deepEqual((await call('inspect')).saved, before);
    await mf.dispose(); mf = null;
    const restartAt = performance.now(); await start(disk);
    assert.deepEqual((await call('inspect')).saved, before); const coldRestartMs = performance.now() - restartAt;
    if (!short) {
      now = epoch + (medium ? 10001 : 60000); const old = ticket; ticket = (await call('claim')).result;
      await call(events ? 'event' : 'tick', { ticket: old, tokens: [] }, /fenced/);
    }
    const batches = [];
    for (let i = 0; i < 40; i++) {
      const out = await call(events ? 'event' : 'tick', { ticket, tokens: [] });
      if (events) {
        assert.equal(out.constructed, 0);
        batches.push({ wallMs: out.wallMs, steps: 0, pendingSteps: 0, npcSteps: 0,
          constructed: out.constructed, reads: out.reads, readBytes: out.readBytes, writes: out.writes,
          writeBytes: out.writeBytes, rootBytes: out.rootBytes, rowBytes: out.rowBytes });
        break;
      }
      if (roaming) assert.ok(out.result.steps <= 4);
      batches.push({ wallMs: out.wallMs, steps: out.result.work.steps, pendingSteps: out.result.work.pendingSteps,
        npcSteps: out.result.steps, constructed: out.constructed, reads: out.reads, readBytes: out.readBytes,
        writes: out.writes, writeBytes: out.writeBytes, rootBytes: out.rootBytes, rowBytes: out.rowBytes });
      if (!out.result.work.pendingSteps && (!medium || out.result.lagMs < 250)) break;
    }
    assert.equal(batches.at(-1).pendingSteps, 0); assert.equal(batches.reduce((n, b) => n + b.steps, 0), 0);
    const saved = (await call('inspect')).saved;
    assert.equal(saved.host.sessions.sessions.length, expired ? 0 : 30);
    assert.equal(saved.host.sessions.pending.length, expired ? 30 : 0);
    const original = new Map(before.host.sessions.sessions.map(s => [s.bodyId, s.motion]));
    const frozen = s => {
      const m = s.motion || s.body.motion, at = original.get(s.bodyId);
      return ['x', 'y', 'z', 'yaw', 'grounded'].every(k => Object.is(m[k], at[k])) && m.vx === 0 && m.vy === 0 && m.vz === 0;
    };
    assert.ok(saved.host.sessions.sessions.every(s => s.deadline === epoch + 60000 && s.stepAt === epoch && frozen(s)));
    assert.ok(saved.host.sessions.pending.every(p => p.at === epoch + 60000 && p.handback === null && frozen(p)));
    let eventReads = null;
    if (events) {
      const noop = await call('event', { ticket, tokens: [] }); assert.equal(noop.writes, 0); assert.equal(noop.result.changed, false);
      const presence = await call('presence', { ticket }); assert.equal(presence.writes, 0);
      assert.equal(presence.result.frame.views.length + presence.result.frame.departures.length, 30);
      eventReads = { noopMs: noop.wallMs, noopReadBytes: noop.readBytes, presenceMs: presence.wallMs,
        presenceReadBytes: presence.readBytes, frameBytes: Buffer.byteLength(JSON.stringify(presence.result.frame)), writes: 0 };
    }
    const verified = await call('verify', { reference: before.host.simulation }); assert.equal(verified.result.verified, 30);
    if (roaming) assert.equal(verified.result.npcSteps, events ? 0 : short ? 1 : medium ? 40 : 0);
    let departureCleanup = null;
    if (cleanupAck && expired) {
      // The last body is gone, and both the finite run and its ownership lease
      // have ended. Reacquire only to retain/acknowledge already-applied events.
      now = epoch + 120001; const old = ticket;
      ticket = (await call('cleanup-claim')).result;
      await call('presence', { ticket: old }, /fenced/);
      const retained = (await call('inspect')).saved;
      const first = (await call('presence', { ticket })).result.frame;
      assert.equal(first.views.length, 0); assert.equal(first.departures.length, 30);
      const receipt = frame => ({ world: frame.world, epoch: frame.epoch, revision: frame.revision,
        ids: frame.departures.slice(0, 15).map(p => p.id) });
      await call('fail-ack', { ticket, receipt: receipt(first) }, /injected body rollback/);
      assert.deepEqual((await call('inspect')).saved, retained);
      const partial = await call('ack', { ticket, receipt: receipt(first) });
      assert.equal(partial.result.changed, true); assert.equal(partial.constructed, 0);
      const stale = await call('ack', { ticket, receipt: receipt(first) });
      assert.equal(stale.result.superseded, true); assert.equal(stale.writes, 0);
      assert.equal((await call('verify', { reference: before.host.simulation })).result.verified, 15);
      const rest = (await call('presence', { ticket })).result.frame;
      assert.equal(rest.departures.length, 15);
      const final = await call('ack', { ticket, receipt: receipt(rest) });
      assert.equal(final.result.changed, true); assert.equal(final.constructed, 0);
      const empty = (await call('inspect')).saved;
      assert.equal(empty.count, 0); assert.equal(empty.host.status, 'stopped');
      assert.equal(empty.host.leaseUntil, now); assert.equal(empty.host.runUntil, retained.host.runUntil);
      assert.deepEqual(empty.host.simulation, retained.host.simulation);
      await call('cleanup-claim', {}, /cleanup unavailable/);
      await mf.dispose(); mf = null; await start(disk);
      assert.deepEqual((await call('inspect')).saved, empty);
      assert.equal((await call('verify', { reference: before.host.simulation })).result.verified, 0);
      departureCleanup = { acknowledged: 30, rollback: true, staleReceiptWrites: 0, stopped: true,
        persistedRestart: true, bodyConstructions: 0,
        partial: { wallMs: partial.wallMs, writes: partial.writes, writeBytes: partial.writeBytes, deletes: partial.deletes },
        final: { wallMs: final.wallMs, writes: final.writes, writeBytes: final.writeBytes, deletes: final.deletes } };
    }
    results.push({ scenario, coldBeginMs, coldRestartMs, admissionsMs: stats(admissions), closeMs,
      recoveryMs: stats(batches.map(b => b.wallMs)), over250ms: batches.filter(b => b.wallMs > 250).length,
      totalRecoveryMs: batches.reduce((n, b) => n + b.wallMs, 0),
      attemptedRecoveryWrites: batches.reduce((n, b) => n + b.writes, 0),
      serializedRecoveryWriteBytes: batches.reduce((n, b) => n + b.writeBytes, 0),
      verifiedBodies: verified.result.verified, verifiedNpcSteps: verified.result.npcSteps, rollback: true, persistedRestart: true, staleOwnerFenced: !short, eventReads, departureCleanup, batches });
    await mf.dispose(); mf = null;
  }
  assert.equal(deniedEgress, 0); assert.equal(logs.length, 0);
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    miniflare: manifest.version, roaming, events, closeStorm, cleanupAck, steady, deliver, pipeline, cachedRoom, rolling, burst, projectNearGate, frameCount, clientDelayMs, bodyLoads, clientDecoders, npcStepLimit: roaming ? 4 : 8, sourceHashes, deniedEgress, logs: logs.length, results,
    limitations: ['30 distinct actual player-body controllers with SQLite/session transactions, in independent authored empty meadows.',
      roaming ? 'Also 53 actual restricted roaming NPCs, sharing the host transaction but not world collision/ownership with the player fixtures.' : 'World is 64 KiB padding; no full-world NPC simulation.',
      deliver ? 'Real Room RPC and 32 protocol clients including one stalled receiver; no browser, live body transport or authenticated body reclaim. Cold requests include disposable bootstrap rigs.'
        : 'No browser, Room or live body transport. Cold requests include disposable bootstrap rigs; verify commands rebuild all30 outside host mutations.',
      'Measured wall time includes dispatch and diagnostic reads, not billed CPU, actual billing units or peak-memory certification.',
      ...(projectNearGate ? ['Harness-only projection delayed until 50ms before the existing strict gate; final confirmation still waits for that gate. Fixed simulation arrival grid and production policy unchanged.'] : []),
      'Short recovery retains the same valid owner lease across orderly runtime reconstruction; long recovery obtains a replacement fence.',
      steady ? `Finite ${frameCount / 4}-second scheduled four-Hz trial, ${clientDelayMs}ms synthetic client delay; not full-world/network certification or abrupt eviction. Cached runtime differs from declared Wrangler.`
        : 'Finite fixed-clock recovery is not sustained four-Hz throughput or abrupt eviction. Cached runtime differs from declared Wrangler.',
      'No account configuration, production data, deployment, provisioning, paid API or permanent loop.'] }, null, 2));
} finally { publicationRunner?.close(); if (publicationTimer !== null) clearTimeout(publicationTimer); for (const row of sockets) { if (row.pending !== null) clearTimeout(row.pending); try { row.socket.close(); } catch {} } if (mf) await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
