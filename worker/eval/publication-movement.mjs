// Finite logical scheduling diagnosis. Actual publisher/Room rate gate, authored
// mutation times and costs. No controller simulation, timers, network or billing.
import assert from 'node:assert/strict';
import { RoomNpcAuthority, npcAuthorityView, npcCadenceName, npcNextPublicationAt } from '../src/room-npc-authority.js';
import { LatestHostPublication } from '../src/host-publication.js';
import { publishHostPoses } from '../src/host-room.js';
import { ROLLING_CADENCE } from '../src/host-cadence.js';
import { createNpcPose } from '../src/npc-pose.js';
import { rig } from '../test/fixtures/npc-pose-rig.mjs';
const results = [];
for (const movementHz of [0, 1, 4, 15]) for (const phaseMs of movementHz ? [0, 25, 80] : [0]) {
  let now = 100000, revision = 1, notBefore = now, stored, roomState, runner, start, end = Infinity;
  let nextProduction = Infinity, nextMovement = Infinity, movementIndex = 1, mutations = 0, simulatedAt = now;
  const sweeps = 1200, attempts = [], commits = [], ages = [], projectedAt = new Map();
  const advance = target => {
    assert.ok(target >= now);
    while (Math.min(nextProduction, nextMovement) <= target && Math.min(nextProduction, nextMovement) < end) {
      now = Math.min(nextProduction, nextMovement);
      if (nextProduction === now) { simulatedAt = now; nextProduction += 250; runner.offer(++revision); }
      if (nextMovement === now) {
        revision++; mutations++;
        nextMovement = start + phaseMs + Math.round(++movementIndex * 1000 / movementHz);
      }
    }
    now = target;
  };
  const storage = { get: async () => structuredClone(stored), async transaction(fn) {
    let draft = structuredClone(stored);
    const result = await fn({ get: async () => draft, put: async (_, v) => { draft = structuredClone(v); } });
    stored = draft; return result;
  } };
  const authority = new RoomNpcAuthority(storage, () => now), ticket = { owner: 'finite-model', world: 'movement-model-1', fence: 1 };
  const runUntil = now + sweeps * 250 + 10000, frame = createNpcPose(123, 1)([{ index: 0, actor: rig() }]);
  const room = {
    async npcAuthorityStatus(t) {
      const r = await authority.read(); if (!r) return null;
      return { authority: npcAuthorityView(r), sequence: r.sequence, runUntil: r.runUntil, cadence: npcCadenceName(r),
        owns: t?.revision === r.revision && t.owner === r.owner && t.world === r.world && t.epoch === r.epoch };
    },
    async configureNpcAuthority(expected, next) { return npcAuthorityView(await authority.change(expected, next)); },
    async publishNpcSnapshot(t, sequence, bytes) {
      const { record: r, duplicate } = await authority.publish(t, sequence, bytes);
      if (start !== undefined) { commits.push(r.at); ages.push(r.at - projectedAt.get(sequence)); }
      return { revision: r.revision, sequence: r.sequence, publishedAt: r.at, duplicate,
        cadence: npcCadenceName(r), nextPublishAt: npcNextPublicationAt(r) };
    },
  };
  const host = {
    async poses() {
      advance(now + 20); projectedAt.set(revision, simulatedAt);
      return { sequence: revision, at: simulatedAt, runUntil, frame };
    },
    async confirmPoses(_, snapshot) {
      advance(Math.max(now, notBefore) + 1);
      return snapshot.sequence === revision && snapshot.at === simulatedAt && now < runUntil;
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
  nextProduction = start;
  nextMovement = movementHz ? start + phaseMs + Math.round(1000 / movementHz) : Infinity;
  for (let operations = 0; nextProduction < end || runner.state().pending; operations++) {
    assert.ok(operations < sweeps * 2, 'bounded finite runner');
    if (!runner.state().pending) advance(Math.max(now, nextProduction));
    advance(Math.max(now, runner.state().nextAt)); await runner.flush();
  }
  for (const times of [attempts, commits]) for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= 125);
    if (i >= 4) assert.ok(times[i] - times[i - 4] >= 1000);
  }
  results.push({ movementHz, phaseMs, sweeps, mutations, authoredPreparationMs: 20, authoredConfirmationMs: 1,
    delivered: commits.length, superseded: runner.state().stats.superseded,
    maximumCommitAgeMs: ages.length ? Math.max(...ages) : null,
    arrivalsAbove250WithAuthored20MsDownstream: ages.filter(age => age + 20 > 250).length,
    strictAttemptAndCommitBounds: true });
}
console.log(JSON.stringify({ results, limitations: [
  'Logical authored time, no measured CPU, storage, network, browser, billing or full-world simulation.',
  'Movement advances shared host revision only. No movement payload or physical body is processed.',
  'All frame bytes are identical. NPC production signals every 250ms; movement does not create a new publication signal.',
  'These phases are scheduling examples, not a production probability distribution or proof of readiness.',
  'The exact revision fence and strict four-per-rolling-second rate gate are unchanged. Activation/burst stay disabled.'
] }, null, 2));
