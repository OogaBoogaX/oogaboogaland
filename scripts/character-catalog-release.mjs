// Coordinator for the three isolated publication jobs. GitHub and R2 are read-only while planning;
// renderer output contains pixels, never executable publication input. The writer reconstructs the plan.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { activateCatalog, encodeCatalog, planCatalog, readCatalog, validateActivation } from "./character-catalog.mjs";
import { canonicalJSON } from "../worker/src/character-catalog-schema.js";
import { branchPrefix } from "./character-submissions.mjs";
import { verifyMergedCatalogBundle } from "./character-catalog-source.mjs";
import { createGitHub } from "./character-github.mjs";
import { catalogStoreFromEnv, STORE_MAX_BYTES } from "./character-catalog-store.mjs";
import { CatalogConflict, loadCatalogState, publishCatalog, seedFromApprovedBaseline } from "./character-catalog-publish.mjs";
import { readReleaseState, initializeRelease } from "./character-catalog-handoff.mjs";
import { createPortraitManifest, validatePortraitManifest, pngDimensions } from "../worker/src/character-portraits-format.js";

const REPOSITORY = "OogaBoogaX/oogaboogaland", SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
export const RECOVERY_MAX_COMMITS = 512;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const sameContext = (a, b) => a && b && ["environment", "engine", "baseline"].every((key) => a[key] === b[key]);
const contextOK = (v) => exact(v, ["environment", "engine", "baseline"]) && ["staging", "production"].includes(v.environment)
  && SHA.test(v.baseline) && typeof v.engine === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(v.engine);
const etagOK = (v) => v === null || typeof v === "string" && /^"[A-Za-z0-9-]{1,128}"$/.test(v);
const textOf = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > STORE_MAX_BYTES) throw new Error("Publication input exceeds its byte bound");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};
const readBytes = (path) => {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > STORE_MAX_BYTES) throw new Error("Expected a bounded publication file");
  const bytes = readFileSync(path);
  if (bytes.byteLength > STORE_MAX_BYTES) throw new Error("Publication file exceeds its byte bound");
  return bytes;
};
const gate = (release, environment) => {
  if (!release || release.state.environment !== environment) throw new Error("Bootstrap the explicitly approved deployed baseline first");
  if (release.state.pending) throw new CatalogConflict("A manual deployment handoff is pending; automatic publication remains paused");
};

// Resolve rock once, then follow immutable first parents. Neither PR updated_at nor GitHub's
// general commit ordering proves merge order; rollback's activation ledger remains consumed.
export const nextCatalogBundle = async (gh, { baseline, consumed = [] }) => {
  if (gh.repo !== REPOSITORY || !SHA.test(baseline) || !Array.isArray(consumed) || consumed.some((sha) => !SHA.test(sha))) throw new Error("Invalid recovery boundary");
  // The activation's last consumed merge was already proven against this baseline.
  // It stays consumed after rollback and is the closest safe lower boundary.
  const boundary = consumed.at(-1) || baseline;
  const commits = [], seen = new Set(), used = new Set(consumed);
  let commit = await gh.api("commits/rock");
  while (commit?.sha !== boundary) {
    if (!commit || !SHA.test(commit.sha) || seen.has(commit.sha) || commits.length >= RECOVERY_MAX_COMMITS
      || !Array.isArray(commit.parents) || !commit.parents.length || commit.parents.length > 16 || commit.parents.some((p) => !SHA.test(p?.sha)))
      throw new Error("Cannot prove the bounded first-parent history to the deployed baseline; maintainer recovery required");
    seen.add(commit.sha); commits.push(commit.sha);
    const parent = commit.parents[0].sha;
    commit = await gh.api(`commits/${parent}`);
    if (commit?.sha !== parent) throw new Error("Recovery commit differs from its requested immutable parent");
  }
  for (const merge of commits.reverse()) {
    if (used.has(merge)) continue;
    const prs = await gh.list(`commits/${merge}/pulls`, 1);
    if (!Array.isArray(prs) || prs.length > 100) throw new Error("Commit-associated PR list is incomplete");
    const candidates = prs.filter((pr) => pr?.head?.ref?.startsWith(branchPrefix("daily"))
      && pr.merge_commit_sha === merge && pr.base?.ref === "rock");
    if (candidates.length > 1) throw new Error("Ambiguous daily bundle merge");
    if (candidates.length) {
      const pr = candidates[0].number;
      if (!Number.isSafeInteger(pr) || pr <= 0) throw new Error("Invalid daily bundle PR number");
      return { pr, merge };
    }
  }
  return null;
};

// A revision owns exactly one portrait manifest. Re-rendering accepted content may
// change pixels across Chrome/GPU versions, so rollback/retry reuse the verified stored bytes.
export const reusableCatalogPortraits = async (store, catalog, revision) => {
  if (!HASH.test(revision || "") || encodeCatalog(catalog).digest !== revision) throw new Error("Invalid portrait reuse revision");
  const object = await store.get(`portraits/${revision}/manifest.json`);
  if (!object) {
    if (await store.get(`catalogs/${catalog.baseline}/${revision}.json`)) throw new Error("Published catalog portrait manifest is missing; repair the incomplete stored revision");
    return null;
  }
  const text = textOf(object.bytes), manifest = JSON.parse(text);
  validatePortraitManifest(manifest, catalog, revision);
  if (text !== JSON.stringify(createPortraitManifest(catalog, revision, manifest.image)) + "\n") throw new Error("Published portrait manifest bytes are not canonical");
  const image = await store.get(`portraits/${revision}/${manifest.image}.png`);
  if (!image || !(image.bytes instanceof Uint8Array) || image.bytes.byteLength > STORE_MAX_BYTES
    || createHash("sha256").update(image.bytes).digest("hex") !== manifest.image) throw new Error("Published portrait image is missing or differs from its digest");
  const dimensions = pngDimensions(image.bytes);
  if (dimensions.width !== manifest.columns * manifest.size || dimensions.height !== manifest.rows * manifest.size) throw new Error("Published portrait dimensions differ from the manifest");
  return { manifest, png: image.bytes };
};

// The injected verifier is solely a test boundary. The CLI always uses the immutable GitHub verifier.
export const createReleaseCoordinator = ({ verifyBundle = verifyMergedCatalogBundle, seedBaseline = seedFromApprovedBaseline } = {}) => {
  const prepare = async ({ gh, store, environment, operation = "publish", bootstrapContext, rollbackRevision, bot, now = Date.now() }) => {
    if (!["staging", "production"].includes(environment) || !["publish", "bootstrap", "rollback"].includes(operation)
      || gh.repo !== REPOSITORY || !/^[A-Za-z0-9-]+\[bot\]$/.test(bot || "")) throw new Error("Explicit release environment, operation and trusted bot are required");
    const release = await readReleaseState(store, environment);
    if (release?.state.pending) gate(release, environment);
    let context;
    if (operation === "bootstrap") {
      if (!contextOK(bootstrapContext) || bootstrapContext.environment !== environment) throw new Error("Explicit approved bootstrap context is required");
      context = bootstrapContext;
      if (release && !sameContext(release.state.context, context)) throw new CatalogConflict("Bootstrap cannot replace a deployed release context");
    } else {
      gate(release, environment); context = release.state.context;
    }
    const current = await loadCatalogState(store, context, { now });
    const plan = { version: 1, operation, context, catalog: current.catalog, activation: current.activation,
      expectedETag: current.etag, releaseETag: release?.etag || null, source: null, noop: false };
    let encoded;
    if (operation === "bootstrap") {
      if (release) return { ...plan, noop: true };
      encoded = await seedBaseline(gh, context, { now });
      if (current.catalog && (current.revision !== encoded.digest || current.activation.generation !== 1 || current.activation.events.length))
        throw new CatalogConflict("An unregistered baseline already contains different publication history");
    } else {
      if (!current.catalog) throw new Error("The deployed release context has no active catalog");
      if (operation === "rollback") {
        if (!HASH.test(rollbackRevision || "") || !current.activation.releases.includes(rollbackRevision)) throw new Error("Rollback requires an explicitly previously accepted revision");
        if (rollbackRevision === current.revision) return { ...plan, noop: true };
        const object = await store.get(`catalogs/${context.baseline}/${rollbackRevision}.json`);
        if (!object) throw new Error("Rollback catalog is missing");
        encoded = readCatalog(textOf(object.bytes), { now });
        if (encoded.digest !== rollbackRevision || !sameContext(encoded.catalog, context)) throw new Error("Rollback bytes differ from the accepted revision");
      } else {
        plan.source = await nextCatalogBundle(gh, { baseline: context.baseline, consumed: current.activation.events.map((event) => event.merge) });
        if (!plan.source) return { ...plan, noop: true };
        const bundle = await verifyBundle(gh, { ...plan.source, bot, now });
        encoded = planCatalog(current.catalog, bundle, { ...context, activation: current.activation, now });
        if (encoded.noop) throw new Error("Recovery selected an already consumed bundle");
      }
    }
    plan.catalog = encoded.catalog;
    plan.activation = operation === "bootstrap" && current.activation ? current.activation
      : activateCatalog(current.activation, encoded.catalog, { expectedGeneration: current.activation?.generation || 0, rollback: operation === "rollback", now });
    return plan;
  };

  const publish = async ({ gh, store, plan, portraits, environment, operation, bootstrapContext, rollbackRevision, bot, now = Date.now() }) => {
    validateReleasePlan(plan, { now });
    if (gh.repo !== REPOSITORY || !/^[A-Za-z0-9-]+\[bot\]$/.test(bot || "")) throw new Error("Explicit trusted repository and bundle bot are required");
    if (plan.noop || plan.operation !== operation || plan.context.environment !== environment) throw new Error("Prepared operation differs from the explicitly requested publication");
    const release = await readReleaseState(store, environment);
    if (operation !== "bootstrap" || release?.state.pending) gate(release, environment);
    const initializedRetry = operation === "bootstrap" && plan.releaseETag === null && release && sameContext(release.state.context, plan.context);
    if (!initializedRetry && (release?.etag || null) !== plan.releaseETag || release && !sameContext(release.state.context, plan.context))
      throw new CatalogConflict("Release context changed after planning");
    const current = await loadCatalogState(store, plan.context, { now });
    if (current.activation && equal(current.activation, plan.activation)) {
      // Retried acknowledgment: re-prove the source without consuming another event/generation.
      let encoded;
      if (operation === "publish") {
        const bundle = await verifyBundle(gh, { ...plan.source, bot, now });
        encoded = planCatalog(current.catalog, bundle, { ...plan.context, activation: current.activation, now });
        if (!encoded.noop) throw new Error("Publication retry is not a consumed event");
      } else if (operation === "bootstrap") {
        if (!sameContext(bootstrapContext, plan.context)) throw new Error("Bootstrap retry differs from its approved context");
        encoded = await seedBaseline(gh, plan.context, { now });
      } else {
        if (rollbackRevision !== current.revision) throw new Error("Rollback retry differs from its explicit revision");
        encoded = encodeCatalog(current.catalog, { now });
      }
      if (encoded.digest !== encodeCatalog(plan.catalog, { now }).digest) throw new Error("Retried publication bytes differ from verified evidence");
    } else {
      const verified = await prepare({ gh, store, environment, operation, bootstrapContext, rollbackRevision, bot, now });
      if (!equal(verified, plan)) throw new CatalogConflict("Prepared artifact differs from the verified current release plan");
    }
    // The shared workflow lock serializes manual deploys; the handoff's pointer fence
    // also rejects an old publisher's CAS if an external operator begins a transition.
    const before = await readReleaseState(store, environment);
    if (before?.state.pending || (before?.etag || null) !== (release?.etag || null)) throw new CatalogConflict("Release handoff changed before publication");
    const result = await publishCatalog({ store, context: plan.context, catalog: plan.catalog, activation: plan.activation,
      portraits, expectedETag: plan.expectedETag, rollback: operation === "rollback", now });
    if (operation === "bootstrap") await initializeRelease({ store, context: plan.context, now });
    return result;
  };
  return { prepare, publish };
};

export const validateReleasePlan = (plan, { now = Date.now() } = {}) => {
  if (!exact(plan, ["version", "operation", "context", "catalog", "activation", "expectedETag", "releaseETag", "source", "noop"])
    || plan.version !== 1 || !["publish", "bootstrap", "rollback"].includes(plan.operation) || !contextOK(plan.context)
    || typeof plan.noop !== "boolean" || !etagOK(plan.expectedETag) || !etagOK(plan.releaseETag)) throw new Error("Invalid prepared release artifact");
  const encoded = encodeCatalog(plan.catalog, { now }); validateActivation(plan.activation);
  if (!sameContext(plan.catalog, plan.context) || !sameContext(plan.activation, plan.context) || encoded.digest !== plan.activation.revision)
    throw new Error("Prepared release artifact has mismatched bytes or context");
  if (plan.operation === "publish" && !plan.noop) {
    if (!exact(plan.source, ["pr", "merge"]) || !Number.isSafeInteger(plan.source.pr) || plan.source.pr <= 0 || !SHA.test(plan.source.merge)) throw new Error("Missing immutable bundle evidence");
  } else if (plan.source !== null) throw new Error("Unexpected bundle evidence");
  return plan;
};

const HELP = `Character release jobs (never deploy Worker code):
  node scripts/character-catalog-release.mjs plan --environment staging|production --operation publish|bootstrap|rollback --output DIR [--rollback SHA256]
  node scripts/character-catalog-release.mjs publish --environment staging|production --operation publish|bootstrap|rollback --plan FILE --portraits DIR [--rollback SHA256]

GH_TOKEN and scoped CHARACTER_CATALOG_R2_* credentials are required. Plan only reads them.
Bootstrap additionally requires approved CHARACTER_CATALOG_BASELINE and CHARACTER_CATALOG_ENGINE.
CHARACTER_BOT_LOGIN identifies the trusted bundle bot. Output files are canonical plan.json, catalog.json and activation.json.
`;
export const runCatalogRelease = async (args, env = process.env) => {
  if (args.length === 1 && args[0] === "--help") return HELP;
  const [command, ...rest] = args, options = new Map();
  if (!["plan", "publish"].includes(command)) throw new Error("Invalid release command; use --help");
  const allowed = ["--environment", "--operation", "--rollback", ...(command === "plan" ? ["--output"] : ["--plan", "--portraits"])];
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || options.has(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error("Invalid release option");
    options.set(rest[i], rest[i + 1]);
  }
  const environment = options.get("--environment"), operation = options.get("--operation"), rollbackRevision = options.get("--rollback");
  if (!["staging", "production"].includes(environment) || !["publish", "bootstrap", "rollback"].includes(operation)
    || operation === "rollback" && !HASH.test(rollbackRevision || "") || operation !== "rollback" && rollbackRevision !== undefined) throw new Error("Explicit valid environment and operation are required");
  const gh = createGitHub(REPOSITORY, env.GH_TOKEN || env.GITHUB_TOKEN), store = catalogStoreFromEnv(env);
  const coordinator = createReleaseCoordinator(), common = { gh, store, environment, operation, rollbackRevision,
    bootstrapContext: { environment, engine: env.CHARACTER_CATALOG_ENGINE, baseline: env.CHARACTER_CATALOG_BASELINE }, bot: env.CHARACTER_BOT_LOGIN };
  if (command === "plan") {
    const output = options.get("--output");
    if (!output) throw new Error("An empty plan output directory is required");
    const plan = await coordinator.prepare(common);
    validateReleasePlan(plan);
    const reuse = plan.noop ? null : await reusableCatalogPortraits(store, plan.catalog, plan.activation.revision);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "plan.json"), canonicalJSON(plan), { flag: "wx" });
    writeFileSync(join(output, "catalog.json"), encodeCatalog(plan.catalog).json, { flag: "wx" });
    writeFileSync(join(output, "activation.json"), canonicalJSON(plan.activation), { flag: "wx" });
    if (reuse) {
      writeFileSync(join(output, "portraits.json"), JSON.stringify(reuse.manifest) + "\n", { flag: "wx" });
      writeFileSync(join(output, "portraits.png"), reuse.png, { flag: "wx" });
    }
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `publish=${!plan.noop}\nbaseline=${plan.context.baseline}\nreuse=${!!reuse}\n`);
    return JSON.stringify({ operation, noop: plan.noop, baseline: plan.context.baseline, revision: plan.activation.revision, generation: plan.activation.generation }) + "\n";
  }
  if (!options.get("--plan") || !options.get("--portraits")) throw new Error("Prepared plan and portrait directory are required");
  const text = textOf(readBytes(options.get("--plan"))), plan = JSON.parse(text);
  if (canonicalJSON(plan) !== text) throw new Error("Prepared plan must be canonical JSON");
  const directory = options.get("--portraits");
  const portraits = { manifest: JSON.parse(textOf(readBytes(join(directory, "portraits.json")))), png: readBytes(join(directory, "portraits.png")) };
  return JSON.stringify(await coordinator.publish({ ...common, plan, portraits })) + "\n";
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await runCatalogRelease(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
