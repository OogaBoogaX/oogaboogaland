// The Room supplies an authenticated, canonical character handle. Raw browser
// names, aliases and numeric IDs alone cannot authorize an NPC/body mapping.
import { hubCharacters } from './ooga-crew.js';
import { hubNpcId } from './hub-world-projection.js';

export function hubNpcFor(bodyId, source) {
  if (!source || !Number.isSafeInteger(source.accountId) || source.accountId < 1
    || bodyId !== `player:${source.accountId}` || source.bodyId !== bodyId
    || !['ooga', 'clanker'].includes(source.kind) || typeof source.handle !== 'string') return null;
  const character = hubCharacters.get(source.handle);
  if (!character || character.handle.toLowerCase() !== source.handle.toLowerCase()) return null;
  const { accountForId, accountForHandle } = globalThis.BL.accountIdentities;
  const pinned = accountForId(source.accountId), owner = accountForHandle(character.handle);
  if (pinned && pinned.handle.toLowerCase() !== character.handle.toLowerCase()
    || owner && owner.id !== source.accountId) return null;
  return hubNpcId(source.kind, character.handle);
}
