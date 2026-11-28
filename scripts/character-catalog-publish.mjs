// Verified inputs become immutable objects before one conditional active-pointer write. This module never
// deploys code, runs a character, executes a renderer, or mutates GitHub. Rendering is a separate credential-free job.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { activateCatalog, encodeCatalog, planCatalog, readCatalog, seedCatalog, validateActivation } from "./character-catalog.mjs";
import { characterPath, parseSafeCharacter } from "./character-safety.mjs";
import { verifyMergedCatalogBundle } from "./character-catalog-source.mjs";
import { createGitHub } from "./character-github.mjs";
import { catalogStoreFromEnv, STORE_MAX_BYTES } from "./character-catalog-store.mjs";
import { canonicalJSON, prefixEvents } from "../worker/src/character-catalog-schema.js";
import { createPortraitManifest, validatePortraitManifest, pngDimensions } from "../worker/src/character-portraits-format.js";

export class CatalogConflict extends Error {}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = (text) => new TextEncoder().encode(text);
const textOf = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > STORE_MAX_BYTES) throw new Error("Invalid bounded publication object");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};
const equal = (a, b) => a.byteLength === b.byteLength && hash(a) === hash(b);
const contextOf = (context) => {
  if (!context || !["staging", "production"].includes(context.environment) || typeof context.engine !== "string"
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(context.engine) || !/^[a-f0-9]{40}$/.test(context.baseline)) throw new Error("Explicit approved publication context is required");
  return context;
};
const matches = (value, context) => {
  if (!["environment", "engine", "baseline"].every((key) => value[key] === context[key])) throw new Error("Publication context mismatch");
};
const activationOf = (bytes) => {
  const text = textOf(bytes), activation = JSON.parse(text);
  validateActivation(activation);
  if (canonicalJSON(activation) !== text) throw new Error("Activation must use canonical JSON");
  return activation;
};

export const loadCatalogState = async (store, context, { now = Date.now() } = {}) => {
  contextOf(context);
  const prefix = `catalogs/${context.baseline}/`, object = await store.get(prefix + "active.json");
  if (!object) return { etag: null, catalog: null, activation: null, revision: null };
  const activation = activationOf(object.bytes); matches(activation, context);
  const content = await store.get(prefix + activation.revision + ".json");
  if (!content) throw new Error("Active catalog is missing");
  const decoded = readCatalog(textOf(content.bytes), { now }); matches(decoded.catalog, context);
  if (decoded.digest !== activation.revision || !prefixEvents(decoded.catalog.events, activation.events)) throw new Error("Active catalog differs from its activation");
  return { etag: object.etag, catalog: decoded.catalog, activation, revision: decoded.digest };
};

export const readCatalogPortraits = async (store, catalog, revision, { allowMissing = false } = {}) => {
  if (!/^[a-f0-9]{64}$/.test(revision || "") || encodeCatalog(catalog).digest !== revision) throw new Error("Invalid portrait reuse revision");
  const object = await store.get(`portraits/${revision}/manifest.json`);
  if (!object) {
    if (allowMissing && !await store.get(`catalogs/${catalog.baseline}/${revision}.json`)) return null;
    throw new Error("Published portrait manifest is missing");
  }
  const text = textOf(object.bytes), manifest = validatePortraitManifest(JSON.parse(text), catalog, revision);
  if (text !== JSON.stringify(createPortraitManifest(catalog, revision, manifest.image)) + "\n") throw new Error("Published portrait manifest is not canonical");
  const image = await store.get(`portraits/${revision}/${manifest.image}.png`);
  if (!image || !(image.bytes instanceof Uint8Array) || image.bytes.byteLength > STORE_MAX_BYTES || hash(image.bytes) !== manifest.image) throw new Error("Published portrait image is missing or corrupt");
  const dimensions = pngDimensions(image.bytes);
  if (dimensions.width !== manifest.size * manifest.columns || dimensions.height !== manifest.size * manifest.rows) throw new Error("Published portrait dimensions differ");
  return { manifest, png: image.bytes };
};

// Source provenance is established by the trusted coordinator/CLI before calling this transaction. The
// transaction independently validates bytes, context, history and the actual storage generation/ETag.
export const publishCatalog = async ({ store, context, catalog, activation, portraits, expectedETag, rollback = false, now = Date.now() }) => {
  contextOf(context);
  if (expectedETag !== null && (typeof expectedETag !== "string" || !/^"[A-Za-z0-9-]{1,128}"$/.test(expectedETag))) throw new Error("An explicit strong expected ETag or null is required");
  const encoded = encodeCatalog(catalog, { now }); matches(catalog, context); validateActivation(activation); matches(activation, context);
  if (activation.revision !== encoded.digest || !prefixEvents(catalog.events, activation.events)) throw new Error("Proposed catalog differs from its activation");
  if (!portraits || !(portraits.png instanceof Uint8Array) || portraits.png.byteLength > STORE_MAX_BYTES) throw new Error("Portrait bytes are required");
  const manifest = createPortraitManifest(encoded.catalog, encoded.digest, hash(portraits.png));
  validatePortraitManifest(portraits.manifest, encoded.catalog, encoded.digest);
  if (portraits.manifest.image !== manifest.image) throw new Error("Portrait image digest mismatch");
  const dimensions = pngDimensions(portraits.png);
  if (dimensions.width !== manifest.columns * manifest.size || dimensions.height !== manifest.rows * manifest.size) throw new Error("Portrait image dimensions differ from the manifest");
  const proposed = bytesOf(canonicalJSON(activation));
  const current = await loadCatalogState(store, context, { now });
  const identical = current.activation && equal(bytesOf(canonicalJSON(current.activation)), proposed);
  if (!identical) {
    if (current.etag !== expectedETag) throw new CatalogConflict("Active catalog changed; prepare a new plan");
    const planned = activateCatalog(current.activation, encoded.catalog, { expectedGeneration: current.activation?.generation || 0, rollback, now });
    if (canonicalJSON(planned) !== canonicalJSON(activation)) throw new Error("Proposed activation differs from its required history");
  }
  const immutable = async (key, bytes, contentType) => {
    let error = null;
    try { await store.put(key, bytes, { ifNoneMatch: "*", contentType }); } catch (caught) { error = caught; }
    // A timeout may have committed. Read the immutable bytes before deciding whether retry is necessary.
    const actual = await store.get(key);
    if (!actual) throw error || new Error("Immutable upload was not confirmed");
    if (!equal(actual.bytes, bytes)) throw new CatalogConflict("Immutable object already has different bytes");
  };
  await immutable(`portraits/${encoded.digest}/${manifest.image}.png`, portraits.png, "image/png");
  // Fixed manifest field order and alphabetically sorted cells; generic catalog JSON bounds cells at 32 keys.
  await immutable(`portraits/${encoded.digest}/manifest.json`, bytesOf(JSON.stringify(manifest) + "\n"), "application/json");
  await immutable(`catalogs/${context.baseline}/${encoded.digest}.json`, bytesOf(encoded.json), "application/json");
  const key = `catalogs/${context.baseline}/active.json`;
  let wrote = false, error = null;
  if (!identical) {
    try {
      wrote = !!await store.put(key, proposed, { ...(expectedETag === null ? { ifNoneMatch: "*" } : { ifMatch: expectedETag }), contentType: "application/json" });
    } catch (caught) { error = caught; }
  }
  const actual = await store.get(key);
  if (!actual || !equal(actual.bytes, proposed)) {
    if (error && !actual) throw error;
    throw new CatalogConflict("Activation was not confirmed; reread current state before retrying");
  }
  return { state: wrote ? "published" : "already-published", revision: encoded.digest, generation: activation.generation, etag: actual.etag, manifest };
};

// Bootstrap reads the exact approved release tree, not a local checkout bearing its label. Custom source is
// only scanned for its literal identity and retained by the deployed engine; it is never executed here.
export const seedFromApprovedBaseline = async (gh, context, { now = Date.now() } = {}) => {
  contextOf(context);
  const tree = await gh.tree(context.baseline), sources = [];
  if (!(tree instanceof Map)) throw new Error("Missing complete baseline tree");
  for (const [path, entry] of tree) {
    if (!path.startsWith("src/characters/") || entry.type === "tree") continue;
    if (!characterPath(path) || entry.type !== "blob" || entry.mode !== "100644" || !Number.isSafeInteger(entry.size)
      || entry.size < 0 || entry.size > 1024 * 1024 || sources.length >= 128) throw new Error("Invalid approved baseline character tree");
    const file = await gh.file(context.baseline, path, 1024 * 1024);
    if (!file || file.sha !== entry.sha || typeof file.source !== "string" || Buffer.byteLength(file.source) !== entry.size) throw new Error("Approved baseline source mismatch");
    let kind = "data";
    try { parseSafeCharacter(file.source, now); } catch { kind = "custom"; }
    sources.push({ path, source: file.source, blob: file.sha, kind });
  }
  if (!sources.length) throw new Error("Approved baseline has no character files");
  return seedCatalog({ ...context, sources, now });
};

const REPOSITORY = "OogaBoogaX/oogaboogaland";
const fileBytes = (path) => {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > STORE_MAX_BYTES) throw new Error("Expected a bounded publication file");
  const bytes = readFileSync(path);
  if (bytes.byteLength > STORE_MAX_BYTES) throw new Error("Publication file exceeds its byte bound");
  return bytes;
};
const usage = `Character publication (writes only the configured R2 bucket):
  node scripts/character-catalog-publish.mjs plan --pr N --merge SHA --bot LOGIN
  node scripts/character-catalog-publish.mjs publish CATALOG ACTIVATION MANIFEST PNG --expected-etag ETAG --pr N --merge SHA --bot LOGIN
  node scripts/character-catalog-publish.mjs bootstrap CATALOG ACTIVATION MANIFEST PNG --expected-etag none [--handoff-token TOKEN]
  node scripts/character-catalog-publish.mjs rollback CATALOG ACTIVATION MANIFEST PNG --expected-etag ETAG

Context is explicit: CHARACTER_CATALOG_ENVIRONMENT, CHARACTER_CATALOG_ENGINE, CHARACTER_CATALOG_BASELINE.
Storage uses CHARACTER_CATALOG_R2_ACCOUNT_ID, _BUCKET, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY.
Plan, publish and bootstrap also require GH_TOKEN or GITHUB_TOKEN. Bootstrap and rollback are operator actions.
Plan prints {catalog,activation,expectedETag,noop}; publishing prints only its confirmed public revision.
`;

export const requireCatalogBundleOrder = async (gh, context, activation, bundle) => {
  if (activation.events.some((event) => event.merge === bundle.merge)) return;
  const { nextCatalogBundle } = await import("./character-catalog-release.mjs");
  const next = await nextCatalogBundle(gh, { baseline: context.baseline, consumed: activation.events.map((event) => event.merge) });
  if (!next || next.pr !== bundle.pr || next.merge !== bundle.merge) throw new CatalogConflict("Publish the earliest outstanding daily bundle before this one");
};
export const runCatalogPublish = async (args, env = process.env) => {
  if (args.length === 1 && args[0] === "--help") return usage;
  const [command, ...rest] = args, files = [], flags = new Map();
  const allowed = command === "plan" ? ["--pr", "--merge", "--bot"] : command === "publish" ? ["--expected-etag", "--pr", "--merge", "--bot"]
    : command === "bootstrap" ? ["--expected-etag", "--handoff-token"] : ["--expected-etag"];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) { files.push(arg); continue; }
    const value = rest[++i];
    if (!allowed.includes(arg) || flags.has(arg) || !value || value.startsWith("--")) throw new Error("Invalid publication option");
    flags.set(arg, value);
  }
  if (!["plan", "publish", "bootstrap", "rollback"].includes(command) || files.length !== (command === "plan" ? 0 : 4)) throw new Error("Invalid publication command; use --help");
  const context = contextOf({ environment: env.CHARACTER_CATALOG_ENVIRONMENT, engine: env.CHARACTER_CATALOG_ENGINE, baseline: env.CHARACTER_CATALOG_BASELINE });
  const store = catalogStoreFromEnv(env);
  const { readReleaseState, initializeRelease } = await import("./character-catalog-handoff.mjs");
  const release = await readReleaseState(store, context.environment);
  if (!release) {
    if (command !== "bootstrap") throw new CatalogConflict("Initialize the approved release context before publishing");
  } else if (release.state.pending) {
    const p = release.state.pending;
    if (command !== "bootstrap" || !p.fenced || flags.get("--handoff-token") !== p.token) throw new CatalogConflict("Manual release holds character publishing");
    matches(p.to, context);
  } else matches(release.state.context, context);
  const current = await loadCatalogState(store, context);
  let verified = null;
  if (command !== "rollback") {
    const gh = createGitHub(REPOSITORY, env.GH_TOKEN || env.GITHUB_TOKEN);
    if (command === "bootstrap") verified = await seedFromApprovedBaseline(gh, context);
    else {
      if (!current.catalog) throw new Error("Bootstrap the approved production baseline first");
      const pr = Number(flags.get("--pr"));
      if (!/^[1-9][0-9]*$/.test(flags.get("--pr") || "") || !Number.isSafeInteger(pr)) throw new Error("Explicit bundle PR is required");
      const bundle = await verifyMergedCatalogBundle(gh, { pr, merge: flags.get("--merge"), bot: flags.get("--bot") });
      await requireCatalogBundleOrder(gh, context, current.activation, bundle);
      verified = planCatalog(current.catalog, bundle, { ...context, activation: current.activation });
    }
  }
  if (command === "plan") return JSON.stringify({ catalog: verified.catalog,
    activation: verified.noop ? current.activation : activateCatalog(current.activation, verified.catalog, { expectedGeneration: current.activation.generation }),
    expectedETag: current.etag, noop: verified.noop }) + "\n";
  const proposed = readCatalog(textOf(fileBytes(files[0]))), activation = activationOf(fileBytes(files[1]));
  if (verified && proposed.digest !== verified.digest) throw new CatalogConflict("Prepared catalog differs from the verified current plan");
  const flag = flags.get("--expected-etag");
  if (flag === undefined) throw new Error("Explicit expected ETag is required");
  const barrier = await readReleaseState(store, context.environment);
  if ((barrier?.etag || null) !== (release?.etag || null)) throw new CatalogConflict("Release context changed while preparing publication");
  const result = await publishCatalog({ store, context, catalog: proposed.catalog, activation,
    portraits: { manifest: JSON.parse(textOf(fileBytes(files[2]))), png: fileBytes(files[3]) },
    expectedETag: flag === "none" ? null : flag, rollback: command === "rollback" });
  if (!release) await initializeRelease({ store, context });
  return JSON.stringify(result) + "\n";
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await runCatalogPublish(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
