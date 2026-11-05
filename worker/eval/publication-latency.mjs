// Finite deterministic diagnosis, not a timing benchmark. Exercise the actual
// publisher, rate-limited Room transaction and latest-only runner with authored
// final-confirmation costs. No network, browser, timers or automatic scheduling.
import assert from 'node:assert/strict';
import { RoomNpcAuthority, npcAuthorityView, npcCadenceName, npcNextPublicationAt } from '../src/room-npc-authority.js';
import { LatestHostPublication } from '../src/host-publication.js';
import { publishHostPoses } from '../src/host-room.js';
import { ROLLING_CADENCE } from '../src/host-cadence.js';
import { createNpcPose } from '../src/npc-pose.js';
import { rig } from '../test/fixtures/npc-pose-rig.mjs';
const results = [];
for (const producer of ['serial', 'independent']) for (const sweeps of [120, 1200]) for (const confirmMs of [0, 1, 4]) {
  let now = 100000, sequence = 1, notBefore = now, saved, roomState;
  let runner, start, nextProduction = Infinity, end = Infinity;
  const attempts = [], commits = [], ages = [], waits = [];
  const advance = target => {
    assert.ok(target >= now);
    while (nextProduction <= target && nextProduction < end) {
      now = nextProduction; nextProduction += 250;
      runner.offer(++sequence);
    }
    now = target;
  };
  const frame = createNpcPose(123, 1)([{ index: 0, actor: rig() }]);
  const ticket = { world: 'latency-model-1', fence: 1, owner: 'finite-model' }, runUntil = now + sweeps * 250 + 10000;
  const storage = { get: async () => structuredClone(saved), async transaction(fn) {
    let next = structuredClone(saved);
    const out = await fn({ get: async () => next, put: async (_, value) => { next = structuredClone(value); } });
    saved = next; return out;
  } };
  const authority = new RoomNpcAuthority(storage, () => now);
  const room = {
    async npcAuthorityStatus(t) {
      const r = await authority.read(); if (!r) return null;
      return { authority: npcAuthorityView(r), sequence: r.sequence, runUntil: r.runUntil, cadence: npcCadenceName(r),
        owns: t?.revision === r.revision && t.owner === r.owner && t.world === r.world && t.epoch === r.epoch };
    },
    async configureNpcAuthority(expected, next) { return npcAuthorityView(await authority.change(expected, next)); },
    async publishNpcSnapshot(t, s, bytes) {
      const { record: r, duplicate } = await authority.publish(t, s, bytes);
      commits.push(r.at);
      if (producer === 'independent' && start !== undefined) ages.push(r.at - (start + (s - 2) * 250));
      return { revision: r.revision, sequence: r.sequence, publishedAt: r.at, duplicate,
        cadence: npcCadenceName(r), nextPublishAt: npcNextPublicationAt(r) };
    },
  };
  const host = {
    async poses() { advance(now + 20); return { sequence, at: now, runUntil, frame }; },
    async confirmPoses(_, revision) {
      waits.push(Math.max(0, notBefore - now)); advance(Math.max(now, notBefore) + confirmMs);
      return revision.sequence === sequence && now < runUntil;
    },
  };
  roomState = (await publishHostPoses(host, room, ticket, { acquire: true, cadence: ROLLING_CADENCE })).roomState;
  now += 250; start = now; end = start + sweeps * 250;
  runner = new LatestHostPublication({ clock: () => now, until: runUntil, cadence: ROLLING_CADENCE,
    async publish(options) {
      attempts.push(now); notBefore = options.notBefore;
      const result = await publishHostPoses(host, room, ticket, { cadence: ROLLING_CADENCE, roomState });
      if (result.roomState) roomState = result.roomState;
      return result;
    } });
  if (producer === 'serial') {
    for (let i = 0; i < sweeps; i++) {
      const scheduled = start + i * 250; now = Math.max(now, scheduled);
      runner.offer(++sequence); now = Math.max(now, runner.state().nextAt);
      await runner.flush(); ages.push(now - scheduled);
    }
  } else {
    nextProduction = start;
    for (let operations = 0; nextProduction < end || runner.state().pending; operations++) {
      assert.ok(operations < sweeps * 2, 'finite model cannot spin');
      if (!runner.state().pending) advance(Math.max(now, nextProduction));
      advance(Math.max(now, runner.state().nextAt));
      await runner.flush();
    }
    assert.equal(sequence, sweeps + 1); assert.equal(saved.sequence, sequence, 'latest production was delivered');
  }
  // A diagnosis is invalid if it quietly relaxes either strict rate bound.
  for (const values of [attempts, commits]) for (let i = 0; i < values.length; i++) {
    if (i) assert.ok(values[i] - values[i - 1] >= 125);
    if (i >= 4) assert.ok(values[i] - values[i - 4] >= 1000);
  }
  if (producer === 'serial') {
    assert.equal(runner.state().stats.published, sweeps); assert.equal(runner.state().stats.coalesced, 0);
  }
  const spans = commits.slice(4).map((at, i) => at - commits[i]);
  results.push({ producer, confirmMs, authoredPreparationMs: 20, sweeps,
    delivered: ages.length, runner: runner.state().stats,
    authoredDurationMs: sweeps * 250, above250Ms: ages.filter(age => age > 250).length,
    firstAbove250Delivery: ages.findIndex(age => age > 250) < 0 ? null : ages.findIndex(age => age > 250) + 1,
    firstAgeMs: ages[0], lastAgeMs: ages.at(-1), maxAgeMs: Math.max(...ages),
    downstreamBudgets: [0, 20, 50].map(authoredDeliveryMs => ({ authoredDeliveryMs,
      maximumArrivalAgeMs: Math.max(...ages) + authoredDeliveryMs,
      arrivalsAbove250Ms: ages.filter(age => age + authoredDeliveryMs > 250).length,
      minimumRemainingBudgetMs: 250 - Math.max(...ages) - authoredDeliveryMs })),
    maxPacingMs: Math.max(...waits), minimumFourCommitSpanMs: Math.min(...spans), maximumFourCommitSpanMs: Math.max(...spans),
    strictAttemptAndCommitBounds: true });
}
console.log(JSON.stringify({ results, limitations: [
  'Authored logical time and one pose; these are not measured CPU, RPC latency or full-world delivery ages.',
  'No simulated body work, storage latency, client decoding, network or host takeover.',
  'Downstream budgets add authored 0/20/50 ms to each commit age; they do not simulate queues, change the producer clock or measure transport.',
  'Serial production waits for each publication; independent production offers every 250 logical ms even during reads, pacing and confirmation.',
  'Independent production only changes revision signals; no world simulation runs and all frame bytes remain identical.',
  'The five-minute horizon diagnoses accumulated delay in this ordering, not a live throughput or production prediction.',
  'This isolates post-eligibility confirmation delay while retaining the actual Room rate implementation.',
  'No rate policy or ownership check is changed; activation and burst remain disabled.'
] }, null, 2));
