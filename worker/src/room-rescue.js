// Private Room observation for rescue commands. Called inside the Room's
// concurrency block, after validating its server ticket. No browser can supply
// session refs or a census. Unsettled body/scene work fails closed.
import '../../src/js/rescue-shared.js';
export async function observeRoomRescue(room, ticket, identity = null) {
  room.checkBodyHandoff(ticket);
  if (identity !== null && (!identity || Object.keys(identity).sort().join(',') !== 'accountId,connection'
    || !Number.isSafeInteger(identity.accountId) || identity.accountId < 1
    || typeof identity.connection !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(identity.connection))) throw Error('rescue connection required');
  const box = room.bodyHandoffController(), rows = await box.records(), tokens = [];
  let ready = true, participant = null;
  for (const row of rows) {
    const p = room.players.get(row.accountId), who = { accountId: row.accountId, connection: row.connection };
    const movement = await box.movement(who, room.ctx.storage, row);
    const current = !!p && p.connectionToken === row.connection && !p.bodyClosing && p.bodyClosedAt == null && !p.bodyQuiescence;
    const live = current && row.phase === 'live' && row.liveSent && !row.pending && !Object.hasOwn(row, 'stopAt');
    if (!live || movement && (!movement.receipt || movement.fenced)) ready = false;
    if (row.ref) tokens.push(row.ref.token);
    if (identity && identity.accountId === row.accountId && identity.connection === row.connection && live
      && !(movement && (!movement.receipt || movement.fenced)) && p.body === row.ref?.bodyId
      && globalThis.BL.rescueShared.zoneId(p.zone)) {
      participant = { ref: { accountId: row.ref.accountId, generation: row.ref.generation, token: row.ref.token },
        bodyId: row.ref.bodyId, zone: p.zone };
    }
  }
  // An authenticated socket not yet represented in the durable handoff cannot
  // authorize a rescue command merely by naming another account's connection.
  if (tokens.length > 64 || new Set(tokens).size !== tokens.length) throw Error('rescue census bounds');
  return { ready, tokens, participant };
}
