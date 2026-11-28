// A manual code release pauses automatic character publishing, fences the old active pointer, and changes
// the release context only after the new runtime has been verified. No timeout silently steals this barrier.
import { createHash } from "node:crypto";
import { encodeCatalog, readCatalog, validateActivation } from "./character-catalog.mjs";
import { CatalogConflict, loadCatalogState, seedFromApprovedBaseline } from "./character-catalog-publish.mjs";
import { canonicalJSON, prefixEvents } from "../worker/src/character-catalog-schema.js";

const KEY = "release.json", MAX = 2 * 1024 * 1024;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const equalContext = (a, b) => ["environment", "baseline", "engine"].every((key) => a[key] === b[key]);
const contextOK = (v) => exact(v, ["environment", "baseline", "engine"]) && ["staging", "production"].includes(v.environment)
  && /^[a-f0-9]{40}$/.test(v.baseline) && typeof v.engine === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(v.engine);
const etagOK = (v) => typeof v === "string" && /^"[A-Za-z0-9-]{1,128}"$/.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const fail = (message) => { throw new Error(`Catalog handoff: ${message}`); };
const freeze = (v) => { if (v && typeof v === "object") { for (const item of Object.values(v)) freeze(item); Object.freeze(v); } return v; };
const validate = (state, environment) => {
  if (!exact(state, ["version", "environment", "generation", "context", "pending"]) || state.version !== 1
    || !["staging", "production"].includes(environment) || state.environment !== environment || !positive(state.generation)
    || !contextOK(state.context) || state.context.environment !== environment) fail("invalid release state");
  const p = state.pending;
  if (p !== null && (!exact(p, ["token", "from", "to", "sourceETag", "sourceRevision", "sourceGeneration", "fenceHash", "fenced"])
    || !/^[a-f0-9]{32}$/.test(p.token) || !contextOK(p.from) || !contextOK(p.to) || !equalContext(p.from, state.context)
    || p.to.environment !== environment || p.to.baseline === p.from.baseline || !etagOK(p.sourceETag)
    || !/^[a-f0-9]{64}$/.test(p.sourceRevision) || !positive(p.sourceGeneration) || !/^[a-f0-9]{64}$/.test(p.fenceHash)
    || typeof p.fenced !== "boolean")) fail("invalid pending handoff");
  return state;
};
const decode = (object, environment) => {
  if (!object || !(object.bytes instanceof Uint8Array) || object.bytes.byteLength > MAX || !etagOK(object.etag)) fail("invalid release object");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(object.bytes), state = validate(JSON.parse(text), environment);
  if (canonicalJSON(state) !== text) fail("release state must use canonical JSON");
  return { state: freeze(state), etag: object.etag };
};
export const readReleaseState = async (store, environment) => {
  if (!["staging", "production"].includes(environment)) fail("explicit environment required");
  const object = await store.get(KEY);
  return object ? decode(object, environment) : null;
};
const write = async (store, state, expectedETag) => {
  validate(state, state.environment);
  const text = canonicalJSON(state);
  let error = null;
  try { await store.put(KEY, new TextEncoder().encode(text), { ...(expectedETag === null ? { ifNoneMatch: "*" } : { ifMatch: expectedETag }), contentType: "application/json" }); }
  catch (caught) { error = caught; }
  const actual = await readReleaseState(store, state.environment);
  if (!actual || canonicalJSON(actual.state) !== text) {
    if (!actual && error) throw error;
    throw new CatalogConflict("Release state changed; the handoff remains held");
  }
  return actual;
};

export const initializeRelease = async ({ store, context, now = Date.now() }) => {
  if (!contextOK(context)) fail("invalid initial context");
  const active = await loadCatalogState(store, context, { now });
  if (!active.catalog) fail("publish and verify the approved baseline before initializing its release context");
  const existing = await readReleaseState(store, context.environment);
  if (existing) {
    if (existing.state.pending || !equalContext(existing.state.context, context)) throw new CatalogConflict("Release context is already initialized differently");
    return existing;
  }
  return write(store, { version: 1, environment: context.environment, generation: 1, context, pending: null }, null);
};

export const checkPreservation = (previous, next) => {
  if (previous.environment !== next.environment) fail("handoff crosses environments");
  const paths = new Map(next.entries.map((entry) => [entry.path, entry]));
  for (const entry of previous.entries) {
    const candidate = paths.get(entry.path);
    if (!candidate || ["handle", "github"].some((key) => candidate.identity[key].toLowerCase() !== entry.identity[key].toLowerCase())) fail("handoff removes or reassigns an existing character");
    // A manually reviewed custom source may change; plain data already live must survive byte for byte.
    if (entry.kind === "data" && (candidate.kind !== "data" || candidate.blob !== entry.blob || candidate.hash !== entry.hash)) fail("handoff regresses or changes a published plain-data character");
  }
  return true;
};

// An earlier accepted addition can be absent because it was deliberately rolled back.
// Seeding a new code baseline must not silently revive it, even after later daily updates.
export const checkHandoffPreservation = async (store, source, next, { now = Date.now() } = {}) => {
  checkPreservation(source.catalog, next);
  const active = new Set(source.catalog.entries.map((entry) => entry.path));
  const additions = next.entries.filter((entry) => !active.has(entry.path));
  if (!additions.length) return true;
  const paths = new Set(additions.map((entry) => entry.path)), handles = new Set(additions.map((entry) => entry.identity.handle.toLowerCase()));
  const owners = new Set(additions.map((entry) => entry.identity.github.toLowerCase()));
  validateActivation(source.activation);
  // releases is validated and bounded at 513. Reads are sequential and only one catalog is retained.
  for (const revision of source.activation.releases) {
    if (revision === source.revision) continue;
    const object = await store.get(`catalogs/${source.catalog.baseline}/${revision}.json`);
    if (!object || !(object.bytes instanceof Uint8Array) || object.bytes.byteLength > MAX) fail("accepted historical catalog is missing");
    const encoded = readCatalog(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes), { now });
    if (encoded.digest !== revision || !equalContext(encoded.catalog, source.catalog) || !prefixEvents(encoded.catalog.events, source.activation.events)) fail("accepted historical catalog differs from its activation");
    if (encoded.catalog.entries.some((entry) => !active.has(entry.path) && (paths.has(entry.path)
      || handles.has(entry.identity.handle.toLowerCase()) || owners.has(entry.identity.github.toLowerCase()))))
      fail("handoff reintroduces a rolled-back character; explicitly reconcile the target before deploying");
  }
  return true;
};

export const prepareHandoff = async ({ gh, store, currentContext, nextContext, now = Date.now() }) => {
  if (!contextOK(currentContext) || !contextOK(nextContext) || currentContext.environment !== nextContext.environment
    || currentContext.baseline === nextContext.baseline) fail("a handoff requires a distinct approved baseline in the same environment");
  const release = await readReleaseState(store, currentContext.environment);
  if (!release || release.state.pending || !equalContext(release.state.context, currentContext)) throw new CatalogConflict("Release context is missing, changed or already held");
  const source = await loadCatalogState(store, currentContext, { now });
  if (!source.catalog) fail("current baseline is missing");
  const encoded = await seedFromApprovedBaseline(gh, nextContext, { now });
  await checkHandoffPreservation(store, source, encoded.catalog, { now });
  return { ...encoded, context: nextContext, source: { context: currentContext, etag: source.etag,
    revision: source.revision, generation: source.activation.generation } };
};

// Fencing is a deliberate activation-generation increment with unchanged content and event history.
// It changes the ETag so every pre-barrier publisher's pending conditional pointer write must fail.
const fenceActivation = (current) => {
  const fence = { ...current.activation, generation: current.activation.generation + 1, previous: current.revision };
  validateActivation(fence);
  return fence;
};

export const beginHandoff = async ({ store, environment, expectedETag, prepared, token, now = Date.now() }) => {
  if (!/^[a-f0-9]{32}$/.test(token || "")) fail("explicit handoff token required");
  const release = await readReleaseState(store, environment);
  if (!release || release.etag !== expectedETag || release.state.pending) throw new CatalogConflict("Release changed or is already held");
  const from = prepared?.source?.context, to = prepared?.context;
  if (!contextOK(from) || !contextOK(to) || !equalContext(from, release.state.context) || to.environment !== environment || to.baseline === from.baseline) fail("prepared handoff context mismatch");
  const encoded = encodeCatalog(prepared.catalog, { now });
  if (encoded.digest !== prepared.digest || !equalContext(encoded.catalog, to)) fail("prepared target bytes changed");
  const source = await loadCatalogState(store, from, { now });
  if (!source.catalog || source.etag !== prepared.source.etag || source.revision !== prepared.source.revision
    || source.activation.generation !== prepared.source.generation) throw new CatalogConflict("Publication advanced while preparing the handoff");
  await checkHandoffPreservation(store, source, encoded.catalog, { now });
  const pending = { token, from, to, sourceETag: source.etag, sourceRevision: source.revision, sourceGeneration: source.activation.generation,
    fenceHash: hash(canonicalJSON(fenceActivation(source))), fenced: false };
  const held = await write(store, { ...release.state, generation: release.state.generation + 1, pending }, expectedETag);
  return resumeHandoff({ store, environment, expectedETag: held.etag, token, now });
};

export const resumeHandoff = async ({ store, environment, expectedETag, token, now = Date.now() }) => {
  const release = await readReleaseState(store, environment), p = release?.state.pending;
  if (!release || release.etag !== expectedETag || !p || p.token !== token) throw new CatalogConflict("Pending handoff changed");
  let source = await loadCatalogState(store, p.from, { now });
  if (!source.catalog) fail("source catalog is missing; keep the handoff held");
  if (!p.fenced && hash(canonicalJSON(source.activation)) !== p.fenceHash) {
    if (source.etag !== p.sourceETag || source.revision !== p.sourceRevision || source.activation.generation !== p.sourceGeneration)
      throw new CatalogConflict("Publication won the fence race; reconcile the held handoff before deploying");
    const fence = canonicalJSON(fenceActivation(source));
    if (hash(fence) !== p.fenceHash) fail("fence evidence differs from the pending handoff");
    try { await store.put(`catalogs/${p.from.baseline}/active.json`, new TextEncoder().encode(fence), { ifMatch: p.sourceETag, contentType: "application/json" }); }
    catch { /* Re-read below: the conditional write may have committed despite its missing acknowledgment. */ }
    source = await loadCatalogState(store, p.from, { now });
  }
  if (!source.activation || hash(canonicalJSON(source.activation)) !== p.fenceHash || source.revision !== p.sourceRevision
    || p.fenced && (source.etag !== p.sourceETag || source.activation.generation !== p.sourceGeneration))
    throw new CatalogConflict("Fence was not confirmed; keep the handoff held");
  if (p.fenced) return release;
  return write(store, { ...release.state, generation: release.state.generation + 1,
    pending: { ...p, sourceETag: source.etag, sourceGeneration: source.activation.generation, fenced: true } }, expectedETag);
};

// Explicit operator recovery only. No deploy can have started from an unfenced state.
// Fence the latest pointer before clearing the barrier, so every old writer remains invalid.
export const abortUnfencedHandoff = async ({ store, environment, expectedETag, token, now = Date.now() }) => {
  const release = await readReleaseState(store, environment), p = release?.state.pending;
  if (!release || release.etag !== expectedETag || !p || p.token !== token || p.fenced) throw new CatalogConflict("Only the exact unfenced handoff can be cancelled");
  const source = await loadCatalogState(store, p.from, { now });
  if (!source.catalog) fail("source catalog is missing; keep the handoff held");
  if (hash(canonicalJSON(source.activation)) === p.fenceHash) throw new CatalogConflict("The original fence committed; resume the handoff instead");
  const fence = canonicalJSON(fenceActivation(source));
  try { await store.put(`catalogs/${p.from.baseline}/active.json`, new TextEncoder().encode(fence), { ifMatch: source.etag, contentType: "application/json" }); }
  catch { /* The acknowledgment may be lost. Require exact readback before clearing the barrier. */ }
  const actual = await loadCatalogState(store, p.from, { now });
  if (!actual.activation || canonicalJSON(actual.activation) !== fence) throw new CatalogConflict("Cancellation fence was not confirmed; keep the handoff held");
  return write(store, { ...release.state, generation: release.state.generation + 1, pending: null }, expectedETag);
};

// Explicit recovery of a failed renderer/build, under the same deployment lock after the prior run
// has ended. A target with an active pointer must be resumed instead. Keep the original source fence
// and the publication barrier; replacing the token/ETag invalidates every old prepared artifact.
export const replaceUnstagedHandoff = async ({ store, environment, expectedETag, token, expectedTarget,
  prepared, newToken, verified, now = Date.now() }) => {
  const release = await readReleaseState(store, environment), p = release?.state.pending;
  if (!release || release.etag !== expectedETag || !p || !p.fenced || p.token !== token || p.to.baseline !== expectedTarget)
    throw new CatalogConflict("Only the exact fenced unpublished target can be replaced");
  if (!/^[a-f0-9]{32}$/.test(newToken || "") || newToken === token) fail("a distinct replacement token is required");
  const to = prepared?.context;
  if (!contextOK(to) || to.environment !== environment || to.baseline === p.from.baseline || to.baseline === p.to.baseline)
    fail("replacement requires a distinct approved target in the same environment");
  const encoded = encodeCatalog(prepared.catalog, { now });
  if (encoded.digest !== prepared.digest || !equalContext(encoded.catalog, to)) fail("replacement target bytes changed");
  const sourceState = async () => {
    const source = await loadCatalogState(store, p.from, { now });
    if (!source.catalog || source.etag !== p.sourceETag || source.revision !== p.sourceRevision
      || source.activation.generation !== p.sourceGeneration || hash(canonicalJSON(source.activation)) !== p.fenceHash)
      throw new CatalogConflict("Source fence changed; keep the handoff held");
    return source;
  };
  const absentTargets = async () => {
    for (const context of [p.to, to]) if (await store.get(`catalogs/${context.baseline}/active.json`))
      throw new CatalogConflict("A target was already activated; resume its exact handoff instead");
  };
  await absentTargets();
  const source = await sourceState();
  if (!verified || !equalContext(verified, p.from) || verified.revision !== p.sourceRevision || verified.generation !== p.sourceGeneration)
    fail("live runtime did not confirm the fenced source");
  await checkHandoffPreservation(store, source, encoded.catalog, { now });
  // History reads may take time. Confirm unchanged storage again immediately before the release CAS.
  await sourceState(); await absentTargets();
  return write(store, { ...release.state, generation: release.state.generation + 1,
    pending: { ...p, to, token: newToken } }, expectedETag);
};

export const completeHandoff = async ({ store, environment, expectedETag, token, verified, now = Date.now() }) => {
  const release = await readReleaseState(store, environment), p = release?.state.pending;
  if (!release || release.etag !== expectedETag || !p || p.token !== token || !p.fenced) throw new CatalogConflict("No matching confirmed handoff fence");
  const source = await loadCatalogState(store, p.from, { now });
  if (source.etag !== p.sourceETag || source.revision !== p.sourceRevision || source.activation?.generation !== p.sourceGeneration
    || hash(canonicalJSON(source.activation)) !== p.fenceHash) throw new CatalogConflict("Old baseline changed during deployment; keep the handoff held");
  const target = await loadCatalogState(store, p.to, { now });
  if (!target.catalog || !verified || verified.baseline !== p.to.baseline || verified.engine !== p.to.engine
    || verified.revision !== target.revision || verified.generation !== target.activation.generation) fail("new runtime did not confirm the prepared catalog");
  await checkHandoffPreservation(store, source, target.catalog, { now });
  return write(store, { ...release.state, generation: release.state.generation + 1, context: p.to, pending: null }, expectedETag);
};
