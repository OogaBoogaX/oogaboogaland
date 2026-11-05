// Finite Node-only cost sample for actual prop support loss and recovery.
// Eight operations, four independent bodies per operation; no service loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture, worldId } from '../test/fixtures/clanker-body-world-fixture.mjs';
const f = fixture({ wall: true }), saved = [], rows = [], phases = [], browserPhases = [], wires = [], hashes = {};
for (const path of ['../../src/js/clankers.js', '../../src/js/agent.js', '../../src/js/solid-props.js',
  '../../src/js/clanker-body-transfer.js', '../src/clanker-roaming.js', '../src/checkpoint-pack.js',
  '../test/fixtures/clanker-controller-fixture.mjs', '../test/fixtures/clanker-body-world-fixture.mjs'])
  hashes[path] = createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
try {
  for (let i = 0; i < 32; i++) {
    const body = f.make({ ownerId: `player-${i}`, name: `player-${i}` });
    try { f.seed(body, -16 + (i % 4) * 6, -16 + Math.floor(i / 4) * 4); saved.push(body.codec.capture()); }
    finally { body.sim.dispose(); }
  }
  f.removeSupport();
  for (let offset = 0; offset < 32; offset += 4) {
    const started = performance.now(), cpu = process.cpuUsage(); let active = 0, peak = 0;
    for (let i = offset; i < offset + 4; i++) {
      const at = performance.now(), body = f.make({ ownerId: `player-${i}`, name: `player-${i}` }); active++; peak = Math.max(peak, active);
      try {
        body.codec.restore(saved[i], { passive: true });
        assert.throws(() => body.codec.capture(), /unsupported/);
        body.codec.stepPassive(body.codec.motion(), 50);
        const checkpoint = body.codec.capture(), motion = body.codec.motion();
        assert.equal(motion.grounded, false); assert.ok(motion.y < 2 && motion.vy < 0);
        const wire = JSON.stringify(body.codec.records.transfer(checkpoint)); wires.push(wire);
        rows.push({ index: i, constructRecoverEncodeMs: performance.now() - at,
          checkpointBytes: Buffer.byteLength(JSON.stringify(checkpoint)), wireBytes: Buffer.byteLength(wire), motion });
      } finally { body.sim.dispose(); active--; }
    }
    const used = process.cpuUsage(cpu);
    phases.push({ bodies: 4, wallMs: performance.now() - started, cpuMs: (used.user + used.system) / 1000, peakControllers: peak });
  }
  for (let offset = 0; offset < 32; offset += 4) {
    const started = performance.now();
    for (let i = offset; i < offset + 4; i++) {
      const body = f.make({ ownerId: `player-${i}`, name: `player-${i}` });
      try {
        f.B.clankerBodyTransfer.forBody(body.sim, worldId).restore(JSON.parse(wires[i]));
        assert.deepEqual(structuredClone(body.sim.bodyCheckpoint.motion()), structuredClone(rows[i].motion));
        assert.equal(body.sim.activate(), true);
      } finally { body.sim.dispose(); }
    }
    browserPhases.push({ bodies: 4, wallMs: performance.now() - started, peakControllers: 1 });
  }
  assert.equal(rows.length, 32);
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, hashes,
    bodies: rows.length, operations: phases, maxOperationMs: Math.max(...phases.map(p => p.wallMs)),
    totalOperationMs: phases.reduce((n, p) => n + p.wallMs, 0), maxCheckpointBytes: Math.max(...rows.map(r => r.checkpointBytes)),
    maxWireBytes: Math.max(...rows.map(r => r.wireBytes)), browserOperations: browserPhases,
    maxBrowserOperationMs: Math.max(...browserPhases.map(p => p.wallMs)), totalBrowserOperationMs: browserPhases.reduce((n, p) => n + p.wallMs, 0), rows,
    limitations: ['One platform removed and one retained wall, with 32 distinct body identities; static authored geometry, no Hub/browser.',
      'Four bodies processed serially per operation; one live body controller at a time. Source modules and collision trees are already loaded.',
      'Recovery includes construction, passive restore, 50ms source step, capture, wire encode and disposal; no host/session/Room/SQLite/network overhead.',
      'Browser-source operations run in Node: construct, JSON parse, source decode, placement validation/activation and dispose; no real browser, camera attachment or rendered frame.',
      'Component bytes are not complete session/row/envelope bytes; Node CPU is not provider billed CPU or peak-memory certification.',
      'Eight operations only, not a tail-latency guarantee, full-world representative load or sustained four-Hz test.'] }, null, 2));
} finally { f.dispose(); }
