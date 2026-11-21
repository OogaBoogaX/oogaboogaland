// Only explicit saves and admission/wake/sweep read D1. Pose traffic never does. The promise
// queue orders HTTP saves; revision checks also guard reads finishing after a newer write.
import { equipmentCommand, equipmentEnabled, equipmentFitSize, equipmentRecord } from "./equipment-model.js";
import { readEquipment, writeEquipment } from "./equipment-store.js";

const queue = (room, step) => {
  if ((room.equipmentPending || 0) >= 64) return Promise.reject(new Error("Equipment queue full"));
  room.equipmentPending = (room.equipmentPending || 0) + 1;
  const operation = (room.equipmentQueue || Promise.resolve()).then(step);
  room.equipmentQueue = operation.catch(() => {});
  return operation.finally(() => { room.equipmentPending--; });
};
const row = p => ({ id: p.id, revision: p.equipment.revision, selection: p.equipment.selection, size: p.equipment.size });
const own = (room, p) => { if (p.equipment) room.send(p.ws, { t: "equipment", ...row(p), equipment: p.equipment }); };
const publish = (room, p) => {
  if (!p.equipment || !p.equipmentReady) return;
  const message = { t: "equipment", ...row(p) };
  for (const other of room.players.values()) if (other !== p && room.equipmentVisible(other.zone, p.zone)) room.send(other.ws, message);
  own(room, p);
};
const apply = (room, p, record, tell = true) => {
  if (room.players.get(p.id) !== p || !record || (p.equipment && record.revision < p.equipment.revision)) return;
  const changed = JSON.stringify(p.equipment) !== JSON.stringify(record);
  p.equipment = record;
  if (changed) {
    p.ws.serializeAttachment(room.attachment(p));
    if (tell) publish(room, p);
  }
  return changed;
};

export const equipmentRoom = {
  enabled: equipmentEnabled,
  saved(room, value, login, id) {
    if (!equipmentEnabled(room.env) || !value) return null;
    try {
      if (value.revision === 0 && value.selection === null && value.declined === null && (value.size === undefined || value.size === 100)) return equipmentRecord(null);
      const record = equipmentRecord({ item: value.selection?.item ?? null, version: value.selection?.version ?? null,
        size: value.size, revision: value.revision, declined: value.declined });
      // The apple helmet is the only restricted fit. Pins safe even for that wearer do not
      // need catalog authority while a hibernated Room is still restoring its index.
      if (equipmentFitSize("w-s-bitcoin", record.selection, record.size) === record.size) return record;
      // Never expose an unsafe legacy attachment if its authoritative D1 refresh fails.
      return equipmentFitSize(room.equipmentCharacter(login, id), record.selection, record.size) === record.size ? record : null;
    } catch { return null; }
  },
  async request(room, id, tokenHash, change) {
    if (!equipmentEnabled(room.env)) return { status: 404, error: "not found" };
    if (!Number.isSafeInteger(id) || id <= 0 || typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(tokenHash))
      return { status: 401, error: "unauthenticated" };
    let command = null;
    try { if (change !== null) command = equipmentCommand(change); } catch { return { status: 400, error: "invalid equipment" }; }
    return queue(room, async () => {
      let answer;
      try {
        if (room.catalog?.enabled) { await room.catalog.refresh(room.ctx.storage); room.catalogChanged(); }
        const characterFor = (login, id) => room.equipmentCharacter(login, id);
        if (command) answer = await writeEquipment(room.env.DB, id, tokenHash, command, characterFor);
        else { const equipment = await readEquipment(room.env.DB, id, tokenHash, characterFor); answer = equipment ? { status: 200, equipment } : { status: 401, error: "unauthenticated" }; }
      } catch (error) {
        if (error.code === "invalid_update") return { status: 400, error: "invalid update" };
        throw error;
      }
      const p = room.players.get(id);
      if (p && answer.equipment) {
        // A hosted Studio can use a different session from the game. Check that the game's
        // original session survived account deletion before applying the recreated account's row.
        if (p.equipmentSession !== tokenHash) await equipmentRoom.refresh(room, p);
        else {
          const changed = apply(room, p, answer.equipment);
          if (!changed && p.equipmentReady) own(room, p);
        }
      }
      return answer;
    });
  },
  async refresh(room, p, tell = true) {
    if (!equipmentEnabled(room.env)) return;
    const session = p.equipmentSession;
    const record = typeof session === "string" && /^[a-f0-9]{64}$/.test(session)
      ? await readEquipment(room.env.DB, p.id, session, (login, id) => room.equipmentCharacter(login, id)) : null;
    if (!record) {
      if (room.players.get(p.id) === p) room.evict(p, "revoked");
      return false;
    }
    apply(room, p, record, tell);
    return true;
  },
  async refreshAll(room, notify = false) {
    if (!equipmentEnabled(room.env)) return;
    if (room.catalog?.current() === null) return;
    for (const p of [...room.players.values()]) {
      try { await equipmentRoom.refresh(room, p); }
      catch (error) { if (error.code === "catalog_unavailable") return; throw error; }
      if (notify && room.players.get(p.id) === p && p.equipmentReady) own(room, p);
    }
  },
  welcome(room, p) {
    if (!equipmentEnabled(room.env)) return;
    p.equipmentReady = true;
    equipmentRoom.snapshot(room, p);
  },
  snapshot(room, p) {
    if (!equipmentEnabled(room.env)) return;
    const rows = [];
    for (const other of room.players.values()) if (other !== p && other.equipment && room.equipmentVisible(other.zone, p.zone)) rows.push(row(other));
    room.send(p.ws, { t: "equipment", kind: "snapshot", rows });
    own(room, p);
  },
  moved(room, p, from) {
    if (!equipmentEnabled(room.env)) return;
    for (const other of room.players.values()) if (other !== p) {
      const before = room.equipmentVisible(other.zone, from), after = room.equipmentVisible(other.zone, p.zone);
      if (before && !after) room.send(other.ws, { t: "equipment", kind: "remove", ids: [p.id] });
      else if (!before && after && p.equipment) room.send(other.ws, { t: "equipment", ...row(p) });
    }
    equipmentRoom.snapshot(room, p);
  },
  changed(room, p) { if (equipmentEnabled(room.env)) publish(room, p); },
  left(room, p) {
    if (!equipmentEnabled(room.env)) return;
    for (const other of room.players.values()) if (other !== p && room.equipmentVisible(other.zone, p.zone))
      room.send(other.ws, { t: "equipment", kind: "remove", ids: [p.id] });
  },
};
