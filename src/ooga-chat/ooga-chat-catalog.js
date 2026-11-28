// The island's published character catalog for the 3D view (docs/ooga-chat-hosts.md, "The 3D view"), so each speaker's
// Ooga wears the look the island gives it now rather than the one this build bundled. Asked of the app's own edge once a
// page (`/api/chat/public/characters/catalog`, which passes the island's on), read whole within the catalog's bound,
// checked as the island checks it (character-catalog-schema.js: its canonical JSON and that JSON's digest), and applied
// to the bundled cast against the baseline this build was made from (`BL.oogaChatCharacterBaseline`, written into the
// `live` chunk by scripts/ooga-chat.mjs). Anything wrong, missing or not matching keeps the bundled cast: `apply()`
// never rejects. It runs before the first Ooga is built, so no Ooga changes look while it is shown.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, PATH = "/api/chat/public/characters/catalog", TIMEOUT_MS = 4000;
  let done = null, state = "embedded";
  const read = async () => {
    const schema = BL.characterCatalogSchema, baseline = BL.oogaChatCharacterBaseline;
    if (!schema || !Array.isArray(baseline) || !BL.characters) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(PATH, { credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) { state = response.status === 404 ? "embedded" : "unavailable"; return; }
      const text = await response.text();
      if (text.length > schema.CATALOG_MAX_BYTES + 1024) throw new Error("Character catalog is too large");
      const result = JSON.parse(text);
      if (!result || !/^[a-f0-9]{64}$/.test(result.revision) || !Number.isSafeInteger(result.generation) || result.generation <= 0) throw new Error("Invalid character catalog response");
      const json = schema.canonicalJSON(result.catalog), catalog = schema.parseCatalog(json);
      if (await schema.sha256(json) !== result.revision) throw new Error("Character catalog does not match its revision");
      BL.characters.applyCatalog(catalog, baseline);
      state = "ready";
    } finally { clearTimeout(timer); }
  };
  const apply = () => done ||= read().catch(() => { state = "unavailable"; });
  BL.oogaChatCatalog = { apply, get state() { return state; } };
})();
