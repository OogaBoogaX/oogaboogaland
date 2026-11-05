// Actual host, Room authority and publication bridge. Serial rollback-capable
// stores and authored data-only simulation; no Hub, scene, browser or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL, boundedJSON } from '../src/virtual-host.js';
import { validateRoomBinding } from '../src/host-room-claim.js';
import { RoomNpcAuthority, ROOM_NPC, npcAuthorityView, npcCadenceName, npcNextPublicationAt } from '../src/room-npc-authority.js';
import { publishHostPoses, claimHostRoom, closeHostRoomRun, recoverReleasedHostRoom } from '../src/host-room.js';

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
    npcFor: () => null, handoff: () => false, poses: frame };
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
  return { hostStore, roomStore, makeHost, makeRoom, host: makeHost(), room: makeRoom(), at: value => { now = value; } };
}

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
