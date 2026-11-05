// Server-only replay receipts. The caller authenticates the current live body
// before invoking this journal; receipt and motion commit use one transaction.
import { boundedJSON } from './virtual-host.js';
// Fixed ASCII schema maxima: 268 bytes per row and 545 for 32 safe-integer ids.
export const BODY_MOVEMENT = Object.freeze({ key: 'host-body-movement-v1', prefix: 'host-body-movement-v1:',
  max: 32, indexBytes: 576, rowBytes: 288 });
const fail = () => { throw Error('invalid or fenced body movement'); };
const positive = n => Number.isSafeInteger(n) && n > 0;
const key = id => BODY_MOVEMENT.prefix + id;
function validate(row) {
  boundedJSON(row, BODY_MOVEMENT.rowBytes, 32);
  if (!row || Object.keys(row).sort().join() !== 'accountId,at,bodyId,digest,generation,sequence,v'
    || row.v !== 1 || !positive(row.accountId) || !positive(row.generation) || !positive(row.sequence)
    || typeof row.bodyId !== 'string' || !/^[A-Za-z0-9._:/-]{1,64}$/.test(row.bodyId)
    || typeof row.digest !== 'string' || !/^[0-9a-f]{64}$/.test(row.digest)
    || !Number.isSafeInteger(row.at) || row.at < 0) fail();
  return row;
}
export function createBodyMovementJournal(tx) {
  return { async run(command, activeAccounts, execute) {
    const next = validate(command), ids = await tx.get(BODY_MOVEMENT.key) ?? [];
    if (!Array.isArray(ids) || ids.length > BODY_MOVEMENT.max || ids.some(id => !positive(id))
      || new Set(ids).size !== ids.length || !Array.isArray(activeAccounts)
      || activeAccounts.length > BODY_MOVEMENT.max || activeAccounts.some(id => !positive(id))
      || !activeAccounts.includes(next.accountId)) fail();
    boundedJSON(ids, BODY_MOVEMENT.indexBytes, 33);
    const saved = await tx.get(key(next.accountId));
    if (saved !== undefined) {
      const old = validate(saved);
      if (!ids.includes(next.accountId) || old.accountId !== next.accountId || next.generation < old.generation) fail();
      if (next.generation === old.generation) {
        if (next.bodyId !== old.bodyId || next.sequence < old.sequence) fail();
        if (next.sequence === old.sequence) {
          if (next.digest !== old.digest) fail();
          return { sequence: old.sequence, at: old.at }; // No presence refresh or writes.
        }
      }
    } else if (ids.includes(next.accountId)) fail();
    const retained = ids.filter(id => activeAccounts.includes(id));
    if (!retained.includes(next.accountId)) retained.push(next.accountId);
    if (retained.length > BODY_MOVEMENT.max) fail();
    await execute();
    await tx.put(key(next.accountId), next);
    const removed = ids.filter(id => !retained.includes(id));
    if (removed.length) await tx.delete(removed.map(key));
    if (removed.length || !ids.includes(next.accountId)) await tx.put(BODY_MOVEMENT.key, retained);
    return { sequence: next.sequence, at: next.at };
  } };
}
