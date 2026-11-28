// Hosted builds pause their remaining classic modules here, before contributors captures the cast. Source,
// studio and portable pages keep the embedded cast. A page adopts one complete catalog, never a live model swap.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, ENGINE = "island-character-data-v1", TIMEOUT_MS = 4000;
  let baseline = null, pending = null, started = false, state = Object.freeze({ status: "embedded", revision: null, generation: 0 });
  const configure = (entries) => {
    if (started || baseline) throw new Error("Character catalog baseline is already set");
    baseline = entries;
  };
  const metadata = () => {
    const page = document.documentElement.dataset, params = new URLSearchParams(location.search);
    if (page.workerPage !== "1" || !/^https?:$/.test(location.protocol) || params.has("nosim") || params.get("net") === "0") return null;
    const { characterCatalogBaseline: base, characterCatalogEngine: engine, characterCatalogEnvironment: environment } = page;
    if (!base && !engine && !environment) return null;
    if (!/^[a-f0-9]{40}$/.test(base || "") || engine !== ENGINE || !["staging", "production"].includes(environment) || !baseline) return false;
    return { version: 1, baseline: base, engine, environment };
  };
  const read = async (response) => {
    const limit = BL.characterCatalogSchema.CATALOG_MAX_BYTES + 1024;
    if (!response.body || Number(response.headers.get("content-length")) > limit) throw new Error("Character catalog is too large");
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Character catalog is too large");
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };
  const download = async (context, signal) => {
    const response = await fetch(`/api/characters/catalog?baseline=${context.baseline}&engine=${context.engine}`, {
      credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" }, signal
    });
    if (response.status === 404) return null;
    if (response.status === 409) throw Object.assign(new Error("Character catalog is incompatible"), { incompatible: true });
    if (!response.ok) throw new Error("Character catalog is unavailable");
    const result = await read(response), schema = BL.characterCatalogSchema;
    if (!result || Object.keys(result).sort().join(",") !== "catalog,generation,revision" || !/^[a-f0-9]{64}$/.test(result.revision)
      || !Number.isSafeInteger(result.generation) || result.generation <= 0) throw new Error("Invalid character catalog response");
    const json = schema.canonicalJSON(result.catalog), catalog = schema.parseCatalog(json);
    if (!schema.sameContext(catalog, context) || await schema.sha256(json) !== result.revision) throw new Error("Character catalog does not match this page");
    // Compute before changing the registry: a late digest result after a timeout never changes the embedded cast.
    const joined = new Map(baseline.map((entry) => [entry.path, BL.characters.get(entry.identity.handle).joined]));
    const handles = catalog.entries.map((entry) => ({ handle: entry.identity.handle, joined: entry.row ? entry.row.joined : joined.get(entry.path) }))
      .sort((a, b) => a.joined - b.joined || (a.handle < b.handle ? -1 : 1)).map((entry) => entry.handle);
    const roster = await schema.catalogRoster(context.engine, context.baseline, handles);
    return { catalog, revision: result.revision, generation: result.generation, roster };
  };
  const load = async (context) => {
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([download(context, controller.signal), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Character catalog timed out")); }, TIMEOUT_MS);
      })]);
      if (result) {
        BL.characters.applyCatalog(result.catalog, baseline);
        state = Object.freeze({ status: "ready", revision: result.revision, generation: result.generation, roster: result.roster,
          baseline: context.baseline, engine: context.engine, environment: context.environment });
      }
    } catch (error) {
      state = Object.freeze({ status: error.incompatible ? "incompatible" : "unavailable", revision: null, generation: 0 });
    } finally { clearTimeout(timer); }
  };
  const start = (continueBoot) => {
    if (!started) {
      started = true;
      const context = metadata();
      if (context === false) state = Object.freeze({ status: "incompatible", revision: null, generation: 0 });
      else if (context) pending = load(context);
    }
    // Preserve synchronous evaluation for the single-file page and local tools.
    return pending ? pending.then(continueBoot) : continueBoot();
  };
  BL.characterCatalog = { configure, start, get current() { return state; } };
})();
