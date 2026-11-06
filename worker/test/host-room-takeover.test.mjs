// Actual host, Room authority and publication bridge. Serial rollback-capable
// stores and authored data-only simulation; no Hub, scene, browser or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL, boundedJSON } from '../src/virtual-host.js';
import { validateRoomBinding } from '../src/host-room-claim.js';
import { RoomNpcAuthority, ROOM_NPC, npcAuthorityView, npcCadenceName, npcNextPublicationAt } from '../src/room-npc-authority.js';
import { publishHostPoses, acquireHostRoom, claimHostRoom, closeHostRoomRun, recoverReleasedHostRoom } from '../src/host-room.js';
import { openHostWorldRunner } from '../src/host-world-runner.js';
import { RoomBodyPresence, ROOM_BODY_PRESENCE } from '../src/room-body-presence.js';

function storage() {
  let data = new Map(), tail = Promise.resolve(), failure = false, puts = 0;
  return { get: async key => structuredClone(data.get(key)), writes: () => puts, fail: () => { failure = true; },
    transaction(fn) {
      const work = tail.then(async () => {
        const pending = structuredClone(data); let written = 0;
        const result = await fn({ get: async key => structuredClone(pending.get(key)),
          put: async (key, value) => {
            if (failure) { failure = false; throw Error('fixture write failure'); }
            pending.set(key, structuredClone(value)); written++;
          } });
        data = pending; puts += written; return result;
      });
      tail = work.catch(() => {}); return work;
    } };
}
function frame() {
  const data = new ArrayBuffer(16 + 112 * 4), header = new Uint32Array(data, 0, 4), values = new Float32Array(data, 16);
  header.set([2, 0, 1, 0]); values[1] = 1; values[12] = values[13] = values[14] = values[43] = 1;
  return data;
}
function fixture() {
  let now = 100000;
  const hostStore = storage(), roomStore = storage(), simulation = {
    version: 'takeover-fixture-1', checkpointBytes: 30 * 1024,
    initial: () => ({ steps: 0 }), validate: s => Number.isSafeInteger(s.steps),
    step(s) { s.steps++; }, project: () => ({ npcs: [], hub: { pile: 0 } }),
    npcFor: () => null, handoff: () => false, poses: frame,
    // Data-only source reconciliation, called only by reconcileSource.
    applySource(s, source, timing) {
      if (source.fail) throw Error('fixture source failure');
      if (s.level === source.level) return 'unchanged';
      s.level = source.level; s.sourceAt = timing.observedAt; return 'applied';
    } };
  const makeHost = () => new VirtualHost({ storage: hostStore, simulation, clock: () => now, sessionAdapter: { stepPassive: m => m } });
  const makeRoom = () => {
    const authority = new RoomNpcAuthority(roomStore, () => now);
    return {
      async npcAuthorityStatus(ticket) {
        const r = await authority.read();
        return { authority: npcAuthorityView(r), owns: !!r && r.mode === 'server' && ticket?.revision === r.revision
          && ticket.v === r.v && ticket.format === r.format && ticket.owner === r.owner && ticket.world === r.world && ticket.epoch === r.epoch,
          sequence: r?.sequence, runUntil: r?.runUntil, cadence: npcCadenceName(r) };
      },
      async configureNpcAuthority(expected, next) { return npcAuthorityView(await authority.change(expected, next)); },
      async fenceNpcAuthority(intent) { return npcAuthorityView(await authority.fence(intent)); },
      async reacquireNpcAuthority(expected, intent, format) { return npcAuthorityView(await authority.reacquire(expected, intent, format)); },
      async publishNpcSnapshot(ticket, sequence, data) {
        const { record, duplicate } = await authority.publish(ticket, sequence, data);
        return { revision: record.revision, sequence: record.sequence, publishedAt: record.at, duplicate };
      }
    };
  };
  return { hostStore, roomStore, makeHost, makeRoom, host: makeHost(), room: makeRoom(), now: () => now, at: value => { now = value; } };
}

test('bounded publication pacing confirms ownership after the wait and keeps the strict Room gate', async () => {
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  const first = await publishHostPoses(f.host, f.room, ticket, { acquire: true });
  f.at(100125); await f.host.tick(ticket, []);
  const calls = [], host = Object.create(f.host);
  host.confirmPoses = async (...args) => { calls.push(['confirm', f.now()]); return f.host.confirmPoses(...args); };
  const options = { roomState: first.roomState, notBefore: 100250, clock: f.now,
    waitUntil: async deadline => { calls.push(['wait', deadline]); f.at(deadline); } };
  // There is no new frame at 125 ms. Create a metadata-only revision; this
  // tests publication timing independently of the source world's step size.
  await f.host.sessions(ticket, [], () => true);
  const published = await publishHostPoses(host, f.room, ticket, options);
  assert.deepEqual(calls, [['wait', 100250], ['confirm', 100250]]);
  assert.equal(published.publishedAt, 100250); assert.equal(published.cadence, undefined);
  f.at(100375); await f.host.sessions(ticket, [], () => true);
  await assert.rejects(publishHostPoses(host, f.room, ticket, { ...options, notBefore: 100499 }), /fenced/);
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).at, 100250, 'caller-supplied timing cannot bypass the durable 250ms gate');
});

test('Room acquisition without publication binds the host and holds authority with no frame, so the first frame follows a later commit', async () => {
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  const acquired = await acquireHostRoom(f.host, f.room, ticket);
  assert.equal(acquired.status, 'acquired');
  const held = await f.roomStore.get(ROOM_NPC.key);
  assert.deepEqual([held.mode, held.owner, held.epoch, held.frame, held.sequence], ['server', 'runner', ticket.fence, null, 0], 'authority held, no frame sent');
  assert.equal((await f.host.worldRunState(ticket)).publicationProtocol, 1, 'host bound to the Room before any frame');
  // A lost reply: retrying re-verifies the held authority without changing it.
  const roomWrites = f.roomStore.writes();
  assert.deepEqual(await acquireHostRoom(f.host, f.room, ticket), acquired);
  assert.equal(f.roomStore.writes(), roomWrites, 'a retry writes nothing to Room');
  // The runner opens on the bound pair, and the world advances before anything is shown.
  await openHostWorldRunner({ host: f.host, room: f.room, ticket, clock: f.now, waitUntil: async at => f.at(at) });
  f.at(100250); const tick = await f.host.tick(ticket, []);
  assert.ok(tick.steps > 0 && tick.snapshot);
  const first = await publishHostPoses(f.host, f.room, ticket, { roomState: acquired.roomState });
  assert.equal(first.status, 'published');
  assert.equal(first.sequence, tick.snapshot.sequence, 'the first frame shown is the committed post-tick revision');
});

test('Room acquisition without publication keeps uncertain-reply reconciliation, fencing and its explicit-only form', async () => {
  // Room commits the claim, then the reply is lost: reconciled by reading, never retried blindly.
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  let lost = 0;
  const flaky = { ...f.room, async configureNpcAuthority(...args) { await f.room.configureNpcAuthority(...args); lost++; throw Error('lost reply'); } };
  const acquired = await acquireHostRoom(f.host, flaky, ticket);
  assert.deepEqual([acquired.status, lost], ['acquired', 1]);
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).frame, null);
  // A newer Room owner fences an older host's acquisition.
  const g = fixture(), old = await g.host.begin('runner-old', 60000);
  await g.room.configureNpcAuthority(0, { mode: 'server', world: old.world, epoch: old.fence + 1, owner: 'runner-newer', runUntil: 160000 });
  await assert.rejects(acquireHostRoom(g.host, g.room, old), /fenced/);
  assert.equal((await g.hostStore.get(HOST.key)).room, undefined, 'a fenced acquisition never binds the host');
  // Never implicit, retained or paced.
  const h = fixture(), t = await h.host.begin('runner', 60000);
  for (const options of [{ publish: false }, { publish: false, acquire: true, notBefore: 100250, waitUntil: async () => {} },
    { publish: false, acquire: true, roomState: { authority: {}, owner: 'runner', runUntil: 0, cadence: null } }, { publish: 0, acquire: true }])
    await assert.rejects(publishHostPoses(h.host, h.room, t, options), /explicit fresh acquisition/, JSON.stringify(options));
  assert.equal(await h.roomStore.get(ROOM_NPC.key), undefined, 'nothing acquired by a refused form');
});

test('source-only reconciliation needs an owned Room-bound run and changes only source state, never clocks, sessions or deadlines', async () => {
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  await assert.rejects(f.host.reconcileSource(ticket, { level: 7 }), /acquired running world/, 'never before Room acquisition');
  await acquireHostRoom(f.host, f.room, ticket);
  await f.host.connect(ticket, [], { protocol: SESSION_PROTOCOL, world: ticket.world, accountId: 1, bodyId: 'player:1', zone: 'outside',
    body: { kind: 'ooga', motion: { x: 1, y: 8, z: 2, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: false },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } });
  f.at(100100);
  const before = await f.hostStore.get(HOST.key);
  assert.ok(before.sessions.sessions.length === 1, 'a live body with its deadlines');
  const applied = await f.host.reconcileSource(ticket, { level: 7 });
  assert.deepEqual([applied.status, applied.epoch], ['applied', ticket.fence]);
  const after = await f.hostStore.get(HOST.key);
  const kept = ({ revision, wallAt, simulation, ...rest }) => rest;
  assert.deepEqual(kept(after), kept(before), 'sessions, deadlines, lease, run end, wallCursor and simulatedAt untouched');
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.simulation, { ...before.simulation, level: 7, sourceAt: 100100 }, 'no step: only source state, at trusted host time');
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).frame, null, 'no frame is sent');
  // Unchanged source writes nothing; a failed application or commit changes nothing.
  const writes = f.hostStore.writes();
  assert.equal((await f.host.reconcileSource(ticket, { level: 7 })).status, 'unchanged');
  await assert.rejects(f.host.reconcileSource(ticket, { level: 8, fail: true }), /fixture source failure/);
  f.hostStore.fail();
  await assert.rejects(f.host.reconcileSource(ticket, { level: 9 }), /fixture write failure/);
  assert.equal(f.hostStore.writes(), writes);
  assert.deepEqual(await f.hostStore.get(HOST.key), after, 'retained exactly as last committed');
  // After a takeover, the old owner can no longer reconcile.
  f.at(110001); const next = await claimHostRoom(f.host, f.room, 'runner-b');
  await assert.rejects(f.host.reconcileSource(ticket, { level: 9 }), /fenced/);
  assert.equal((await f.host.reconcileSource(next, { level: 9 })).status, 'applied');
});

// Real host/session/presentation storage and Room NPC authority; the transport
// census below is authored, not a WebSocket or Hub integration test.
function eventRoom(f, tokens = []) {
  const presence = new RoomBodyPresence(f.roomStore, f.now);
  let duringCensus = null, deliveries = 0;
  return { room: { ...f.room,
    bodyWork: async () => ({ tokens: [...tokens], events: [], nextDeadline: null, publicationPending: null }),
    bodyCensus: async () => { if (duringCensus) await duringCensus(); return { ready: true, tokens: [...tokens], closed: [], pending: [], unobserved: [] }; },
    retainBodyPresence: (...args) => presence.retain(...args),
    bodyPresenceStatus: authority => presence.snapshot(authority),
    deliverBodyPresence: async () => { deliveries++; },
  }, during: fn => { duringCensus = fn; }, deliveries: () => deliveries };
}

test('world event runner separates body events from ticks and reattaches at a due frozen deadline', async () => {
  const f = fixture(), ticket = await f.host.begin('runner-a', 120000);
  await publishHostPoses(f.host, f.room, ticket, { acquire: true });
  const joined = (await f.host.connect(ticket, [], { protocol: SESSION_PROTOCOL, world: ticket.world,
    accountId: 1, bodyId: 'player:1', zone: 'outside', body: { kind: 'ooga',
      motion: { x: 1, y: 8, z: 2, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: false },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false,
        selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } })).result;
  const tokens = [joined.session.token], events = eventRoom(f, tokens);
  const beforeOpen = [f.hostStore.writes(), f.roomStore.writes()];
  const create = owner => openHostWorldRunner({ host: f.host, room: events.room, ticket: owner, clock: f.now, waitUntil: async at => f.at(at) });
  const runner = await create(ticket);
  assert.deepEqual([f.hostStore.writes(), f.roomStore.writes()], beforeOpen, 'attachment is read-only');
  assert.equal((await runner.tick()).status, 'body-events-required');
  assert.equal((await runner.publish()).status, 'body-events-required');
  assert.equal((await runner.bodies()).status, 'reconciled');
  const quiet = [f.hostStore.writes(), f.roomStore.writes(), events.deliveries()];
  assert.equal((await runner.bodies({ refresh: false })).presence.status, 'unchanged');
  assert.deepEqual([f.hostStore.writes(), f.roomStore.writes(), events.deliveries()], quiet,
    'a recovery rescan inspects ownership without rewriting or redelivering unchanged bodies');
  const roomWrites = f.roomStore.writes(); f.at(100250);
  assert.equal((await runner.tick()).result.steps, 1);
  assert.equal(f.roomStore.writes(), roomWrites, 'an ordinary world tick does not rewrite body presence');
  assert.equal((await runner.publish()).status, 'published');
  tokens.length = 0;
  const disconnected = await runner.bodies();
  assert.equal(disconnected.nextBodyAt, 160000);
  const frozen = await f.roomStore.get(ROOM_BODY_PRESENCE.key);
  assert.equal(frozen.frame.views[0].motion.y, 8); assert.equal(frozen.frame.views[0].state, 'grace');
  assert.equal(frozen.frame.views[0].deadline, 160000);
  const writes = [f.hostStore.writes(), f.roomStore.writes()];
  for (let i = 0; i < 50; i++) runner.state();
  assert.deepEqual([f.hostStore.writes(), f.roomStore.writes()], writes, 'no frozen-body polling loop is installed');
  f.at(160000); runner.close();
  const replacement = await claimHostRoom(f.host, f.room, 'runner-b');
  assert.equal(await f.host.poses(replacement, { skipPending: true }), null, 'due lifecycle correctly blocks poses');
  const restarted = await create(replacement);
  assert.equal((await restarted.tick()).status, 'body-events-required');
  assert.equal((await restarted.bodies()).status, 'reconciled');
  const departed = await f.roomStore.get(ROOM_BODY_PRESENCE.key);
  assert.equal(departed.frame.departures[0].at, 160000); assert.equal(departed.frame.departures[0].glyph, 'green');
  assert.equal(departed.frame.departures[0].handback, null);
  assert.equal((await f.hostStore.get(HOST.key)).simulation.steps, 1, 'expiry recovery performs no NPC or body physics tick');
  assert.equal((await runner.tick()).status, 'closed');
  f.at(220000); assert.equal((await restarted.tick()).status, 'closed');
});

test('world event runner bounds concurrent work and closes on uncertain errors without dropping durable state', async () => {
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  await publishHostPoses(f.host, f.room, ticket, { acquire: true });
  const events = eventRoom(f); let release;
  const paused = new Promise(resolve => { release = resolve; });
  events.during(() => paused);
  const runner = await openHostWorldRunner({ host: f.host, room: events.room, ticket, clock: f.now, waitUntil: async at => f.at(at) });
  const first = runner.bodies();
  assert.equal((await runner.bodies()).status, 'busy');
  assert.equal((await runner.admit({ accountId: 1, connection: 'not-queued' })).status, 'busy');
  assert.equal((await runner.tick()).status, 'busy');
  release(); assert.equal((await first).status, 'reconciled');
  const before = await f.hostStore.get(HOST.key);
  events.during(() => { throw Error('uncertain transport read'); });
  await assert.rejects(runner.bodies(), /uncertain transport/);
  assert.equal(runner.state().closed, true);
  assert.equal((await runner.publish()).status, 'closed');
  assert.deepEqual(await f.hostStore.get(HOST.key), before);
  assert.equal((await runner.admit({ accountId: 1, connection: 'not-queued' })).status, 'closed');
});

test('world event runner continues production during paced publication and retains only the latest revision', async () => {
  const f = fixture(), ticket = await f.host.begin('runner', 60000);
  await publishHostPoses(f.host, f.room, ticket, { acquire: true });
  const events = eventRoom(f); let delay = true, release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const commit = events.room.publishNpcSnapshot;
  events.room.publishNpcSnapshot = async (...args) => {
    if (delay) { f.at(f.now() + 50); delay = false; } return commit(...args);
  };
  const runner = await openHostWorldRunner({ host: f.host, room: events.room, ticket, clock: f.now,
    waitUntil: async () => { entered(); await pause; } });
  await runner.bodies(); f.at(100250); await runner.tick();
  assert.equal((await runner.publish()).publishedAt, 100300);
  f.at(100500); await runner.tick();
  const stale = runner.publish(); await waiting;
  assert.equal(runner.state().publication.busy, true); assert.equal(runner.state().busy, false);
  f.at(100750); const next = await runner.tick();
  assert.equal(next.result.steps, 1);
  assert.equal(runner.state().publication.pending, next.result.snapshot.sequence);
  release(); assert.equal((await stale).status, 'superseded');
  const fresh = await runner.publish();
  assert.equal(fresh.sequence, next.result.snapshot.sequence);
  assert.equal(runner.state().publication.pending, null);
  assert.equal(runner.state().publication.stats.superseded, 1);
  runner.close();
});

test('bounded publication pacing rejects clock faults, oversized waits and changes during the wait', async () => {
  for (const change of ['tick', 'takeover', 'clock', 'early', 'deadline']) {
    const f = fixture(), ticket = await f.host.begin('runner-a', 60000);
    const started = change === 'takeover' ? 109750 : 100000;
    f.at(started); const first = await publishHostPoses(f.host, f.room, ticket, { acquire: true });
    await f.host.sessions(ticket, [], () => true);
    const before = await f.roomStore.get(ROOM_NPC.key);
    const operation = publishHostPoses(f.host, f.room, ticket, { roomState: first.roomState,
      notBefore: started + 250, clock: f.now, waitUntil: async deadline => {
        if (change === 'early') return;
        f.at(change === 'clock' ? started - 1 : change === 'deadline' ? 160000 : deadline);
        if (change === 'tick') await f.host.sessions(ticket, [], () => true);
        if (change === 'takeover') await claimHostRoom(f.host, f.room, 'runner-b');
      } });
    if (change === 'clock' || change === 'early') await assert.rejects(operation, /wait incomplete/);
    else if (change === 'takeover') await assert.rejects(operation, /fenced/);
    else assert.equal((await operation).status, 'superseded');
    const after = await f.roomStore.get(ROOM_NPC.key);
    if (change === 'takeover') { assert.equal(after.epoch, 2); assert.equal(after.frame, null); }
    else assert.deepEqual(after, before);
  }
  const f = fixture(), ticket = await f.host.begin('runner', 60000), before = await f.hostStore.get(HOST.key);
  await assert.rejects(publishHostPoses(f.host, f.room, ticket, { notBefore: 100251, clock: f.now, waitUntil: async () => {} }), /bounded/);
  await assert.rejects(publishHostPoses(f.host, f.room, ticket, { notBefore: 100250, clock: f.now }), /bounded/);
  await assert.rejects(publishHostPoses(f.host, f.room, ticket, { waitUntil: async () => {} }), /deadline required/);
  assert.deepEqual(await f.hostStore.get(HOST.key), before);
  assert.equal(await f.roomStore.get(ROOM_NPC.key), undefined);
});

test('takeover fences a delayed old-host frame before granting the replacement ticket', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  f.at(109750); const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
  f.at(109751); await f.host.sessions(old, [], () => true);
  const oldFrame = await f.host.poses(old); let next;
  const delayed = { ...f.room, async publishNpcSnapshot(...args) {
    f.at(110001); next = await claimHostRoom(f.host, f.room, 'runner-b');
    return f.room.publishNpcSnapshot(...args);
  } };
  await assert.rejects(publishHostPoses(f.host, delayed, old, { roomState: first.roomState }), /fenced/);
  assert.equal(next.fence, 2);
  const room = await f.roomStore.get(ROOM_NPC.key), host = await f.hostStore.get(HOST.key);
  assert.equal(room.epoch, 2); assert.equal(room.frame, null); assert.equal(room.sequence, 0);
  assert.equal(host.fence, 2); assert.equal(host.room.pending, false);
  await assert.rejects(f.host.poses(old), /fenced/);
  await assert.rejects(f.host.claim('bypass'), /coordinated/);
  await assert.rejects(f.host.claimBodyCleanup('bypass'), /coordinated/);
  await assert.rejects(f.host.begin('bypass', 60000), /coordinated/);
  await assert.rejects(f.room.publishNpcSnapshot({ ...first.roomState.authority, owner: old.owner }, oldFrame.sequence, oldFrame.frame), /fenced/);
  assert.equal((await publishHostPoses(f.host, f.room, next)).status, 'published');
});

test('failed intent, Room fence and final host writes recover from durable state without a grant gap', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const before = await f.hostStore.get(HOST.key);
  f.hostStore.fail(); await assert.rejects(claimHostRoom(f.host, f.room, 'runner-b'), /write failure/);
  assert.deepEqual(await f.hostStore.get(HOST.key), before);
  f.roomStore.fail(); await assert.rejects(claimHostRoom(f.host, f.room, 'runner-b'), /write failure/);
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, true);
  assert.equal((await f.hostStore.get(HOST.key)).fence, 1);
  await assert.rejects(f.host.prepareRoomClaim('competitor'), /pending/);
  await assert.rejects(f.host.claim('bypass'), /coordinated/);
  f.hostStore.fail(); await assert.rejects(claimHostRoom(f.makeHost(), f.makeRoom(), 'runner-b'), /write failure/);
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).epoch, 2);
  assert.equal((await f.hostStore.get(HOST.key)).fence, 1);
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, true);
  const next = await claimHostRoom(f.makeHost(), f.makeRoom(), 'runner-b');
  assert.equal(next.fence, 2); assert.equal((await f.hostStore.get(HOST.key)).room.pending, false);
  assert.equal((await f.hostStore.get(HOST.key)).runUntil, before.runUntil);
});

test('lost fence and host completion replies reconcile the same epoch without lease renewal', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const lostFence = { ...f.room, async fenceNpcAuthority(intent) { await f.room.fenceNpcAuthority(intent); throw Error('lost fence reply'); } };
  const lostHost = { prepareRoomClaim: owner => f.host.prepareRoomClaim(owner),
    async completeRoomClaim(...args) { await f.host.completeRoomClaim(...args); throw Error('lost host reply'); } };
  await assert.rejects(claimHostRoom(lostHost, lostFence, 'runner-b'), /lost host reply/);
  const committed = await f.hostStore.get(HOST.key), writes = [f.hostStore.writes(), f.roomStore.writes()];
  f.at(110500);
  await assert.rejects(claimHostRoom(f.makeHost(), f.makeRoom(), 'runner-b'), /unavailable/, 'an owner name alone cannot join a live host lease');
  const next = await claimHostRoom(f.makeHost(), f.makeRoom(), 'runner-b', { intent: committed.room.claim });
  assert.equal(next.fence, 2); assert.deepEqual(await f.hostStore.get(HOST.key), committed);
  assert.deepEqual([f.hostStore.writes(), f.roomStore.writes()], writes);
  await assert.rejects(f.host.prepareRoomClaim('competitor'), /unavailable/);
});

test('takeover preserves strict and rolling delivery debt even when Room lease outlives the host', async () => {
  for (const cadence of [undefined, 'rolling-4-v1']) {
    const f = fixture(), old = await f.host.begin('runner-a', 60000);
    const stamps = cadence ? [109000, 109400, 109700, 109950] : [109950];
    for (let i = 0; i < stamps.length; i++) {
      f.at(stamps[i]); if (i) await f.host.sessions(old, [], () => true);
      await publishHostPoses(f.host, f.room, old, { acquire: i === 0, cadence });
    }
    const prior = await f.roomStore.get(ROOM_NPC.key), gate = npcNextPublicationAt(prior);
    f.at(110001); const next = await claimHostRoom(f.host, f.room, 'runner-b');
    const after = await f.roomStore.get(ROOM_NPC.key);
    assert.equal(npcNextPublicationAt(after), gate); assert.deepEqual(after.cadence, prior.cadence);
    assert.equal(after.runUntil, prior.runUntil);
    await assert.rejects(publishHostPoses(f.host, f.room, next, { cadence }), /fenced/);
    f.at(gate); assert.equal((await publishHostPoses(f.host, f.room, next, { cadence })).status, 'published');
  }
});

test('binding adds one bounded host write, steady publication does not write host state, and old protocol fails closed', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000), initial = await f.hostStore.get(HOST.key);
  const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
  const bound = await f.hostStore.get(HOST.key), writes = f.hostStore.writes();
  assert.equal(writes, 2); assert.deepEqual(bound.simulation, initial.simulation);
  assert.equal((await publishHostPoses(f.host, f.room, old, { roomState: first.roomState })).duplicate, true);
  assert.equal(f.hostStore.writes(), writes);
  const legacy = { poses: async () => ({ sequence: 1, at: 100000, runUntil: 160000, frame: frame() }), confirmPoses: async () => true };
  await assert.rejects(publishHostPoses(legacy, f.room, old), /protocol required/);
  await assert.rejects(claimHostRoom(f.host, { npcAuthorityStatus: f.room.npcAuthorityStatus }, 'runner-b'), /unavailable/);
  const bytes = Buffer.byteLength(JSON.stringify(bound.room));
  assert.ok(bytes < 128); assert.equal(bound.room.pending, false);
});

test('release, another epoch, and forged completion receipts cannot satisfy the pending takeover', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
  f.at(110000); const intent = await f.host.prepareRoomClaim('runner-b');
  await assert.rejects(f.host.completeRoomClaim(intent, { owns: true, authority: first.roomState.authority,
    owner: intent.owner, runUntil: intent.runUntil }), /receipt mismatch/);
  const prior = await f.roomStore.get(ROOM_NPC.key);
  await f.room.configureNpcAuthority(prior.revision, { mode: 'browser', owner: old.owner, epoch: old.fence, world: old.world });
  await assert.rejects(claimHostRoom(f.host, f.room, 'runner-b'), /fenced/);
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, true);
  assert.equal((await f.hostStore.get(HOST.key)).fence, 1);
});

test('failed initial Room configuration does not bind or strand a previously unpublished host', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  const refused = { ...f.room, configureNpcAuthority: async () => { throw Error('fixture configuration refused'); } };
  await assert.rejects(publishHostPoses(f.host, refused, old, { acquire: true }), /configuration refused/);
  assert.equal((await f.hostStore.get(HOST.key)).room, undefined);
  f.at(110000); assert.equal((await f.host.claim('runner-b')).fence, 2);
});

test('host mutation during initial Room configuration binds ownership but supersedes stale frame bytes', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  const changed = { ...f.room, async configureNpcAuthority(...args) {
    const result = await f.room.configureNpcAuthority(...args);
    await f.host.sessions(old, [], () => true); return result;
  } };
  assert.equal((await publishHostPoses(f.host, changed, old, { acquire: true })).status, 'superseded');
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).sequence, 0);
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, false);
  assert.equal((await publishHostPoses(f.host, f.room, old)).status, 'published');
});

test('a completed takeover permits a finite stop without restoring the longer original deadline', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true });
  f.at(110000); const next = await claimHostRoom(f.host, f.room, 'runner-b');
  f.at(110500); assert.equal((await f.host.stop(next, [])).status, 'stopped');
  const stopped = await f.hostStore.get(HOST.key);
  assert.equal(stopped.runUntil, 110500); assert.equal(stopped.room.claim.runUntil, 160000);
  await assert.rejects(f.host.poses(next), /fenced/);
  await assert.rejects(f.host.prepareRoomClaim('runner-b'), /unavailable/);
  await assert.rejects(f.host.begin('runner-c', 60000), /coordinated/);
});

test('competing takeover operations serialize and an older recovered intent cannot displace the winner', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const results = await Promise.allSettled(['runner-b', 'runner-c'].map(owner => claimHostRoom(f.makeHost(), f.makeRoom(), owner)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const won = await f.hostStore.get(HOST.key), intent = structuredClone(won.room.claim);
  assert.equal(won.fence, 2); assert.equal((await f.roomStore.get(ROOM_NPC.key)).owner, won.owner);
  f.at(won.leaseUntil); const next = await claimHostRoom(f.makeHost(), f.makeRoom(), 'runner-d');
  assert.equal(next.fence, 3);
  await assert.rejects(claimHostRoom(f.host, f.room, intent.owner, { intent }), /fenced/);
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).epoch, 3);
});

test('takeover metadata stays inside the existing byte and node reservation with maximum-width identifiers', async t => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  await f.host.prepareRoomClaim('runner-b');
  const record = await f.hostStore.get(HOST.key), typical = Buffer.byteLength(JSON.stringify(record.room));
  const metadata = { ...record, simulation: null, world: 'w'.repeat(80), owner: 'a'.repeat(80),
    fence: Number.MAX_SAFE_INTEGER - 1, revision: Number.MAX_SAFE_INTEGER,
    leaseUntil: Number.MAX_SAFE_INTEGER, runUntil: Number.MAX_SAFE_INTEGER, wallAt: Number.MAX_SAFE_INTEGER,
    wallCursor: Number.MAX_SAFE_INTEGER, simulatedAt: Number.MAX_SAFE_INTEGER, pausedMs: Number.MAX_SAFE_INTEGER,
    room: { v: 1, pending: true, claim: { ...record.room.claim, world: 'w'.repeat(80), previousOwner: 'a'.repeat(80),
      owner: 'b'.repeat(80), previousEpoch: Number.MAX_SAFE_INTEGER - 1, epoch: Number.MAX_SAFE_INTEGER,
      runUntil: Number.MAX_SAFE_INTEGER } } };
  validateRoomBinding(metadata.room, metadata);
  const text = boundedJSON(metadata, HOST.metadataBytes, HOST.metadataNodes);
  t.diagnostic(JSON.stringify({ typicalBindingBytes: typical, maximumWidthBindingBytes: Buffer.byteLength(JSON.stringify(metadata.room)),
    maximumWidthMetadataBytes: Buffer.byteLength(text), reservedMetadataBytes: HOST.metadataBytes,
    scope: 'encoding bound only; independent scalar maxima are not a simulated timeline' }));
  metadata.room.claim = { ...metadata.room.claim, v: 2, action: 'release', cleanup: false };
  validateRoomBinding(metadata.room, metadata);
  t.diagnostic(JSON.stringify({ maximumWidthReleaseMetadataBytes: Buffer.byteLength(boundedJSON(metadata, HOST.metadataBytes, HOST.metadataNodes)),
    maximumWidthReleaseBindingBytes: Buffer.byteLength(JSON.stringify(metadata.room)) }));
});

test('coordinated cleanup after a finite stop fences Room without restarting NPC work or extending departures', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await f.host.connect(old, [], { protocol: SESSION_PROTOCOL, world: old.world, accountId: 1, bodyId: 'resident', zone: 'outside',
    body: { kind: 'ooga', motion: { x: 1, y: 8, z: 2, yaw: .3, vx: 0, vy: 0, vz: 0, grounded: false },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1,
        unlimited: false, jetpack: false, jetpackOwned: false } } });
  await publishHostPoses(f.host, f.room, old, { acquire: true });
  f.at(110000); const next = await claimHostRoom(f.host, f.room, 'runner-b');
  f.at(110001); await f.host.stop(next, []);
  const draining = await f.hostStore.get(HOST.key);
  assert.equal(draining.status, 'draining', 'stopping a run still preserves the held body grace');
  const deadline = draining.sessions.sessions[0].deadline;
  f.at(deadline);
  const expiry = await claimHostRoom(f.makeHost(), f.makeRoom(), 'expiry');
  assert.equal((await f.host.tick(expiry, [])).status, 'stopped');
  const stopped = await f.hostStore.get(HOST.key);
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.sessions.pending.length, 1);
  assert.equal(stopped.sessions.pending[0].at, deadline);
  const cleanup = await claimHostRoom(f.makeHost(), f.makeRoom(), 'cleanup');
  const after = await f.hostStore.get(HOST.key);
  assert.equal(after.status, 'draining'); assert.equal(after.runUntil, stopped.runUntil);
  assert.deepEqual(after.simulation, stopped.simulation); assert.deepEqual(after.sessions, stopped.sessions);
  assert.equal((await f.roomStore.get(ROOM_NPC.key)).runUntil, stopped.runUntil);
  await assert.rejects(publishHostPoses(f.host, f.room, cleanup), /closed/);
  assert.equal((await f.host.bodyPresence(cleanup)).frame.departures.length, 1);
});

test('incomplete, malformed or inconsistent Room receipts cannot grant a replacement host ticket', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const intent = await f.host.prepareRoomClaim('runner-b'), authority = await f.room.fenceNpcAuthority(intent);
  const valid = { ...await f.room.npcAuthorityStatus({ ...authority, owner: intent.owner }), owner: intent.owner };
  const before = await f.hostStore.get(HOST.key), writes = f.hostStore.writes();
  const invalid = [
    { ...valid, owns: 'true' }, { ...valid, owns: 1 }, { ...valid, owner: 'other' },
    { ...valid, authority: { mode: 'server', world: intent.world, epoch: intent.epoch } },
    ...[{ revision: 0 }, { revision: .5 }, { v: 3 }, { format: 'future' }, { ignored: true }]
      .map(change => ({ ...valid, authority: { ...authority, ...change } }))
  ];
  for (const receipt of invalid) await assert.rejects(f.host.completeRoomClaim(intent, receipt), /receipt mismatch/);
  const inconsistent = { ...f.room, async npcAuthorityStatus(ticket) {
    const status = await f.room.npcAuthorityStatus(ticket);
    return { ...status, authority: { ...status.authority, revision: authority.revision + 1 } };
  } };
  await assert.rejects(claimHostRoom(f.host, inconsistent, intent.owner), /receipt mismatch/);
  const unknownFence = { ...f.room, async fenceNpcAuthority(c) { return { ...await f.room.fenceNpcAuthority(c), ignored: true }; } };
  await assert.rejects(claimHostRoom(f.host, unknownFence, intent.owner), /receipt mismatch/);
  assert.deepEqual(await f.hostStore.get(HOST.key), before); assert.equal(f.hostStore.writes(), writes);
  assert.equal((await claimHostRoom(f.host, f.room, intent.owner)).fence, 2);
});

test('restart after the Room fence lease expires permits one first frame but never renews ordinary expired publication', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const intent = await f.host.prepareRoomClaim('runner-b');
  await f.room.fenceNpcAuthority(intent);
  const fenced = await f.roomStore.get(ROOM_NPC.key);
  f.at(125000);
  const host = f.makeHost(), room = f.makeRoom(), next = await claimHostRoom(host, room, intent.owner, { intent });
  assert.deepEqual(await f.roomStore.get(ROOM_NPC.key), fenced, 'replaying a fence must not renew Room');
  const first = await publishHostPoses(host, room, next);
  assert.equal(first.status, 'published');
  const published = await f.roomStore.get(ROOM_NPC.key);
  assert.equal(published.fencePending, false); assert.equal(published.leaseUntil, 135000);
  f.at(134000); await host.tick(next, []);
  f.at(135001);
  await assert.rejects(publishHostPoses(host, room, next, { roomState: first.roomState }), /fenced/);
  assert.deepEqual(await f.roomStore.get(ROOM_NPC.key), published);
});

test('cached authority cannot bind an unpublished host, including after explicit Room release', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  const authority = await f.room.configureNpcAuthority(0, { mode: 'server', world: old.world,
    epoch: old.fence, owner: old.owner, runUntil: 160000 });
  const roomState = { authority, owner: old.owner, runUntil: 160000, cadence: null };
  const writes = f.hostStore.writes();
  await assert.rejects(publishHostPoses(f.host, f.room, old, { roomState }), /fresh Room evidence/);
  await f.room.configureNpcAuthority(authority.revision, { mode: 'browser', world: old.world, epoch: old.fence, owner: old.owner });
  await assert.rejects(publishHostPoses(f.host, f.room, old, { roomState }), /fresh Room evidence/);
  assert.equal((await f.hostStore.get(HOST.key)).room, undefined); assert.equal(f.hostStore.writes(), writes);
});

test('an explicit drained close preserves the checkpoint and permits a separate finite run', async () => {
  for (const stop of [true, false]) {
    const f = fixture(), old = await f.host.begin('runner-a', 60000);
    const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
    if (stop) { f.at(100001); await f.host.stop(old, []); } else f.at(160000);
    const before = await f.hostStore.get(HOST.key);
    assert.equal((await closeHostRoomRun(f.host, f.room, 'closer')).status, 'stopped');
    const closed = await f.hostStore.get(HOST.key);
    assert.equal(closed.room, undefined); assert.equal(closed.fence, 2);
    assert.deepEqual(closed.simulation, before.simulation); assert.deepEqual(closed.sessions, before.sessions);
    assert.equal((await f.room.npcAuthorityStatus()).authority.mode, 'browser');
    await assert.rejects(f.room.publishNpcSnapshot({ ...first.roomState.authority, owner: old.owner }, 99, frame()), /fenced/);
    await assert.rejects(f.host.tick(old, []), /fenced/);
    const next = await f.host.begin('runner-c', 60000, { resumePaused: true });
    assert.equal(next.fence, 3);
    if (stop) {
      await assert.rejects(publishHostPoses(f.host, f.room, next, { acquire: true }), /fenced/);
      f.at(100250);
    }
    assert.equal((await publishHostPoses(f.host, f.room, next, { acquire: true })).status, 'published');
  }
});

test('connected close explicitly selects migration and reconciles a lost final receipt before completing host release', async () => {
  const f = fixture(), owner = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, owner, { acquire: true }); f.at(110000);
  const before = await f.hostStore.get(HOST.key);
  await assert.rejects(closeHostRoomRun(f.host, f.room, 'closer', { connected: true }), /migration unavailable/);
  assert.deepEqual(await f.hostStore.get(HOST.key), before, 'unsupported Room cannot leave a new host intent');
  let migrated = 0, delivered = 0, saved;
  const state = new RoomNpcAuthority(f.roomStore, () => 110000);
  const room = { ...f.room, async releaseConnectedNpcAuthority(expected, intent) {
    migrated++; saved = npcAuthorityView(await f.roomStore.transaction(tx => state.releaseDrained(tx, expected, intent)));
    throw Error('lost connected release reply');
  }, async deliverBodyRelease(revision) {
    assert.equal(revision, saved.revision); delivered++;
    if (delivered === 1) throw Error('lost final body receipt');
    return true;
  } };
  await assert.rejects(closeHostRoomRun(f.host, room, 'closer', { connected: true }), /lost final body receipt/);
  const intent = (await f.hostStore.get(HOST.key)).room.claim, writes = f.roomStore.writes();
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, true);
  assert.equal((await closeHostRoomRun(f.makeHost(), room, 'closer', { connected: true, intent })).status, 'stopped');
  assert.equal(migrated, 1); assert.equal(delivered, 2); assert.equal(f.roomStore.writes(), writes);
  assert.equal((await f.hostStore.get(HOST.key)).room, undefined);
});

test('release races a pending old takeover without granting that ticket or erasing a failed write', async () => {
  for (const preReleased of [true, false]) {
    const f = fixture(), old = await f.host.begin('runner-a', 60000);
    const first = await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
    const abandoned = await f.host.prepareRoomClaim('runner-b');
    if (preReleased) await f.room.configureNpcAuthority(first.roomState.authority.revision,
      { mode: 'browser', world: old.world, owner: old.owner, epoch: old.fence });
    let raced = false;
    const room = { ...f.room, async configureNpcAuthority(...args) {
      if (!raced) { raced = true; await f.room.fenceNpcAuthority(abandoned); }
      return f.room.configureNpcAuthority(...args);
    } };
    f.hostStore.fail();
    await assert.rejects(closeHostRoomRun(f.host, room, 'runner-b'), /write failure/);
    assert.deepEqual((await f.hostStore.get(HOST.key)).room.claim, abandoned);
    await closeHostRoomRun(f.host, room, 'runner-b');
    assert.equal((await f.room.npcAuthorityStatus()).authority.mode, 'browser');
    assert.equal((await f.hostStore.get(HOST.key)).status, 'stopped');
    await assert.rejects(f.host.resumeRoomClaim(abandoned), /fenced/);
    assert.equal(raced, !preReleased);
  }
});

test('drained close recovers lost replies, refuses forged receipts and cannot close a newer run', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const intent = await f.host.prepareRoomRelease('closer');
  await assert.rejects(f.host.completeRoomRelease(intent, { authority: { v: 1, mode: 'browser' } }), /receipt mismatch/);
  await assert.rejects(f.host.prepareRoomClaim('closer'), /release pending/);
  await assert.rejects(f.room.fenceNpcAuthority(intent), /fenced/);
  const lost = { ...f.room, async configureNpcAuthority(...args) {
    await f.room.configureNpcAuthority(...args); throw Error('lost Room release reply');
  } };
  const host = { prepareRoomRelease: o => f.host.prepareRoomRelease(o), async completeRoomRelease(...args) {
    await f.host.completeRoomRelease(...args); throw Error('lost host close reply');
  } };
  await assert.rejects(closeHostRoomRun(host, lost, 'closer'), /lost host close reply/);
  const writes = [f.hostStore.writes(), f.roomStore.writes()];
  assert.equal((await closeHostRoomRun(f.makeHost(), f.makeRoom(), 'closer', { intent })).status, 'stopped');
  assert.deepEqual([f.hostStore.writes(), f.roomStore.writes()], writes);
  await f.host.begin('new-run', 60000);
  await assert.rejects(closeHostRoomRun(f.host, f.room, 'closer', { intent }), /fenced/);
});

test('closing cannot discard held bodies or pending departure delivery', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  await f.host.connect(old, [], { protocol: SESSION_PROTOCOL, world: old.world, accountId: 1, bodyId: 'resident', zone: 'outside',
    body: { kind: 'ooga', motion: { x: 1, y: 8, z: 2, yaw: .3, vx: 0, vy: 0, vz: 0, grounded: false },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1,
        unlimited: false, jetpack: false, jetpackOwned: false } } });
  await publishHostPoses(f.host, f.room, old, { acquire: true }); f.at(110000);
  const before = await f.hostStore.get(HOST.key);
  await assert.rejects(closeHostRoomRun(f.host, f.room, 'closer'), /drain required/);
  assert.deepEqual(await f.hostStore.get(HOST.key), before);
  f.at(160000); const cleanup = await claimHostRoom(f.host, f.room, 'cleanup');
  await f.host.tick(cleanup, []);
  const pending = await f.hostStore.get(HOST.key);
  assert.equal(pending.sessions.sessions.length, 0); assert.equal(pending.sessions.pending.length, 1);
  await assert.rejects(closeHostRoomRun(f.host, f.room, 'closer'), /drain required/);
  assert.deepEqual(await f.hostStore.get(HOST.key), pending);
});

test('explicit released-Room recovery preserves occupied bodies and original deadlines, including after run expiry', async () => {
  for (const at of [110000, 160000]) {
    const f = fixture(), old = await f.host.begin('runner-a', 60000);
    await f.host.connect(old, [], { protocol: SESSION_PROTOCOL, world: old.world, accountId: 1, bodyId: 'resident', zone: 'outside',
      body: { kind: 'ooga', motion: { x: 1, y: 8, z: 2, yaw: .3, vx: 0, vy: 0, vz: 0, grounded: false },
        equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1,
          unlimited: false, jetpack: false, jetpackOwned: false } } });
    await f.host.sessions(old, [], () => true); // Authenticated empty census freezes the live admission.
    const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
    await f.room.configureNpcAuthority(first.roomState.authority.revision,
      { mode: 'browser', world: old.world, epoch: old.fence, owner: old.owner });
    f.at(at);
    await assert.rejects(claimHostRoom(f.host, f.room, 'recovery'), /fenced/);
    const before = await f.hostStore.get(HOST.key);
    await assert.rejects(recoverReleasedHostRoom(f.host, f.room, 'recovery'), /explicit/);
    assert.deepEqual(await f.hostStore.get(HOST.key), before);
    const next = await recoverReleasedHostRoom(f.makeHost(), f.makeRoom(), 'recovery', { format: 'legacy-1' });
    const after = await f.hostStore.get(HOST.key), room = await f.roomStore.get(ROOM_NPC.key);
    assert.equal(next.fence, 2); assert.deepEqual(after.sessions, before.sessions);
    assert.deepEqual(after.simulation, before.simulation); assert.equal(after.runUntil, before.runUntil);
    assert.equal(room.runUntil, before.runUntil);
    await assert.rejects(f.host.tick(old, []), /fenced/);
    if (at === 160000) {
      await assert.rejects(publishHostPoses(f.host, f.room, next), /closed/);
      const result = await f.host.tick(next, []); assert.equal(result.steps, 0);
      const drained = await f.hostStore.get(HOST.key);
      assert.equal(drained.sessions.pending[0].at, before.sessions.sessions[0].deadline);
    } else assert.equal((await publishHostPoses(f.host, f.room, next)).status, 'published');
  }
});

test('released recovery reconciles lost replies without overriding another Room owner or extending leases', async () => {
  const f = fixture(), old = await f.host.begin('runner-a', 60000);
  const first = await publishHostPoses(f.host, f.room, old, { acquire: true });
  await f.room.configureNpcAuthority(first.roomState.authority.revision,
    { mode: 'browser', world: old.world, epoch: old.fence, owner: old.owner }); f.at(110000);
  const intent = await f.host.prepareRoomClaim('recovery');
  f.roomStore.fail();
  await assert.rejects(recoverReleasedHostRoom(f.host, f.room, intent.owner, { format: 'legacy-1' }), /write failure/);
  assert.equal((await f.hostStore.get(HOST.key)).room.pending, true);
  const lost = { ...f.room, async reacquireNpcAuthority(...args) {
    await f.room.reacquireNpcAuthority(...args); throw Error('lost recovery reply');
  } };
  await recoverReleasedHostRoom(f.host, lost, intent.owner, { format: 'legacy-1' });
  const before = await f.hostStore.get(HOST.key), room = await f.roomStore.get(ROOM_NPC.key);
  f.at(110250);
  await recoverReleasedHostRoom(f.makeHost(), f.makeRoom(), intent.owner, { format: 'legacy-1', intent });
  assert.deepEqual(await f.hostStore.get(HOST.key), before); assert.deepEqual(await f.roomStore.get(ROOM_NPC.key), room);
  await assert.rejects(recoverReleasedHostRoom(f.host, f.room, intent.owner, { format: 'mixed-1', intent }), /format/);
  f.at(120000); const winner = await claimHostRoom(f.host, f.room, 'winner');
  await assert.rejects(recoverReleasedHostRoom(f.host, f.room, intent.owner, { format: 'legacy-1', intent }), /fenced/);
  assert.equal((await f.hostStore.get(HOST.key)).fence, winner.fence);
});
