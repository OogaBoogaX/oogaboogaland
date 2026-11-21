import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createSession, upsertPlayerFromGitHub } from "../src/db.js";
import { sha256Hex } from "../src/crypto.js";
import { readEquipment as readStoredEquipment, writeEquipment as writeStoredEquipment } from "../src/equipment-store.js";

// These fixture accounts own their matching handles. Real Room tests supply its catalog-based resolver.
const matchingCharacter = login => login;
export const readEquipment = (db, id, tokenHash = null, characterFor = matchingCharacter) => readStoredEquipment(db, id, tokenHash, characterFor);
export const writeEquipment = (db, id, tokenHash, command, characterFor = matchingCharacter) => writeStoredEquipment(db, id, tokenHash, command, characterFor);

export const equipmentDatabase = () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0001_init.sql", "0012_player_equipment.sql", "0013_player_equipment_size.sql"])
    sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const prepare = (query, args = []) => {
    const execute = method => {
      const values = [], numbered = query.replace(/\?(\d+)/g, (_, n) => { values.push(args[Number(n) - 1]); return "?"; });
      return sql.prepare(numbered)[method](...(values.length ? values : args));
    };
    return { bind: (...values) => prepare(query, values), first: async () => { const row = execute("get"); return row ? { ...row } : null; },
      run: async () => ({ success: true, meta: execute("run") }), execute: () => ({ success: true, meta: execute("run") }) };
  };
  return { sql, prepare, batch: async statements => {
    sql.exec("BEGIN");
    try { const result = statements.map(s => s.execute()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
};
export const equipmentAccount = async (db, id = 1) => {
  const player = await upsertPlayerFromGitHub(db, { id, login: "owner" + id });
  const token = await createSession(db, id, "equipment test");
  return { player, token, session: { token_hash: await sha256Hex(token) } };
};
