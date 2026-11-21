import "../../src/js/equipment-hats.js";
import "../../src/js/equipment-hats.gen.js";
import archives from "./equipment-hat-data.gen.json" with { type: "json" };
export const equipmentHats = globalThis.BL.equipmentHats;
export const equipmentHatArchive = (hash) => typeof hash === "string" && Object.hasOwn(archives, hash) ? archives[hash] : null;
export default equipmentHats;
