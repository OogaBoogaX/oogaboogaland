import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage } from '../src/host-body-storage.js';
import { BODY_OPERATIONS, bodyOperationDigest, createBodyOperationJournal } from '../src/host-body-operations.js';
import { RoomBodyHandoff } from '../src/room-body-handoff.js';
import { advanceBodyHandoff, closeBodyHandoff } from '../src/host-body-room.js';
const nonce = n => n.toString(16).padStart(32, '0');
function memory() {
  let data = new Map(), fail = 0, lose = false, tail = Promise.resolve();
  return { snapshot: () => structuredClone(data), get: async k => structuredClone(data.get(k)),
    fail: n => { fail = n; }, lose: () => { lose = true; }, transaction(fn) {
      const next = tail.then(async () => {
        const copy = structuredClone(data); let writes = 0;
        const result = await fn({ get: async k => Array.isArray(k) ? new Map(k.filter(v => copy.has(v)).map(v => [v, structuredClone(copy.get(v))])) : structuredClone(copy.get(k)),
          put: async (k, v) => { for (const [name, value] of typeof k === 'string' ? [[k, v]] : Object.entries(k)) {
            copy.set(name, structuredClone(value)); if (++writes === fail) { fail = 0; throw Error('partial write'); }
          } }, delete: async k => { for (const name of Array.isArray(k) ? k : [k]) copy.delete(name); } });
        data = copy; if (lose) { lose = false; throw Error('lost committed reply'); } return result;
      }); tail = next.catch(() => {}); return next;
    } };
}
async function fixture() {
  let now = 100000; const raw = memory();
  const simulation = { version: 'receipt-world', checkpointBytes: 65536, initial: () => ({ ticks: 0 }),
    validate: s => Number.isSafeInteger(s.ticks), step: s => s.ticks++, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const storage = createHostBodyStorage({ storage: raw, profile: 'receipt-fixture', validate: () => true,
    capture: r => [...(r.sessions?.sessions || []), ...(r.sessions?.pending || [])].map(s => ({ accountId: s.accountId, bodyId: s.bodyId,
      generation: s.generation, kind: s.kind || s.body.kind, checkpoint: { body: 'fixture' } })) });
  const make = () => new VirtualHost({ storage, simulation, clock: () => now, sessionAdapter: { stepPassive: m => m } });
  const host = make(), ticket = await host.begin('owner', 120000);
  const claim = { protocol: SESSION_PROTOCOL, world: simulation.version, accountId: 1, bodyId: 'body-1', zone: 'outside', body: { kind: 'clanker',
    motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
    equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } };
  const preparation = await host.prepareBody(ticket, 1, claim.bodyId), command = { accountId: 1, connection: 'connection-a', request: nonce(1),
    phase: 'offering', revision: 2, input: { claim, preparation } };
  return { raw, make, host, ticket, command, at: t => { now = t; }, clock: () => now,
    session: () => raw.snapshot().get(HOST.key).host.sessions?.sessions[0] };
}
const nextCommand = (c, answer, phase) => ({ ...c, phase, revision: c.revision + 2, input: { ref: answer.result.session, issued: answer.transfer } });

test('lost offer and activation replies replay the atomic exact result without another admission, hold or write', async () => {
  const f = await fixture(); f.raw.lose();
  await assert.rejects(f.host.bodyOperation(f.ticket, [], f.command), /lost committed/);
  const saved = f.raw.snapshot(), generation = f.session().generation;
  f.at(100200); const offered = await f.make().bodyOperation(f.ticket, [], f.command);
  assert.equal(offered.result.session.generation, generation); assert.deepEqual(f.raw.snapshot(), saved);
  const activate = nextCommand(f.command, offered, 'activating'); f.raw.lose();
  await assert.rejects(f.host.bodyOperation(f.ticket, [], activate), /lost committed/);
  const held = f.raw.snapshot(); f.at(100400);
  const final = await f.make().bodyOperation(f.ticket, [], activate);
  assert.equal(final.transfer.at, 100200); assert.equal(final.transfer.expiresAt, 101200);
  assert.deepEqual(f.raw.snapshot(), held); assert.equal(f.session().deadline, 160000);
  const confirm = nextCommand(activate, final, 'confirming'); f.raw.lose();
  await assert.rejects(f.host.bodyOperation(f.ticket, [], confirm), /lost committed/);
  const live = f.raw.snapshot(); f.at(101500);
  assert.equal((await f.make().bodyOperation(f.ticket, [], confirm)).result.view.state, 'live');
  assert.deepEqual(f.raw.snapshot(), live, 'reply expiry does not renew live presence');
});

test('receipt, body and index writes roll back together; changed commands and skipped phases cannot claim twice', async () => {
  for (let n = 1; n <= 4; n++) {
    const f = await fixture(), before = f.raw.snapshot(); f.raw.fail(n);
    await assert.rejects(f.host.bodyOperation(f.ticket, [], f.command), /partial write/);
    assert.deepEqual(f.raw.snapshot(), before);
    assert.equal((await f.host.bodyOperation(f.ticket, [], f.command)).result.ok, true);
  }
  const f = await fixture(), offered = await f.host.bodyOperation(f.ticket, [], f.command), stable = f.raw.snapshot();
  const changed = structuredClone(f.command); changed.input.claim.body.motion.x = -0;
  await assert.rejects(f.host.bodyOperation(f.ticket, [], changed), /body operation/);
  await assert.rejects(f.host.bodyOperation(f.ticket, [], { ...f.command, request: nonce(2) }), /body operation/);
  await assert.rejects(f.host.bodyOperation(f.ticket, [], nextCommand(f.command, offered, 'confirming')), /body operation/);
  const bad = nextCommand(f.command, offered, 'activating'); bad.input.issued.checkpoint.body = 'changed';
  await assert.rejects(f.host.bodyOperation(f.ticket, [], bad), /body operation/);
  assert.deepEqual(f.raw.snapshot(), stable);
});

test('new host fence can read the old committed receipt for cleanup; old owner cannot execute or read it', async () => {
  const f = await fixture(), offered = await f.host.bodyOperation(f.ticket, [], f.command);
  f.at(110000); const next = await f.make().claim('replacement'), stable = f.raw.snapshot();
  await assert.rejects(f.host.bodyOperation(f.ticket, [], f.command), /host fenced/);
  assert.deepEqual(await f.make().bodyOperation(next, [], f.command), offered);
  assert.deepEqual(f.raw.snapshot(), stable);
  assert.equal(offered.transfer.epoch, 1, 'old epoch is preserved, never relabelled as a new grant');
  await assert.rejects(f.make().bodyOperation(next, [], nextCommand(f.command, offered, 'activating')), /body operation/);
  assert.equal(await f.make().retireBodyOperation(next, 1, f.command.connection, f.command.request), true);
  await assert.rejects(f.make().bodyOperation(next, [], f.command), /body operation/);
  assert.equal(f.session().generation, offered.result.session.generation);
});

test('Room restart recovers the same persisted claim command and completes an offer that lost its host reply', async () => {
  const f = await fixture(), roomStorage = memory(), identity = { accountId: 1, connection: 'connection-a' };
  const room = () => new RoomBodyHandoff({ storage: roomStorage, clock: f.clock, current: () => true, send: () => true });
  await room().prepare(identity, f.command.input.preparation, 'clanker', nonce(1), f.command.input.claim);
  const ready = await room().receive(identity, { t: 'body-ready', request: nonce(1) });
  const command = await room().command(identity); assert.deepEqual(command, f.command);
  f.raw.lose(); await assert.rejects(f.host.bodyOperation(f.ticket, [], command), /lost committed/);
  await room().close(identity, 100000);
  const recovered = await room().command(identity); assert.deepEqual(recovered, command);
  const offered = await f.make().bodyOperation(f.ticket, [], recovered);
  await room().complete(identity, ready.record.pending.revision, offered);
  const closed = await room().read(identity); assert.equal(closed.phase, 'closed'); assert.equal(closed.claim, null);
  assert.deepEqual(closed.ref, offered.result.session); assert.equal(await room().deliver(identity), false);
  assert.equal((await room().cleanup(identity)).kind, 'disconnect');
});

test('canonical command digest is key-order independent but distinguishes signed zero and typed values', async () => {
  const f = await fixture(), c = structuredClone(f.command);
  const hash = await bodyOperationDigest(c);
  assert.equal(await bodyOperationDigest(Object.fromEntries(Object.entries(c).reverse())), hash);
  c.input.claim.body.motion.x = -0; assert.notEqual(await bodyOperationDigest(c), hash);
  await assert.rejects(bodyOperationDigest({ ...c, connection: undefined }), /non-JSON|body operation/);
});

test('closing before an uncertain call commits cancels it durably; a late call cannot create or activate a body', async () => {
  const f = await fixture(), before = f.raw.snapshot().get(HOST.key);
  const cancelled = await f.host.bodyOperation(f.ticket, [], f.command, { recoverOnly: true });
  assert.equal(cancelled.result.reason, 'cancelled');
  assert.deepEqual(f.raw.snapshot().get(HOST.key), before);
  assert.deepEqual(await f.host.bodyOperation(f.ticket, [], f.command), cancelled);
  assert.equal(f.session(), undefined);
  const h = await fixture(), offered = await h.host.bodyOperation(h.ticket, [], h.command);
  const activate = nextCommand(h.command, offered, 'activating');
  const passive = h.raw.snapshot().get(HOST.key);
  assert.equal((await h.host.bodyOperation(h.ticket, [], activate, { recoverOnly: true })).result.reason, 'cancelled');
  assert.equal((await h.host.bodyOperation(h.ticket, [], activate)).result.reason, 'cancelled');
  assert.deepEqual(h.raw.snapshot().get(HOST.key), passive); assert.equal(h.session().state, 'offered');
});

test('receipt capacity and retention are bounded; retirement cannot permit a delayed expired request', async t => {
  const storage = memory(); let calls = 0;
  const run = (c, now = 100000) => storage.transaction(tx => createBodyOperationJournal(tx).run(c, 'a'.repeat(64), now, async () => {
    calls++; return { result: { ok: true, session: { accountId: c.accountId } }, transfer: { padding: 'x'.repeat(32700) } };
  }));
  const command = id => ({ accountId: id, connection: 'connection-a', request: nonce(id), phase: 'offering', revision: 2,
    input: { claim: { accountId: id }, preparation: { accountId: id, expiresAt: 110000 } } });
  for (let id = 1; id <= 32; id++) await run(command(id));
  await assert.rejects(run(command(33)), /body operation/); assert.equal(calls, 32);
  const bytes = [...storage.snapshot().values()].map(v => Buffer.byteLength(JSON.stringify(v)));
  assert.ok(Math.max(...bytes) <= BODY_OPERATIONS.rowBytes); assert.equal(bytes.length, 33);
  t.diagnostic(JSON.stringify({ records: bytes.length, totalJSONBytes: bytes.reduce((a, b) => a + b), maximumRecordBytes: Math.max(...bytes) }));
  await assert.rejects(storage.transaction(tx => createBodyOperationJournal(tx).retire(1, 'connection-a', nonce(1), 109999)), /body operation/);
  await storage.transaction(tx => createBodyOperationJournal(tx).retire(1, 'connection-a', nonce(1), 110000));
  await assert.rejects(run(command(1), 110000), /body operation/);
  await run(command(33)); assert.equal(calls, 33);
});

test('finite runner resumes a lost Room commit reply without repeating host admission and cancels closed work', async () => {
  const f = await fixture(), storage = memory(), identity = { accountId: 1, connection: 'connection-a' }, sent = [];
  let current = true;
  const outbox = new RoomBodyHandoff({ storage, clock: f.clock, current: () => current, send: (i, m) => { sent.push(m); return true; } });
  const room = {
    pendingBodyHandoff: (t, i) => outbox.pending(i),
    completeBodyHandoff: async (t, i, revision, answer) => {
      const row = await outbox.complete(i, revision, answer); return { phase: row.phase, delivered: await outbox.deliver(i) };
    },
    deliverBodyHandoff: async (t, i) => ({ phase: (await outbox.read(i))?.phase, delivered: await outbox.deliver(i) }),
    closedBodyHandoff: (t, i) => outbox.cleanup(i),
    resolveBodyHandoff: (t, i, revision, proof) => outbox.resolveClosed(i, revision, proof),
  };
  const rt = { world: f.ticket.world, owner: f.ticket.owner, epoch: f.ticket.fence };
  await outbox.prepare(identity, f.command.input.preparation, 'clanker', nonce(1), f.command.input.claim);
  await outbox.receive(identity, { t: 'body-ready', request: nonce(1) });
  storage.lose();
  await assert.rejects(advanceBodyHandoff(f.host, room, f.ticket, rt, identity, []), /lost committed/);
  const saved = f.raw.snapshot();
  const resumed = await advanceBodyHandoff(f.make(), room, f.ticket, rt, identity, []);
  assert.equal(resumed.status, 'idle'); assert.equal(resumed.delivered, true); assert.equal(sent.at(-1).t, 'body-grant');
  assert.deepEqual(f.raw.snapshot(), saved);
  const r = await outbox.read(identity);
  await outbox.receive(identity, { t: 'body-applied', request: r.request, epoch: r.transfer.epoch, generation: r.ref.generation, revision: r.transfer.revision });
  current = false; await outbox.close(identity);
  const cancelled = await advanceBodyHandoff(f.host, room, f.ticket, rt, identity, []);
  assert.equal(cancelled.phase, 'closed'); assert.equal(cancelled.delivered, false);
  assert.equal(f.session().state, 'offered'); assert.equal((await outbox.read(identity)).pending, null);
  assert.equal((await closeBodyHandoff(f.host, room, f.ticket, rt, identity, [])).status, 'resolved');
  assert.equal(await outbox.read(identity), null); assert.equal(f.session().deadline, 160000);
});

test('replacement host abandons an undelivered final ACK before ticking and preserves its original deadline', async () => {
  const f = await fixture(), offered = await f.host.bodyOperation(f.ticket, [], f.command);
  f.at(100100); const activate = nextCommand(f.command, offered, 'activating');
  const final = await f.host.bodyOperation(f.ticket, [], activate);
  f.at(100200); const confirm = nextCommand(activate, final, 'confirming');
  await f.host.bodyOperation(f.ticket, [], confirm);
  assert.equal(f.session().state, 'live');
  f.at(110000); const ticket = await f.make().claim('replacement');
  assert.equal((await f.make().bodyOperation(ticket, [], confirm)).result.view.state, 'live');
  const restored = await f.make().abandonBody(ticket, [], 1, final.result.session, final.transfer);
  assert.equal(restored.result.ok, true); assert.equal(f.session().deadline, 160000);
  assert.equal(f.session().lastSeenAt, 100000); assert.equal(f.session().stepAt, 100100);
  assert.equal((await f.make().bodyReferenceState(ticket, 1, final.result.session)).state, 'grace');
  assert.equal(await f.make().bodyReferenceState(ticket, 1, { ...final.result.session, token: nonce(999) }), null);
  await assert.rejects(f.host.abandonBody(f.ticket, [], 1, final.result.session, final.transfer), /host fenced/);
});
