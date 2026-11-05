import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomBodyHandoff, ROOM_BODY, ROOM_MOVEMENT } from '../src/room-body-handoff.js';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage } from '../src/host-body-storage.js';
import { closeBodyHandoff, advanceBodyMovement, retireRecoveredBodyHandoff } from '../src/host-body-room.js';
import { createClankerBodyCheckpoint } from '../src/clanker-roaming.js';
import { createClankerBodySessions } from '../src/clanker-body-sessions.js';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';
import '../../src/js/body-reclaim.js';
const identity = (accountId = 1, connection = 'connection-a') => ({ accountId, connection });
const request = n => n.toString(16).padStart(32, '0');
const preparation = (accountId = 1) => ({ v: 1, world: 'handoff-fixture', epoch: 1, accountId, bodyId: `body-${accountId}`,
  generation: 0, nextGeneration: 1, expiresAt: 110000 });
const ref = accountId => ({ accountId, bodyId: `body-${accountId}`, generation: accountId, token: request(accountId + 100) });
const transfer = (state, accountId = 1) => ({ v: 1, protocol: SESSION_PROTOCOL, world: 'handoff-fixture', epoch: 1,
  revision: state === 'offered' ? 2 : 3, at: 100000, expiresAt: state === 'offered' ? 110000 : 101000,
  resetResources: 'defaults', view: { accountId, bodyId: `body-${accountId}`, kind: 'clanker', generation: accountId,
    state, deadline: 160000 }, checkpoint: { fixture: true } });
const receipt = (t, record) => ({ t, request: record.request, epoch: record.transfer.epoch,
  generation: record.transfer.view.generation, revision: record.transfer.revision });
function memory() {
  let data = new Map(), failAt = 0, lose = false, serial = Promise.resolve(); const writes = [];
  return { get: async k => structuredClone(data.get(k)),
    transaction(fn) {
      const run = serial.then(async () => {
        const draft = structuredClone(data); let count = 0;
        const result = await fn({ get: async k => Array.isArray(k) ? new Map(k.filter(x => draft.has(x)).map(x => [x, structuredClone(draft.get(x))])) : structuredClone(draft.get(k)),
          put: async (k, v) => { for (const [name, value] of typeof k === 'string' ? [[k, v]] : Object.entries(k)) {
            draft.set(name, structuredClone(value)); writes.push(Buffer.byteLength(JSON.stringify(value)));
            if (++count === failAt) { failAt = 0; throw Error('injected write failure'); }
          } }, delete: async keys => { for (const k of Array.isArray(keys) ? keys : [keys]) draft.delete(k); } });
        data = draft; if (lose) { lose = false; throw Error('lost committed reply'); } return result;
      });
      serial = run.catch(() => {}); return run;
    }, snapshot: () => structuredClone(data), fail: n => { failAt = n; }, lose: () => { lose = true; }, writes,
  };
}
function fixture() {
  let now = 100000; const storage = memory(), current = new Map(), sent = [];
  const isCurrent = i => current.get(i.accountId) === i.connection;
  const make = () => new RoomBodyHandoff({ storage, clock: () => now, current: isCurrent,
    send: (i, m) => { if (!isCurrent(i)) return false; sent.push(m); return true; } });
  return { storage, current, sent, make, at: t => { now = t; }, clock: () => now };
}
async function offered(f, i = identity(), data = transfer('offered', i.accountId)) {
  const box = f.make(); f.current.set(i.accountId, i.connection);
  await box.prepare(i, preparation(i.accountId), 'clanker', request(i.accountId));
  const op = await box.receive(i, { t: 'body-ready', request: request(i.accountId) });
  return box.complete(i, op.record.pending.revision, { result: { ok: true, session: ref(i.accountId) }, transfer: data });
}

test('Room persists each intent and transfer before delivery; restart and duplicate receipts do not dispatch twice', async () => {
  const f = fixture(), i = identity(), box = f.make(); f.current.set(1, i.connection);
  f.storage.fail(2);
  await assert.rejects(box.prepare(i, preparation(), 'clanker', request(1)), /write failure/);
  assert.equal(f.storage.snapshot().size, 0, 'row and bounded index commit together');
  f.storage.lose(); await assert.rejects(box.prepare(i, preparation(), 'clanker', request(1)), /lost committed/);
  const prepared = await f.make().prepare(i, preparation(), 'clanker', request(1)); assert.equal(prepared.revision, 1);
  await assert.rejects(box.prepare(i, { ...preparation(), bodyId: 'different' }, 'clanker', request(1)), /handoff/);
  assert.equal(await box.deliver(i), true); assert.equal(f.sent.at(-1).v, 2);
  const op = await box.receive(i, { t: 'body-ready', request: request(1) }); assert.equal(op.status, 'dispatch');
  const before = f.storage.snapshot();
  assert.equal((await f.make().receive(i, { t: 'body-ready', request: request(1) })).status, 'pending');
  assert.deepEqual(f.storage.snapshot(), before); assert.equal(await box.deliver(i), false);
  f.storage.fail(1);
  const reply = { result: { ok: true, session: ref(1) }, transfer: transfer('offered') };
  await assert.rejects(box.complete(i, op.record.pending.revision, reply), /write failure/);
  assert.deepEqual(f.storage.snapshot(), before); assert.equal(f.sent.length, 1);
  const row = await f.make().complete(i, op.record.pending.revision, reply);
  assert.equal(await f.make().deliver(i), true); assert.equal(f.sent.at(-1).t, 'body-grant');
  assert.equal(JSON.stringify(f.sent).includes(ref(1).token), false, 'private host token never reaches the socket');
  assert.equal((await box.receive(i, { ...receipt('body-applied', row), body: { attacker: true } })).status, 'refused');
  assert.equal((await box.receive(i, { ...receipt('body-applied', row), generation: 99 })).status, 'refused');
  assert.equal((await box.receive(i, receipt('body-applied', row))).status, 'dispatch');
});

test('close during a host RPC retains its result for cleanup and never delivers it to a replacement', async () => {
  const f = fixture(), i = identity(), box = f.make(), row = await offered(f);
  const active = await box.receive(i, receipt('body-applied', row));
  f.at(100100); f.current.set(1, 'replacement');
  const closed = await box.close(i);
  assert.equal(closed.pending.phase, 'activating'); assert.equal(closed.closedAt, 100100);
  assert.equal((await box.cleanup(i)).kind, 'reconcile');
  await assert.rejects(box.resolveClosed(i, closed.revision, null), /handoff/);
  const saved = await f.make().complete(i, active.record.pending.revision,
    { result: { ok: true, session: ref(1) }, transfer: transfer('starting') });
  assert.equal(saved.phase, 'closed'); assert.equal(saved.closedAt, 100100); assert.equal(saved.liveSent, false);
  assert.equal(saved.ref.token, ref(1).token); assert.equal(saved.pending, null);
  assert.equal((await box.cleanup(i)).kind, 'abandon');
  assert.equal(await box.deliver(i), false); assert.equal(await box.deliver(identity(1, 'replacement')), false);
  await assert.rejects(box.prepare(identity(1, 'replacement'), preparation(), 'clanker', request(2)), /handoff/);
  await assert.rejects(box.resolveClosed(i, saved.revision, { ref: ref(1), view: { ...transfer('starting').view, state: 'live' } }), /handoff/);
  assert.equal(await box.resolveClosed(i, saved.revision, { ref: ref(1), view: { ...transfer('starting').view, state: 'grace' } }), true);
  assert.equal(await box.read(i), null); assert.deepEqual(await f.storage.get(ROOM_BODY.key), []);
  assert.equal((await box.prepare(identity(1, 'replacement'), preparation(), 'clanker', request(2))).phase, 'prepared');
});

test('a live-send marker is durable before control notification, including a lost write reply', async () => {
  const f = fixture(), i = identity(), box = f.make(), row = await offered(f);
  const active = await box.receive(i, receipt('body-applied', row));
  const starting = await box.complete(i, active.record.pending.revision, { result: { ok: true, session: ref(1) }, transfer: transfer('starting') });
  const ack = await box.receive(i, receipt('body-started', starting));
  await box.complete(i, ack.record.pending.revision, { result: { ok: true, view: { ...starting.transfer.view, state: 'live', deadline: null } } });
  f.storage.lose(); await assert.rejects(box.deliver(i), /lost committed/);
  assert.equal(f.sent.length, 0); assert.equal((await f.make().read(i)).liveSent, true);
  assert.equal(await f.make().deliver(i), true); assert.equal(f.sent.at(-1).t, 'body-live');
  const stored = f.storage.snapshot(); assert.equal((await box.receive(i, receipt('body-started', starting))).status, 'duplicate');
  assert.deepEqual(f.storage.snapshot(), stored, 'duplicate ACK creates no new work or storage write');
  f.at(101000); assert.equal(await box.deliver(i), false, 'late retry cannot authorize an expired client exchange');
  await box.close(i); assert.equal((await box.cleanup(i)).kind, 'disconnect', 'possible control forbids earlier-snapshot abandonment');
});

test('body-only decline is request-bound, durable across uncertain writes, and retains pending cleanup after expiry', async () => {
  const f = fixture(), i = identity(), box = f.make(), row = await offered(f);
  await box.receive(i, receipt('body-applied', row));
  const before = f.storage.snapshot(), decline = { t: 'body-decline', request: request(1) };
  for (const [who, message] of [[identity(2), decline], [identity(1, 'replacement'), decline],
    [i, { ...decline, request: request(2) }], [i, { ...decline, accountId: 1 }]])
    assert.equal((await box.receive(who, message)).status, 'refused');
  assert.deepEqual(f.storage.snapshot(), before);
  f.at(111000); f.storage.fail(1);
  await assert.rejects(box.receive(i, decline), /write failure/);
  assert.deepEqual(f.storage.snapshot(), before);
  f.storage.lose(); await assert.rejects(box.receive(i, decline), /lost committed/);
  const closed = await f.make().read(i);
  assert.equal(closed.phase, 'closed'); assert.equal(closed.closedAt, 111000);
  assert.equal(closed.pending.phase, 'activating'); assert.equal((await box.cleanup(i)).kind, 'reconcile');
  const saved = f.storage.snapshot(); f.at(112000);
  assert.equal((await f.make().receive(i, decline)).status, 'closed'); assert.deepEqual(f.storage.snapshot(), saved);
  assert.equal(f.current.get(1), i.connection, 'body decline does not remove the connected voice participant');
  assert.equal(await box.deliver(i), false);
  assert.equal((await box.receive(i, receipt('body-applied', row))).status, 'refused');
});

test('the outbox bounds simultaneous full-size transfers and retains unresolved records under capacity pressure', async t => {
  const f = fixture(), box = f.make();
  for (let n = 1; n <= ROOM_BODY.max; n++) {
    const data = transfer('offered', n); data.checkpoint = { data: '' };
    data.checkpoint.data = 'x'.repeat(ROOM_BODY.transferBytes - Buffer.byteLength(JSON.stringify(data)));
    assert.equal(Buffer.byteLength(JSON.stringify(data)), ROOM_BODY.transferBytes);
    await offered(f, identity(n), data);
  }
  const before = f.storage.snapshot(); f.current.set(33, 'connection-a');
  await assert.rejects(box.prepare(identity(33), preparation(33), 'clanker', request(33)), /handoff/);
  assert.deepEqual(f.storage.snapshot(), before);
  let bytes = 0, max = 0;
  for (const [k, value] of before) { const size = Buffer.byteLength(JSON.stringify(value)); bytes += size; max = Math.max(max, size);
    assert.ok(size <= (k === ROOM_BODY.key ? ROOM_BODY.indexBytes : ROOM_BODY.rowBytes)); }
  assert.equal(before.size, ROOM_BODY.max + 1);
  assert.ok(bytes <= ROOM_BODY.max * ROOM_BODY.rowBytes + ROOM_BODY.indexBytes);
  t.diagnostic(JSON.stringify({ scope: 'maximum 32 transfers, JSON only, not provider overhead', records: before.size, totalBytes: bytes, largestValueBytes: max }));
});

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
async function integrated({ activate = true, journal = false, duration = 120000 } = {}) {
  const f = fixture(), i = identity(), room = f.make(), hostStorage = memory(); f.current.set(1, i.connection);
  const simulation = { version: 'handoff-fixture', checkpointBytes: 65536, initial: () => ({ ticks: 0 }),
    validate: s => Number.isSafeInteger(s.ticks), step: s => s.ticks++, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const storage = createHostBodyStorage({ storage: hostStorage, profile: 'handoff-fixture', validate: () => true,
    capture: r => [...(r.sessions?.sessions || []), ...(r.sessions?.pending || [])].map(s => ({ accountId: s.accountId, bodyId: s.bodyId, generation: s.generation,
      kind: s.kind || s.body.kind, checkpoint: { fixture: true } })) });
  const host = new VirtualHost({ storage, simulation, clock: f.clock, sessionAdapter: { stepPassive: m => m } }), ticket = await host.begin('host-a', duration);
  const claim = { protocol: SESSION_PROTOCOL, world: 'handoff-fixture', accountId: 1, bodyId: 'body-1', zone: 'outside', body: { kind: 'clanker',
    motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
    equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } };
  const clientMessages = []; let controls = false;
  const client = globalThis.BL.bodyReclaim.create({ send: m => clientMessages.push(m), monotonic: f.clock, wall: f.clock, later: () => 1, cancel() {} });
  client.setAdapter({ prepare: () => ({}), preflight: () => true, apply: () => true, activate: () => (controls = activate), release: () => { controls = false; } });
  client.open(1, i.connection, true);
  const prep = await host.prepareBody(ticket, 1, 'body-1'); await room.prepare(i, prep, 'clanker', request(1), journal ? claim : undefined);
  await room.deliver(i); client.message(f.sent.at(-1)); await flush();
  const ready = await room.receive(i, clientMessages.at(-1));
  const offered = journal ? await host.bodyOperation(ticket, [], (await room.pending(i)).command)
    : await host.offerBody(ticket, [], 1, claim, prep), ref = offered.result.session;
  await room.complete(i, ready.record.pending.revision, offered); await room.deliver(i); client.message(f.sent.at(-1));
  const preflight = await room.receive(i, clientMessages.at(-1));
  f.at(100100); const active = journal ? await host.bodyOperation(ticket, [], (await room.pending(i)).command)
    : await host.activateBody(ticket, [], 1, ref, offered.transfer);
  await room.complete(i, preflight.record.pending.revision, active); await room.deliver(i); client.message(f.sent.at(-1));
  assert.equal(controls, false); assert.equal(clientMessages.at(-1).t, 'body-started');
  return { ...f, i, room, host, ticket, hostStorage, client, clientMessages, active, ref, claim, controls: () => controls,
    session: () => hostStorage.snapshot().get(HOST.key).host.sessions.sessions[0] };
}

test('actual host, durable outbox and client agree on final ACK, with no control on a lost commit reply', async () => {
  const h = await integrated(), ack = await h.room.receive(h.i, h.clientMessages.at(-1));
  h.at(100200); h.hostStorage.lose();
  await assert.rejects(h.host.startedBody(h.ticket, [], 1, h.ref, h.active.transfer), /lost committed/);
  assert.equal(h.session().state, 'live'); assert.equal(h.controls(), false);
  assert.equal((await h.make().read(h.i)).pending.phase, 'confirming');
  const reconciled = await h.host.startedBody(h.ticket, [], 1, h.ref, h.active.transfer);
  assert.equal(reconciled.result.duplicate, true);
  await h.room.complete(h.i, ack.record.pending.revision, reconciled); await h.room.deliver(h.i);
  assert.equal(h.client.message(h.sent.at(-1)), true); assert.equal(h.controls(), true);
  assert.equal((await h.make().read(h.i)).liveSent, true); h.client.close();
});

test('close racing the final host ACK restores the ORIGINAL deadline when live notification was never attempted', async () => {
  const h = await integrated(), ack = await h.room.receive(h.i, h.clientMessages.at(-1));
  h.at(100150); await h.room.receive(h.i, { t: 'body-decline', request: request(1) }); h.client.close();
  h.at(100200); const completed = await h.host.startedBody(h.ticket, [], 1, h.ref, h.active.transfer);
  assert.equal(h.session().deadline, null);
  const closed = await h.room.complete(h.i, ack.record.pending.revision, completed);
  assert.equal(closed.phase, 'closed'); assert.equal(closed.liveSent, false); assert.equal(await h.room.deliver(h.i), false);
  const cleanup = await h.room.cleanup(h.i); assert.equal(cleanup.kind, 'abandon');
  const unchanged = h.hostStorage.snapshot();
  assert.equal((await h.host.abandonBody(h.ticket, [], 1, { ...h.ref, token: request(999) }, closed.transfer)).result.ok, false);
  const altered = structuredClone(closed.transfer); altered.checkpoint.fixture = false;
  assert.equal((await h.host.abandonBody(h.ticket, [], 1, h.ref, altered)).result.ok, false);
  assert.deepEqual(h.hostStorage.snapshot(), unchanged);
  const before = h.hostStorage.snapshot(); h.hostStorage.fail(1);
  await assert.rejects(h.host.abandonBody(h.ticket, [], 1, h.ref, closed.transfer), /write failure/);
  assert.deepEqual(h.hostStorage.snapshot(), before);
  const abandoned = await h.host.abandonBody(h.ticket, [], 1, h.ref, closed.transfer);
  assert.equal(abandoned.result.ok, true); assert.equal(h.session().deadline, 160000); assert.equal(h.session().state, 'grace');
  const stable = h.hostStorage.snapshot();
  assert.equal((await h.host.abandonBody(h.ticket, [], 1, h.ref, closed.transfer)).result.duplicate, true);
  assert.deepEqual(h.hostStorage.snapshot(), stable);
  assert.equal(await h.room.resolveClosed(h.i, closed.revision, { ref: closed.ref, view: abandoned.result.view }), true);
  assert.equal(h.controls(), false);
});

test('failed final activation durably disconnects the current host body without closing voice or replaying admission', async () => {
  const h = await integrated({ activate: false });
  const ack = await h.room.receive(h.i, h.clientMessages.at(-1));
  h.at(100200); const answer = await h.host.startedBody(h.ticket, [], 1, h.ref, h.active.transfer);
  await h.room.complete(h.i, ack.record.pending.revision, answer); await h.room.deliver(h.i);
  assert.equal(h.client.message(h.sent.at(-1)), false); assert.equal(h.controls(), false);
  const decline = h.clientMessages.at(-1); assert.deepEqual(decline, { t: 'body-decline', request: request(1) });
  h.at(100300); assert.equal((await h.room.receive(h.i, decline)).status, 'closed');
  const close = await h.room.cleanup(h.i); assert.equal(close.kind, 'disconnect');
  assert.equal(close.closedAt, 100300); assert.equal(h.current.get(1), h.i.connection);
  const facade = { closedBodyHandoff: (_, i) => h.room.cleanup(i),
    resolveBodyHandoff: (_, i, revision, proof) => h.room.resolveClosed(i, revision, proof) };
  const ticket = { world: h.ticket.world, owner: h.ticket.owner, epoch: h.ticket.fence };
  const before = h.hostStorage.snapshot(); h.hostStorage.fail(1);
  await assert.rejects(closeBodyHandoff(h.host, facade, h.ticket, ticket, h.i, []), /write failure/);
  assert.deepEqual(h.hostStorage.snapshot(), before); assert.equal((await h.room.read(h.i)).phase, 'closed');
  h.at(100400); assert.equal((await closeBodyHandoff(h.host, facade, h.ticket, ticket, h.i, [])).status, 'resolved');
  assert.equal(h.session().state, 'grace'); assert.equal(h.session().deadline, 160300);
  assert.equal(h.session().generation, h.ref.generation, 'no replacement admission or old-body restore');
  assert.equal(await h.room.read(h.i), null);
  assert.equal((await closeBodyHandoff(h.host, facade, h.ticket, ticket, h.i, [])).status, 'idle');
  assert.equal(h.client.allows('mute', h.active.transfer.view.bodyId), true);
  assert.equal(h.current.get(1), h.i.connection, 'body cleanup retains authenticated voice connection');
});

async function liveMovement(f) {
  const i = identity(), box = f.make(), row = await offered(f);
  const active = await box.receive(i, receipt('body-applied', row));
  const starting = await box.complete(i, active.record.pending.revision, { result: { ok: true, session: ref(1) }, transfer: transfer('starting') });
  const ack = await box.receive(i, receipt('body-started', starting));
  await box.complete(i, ack.record.pending.revision, { result: { ok: true, view: { ...starting.transfer.view, state: 'live', deadline: null } } });
  await box.deliver(i); return box;
}
const motion = (sequence = 1) => ({ t: 'body-motion', request: request(1), sequence, checkpoint: { wire: 'bounded fixture' } });

test('Room movement keeps exactly one durable unresolved sample; restart, lost replies and duplicates preserve observation time', async () => {
  const f = fixture(), i = identity(), box = await liveMovement(f), message = motion();
  const before = f.storage.snapshot(); f.at(100100);
  for (const write of [1, 2]) {
    f.storage.fail(write);
    await assert.rejects(box.receiveMovement(i, message), /write failure/); assert.deepEqual(f.storage.snapshot(), before);
  }
  f.storage.lose(); await assert.rejects(box.receiveMovement(i, message), /lost committed/);
  message.checkpoint.wire = 'caller changed';
  assert.equal((await f.make().read(i)).v, 3, 'movement atomically fences older handoff-only writers');
  const pending = await f.make().pendingMovement(i);
  assert.equal(pending.observedAt, 100100); assert.equal(pending.sample.checkpoint.wire, 'bounded fixture');
  assert.deepEqual(pending.ref, ref(1));
  f.at(100200); const saved = f.storage.snapshot();
  assert.deepEqual(await f.make().receiveMovement(i, motion()), { status: 'pending', sequence: 1 });
  assert.deepEqual(await box.receiveMovement(i, motion(2)), { status: 'busy', sequence: 1 });
  assert.deepEqual(f.storage.snapshot(), saved, 'retry or newer motion cannot rewrite an uncertain operation');
  await assert.rejects(box.receiveMovement(i, message), /handoff/);
  for (const bad of [{ ...motion(), at: 1 }, { ...motion(), request: request(2) }, { ...motion(), sequence: 0 },
    { ...motion(), checkpoint: { payload: 'x'.repeat(4096) } }]) await assert.rejects(box.receiveMovement(i, bad));
  f.current.set(1, 'replacement');
  await assert.rejects(box.receiveMovement(i, motion()), /handoff/);
  assert.equal(await box.deliverMovement(i), false);
  f.current.set(1, i.connection);
  for (const bad of [null, { sequence: 2, at: 100150 }, { sequence: 1, at: 100099 }])
    await assert.rejects(box.completeMovement(i, 1, bad), /handoff/);
  assert.deepEqual(f.storage.snapshot(), saved);
  f.storage.lose(); await assert.rejects(box.completeMovement(i, 1, { sequence: 1, at: 100150 }), /lost committed/);
  assert.equal(await f.make().pendingMovement(i), null);
  const completed = f.storage.snapshot();
  await f.make().completeMovement(i, 1, { sequence: 1, at: 100150 });
  assert.deepEqual(f.storage.snapshot(), completed);
  assert.equal(await box.deliverMovement(i), true);
  assert.deepEqual(f.sent.at(-1), { t: 'body-motion-ack', request: request(1), generation: 1, sequence: 1 });
  assert.equal(JSON.stringify(f.sent).includes(ref(1).token), false);
  await box.receiveMovement(i, motion(2));
  await assert.rejects(box.receiveMovement(i, motion()), /handoff/);
  assert.equal(f.storage.snapshot().size, 3, 'handoff row, bounded index, and one movement row');
  assert.ok(Buffer.byteLength(JSON.stringify(f.storage.snapshot().get(ROOM_MOVEMENT.prefix + 1))) < ROOM_MOVEMENT.rowBytes);
});

test('close fences an uncertain movement without replay, preserves the original close time and sends no ACK to a replacement', async () => {
  const f = fixture(), i = identity(), box = await liveMovement(f);
  f.at(100100); await box.receiveMovement(i, motion());
  f.at(100200); await box.close(i); f.current.set(1, 'replacement');
  const closed = await box.read(i);
  assert.equal((await box.cleanup(i)).kind, 'movement');
  await assert.rejects(box.resolveClosed(i, closed.revision, { ref: ref(1), view: null }), /handoff/);
  const calls = [], ticket = { owner: 'host', world: preparation().world, fence: 1 }, roomTicket = { ...ticket, epoch: 1 };
  let passive = false;
  const host = {
    async bodyReferenceState() { return passive ? null : { state: 'live' }; },
    async updateObservedBody() { throw Error('closed sample must not replay'); },
    async disconnect(_, tokens, reference, at) {
      calls.push('disconnect'); assert.deepEqual(reference, ref(1)); assert.equal(at, 100200); passive = true;
    },
  };
  const room = { pendingBodyMovement: (_, who) => box.pendingMovement(who),
    completeBodyMovement: async (_, who, sequence, answer) => { await box.completeMovement(who, sequence, answer); return { delivered: await box.deliverMovement(who) }; },
    fenceBodyMovement: (_, who, sequence, proof) => box.fenceMovement(who, sequence, proof),
    closedBodyHandoff: (_, who) => box.cleanup(who), resolveBodyHandoff: (_, who, revision, proof) => box.resolveClosed(who, revision, proof) };
  assert.deepEqual(await closeBodyHandoff(host, room, ticket, roomTicket, i, []), { status: 'resolved' });
  assert.deepEqual(calls, ['disconnect']); assert.equal(await box.read(i), null);
  assert.equal(f.storage.snapshot().has(ROOM_MOVEMENT.prefix + 1), false);
  assert.equal(f.sent.some(m => m.t === 'body-motion-ack'), false);
});

test('an already passive generation fences uncertain movement before close cleanup instead of replaying it', async () => {
  const f = fixture(), i = identity(), box = await liveMovement(f);
  await box.receiveMovement(i, motion()); await box.close(i);
  const ticket = { owner: 'host', world: preparation().world, fence: 1 }, authority = { ...ticket, epoch: 1 };
  const host = { bodyReferenceState: async () => null, updateBody: () => { throw Error('must not replay'); } };
  const room = { pendingBodyMovement: (_, who) => box.pendingMovement(who),
    fenceBodyMovement: (_, who, sequence, proof) => box.fenceMovement(who, sequence, proof) };
  assert.deepEqual(await advanceBodyMovement(host, room, ticket, authority, i, []), { status: 'fenced' });
  assert.equal(await box.pendingMovement(i), null); assert.equal((await box.cleanup(i)).kind, 'disconnect');
  const r = await box.read(i); await box.resolveClosed(i, r.revision, { ref: ref(1), view: null });
  assert.equal(f.storage.snapshot().has(ROOM_MOVEMENT.prefix + 1), false);
});

test('an older host without observation-aware movement refuses before dispatch and retains the Room intent', async () => {
  const f = fixture(), i = identity(), box = await liveMovement(f); await box.receiveMovement(i, motion());
  const before = f.storage.snapshot(), owner = { owner: 'host', world: preparation().world, fence: 1 };
  const host = { updateBody() { throw Error('legacy host must not run'); } };
  const room = { pendingBodyMovement: (_, who) => box.pendingMovement(who) };
  await assert.rejects(advanceBodyMovement(host, room, owner, { ...owner, epoch: 1 }, i, [ref(1).token]), /host protocol/);
  assert.deepEqual(f.storage.snapshot(), before); assert.ok(await box.pendingMovement(i));
});

test('actual Clanker movement with a lost host reply closes through the durable Room inbox without losing its committed position', async t => {
  const f = fixture(), i = identity(), box = f.make(), world = preparation().world, hostStorage = memory();
  const createBody = () => {
    const b = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...b, codec: createClankerBodyCheckpoint(b.sim, world) };
  };
  const source = createBody();
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const initial = source.codec.capture();
    const storage = createHostBodyStorage({ storage: hostStorage, profile: 'clanker-body-3',
      capture: () => { throw Error('scoped capture required'); }, validate: v => { source.codec.records.read(v); return true; } });
    const simulation = { version: world, checkpointBytes: 65536, initial: () => ({ n: 0 }), validate: s => Number.isSafeInteger(s.n),
      step: s => { s.n++; }, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
    const host = new VirtualHost({ storage, simulation, clock: f.clock,
      sessionAdapter: createClankerBodySessions({ browserTransfer: true, admit: () => initial, recordFor: () => source.codec.records,
        create: () => { const b = createBody(); return { codec: b.codec, dispose: b.dispose }; } }) });
    const ticket = await host.begin('owner', 120000), authority = { ...ticket, epoch: ticket.fence };
    const p = await host.prepareBody(ticket, 1, 'body-1'), claim = { protocol: SESSION_PROTOCOL, world, accountId: 1, bodyId: 'body-1', zone: 'outside',
      body: { kind: 'clanker', motion: structuredClone(source.codec.motion()), equipment: { weapon: null, mode: 'carry', primaryOwned: false,
        secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } };
    f.current.set(1, i.connection); await box.prepare(i, p, 'clanker', request(1), claim);
    const ready = await box.receive(i, { t: 'body-ready', request: request(1) });
    const offered = await host.offerBody(ticket, [], 1, claim, p);
    const offerRow = await box.complete(i, ready.record.pending.revision, offered);
    const applied = await box.receive(i, receipt('body-applied', offerRow));
    const active = await host.activateBody(ticket, [], 1, offered.result.session, offered.transfer);
    const starting = await box.complete(i, applied.record.pending.revision, active);
    const started = await box.receive(i, receipt('body-started', starting));
    await box.complete(i, started.record.pending.revision,
      await host.startedBody(ticket, [], 1, active.result.session, active.transfer));
    await box.deliver(i);
    const checkpoint = source.codec.records.transfer(initial);
    checkpoint.body = ['fixture-0', 2, 3, 0, .5, .6, -1.5, .8, 1, 4];
    const firstHostWrites = hostStorage.writes.length, firstRoomWrites = f.storage.writes.length;
    f.at(100100); await box.receiveMovement(i, { t: 'body-motion', request: request(1), sequence: 1, checkpoint });
    const room = { pendingBodyMovement: (_, who) => box.pendingMovement(who),
      completeBodyMovement: async (_, who, sequence, answer) => { await box.completeMovement(who, sequence, answer); return { delivered: await box.deliverMovement(who) }; },
      fenceBodyMovement: (_, who, sequence, proof) => box.fenceMovement(who, sequence, proof),
      closedBodyHandoff: (_, who) => box.cleanup(who), resolveBodyHandoff: (_, who, revision, proof) => box.resolveClosed(who, revision, proof) };
    await advanceBodyMovement(host, room, ticket, authority, i, [active.result.session.token]);
    assert.equal(hostStorage.writes.length - firstHostWrites, 2);
    assert.equal(f.storage.writes.length - firstRoomWrites, 3, 'first sample also persists the Room movement marker');
    const hostWrites = hostStorage.writes.length, roomWrites = f.storage.writes.length, startedAt = performance.now();
    f.at(100125); await box.receiveMovement(i, { t: 'body-motion', request: request(1), sequence: 2, checkpoint });
    await advanceBodyMovement(host, room, ticket, authority, i, [active.result.session.token]);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(hostStorage.writes.length - hostWrites, 2); assert.equal(f.storage.writes.length - roomWrites, 2);
    t.diagnostic(JSON.stringify({ steadyMovementLogicalWrites: 4, firstMovementLogicalWrites: 5, elapsedMs,
      hostJSONBytes: hostStorage.writes.slice(hostWrites).reduce((a, b) => a + b, 0),
      roomJSONBytes: f.storage.writes.slice(roomWrites).reduce((a, b) => a + b, 0),
      scope: 'one actual Clanker movement through atomic in-memory host and Room stores; no RPC/provider/billing/scene load' }));
    f.at(100150); await box.receiveMovement(i, { t: 'body-motion', request: request(1), sequence: 3, checkpoint });
    hostStorage.lose();
    await assert.rejects(advanceBodyMovement(host, room, ticket, authority, i, [active.result.session.token]), /lost committed/);
    assert.ok(await box.pendingMovement(i));
    assert.equal(hostStorage.snapshot().get(HOST.key).host.sessions.sessions[0].motion.x, 2);
    const retainedRow = f.storage.snapshot().get(ROOM_MOVEMENT.prefix + 1);
    f.at(100200); await box.close(i); f.current.delete(1);
    assert.deepEqual(await closeBodyHandoff(host, room, ticket, authority, i, []), { status: 'resolved' });
    const offline = hostStorage.snapshot().get(HOST.key).host.sessions.sessions[0];
    assert.equal(offline.state, 'grace'); assert.equal(offline.deadline, 160200);
    assert.equal(offline.motion.x, 2); assert.equal(offline.motion.vx, 0); assert.equal(offline.motion.vz, 0); assert.equal(offline.motion.vy, 0);
    const body = (await storage.transaction(tx => tx.bodies()))[0];
    assert.deepEqual(structuredClone(source.codec.records.motion(body.checkpoint)), offline.motion);
    assert.equal(await box.read(i), null); assert.equal(f.storage.snapshot().has(ROOM_MOVEMENT.prefix + 1), false);
    assert.deepEqual(f.sent.filter(m => m.t === 'body-motion-ack').map(m => m.sequence), [1, 2], 'lost sequence 3 is never acknowledged after close');
    t.diagnostic(JSON.stringify({ roomPendingMovementRowBytes: Buffer.byteLength(JSON.stringify(retainedRow)),
      scope: 'representative actual Clanker wire plus Room inbox metadata; keys/provider overhead excluded' }));
  } finally { source.dispose(); }
});


test('expired Room retirement recovers uncertain work without reissuing control or resetting deadlines', async () => {
  const h = await integrated({ journal: true });
  await h.room.receive(h.i, h.clientMessages.at(-1)); // Final confirmation has not executed.
  h.at(100200); await h.room.close(h.i);
  const roomTicket = { world: h.ticket.world, epoch: h.ticket.fence, owner: h.ticket.owner };
  const facade = {
    async closedBodyRecovery(_, i) {
      const close = await h.room.cleanup(i);
      return close ? { close, pending: await h.room.pending(i), movement: await h.room.pendingMovement(i) } : null;
    },
    completeClosedBodyRecovery: (_, i, rev, answer) => h.room.complete(i, rev, answer),
    fenceClosedBodyMovement: (_, i, seq, proof) => h.room.fenceMovement(i, seq, proof),
    resolveClosedBodyRecovery: (_, i, rev, proof) => h.room.resolveClosed(i, rev, proof),
  };
  const sent = h.sent.length;
  // Recover cancellation independently, then simulate a pause before retirement.
  const pending = await h.room.pending(h.i);
  const cancelled = await h.host.bodyOperation(h.ticket, [], pending.command, { recoverOnly: true });
  await h.room.complete(h.i, pending.command.revision, cancelled);
  assert.equal((await h.room.read(h.i)).pending, null);
  h.at(230000); const recovered = await h.host.claim('replacement');
  const before = h.hostStorage.snapshot().get(HOST.key).host;
  await h.host.reconcileBodies(recovered, []);
  assert.equal(h.session(), undefined);
  const after = h.hostStorage.snapshot().get(HOST.key).host;
  assert.equal(after.runUntil, before.runUntil); assert.equal(after.leaseUntil, before.leaseUntil);
  assert.deepEqual(after.simulation, before.simulation);
  const stable = h.storage.snapshot(); h.storage.fail(1);
  await assert.rejects(retireRecoveredBodyHandoff(h.host, facade, recovered, roomTicket, h.i), /write failure/);
  assert.deepEqual(h.storage.snapshot(), stable);
  assert.equal((await retireRecoveredBodyHandoff(h.host, facade, recovered, roomTicket, h.i)).status, 'resolved');
  assert.equal(await h.room.read(h.i), null); assert.equal(h.sent.length, sent); assert.equal(h.controls(), false);
  assert.equal((await retireRecoveredBodyHandoff(h.host, facade, recovered, roomTicket, h.i)).status, 'idle');
  await assert.rejects(retireRecoveredBodyHandoff(h.host, facade, h.ticket, roomTicket, h.i), /fenced/);
  await assert.rejects(retireRecoveredBodyHandoff(h.host, facade, recovered, { ...roomTicket, epoch: recovered.fence + 1 }, h.i), /differ/);
});


test('recovered close keeps an uncertain movement until its exact generation is passive', async () => {
  const f = fixture(), i = identity(), box = await liveMovement(f);
  await box.receiveMovement(i, motion()); await box.close(i);
  const owner = { world: preparation().world, fence: 2, owner: 'replacement' };
  const authority = { world: owner.world, epoch: 1, owner: 'previous' };
  let view = { ...transfer('live').view, deadline: null };
  const host = { bodyLifecycleRevision: async () => 9, closeRetainedBody: async () => ({ changed: false }), bodyReferenceState: async (_, account, reference) => {
    assert.equal(account, 1); assert.deepEqual(reference, ref(1)); return view;
  } };
  const room = {
    async closedBodyRecovery(_, who) {
      const close = await box.cleanup(who);
      return close ? { close, pending: await box.pending(who), movement: await box.pendingMovement(who) } : null;
    },
    fenceClosedBodyMovement: (_, who, sequence, proof) => box.fenceMovement(who, sequence, proof),
    resolveClosedBodyRecovery: (_, who, revision, proof) => box.resolveClosed(who, revision, proof),
  };
  const before = f.storage.snapshot();
  assert.equal((await retireRecoveredBodyHandoff(host, room, owner, authority, i)).status, 'blocked');
  assert.deepEqual(f.storage.snapshot(), before);
  view = { ...view, state: 'grace', deadline: 160000 };
  assert.equal((await retireRecoveredBodyHandoff(host, room, owner, authority, i)).status, 'resolved');
  assert.equal(await box.read(i), null); assert.equal(f.storage.snapshot().has(ROOM_MOVEMENT.prefix + 1), false);
  assert.equal(f.sent.some(m => m.t === 'body-motion-ack'), false);
});


test('a no-live-send final ACK restores the original grace after the finite run ends', async () => {
  const h = await integrated({ journal: true, duration: 500 });
  await h.room.receive(h.i, h.clientMessages.at(-1));
  const command = (await h.room.pending(h.i)).command;
  h.at(100200); const answer = await h.host.bodyOperation(h.ticket, [], command);
  assert.equal(h.session().state, 'live');
  await h.room.close(h.i);
  await h.room.complete(h.i, command.revision, answer);
  const close = await h.room.cleanup(h.i);
  assert.equal(close.kind, 'abandon'); assert.equal((await h.room.read(h.i)).liveSent, false);
  h.at(100600); const before = h.hostStorage.snapshot().get(HOST.key).host;
  await assert.rejects(h.host.startedBody(h.ticket, [], 1, h.ref, h.active.transfer), /run closed/);
  const facade = {
    async closedBodyRecovery(_, who) {
      const close = await h.room.cleanup(who);
      return close ? { close, pending: await h.room.pending(who), movement: await h.room.pendingMovement(who) } : null;
    },
    resolveClosedBodyRecovery: (_, who, revision, proof) => h.room.resolveClosed(who, revision, proof),
  };
  const authority = { world: h.ticket.world, owner: h.ticket.owner, epoch: h.ticket.fence };
  assert.equal((await retireRecoveredBodyHandoff(h.host, facade, h.ticket, authority, h.i)).status, 'resolved');
  assert.equal(await h.room.read(h.i), null); assert.equal(h.session().deadline, 160000);
  assert.equal(h.session().state, 'grace');
  const after = h.hostStorage.snapshot().get(HOST.key).host;
  assert.equal(after.runUntil, before.runUntil); assert.equal(after.leaseUntil, before.leaseUntil);
  assert.deepEqual(after.simulation, before.simulation);
  assert.equal(h.controls(), false);
  h.at(160000); const replacement = await h.host.claim('cleanup');
  await h.host.reconcileBodies(replacement, []);
  assert.equal(h.session(), undefined);
  assert.equal(h.hostStorage.snapshot().get(HOST.key).host.sessions.pending[0].at, 160000);
});


test('closed no-live-send rollback is not an absence census for another live player', async () => {
  const h = await integrated({ journal: true, duration: 500 });
  const other = (await h.host.connect(h.ticket, [h.ref.token], { ...h.claim, accountId: 2, bodyId: 'body-2' })).result.session;
  await h.room.receive(h.i, h.clientMessages.at(-1));
  const command = (await h.room.pending(h.i)).command;
  h.at(100200); const answer = await h.host.bodyOperation(h.ticket, [other.token], command);
  await h.room.close(h.i); await h.room.complete(h.i, command.revision, answer);
  const close = await h.room.cleanup(h.i);
  h.at(100600); await h.host.abandonBody(h.ticket, [], 1, close.ref, close.issued);
  const rows = h.hostStorage.snapshot().get(HOST.key).host.sessions.sessions;
  assert.equal(rows.find(r => r.accountId === 1).deadline, 160000);
  const retained = rows.find(r => r.accountId === 2);
  assert.equal(retained.state, 'live'); assert.equal(retained.deadline, null); assert.equal(retained.token, other.token);
});
