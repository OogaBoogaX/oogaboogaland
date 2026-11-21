// Pure character release planning. Nothing here reads a checkout, executes character code, publishes a file,
// or grants an identity. Callers supply an approved production baseline and verified immutable bundle evidence.
import { createHash } from "node:crypto";
import { declaredIdentity } from "./character-identity.mjs";
import { characterPath, parseSafeCharacter, validateCharacterData } from "./character-safety.mjs";

export const CATALOG_VERSION = 1;
export const CATALOG_MAX_CHARACTERS = 128;
export const CATALOG_MAX_EVENTS = 512;
export const CATALOG_MAX_BYTES = 2 * 1024 * 1024;
const REPOSITORY = "OogaBoogaX/oogaboogaland";
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
const reject = (message) => { throw new Error(`Character catalog: ${message}`); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, names) => object(value) && Object.keys(value).length === names.length && names.every((key) => Object.hasOwn(value, key));
const hash = (text) => createHash("sha256").update(text).digest("hex");
const blobOf = (source) => createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest("hex");
const integer = (value) => Number.isSafeInteger(value) && value > 0;

// A single canonical encoding for both hashing and storage. Reject values JSON.stringify would silently lose.
const canonical = (value, depth = 0) => {
  if (depth > 12) reject("data is nested too deeply");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === "string" && value.length <= 32768) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) reject("only plain JSON arrays are allowed");
    const length = Object.getOwnPropertyDescriptor(value, "length").value;
    if (length > CATALOG_MAX_EVENTS + 1) reject("array exceeds its bound");
    const names = Reflect.ownKeys(value);
    if (names.length !== length + 1 || names.some((name) => typeof name !== "string"
      || name !== "length" && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= length))) reject("unsafe array property");
    const items = [];
    for (let i = 0; i < length; i++) {
      const property = Object.getOwnPropertyDescriptor(value, String(i));
      if (!property || !property.enumerable || !Object.hasOwn(property, "value")) reject("unsafe array element");
      items.push(canonical(property.value, depth + 1));
    }
    return `[${items.join(",")}]`;
  }
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject("only plain JSON data is allowed");
  const names = Reflect.ownKeys(value);
  if (names.length > 32) reject("object exceeds its field bound");
  if (names.some((key) => typeof key !== "string")) reject("unsafe JSON property");
  names.sort();
  return `{${names.map((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (["__proto__", "prototype", "constructor"].includes(key) || !property.enumerable || !Object.hasOwn(property, "value")) reject("unsafe JSON property");
    return `${JSON.stringify(key)}:${canonical(property.value, depth + 1)}`;
  }).join(",")}}`;
};
const bounded = (value) => {
  const json = canonical(value) + "\n";
  if (Buffer.byteLength(json) > CATALOG_MAX_BYTES) reject("snapshot exceeds its byte bound");
  return json;
};
const context = (value) => {
  if (value.version !== CATALOG_VERSION || !["staging", "production"].includes(value.environment)
    || typeof value.engine !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.engine)
    || !SHA.test(value.baseline)) reject("invalid version, environment, engine or production baseline");
};
const sameContext = (a, b) => {
  if (["version", "environment", "engine", "baseline"].some((key) => a[key] !== b[key])) reject("environment, engine or baseline mismatch");
};
const identityOf = (row) => ({ handle: row.handle, github: row.github || row.handle });
const identityKey = (identity) => `${identity.handle.toLowerCase()}/${identity.github.toLowerCase()}`;
const eventsOf = (events) => {
  if (!Array.isArray(events) || events.length > CATALOG_MAX_EVENTS) reject("event ledger is full or invalid; approve a new baseline");
  const seen = new Set();
  for (const event of events) {
    if (!exact(event, ["merge", "hash"]) || !SHA.test(event.merge) || !HASH.test(event.hash) || seen.has(event.merge)) reject("invalid or repeated event");
    seen.add(event.merge);
  }
};
const prefixOf = (prefix, list) => prefix.length <= list.length && prefix.every((event, i) => event.merge === list[i].merge && event.hash === list[i].hash);

const validateCatalog = (catalog, now) => {
  if (!exact(catalog, ["version", "environment", "engine", "baseline", "entries", "events"])) reject("invalid snapshot fields");
  context(catalog);
  eventsOf(catalog.events);
  if (!Array.isArray(catalog.entries) || catalog.entries.length > CATALOG_MAX_CHARACTERS) reject("character capacity exceeded");
  const paths = new Set(), identities = new Map();
  for (const entry of catalog.entries) {
    if (!exact(entry, ["path", "kind", "identity", "hash", "blob", "row"]) || !characterPath(entry.path)
      || !["data", "custom"].includes(entry.kind) || !HASH.test(entry.hash) || !SHA.test(entry.blob)
      || !exact(entry.identity, ["handle", "github"])) reject("invalid character entry");
    validateCharacterData({ ...entry.identity, joined: 1, lastCommit: 1 }, now);
    if (paths.has(entry.path.toLowerCase())) reject("duplicate character path");
    paths.add(entry.path.toLowerCase());
    for (const name of new Set(Object.values(entry.identity).map((name) => name.toLowerCase()))) {
      if (identities.has(name)) reject("duplicate character handle or owner");
      identities.set(name, entry.path);
    }
    if (entry.kind === "data") {
      validateCharacterData(entry.row, now);
      if (canonical(identityOf(entry.row)) !== canonical(entry.identity)) reject("character row identity differs from its reservation");
    } else if (entry.row !== null) reject("custom baseline entries reserve identity only");
  }
  if (catalog.entries.some((entry, i) => i && catalog.entries[i - 1].path >= entry.path)) reject("character entries must be sorted by path");
};

export const encodeCatalog = (catalog, { now = Date.now() } = {}) => {
  // Clone after checking the JSON surface, so callers cannot change a checked snapshot behind its digest.
  const json = bounded(catalog), copy = JSON.parse(json);
  validateCatalog(copy, now);
  return { catalog: copy, json, digest: hash(json) };
};

export const readCatalog = (text, options) => {
  if (typeof text !== "string" || Buffer.byteLength(text) > CATALOG_MAX_BYTES) reject("snapshot exceeds its byte bound");
  let parsed;
  try { parsed = JSON.parse(text); } catch { reject("invalid snapshot JSON"); }
  const result = encodeCatalog(parsed, options);
  // This also rejects duplicate JSON keys rather than silently choosing their last value.
  if (text !== result.json) reject("snapshot must use canonical JSON encoding");
  return result;
};

const sourceEntry = ({ path, source, blob, kind }, now) => {
  if (!characterPath(path) || !["data", "custom"].includes(kind) || typeof source !== "string"
    || Buffer.byteLength(source) > (kind === "data" ? 32768 : 1024 * 1024)) reject("invalid source entry");
  if (!SHA.test(blob) || blobOf(source) !== blob) reject("source Git blob mismatch");
  const row = kind === "data" ? parseSafeCharacter(source, now) : null;
  const identity = identityOf(row || declaredIdentity(source));
  return { path, kind, identity, hash: hash(source), blob, row };
};

// Custom files are explicit trusted baseline reservations, not a fallback for a rejected automatic submission.
export const seedCatalog = ({ environment, engine, baseline, sources, now = Date.now() }) => {
  if (!Array.isArray(sources) || sources.length > CATALOG_MAX_CHARACTERS) reject("invalid baseline sources");
  const entries = sources.map((source) => sourceEntry(source, now)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ...encodeCatalog({ version: CATALOG_VERSION, environment, engine, baseline, entries, events: [] }, { now }), noop: false };
};

export const validateActivation = (activation) => {
  // The activation ledger outlives rollback. Never derive it from the restored catalog's older event history.
  bounded(activation);
  if (!exact(activation, ["version", "environment", "engine", "baseline", "generation", "revision", "previous", "events", "releases"])) reject("invalid activation fields");
  context(activation);
  eventsOf(activation.events);
  if (!integer(activation.generation) || !HASH.test(activation.revision) || activation.previous !== null && !HASH.test(activation.previous)
    || !Array.isArray(activation.releases) || !activation.releases.length || activation.releases.length > CATALOG_MAX_EVENTS + 1
    || activation.releases.some((revision) => !HASH.test(revision)) || new Set(activation.releases).size !== activation.releases.length
    || !activation.releases.includes(activation.revision)
    || activation.previous !== null && !activation.releases.includes(activation.previous)) reject("invalid activation history");
};

// Planning requires a server-side validated bundle proof, never a user-provided JSON claim of verification.
// The companion source verifier establishes this proof from immutable GitHub objects without executing them.
export const planCatalog = (previous, bundle, { environment, engine, activation, now = Date.now() }) => {
  const current = encodeCatalog(previous, { now });
  validateActivation(activation);
  sameContext(previous, activation);
  if (environment !== previous.environment || engine !== previous.engine || activation.revision !== current.digest) reject("planner context does not match the active catalog");
  if (!prefixOf(previous.events, activation.events)) reject("catalog event history differs from activation");
  if (!object(bundle) || bundle.repository !== REPOSITORY || bundle.lane !== "daily" || !integer(bundle.pr)
    || !SHA.test(bundle.merge) || !SHA.test(bundle.head) || !Array.isArray(bundle.entries)
    || !bundle.entries.length || bundle.entries.length > CATALOG_MAX_CHARACTERS) reject("invalid verified daily bundle");
  const paths = new Set();
  const changes = bundle.entries.map((entry) => {
    if (entry.lane !== "daily" || !SHA.test(entry.head) || entry.base !== null && !SHA.test(entry.base)
      || typeof entry.author !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(entry.author) || entry.author.includes("--")
      || entry.pr !== null && !integer(entry.pr) || !HASH.test(entry.hash)) reject("invalid daily entry provenance");
    const next = sourceEntry({ ...entry, kind: "data" }, now);
    if (next.hash !== entry.hash) reject("source digest mismatch");
    if (paths.has(next.path.toLowerCase())) reject("duplicate bundle path");
    paths.add(next.path.toLowerCase());
    return { entry, next };
  }).sort((a, b) => a.next.path < b.next.path ? -1 : a.next.path > b.next.path ? 1 : 0);
  const event = { merge: bundle.merge, hash: hash(canonical({ repository: bundle.repository, pr: bundle.pr, head: bundle.head,
    entries: changes.map(({ entry, next }) => ({ path: next.path, base: entry.base, hash: next.hash, blob: next.blob, pr: entry.pr, head: entry.head, author: entry.author })) })) };
  const consumed = activation.events.find((item) => item.merge === event.merge);
  if (consumed) {
    if (consumed.hash !== event.hash) reject("consumed bundle evidence changed");
    return { ...current, noop: true };
  }
  if (activation.events.length === CATALOG_MAX_EVENTS) reject("event ledger is full; approve a new baseline");
  const entries = new Map(current.catalog.entries.map((entry) => [entry.path, entry]));
  for (const { entry, next } of changes) {
    const before = entries.get(next.path);
    if ((before?.blob || null) !== entry.base) reject("character base changed since the published revision");
    if (before && (before.kind !== "data" || identityKey(before.identity) !== identityKey(next.identity))) reject("custom character or identity changes need a manual release");
    entries.set(next.path, next);
  }
  const catalog = { ...current.catalog, entries: [...entries.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    events: [...activation.events, event] };
  return { ...encodeCatalog(catalog, { now }), noop: false };
};

// The future publisher must atomically compare-and-swap the stored manifest using expectedGeneration; this
// pure function is the precondition check, not an R2 write or a substitute for conditional storage semantics.
export const activateCatalog = (previous, catalog, { expectedGeneration, rollback = false, now = Date.now() }) => {
  const next = encodeCatalog(catalog, { now });
  let events = catalog.events, releases = [next.digest];
  if (previous !== null) {
    validateActivation(previous);
    sameContext(previous, catalog);
    if (expectedGeneration !== previous.generation) reject("stale activation generation");
    if (next.digest === previous.revision) {
      if (!prefixOf(catalog.events, previous.events)) reject("catalog event history differs from activation");
      return JSON.parse(bounded(previous));
    }
    if (rollback) {
      if (!previous.releases.includes(next.digest) || !prefixOf(catalog.events, previous.events)) reject("rollback target was not a previously accepted release");
      events = previous.events;
    } else if (!prefixOf(previous.events, catalog.events) || catalog.events.length !== previous.events.length + 1) reject("publication event history does not follow activation");
    releases = previous.releases.includes(next.digest) ? previous.releases : [...previous.releases, next.digest];
  } else if (expectedGeneration !== 0 || rollback || catalog.events.length) reject("initial activation requires a fresh approved baseline");
  const activation = { version: CATALOG_VERSION, environment: catalog.environment, engine: catalog.engine, baseline: catalog.baseline,
    generation: (previous?.generation || 0) + 1, revision: next.digest, previous: previous?.revision || null, events, releases };
  validateActivation(activation);
  return JSON.parse(bounded(activation));
};
