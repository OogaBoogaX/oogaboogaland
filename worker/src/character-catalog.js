// A bounded, environment-scoped authority snapshot. Only admission/revalidation boundaries await read();
// high-frequency room messages use current(). An enabled but unavailable catalog never falls back to old authority.
import CAST_ROWS from "./characters.gen.json" with { type: "json" };
import { CATALOG_MAX_BYTES, canonicalJSON, parseActivation, parseCatalog, prefixEvents, sameContext, sha256 } from "./character-catalog-schema.js";

export const CATALOG_REFRESH_MS = 60000;
export const CATALOG_MAX_STALE_MS = 15 * 60000;
export const CATALOG_TIMEOUT_MS = 4000;
const loaders = new WeakMap();
const fail = () => { throw new Error("Character catalog unavailable"); };
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const owner = (row) => String(row.github_login || row.handle).toLowerCase();
const rowsFor = (catalog, compiled) => {
  const byHandle = new Map(compiled.map((row) => [row.handle.toLowerCase(), row]));
  const entries = new Map(catalog.entries.map((entry) => [entry.identity.handle.toLowerCase(), entry]));
  // Catalog-only updates may not remove a compiled owner or replace compiled executable/custom appearance code.
  for (const row of compiled) {
    const entry = entries.get(row.handle.toLowerCase());
    if (!entry || entry.identity.github.toLowerCase() !== owner(row) || row.has_look_code && entry.kind !== "custom") fail();
  }
  const rows = catalog.entries.map((entry) => {
    if (entry.kind === "custom") {
      const original = byHandle.get(entry.identity.handle.toLowerCase());
      if (!original || owner(original) !== entry.identity.github.toLowerCase()) fail();
      return original;
    }
    const row = entry.row;
    return { handle: row.handle, github_login: row.github || row.handle, display: row.display || null,
      joined_at: new Date(row.joined * 1000).toISOString(), last_commit_at: new Date(row.lastCommit * 1000).toISOString(),
      look: row.look || {}, voice: row.voice || null, has_look_code: false };
  });
  return rows.sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at) || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
};

export const createCatalogLoader = (env, { rows = CAST_ROWS, now = Date.now, timeoutMs = CATALOG_TIMEOUT_MS } = {}) => {
  const enabled = env.CHARACTER_CATALOG_ENABLED === "1";
  const expected = { version: 1, environment: env.ENVIRONMENT, engine: env.CHARACTER_CATALOG_ENGINE, baseline: env.CHARACTER_CATALOG_BASELINE };
  const configured = enabled && env.CHARACTER_CATALOGS && typeof env.CHARACTER_CATALOGS.get === "function"
    && ["staging", "production"].includes(expected.environment) && typeof expected.engine === "string"
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(expected.engine) && /^[a-f0-9]{40}$/.test(expected.baseline);
  const compiled = freeze(JSON.parse(JSON.stringify(rows)));
  const embedded = freeze({ revision: "embedded", generation: 0, baseline: null, engine: null, rows: compiled,
    catalog: null, activation: null, checkedAt: 0 });
  let accepted = null, pending = null, epoch = 0, nextReadAt = 0;
  const current = () => !enabled ? embedded : configured && accepted && now() >= accepted.checkedAt
    && now() - accepted.checkedAt < CATALOG_MAX_STALE_MS ? accepted : null;
  const transition = (activation) => {
    if (!sameContext(activation, expected)) fail();
    if (!accepted) return;
    const before = accepted.activation;
    if (activation.generation < before.generation) fail();
    if (activation.generation === before.generation) {
      if (canonicalJSON(activation) !== canonicalJSON(before)) fail();
    } else if (!prefixEvents(before.events, activation.events) || before.releases.length > activation.releases.length
      || !before.releases.every((revision, i) => revision === activation.releases[i])) fail();
  };
  const validate = async (catalogJSON, activation, checkedAt, restoreExpired = false) => {
    if (!configured || !Number.isFinite(checkedAt) || checkedAt < 0 || checkedAt > now()
      || !restoreExpired && now() - checkedAt >= CATALOG_MAX_STALE_MS) fail();
    transition(activation);
    const catalog = parseCatalog(catalogJSON, now());
    if (!sameContext(catalog, expected) || !prefixEvents(catalog.events, activation.events)
      || await sha256(catalogJSON) !== activation.revision) fail();
    return freeze({ revision: activation.revision, generation: activation.generation, baseline: catalog.baseline,
      engine: catalog.engine, rows: rowsFor(catalog, compiled), catalog, activation, checkedAt });
  };
  const restore = async (saved) => {
    if (!configured || !saved || Object.keys(saved).sort().join(",") !== "activation,catalog,checkedAt") return false;
    try {
      const snapshot = await validate(canonicalJSON(saved.catalog), parseActivation(canonicalJSON(saved.activation)), saved.checkedAt, true);
      // Another admission may have refreshed the environment-scoped loader while the digest was checked.
      transition(snapshot.activation);
      if (accepted && snapshot.checkedAt < accepted.checkedAt) return false;
      accepted = snapshot;
      nextReadAt = snapshot.checkedAt + CATALOG_REFRESH_MS;
      // Keep expired evidence only as a generation high-water mark. It never becomes usable authority again.
      return current() !== null;
    } catch { return false; }
  };
  const saved = () => accepted ? { catalog: accepted.catalog, activation: accepted.activation, checkedAt: accepted.checkedAt } : null;
  const read = async () => {
    if (!enabled) return embedded;
    if (!configured) return null;
    if (pending) {
      if (now() - pending.started < timeoutMs) return pending.promise;
      pending.cancel();
      pending = null;
      nextReadAt = 0;
    }
    if (now() < nextReadAt) return current();
    const token = ++epoch, readers = new Set(), started = now();
    nextReadAt = started + CATALOG_REFRESH_MS;
    const valid = () => { if (epoch !== token) fail(); };
    const cancel = () => {
      if (epoch === token) epoch++;
      for (const reader of readers) reader.cancel().catch(() => {});
    };
    const readObject = async (key) => {
      const object = await env.CHARACTER_CATALOGS.get(key);
      if (epoch !== token) { if (object?.body) object.body.cancel().catch(() => {}); fail(); }
      if (!object?.body || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > CATALOG_MAX_BYTES) {
        if (object?.body) object.body.cancel().catch(() => {});
        fail();
      }
      const reader = object.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
      readers.add(reader);
      let bytes = 0, text = "";
      try {
        while (true) {
          const chunk = await reader.read(); valid();
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array)) fail();
          bytes += chunk.value.byteLength;
          if (bytes > CATALOG_MAX_BYTES || bytes > object.size) fail();
          text += decoder.decode(chunk.value, { stream: true });
        }
        if (bytes !== object.size) fail();
        return text + decoder.decode();
      } catch (error) { reader.cancel().catch(() => {}); throw error; }
      finally { readers.delete(reader); reader.releaseLock(); }
    };
    let timer;
    const work = (async () => {
      const prefix = `catalogs/${expected.baseline}/`;
      const activation = parseActivation(await readObject(prefix + "active.json"));
      transition(activation);
      const catalogJSON = accepted && activation.revision === accepted.revision
        ? canonicalJSON(accepted.catalog) : await readObject(prefix + activation.revision + ".json");
      const snapshot = await validate(catalogJSON, activation, now());
      valid(); transition(snapshot.activation);
      accepted = snapshot;
      return current();
    })();
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { cancel(); reject(new Error("Catalog read timed out")); }, timeoutMs); });
    const promise = Promise.race([work, deadline]).catch(() => current()).finally(() => {
      clearTimeout(timer);
      if (pending?.token === token) pending = null;
    });
    pending = { token, started, promise, cancel };
    return promise;
  };
  return { enabled, read, current, fresh: () => current() !== null, restore, saved };
};

export const catalogFor = (env) => {
  let loader = loaders.get(env);
  if (!loader) { loader = createCatalogLoader(env); loaders.set(env, loader); }
  return loader;
};
