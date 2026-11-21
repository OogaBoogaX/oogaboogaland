// The browser and Worker validate exactly the same data-only catalog protocol.
import "../../src/js/character-catalog-schema.js";
export const { CATALOG_MAX_BYTES, canonicalJSON, sha256, sameContext, prefixEvents, parseCatalog, parseActivation, catalogRoster } = globalThis.BL.characterCatalogSchema;
