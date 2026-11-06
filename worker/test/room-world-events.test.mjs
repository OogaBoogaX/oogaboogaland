import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomWorldNotifier, dispatchRoomWorldHint, validateRoomWorldHint } from '../src/room-world-events.js';
const hint = { v: 1, room: 'island', world: 'world-1', epoch: 1, revision: 2, owner: 'host-a', runUntil: 200000 };
function fixture(send) {
  let now = 100000, current = hint, serial = 0; const timers = new Map(), held = [], sent = [];
  const notifier = createRoomWorldNotifier({ current: () => current, clock: () => now,
    send: async value => { sent.push({ at: now, value }); return send(value); }, hold: p => held.push(p),
    schedule: (callback, delay) => { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; }, cancel: id => timers.delete(id) });
  return { notifier, timers, sent, at: value => { now = value; }, current: value => { current = value; },
    fire() { const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; now = Math.max(now, timer.at); timers.delete(id); timer.callback(); },
    async settle() { await Promise.all(held.splice(0)); } };
}

test('Room wake hints coalesce without a command queue, respect 250ms spacing and stop bounded followups', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); let calls = 0;
  const f = fixture(() => ++calls === 1 ? pending : { status: 'handled', more: true });
  for (let i = 0; i < 100; i++) f.notifier.notify();
  assert.equal(f.timers.size, 1); f.fire(); assert.equal(f.sent.length, 1);
  for (let i = 0; i < 100; i++) f.notifier.notify();
  assert.equal(f.timers.size, 0); assert.equal(f.notifier.state().active, true);
  release({ status: 'handled', more: true }); await f.settle();
  f.fire(); await f.settle(); f.fire(); await f.settle();
  assert.deepEqual(f.sent.map(row => row.at), [100000, 100250, 100500]);
  assert.ok(f.sent.every(row => JSON.stringify(row.value) === JSON.stringify(hint)));
  assert.equal(f.timers.size, 0); assert.equal(f.notifier.state().pending, true, 'remaining durable work requires another explicit event');
  f.notifier.dispose(); assert.equal(f.notifier.notify(), false);
});

test('Room wake hints do not retry uncertain failures, stop after three failures and reject expired authority', async () => {
  const f = fixture(() => { throw Error('uncertain RPC'); });
  for (let i = 0; i < 3; i++) {
    assert.equal(f.notifier.notify(), true); f.fire(); await f.settle(); assert.equal(f.timers.size, 0);
  }
  assert.equal(f.notifier.notify(), false); assert.equal(f.sent.length, 3); assert.equal(f.notifier.state().error, 'uncertain RPC');
  for (const value of [null, { ...hint, runUntil: 100000 }, { ...hint, runUntil: 1000001 }, { ...hint, accountId: 123 }]) {
    const expired = fixture(() => { throw Error('must not send'); }); expired.current(value);
    expired.notifier.notify(); expired.fire(); await expired.settle(); assert.equal(expired.sent.length, 0); assert.equal(expired.timers.size, 0);
  }
  const canceled = fixture(() => ({ status: 'handled', more: false })); canceled.notifier.notify(); canceled.notifier.dispose();
  assert.equal(canceled.timers.size, 0);
  assert.throws(() => validateRoomWorldHint({ ...hint, room: 'client-chosen-room' }), /invalid/);
});

test('Room wake receiver fences authority and reads bounded current identities instead of trusting the hint', async () => {
  const host = { world: hint.world, fence: hint.epoch, owner: hint.owner }, roomTicket = { world: hint.world, epoch: hint.epoch, owner: hint.owner, revision: hint.revision };
  let bodyCalls = 0, identities = [{ accountId: 1, connection: 'current' }], more = false; const admits = [];
  const runner = { state: () => ({ until: hint.runUntil }), bodies: async () => { bodyCalls++; return { status: 'reconciled' }; },
    admit: async (identity, kind) => { admits.push([identity, kind]); return { status: 'staged' }; } };
  const room = { bodyAdmissionCandidates: async ticket => { assert.deepEqual(ticket, roomTicket); return { identities, more }; } };
  assert.deepEqual(await dispatchRoomWorldHint(runner, room, host, roomTicket, { ...hint, epoch: 2 }), { status: 'stale', more: false });
  assert.equal(bodyCalls, 0);
  assert.deepEqual(await dispatchRoomWorldHint(runner, room, host, roomTicket, hint), { status: 'handled', more: false });
  assert.deepEqual(admits, [[{ accountId: 1, connection: 'current' }, 'ooga']]);
  identities = [identities[0], identities[0]];
  await assert.rejects(dispatchRoomWorldHint(runner, room, host, roomTicket, hint), /inventory/);
  assert.equal(admits.length, 1, 'validate the complete bounded inventory before staging');
  runner.bodies = async () => ({ status: 'pending' });
  assert.deepEqual(await dispatchRoomWorldHint(runner, room, host, roomTicket, hint), { status: 'busy', more: true });
});
