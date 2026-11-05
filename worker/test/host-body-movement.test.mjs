import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBodyMovementJournal, BODY_MOVEMENT } from '../src/host-body-movement.js';
const row = (accountId, patch = {}) => ({ v: 1, accountId, bodyId: `body-${accountId}`, generation: accountId,
  sequence: 1, digest: 'a'.repeat(64), at: 100000, ...patch });
function fixture() {
  let data = new Map(), executions = 0, fail = false;
  return {
    read: () => structuredClone(data), executions: () => executions, fail: () => { fail = true; },
    corrupt(key, value) { data.set(key, value); },
    async run(command, active) {
      const next = structuredClone(data), tx = { get: async k => structuredClone(next.get(k)),
        put: async (k, v) => { next.set(k, structuredClone(v)); },
        delete: async keys => { for (const k of keys) next.delete(k); if (fail) { fail = false; throw Error('injected prune failure'); } } };
      const result = await createBodyMovementJournal(tx).run(command, active, async () => {
        executions++; await tx.put('body', { at: command.at, generation: command.generation });
      });
      data = next; return result;
    },
  };
}

test('bounded movement receipts survive account turnover without losing ordering or atomic pruning', async t => {
  const f = fixture(), active = Array.from({ length: BODY_MOVEMENT.max }, (_, i) => i + 1);
  for (const id of active) await f.run(row(id), active);
  assert.equal(f.read().size, BODY_MOVEMENT.max + 2);
  const full = f.read();
  await assert.rejects(f.run(row(33), [...active, 33]), /movement/);
  assert.deepEqual(f.read(), full);
  const replacement = [...active.slice(1), 33]; f.fail();
  await assert.rejects(f.run(row(33), replacement), /prune/);
  assert.deepEqual(f.read(), full, 'receipt prune failure rolls back body and index too');
  await f.run(row(33), replacement);
  assert.equal(f.read().has(BODY_MOVEMENT.prefix + 1), false);
  assert.equal(f.read().size, BODY_MOVEMENT.max + 2);
  const before = f.read(), count = f.executions();
  assert.deepEqual(await f.run(row(33, { at: 100500 }), [33]), { sequence: 1, at: 100000 });
  assert.deepEqual(f.read(), before, 'duplicate never changes body, receipt, timestamp or index');
  assert.equal(f.executions(), count);
  await assert.rejects(f.run(row(33, { digest: 'b'.repeat(64) }), replacement), /movement/);
  await f.run(row(33, { sequence: 2 }), replacement);
  await assert.rejects(f.run(row(33), replacement), /movement/);
  await assert.rejects(f.run(row(33, { sequence: 3, bodyId: 'changed' }), replacement), /movement/);
  await f.run(row(33, { generation: 34, bodyId: 'changed' }), replacement);
  await assert.rejects(f.run(row(33, { sequence: 3 }), replacement), /movement/);
  const large = row(Number.MAX_SAFE_INTEGER, { bodyId: 'b'.repeat(64), generation: Number.MAX_SAFE_INTEGER,
    sequence: Number.MAX_SAFE_INTEGER, at: Number.MAX_SAFE_INTEGER });
  const bytes = Buffer.byteLength(JSON.stringify(large));
  assert.ok(bytes < BODY_MOVEMENT.rowBytes);
  await f.run(large, [large.accountId]);
  assert.equal(f.read().size, 3);
  t.diagnostic(JSON.stringify({ maxSchemaReceiptBytes: bytes,
    maxIndexBytes: Buffer.byteLength(JSON.stringify(Array.from({ length: 32 }, (_, i) => Number.MAX_SAFE_INTEGER - i))),
    scope: 'maximum ASCII schema lengths in UTF-8 JSON; storage keys and provider overhead excluded' }));
});

test('corrupt movement index and orphan receipt fail closed before body mutation', async () => {
  for (const index of [[1, 1], [0], Array.from({ length: 33 }, (_, i) => i + 1), {}]) {
    const f = fixture(); f.corrupt(BODY_MOVEMENT.key, index);
    await assert.rejects(f.run(row(1), [1]), /movement/); assert.equal(f.executions(), 0);
  }
  for (const value of [row(2), { ...row(1), v: 2 }, { ...row(1), extra: true }]) {
    const f = fixture(); f.corrupt(BODY_MOVEMENT.key, [1]); f.corrupt(BODY_MOVEMENT.prefix + 1, value);
    await assert.rejects(f.run(row(1, { sequence: 2 }), [1]), /movement/); assert.equal(f.executions(), 0);
  }
  const f = fixture(); f.corrupt(BODY_MOVEMENT.prefix + 1, row(1));
  await assert.rejects(f.run(row(1), [1]), /movement/); assert.equal(f.executions(), 0);
});
