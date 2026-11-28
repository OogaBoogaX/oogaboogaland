// D1 remains authoritative across room restarts. Every write checks the authenticated session
// in the same statement as its revision CAS, so a removed account/session cannot be resurrected.
import { equipmentFitSize, equipmentRecord, nextEquipment, wardrobeText } from "./equipment-model.js";

const rowOf = row => row && row.revision !== null ? row : null;
const loadEquipment = async (db, id, tokenHash, characterFor) => {
  if (typeof characterFor !== "function") throw new TypeError("Equipment ownership authority required");
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare(`SELECT p.login, e.item, e.version, e.size, e.revision, e.declined, e.wardrobe
    FROM players p LEFT JOIN player_equipment e ON e.player_id = p.id
    WHERE p.id = ?1 AND p.banned_at IS NULL
      AND (?2 IS NULL OR EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = p.id AND s.token_hash = ?2 AND s.expires_at > ?3))`)
    .bind(id, tokenHash, Math.floor(Date.now() / 1000)).first();
    if (!row) return null;
    const record = equipmentRecord(rowOf(row)), character = characterFor(row.login, id);
    const size = equipmentFitSize(character, record.selection, record.size);
    if (size === record.size) return { record, character, login: row.login };
    if (record.revision >= Number.MAX_SAFE_INTEGER - 1) throw new Error("Equipment revision exhausted");
    // A legacy fit is corrected durably before any reply or broadcast. A racing save wins its
    // own revision; re-read rather than applying this correction to a different pin or account.
    const repaired = await db.prepare(`UPDATE player_equipment SET size = ?1, revision = revision + 1, updated_at = ?2
      WHERE player_id = ?3 AND revision = ?4 AND size = ?5
        AND EXISTS (SELECT 1 FROM players p WHERE p.id = ?3 AND p.login = ?6 AND p.banned_at IS NULL
          AND (?7 IS NULL OR EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = p.id AND s.token_hash = ?7 AND s.expires_at > ?2)))
      RETURNING item, version, size, revision, declined, wardrobe`)
      .bind(size, Math.floor(Date.now() / 1000), id, record.revision, record.size, row.login, tokenHash).first();
    if (repaired) return { record: equipmentRecord(repaired), character, login: row.login };
  }
  throw new Error("Equipment changed during fit correction");
};

export const readEquipment = async (db, id, tokenHash = null, characterFor) => (await loadEquipment(db, id, tokenHash, characterFor))?.record || null;

export const writeEquipment = async (db, id, tokenHash, command, characterFor) => {
  const loaded = await loadEquipment(db, id, tokenHash, characterFor);
  if (!loaded) return { status: 401, error: "unauthenticated" };
  const current = loaded.record;
  let next;
  try { next = nextEquipment(current, command, loaded.character); }
  catch (error) {
    if (error.code === "invalid_update") return { status: 409, error: "conflict", equipment: current };
    throw error;
  }
  if (!next) return { status: 409, error: "conflict", equipment: current };
  const row = await db.prepare(`INSERT INTO player_equipment (player_id, item, version, revision, declined, updated_at, size, wardrobe)
    SELECT ?1, ?2, ?3, ?4 + 1, ?5, ?6, ?8, ?10 FROM players p
    WHERE p.id = ?1 AND p.login = ?9 AND p.banned_at IS NULL
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = p.id AND s.token_hash = ?7 AND s.expires_at > ?6)
      AND (?4 = 0 OR EXISTS (SELECT 1 FROM player_equipment e WHERE e.player_id = p.id AND e.revision = ?4))
    ON CONFLICT(player_id) DO UPDATE SET item = excluded.item, version = excluded.version,
      size = excluded.size, revision = player_equipment.revision + 1, declined = excluded.declined, updated_at = excluded.updated_at,
      wardrobe = excluded.wardrobe
    WHERE player_equipment.revision = ?4
    RETURNING item, version, size, revision, declined, wardrobe`)
    .bind(id, next.selection?.item ?? null, next.selection?.version ?? null, command.revision, next.declined,
      Math.floor(Date.now() / 1000), tokenHash, next.size, loaded.login, wardrobeText(next.wardrobe)).first();
  if (row) return { status: 200, equipment: equipmentRecord(row) };
  const latest = await readEquipment(db, id, tokenHash, characterFor);
  return latest ? { status: 409, error: "conflict", equipment: latest } : { status: 401, error: "unauthenticated" };
};
