// Account choices pin an immutable hat version. A missing choice keeps the authored character;
// `none` explicitly removes its hat. Registry updates only offer a choice; they never accept it.
import { equipmentHats } from "./equipment-hats.js";
import { equipmentWardrobe } from "./equipment-wardrobe.js";

const HASH = /^[a-f0-9]{64}$/;
const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const equipmentEnabled = env => env?.EQUIPMENT_ENABLED === "1";
export const equipmentRevision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
export const equipmentSize = value => Number.isInteger(value) && value >= 80 && value <= 120;
export const equipmentFitSize = (character, selection, size) => Math.max(size, equipmentHats.minimumSize(character, selection?.item, selection?.version));

export const equipmentSelection = (value, hats = equipmentHats) => {
  if (value === null) return null;
  if (!exact(value, ["item", "version"]) || typeof value.item !== "string" || value.item.length > 64
    || (value.item === "none" ? value.version !== null : !HASH.test(value.version))) throw new TypeError("Invalid hat selection");
  if (!hats.has(value.item, value.version)) throw new TypeError("Unknown hat version");
  return { item: value.item, version: value.version };
};

// The rest of what a player wears: every other slot's choice (src/js/equipment-wardrobe.js), or null for their own look.
export const equipmentWardrobeOf = (value, wardrobe = equipmentWardrobe) => wardrobe.selection(value === undefined ? null : value);
const storedWardrobe = (text) => {
  if (text === null || text === undefined) return null;
  if (typeof text !== "string" || text.length > 4096) throw new TypeError("Invalid stored wardrobe");
  return equipmentWardrobeOf(JSON.parse(text));
};
export const wardrobeText = (value) => value ? JSON.stringify(value) : null;

export const equipmentRecord = (row, hats = equipmentHats) => {
  if (!row) return { selection: null, size: 100, revision: 0, declined: null, update: null, wardrobe: null };
  const size = row.size === undefined ? 100 : row.size;
  if (!equipmentSize(size) || !equipmentRevision(row.revision) || row.revision === 0 || (row.declined !== null && !HASH.test(row.declined)))
    throw new TypeError("Invalid stored equipment");
  const selection = equipmentSelection(row.item === null ? null : { item: row.item, version: row.version }, hats);
  if ((!selection || selection.item === "none") && row.declined !== null) throw new TypeError("Invalid declined update");
  const current = selection && selection.item !== "none" ? hats.current(selection.item) : null;
  return { selection, size, revision: row.revision, declined: row.declined,
    update: current && current !== selection.version && current !== row.declined ? { item: selection.item, version: current } : null,
    wardrobe: storedWardrobe(row.wardrobe) };
};

export const equipmentCommand = (value, hats = equipmentHats) => {
  if (!plain(value) || !equipmentRevision(value.revision)) throw new TypeError("Invalid equipment revision");
  // A wardrobe rides beside any change of the hat, or alone; older pages never send one, and keep what is worn.
  if (Object.hasOwn(value, "wardrobe")) {
    const { wardrobe, ...rest } = value;
    const wardrobeChoice = equipmentWardrobeOf(wardrobe);
    if (Object.keys(rest).length === 1) return { revision: value.revision, wardrobe: wardrobeChoice };
    const command = equipmentCommand(rest, hats);
    if (Object.hasOwn(command, "decline")) throw new TypeError("Invalid equipment change");
    return { ...command, wardrobe: wardrobeChoice };
  }
  if (Object.hasOwn(value, "size") && !equipmentSize(value.size)) throw new TypeError("Invalid hat size");
  if (exact(value, ["revision", "selection"])) return { revision: value.revision, selection: equipmentSelection(value.selection, hats) };
  if (exact(value, ["revision", "selection", "size"])) return { revision: value.revision, selection: equipmentSelection(value.selection, hats), size: value.size };
  if (exact(value, ["revision", "size"])) return { revision: value.revision, size: value.size };
  if (exact(value, ["revision", "decline"]) && HASH.test(value.decline)) return { revision: value.revision, decline: value.decline };
  throw new TypeError("Invalid equipment change");
};

export const nextEquipment = (current, command, character = null) => {
  if (current.revision !== command.revision) return null;
  if (Object.hasOwn(command, "decline")) {
    if (!current.update || command.decline !== current.update.version) throw Object.assign(new TypeError("That update is no longer offered"), { code: "invalid_update" });
    return { selection: current.selection, size: equipmentFitSize(character, current.selection, current.size), declined: command.decline, wardrobe: current.wardrobe };
  }
  const selection = Object.hasOwn(command, "selection") ? command.selection : current.selection;
  const unchanged = current.selection?.item === selection?.item && current.selection?.version === selection?.version;
  // Missing size is an old client or a creator-version choice, never an implicit reset.
  return { selection, size: equipmentFitSize(character, selection, command.size === undefined ? current.size : command.size), declined: unchanged ? current.declined : null,
    wardrobe: Object.hasOwn(command, "wardrobe") ? command.wardrobe : current.wardrobe };
};
