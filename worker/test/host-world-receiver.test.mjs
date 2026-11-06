import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostWorldReceiver, WORLD_RECEIVER } from '../src/host-world-receiver.js';

const hint = { v: 1, room: 'island', world: 'world-1', epoch: 1, revision: 2, owner: 'host-a', runUntil: 110000 };
function fixture() {
  let now = 100000, alarm = null, writes = 0, alarmWrites = 0, opens = 0, bodies = 0, closed = 0, pending, failWrite = false, due = null;
  let identities = [], retained = new Set(), map = new Map(); const admitted = [];
  const storage = { sql: {},
    get: async k => structuredClone(map.get(k)),
    put: async (k, value) => { if (failWrite) throw Error('disk failed'); writes++; map.set(k, structuredClone(value)); },
    setAlarm: async at => { alarmWrites++; alarm = at; }, deleteAlarm: async () => { alarm = null; },
    async transaction(fn) { const old = structuredClone(map), prior = alarm; try { return await fn(); } catch (e) { map = old; alarm = prior; throw e; } },
  };
  const open = async h => {
    opens++; let stopped = false;
    return { ticket: { world: h.world, fence: h.epoch, owner: h.owner },
      roomTicket: { world: h.world, epoch: h.epoch, owner: h.owner, revision: h.revision },
      room: { bodyAdmissionCandidates: async () => { const current = identities.filter(i => !retained.has(i.accountId));
        return { identities: current.slice(0, 4), more: current.length > 4 }; } },
      runner: { state: () => ({ until: h.runUntil, closed: stopped, ready: true, nextBodyAt: due }),
        close: () => { stopped = true; closed++; },
        bodies: async () => { bodies++; if (pending) await pending(); return { status: 'reconciled' }; },
        admit: async who => { retained.add(who.accountId); admitted.push(who); return { status: 'staged' }; } } };
  };
  const receiver = () => new HostWorldReceiver({ storage, open, clock: () => now });
  return { receiver, storage, admitted, at: t => { now = t; }, identities: value => { identities = value; },
    pending: value => { pending = value; }, due: value => { due = value; }, failWrite: value => { failWrite = value; },
    stats: () => ({ alarm, writes, alarmWrites, opens, bodies, closed }), record: () => storage.get(WORLD_RECEIVER.key) };
}

test('receiver recovers lost Room wake and admission batches after restart within the original finite run', async () => {
  const f = fixture(); let receiver = f.receiver();
  assert.deepEqual(await receiver.notifyRoomWorld(hint), { status: 'stale', more: false });
  assert.equal(f.stats().opens, 0, 'a hint cannot bootstrap a world');
  await receiver.attach(hint);
  f.identities(Array.from({ length: 6 }, (_, i) => ({ accountId: i + 1, connection: `socket-${i}` })));
  await receiver.alarm(); assert.equal(f.admitted.length, 4); assert.equal(f.stats().alarm, 100250);
  receiver = f.receiver(); f.at(100250); await receiver.alarm();
  assert.equal(f.admitted.length, 6); assert.equal(f.stats().opens, 2);
  f.identities([{ accountId: 7, connection: 'late-socket' }]);
  f.at(f.stats().alarm); await receiver.alarm();
  assert.equal(f.admitted.at(-1).accountId, 7, 'lost join hint recovered from current inventory');
  f.at(hint.runUntil); await receiver.alarm();
  assert.equal((await f.record()).status, 'expired'); assert.equal(f.stats().alarm, null);
  assert.equal((await f.record()).hint.runUntil, hint.runUntil);
});

test('receiver fences hints, preserves attempt budgets across restart and refuses deadline extension', async () => {
  const f = fixture(), receiver = f.receiver(); await receiver.attach(hint); await receiver.alarm();
  const before = f.stats();
  assert.deepEqual(await receiver.notifyRoomWorld({ ...hint, epoch: 2 }), { status: 'stale', more: false });
  assert.equal(f.stats().writes, before.writes);
  await assert.rejects(receiver.attach({ ...hint, runUntil: hint.runUntil + 1000 }), /newer fenced/);
  await f.receiver().attach(hint); assert.equal((await f.record()).scans, 1);
  await receiver.notifyRoomWorld(hint); assert.equal((await f.record()).scans, 1, 'early duplicate cannot spend another scan');
  assert.equal(f.stats().bodies, 1);
  f.at(100250); await receiver.notifyRoomWorld(hint); assert.equal((await f.record()).scans, 2);
});

test('receiver does not lose its alarm behind concurrent RPC work or accept queued identities', async () => {
  const f = fixture(), receiver = f.receiver(); await receiver.attach(hint);
  let release, entered; const entry = new Promise(r => { entered = r; });
  f.pending(() => new Promise(r => { release = r; entered(); }));
  const work = receiver.notifyRoomWorld(hint); await entry;
  assert.equal(f.stats().alarm, 101000, 'durable backstop precedes the external call');
  assert.deepEqual(await receiver.notifyRoomWorld(hint), { status: 'busy', more: true });
  await assert.rejects(receiver.alarm(), /overlaps active/);
  release(); await work;
  assert.equal((await f.record()).scans, 1); assert.equal(f.stats().bodies, 1);
});

test('receiver bounds uncertain recovery failures durably and cannot be reset by identical attachment', async () => {
  const f = fixture(); let receiver = f.receiver(); await receiver.attach(hint);
  f.pending(async () => { throw Error('lost remote reply'); });
  for (let i = 0; i < 3; i++) { f.at(100000 + i * 1000); await receiver.alarm(); receiver = f.receiver(); }
  assert.equal((await f.record()).status, 'paused'); assert.equal(f.stats().alarm, null);
  await receiver.attach(hint); assert.equal((await f.record()).failures, 3);
  assert.deepEqual(await receiver.notifyRoomWorld(hint), { status: 'stale', more: false });
  assert.equal(f.stats().bodies, 3);
});

test('receiver commits recovery reservation and alarm atomically before any body mutation', async () => {
  const f = fixture(), receiver = f.receiver(); await receiver.attach(hint);
  f.failWrite(true); await assert.rejects(receiver.alarm(), /disk failed/);
  assert.equal((await f.record()).scans, 0); assert.equal(f.stats().bodies, 0); assert.equal(f.stats().alarm, 100000);
  f.failWrite(false); await receiver.alarm();
  assert.equal((await f.record()).scans, 1); assert.equal(f.stats().bodies, 1);
});


test('unchanged scans keep the committed backstop without duplicate writes, but persist changed outcomes', async () => {
  const f = fixture(), receiver = f.receiver(); await receiver.attach(hint);
  let before = f.stats();
  await receiver.alarm();
  assert.equal(f.stats().writes - before.writes, 1);
  assert.equal(f.stats().alarmWrites - before.alarmWrites, 1);
  assert.equal(f.stats().alarm, 101000);
  assert.equal((await f.record()).scans, 1);

  f.at(101000); f.due(101400); before = f.stats();
  await receiver.alarm();
  assert.equal(f.stats().writes - before.writes, 2, 'earlier body deadline must replace the reserved backstop');
  assert.equal(f.stats().alarmWrites - before.alarmWrites, 2);
  assert.equal(f.stats().alarm, 101400);
  assert.equal((await f.record()).nextAt, 101400);

  f.at(101400); f.due(null); f.pending(async () => { throw Error('lost reply'); });
  await receiver.alarm();
  assert.equal((await f.record()).failures, 1, 'failed RPC outcome is persisted');
  f.at(f.stats().alarm); f.pending(null); before = f.stats();
  await receiver.alarm();
  assert.equal(f.stats().writes - before.writes, 2, 'successful recovery durably clears the prior failure');
  assert.equal((await f.record()).failures, 0);
  assert.equal((await f.record()).status, 'running');
});
