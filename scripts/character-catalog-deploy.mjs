// Manual deployment coordination. Each CLI phase runs in a separate workflow job; renderer jobs never receive
// storage or deployment credentials. A failed deployment leaves its fenced handoff pending for an explicit retry.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { activateCatalog, encodeCatalog, validateActivation } from "./character-catalog.mjs";
import { createGitHub } from "./character-github.mjs";
import { catalogStoreFromEnv, STORE_MAX_BYTES } from "./character-catalog-store.mjs";
import { CatalogConflict, loadCatalogState, publishCatalog, seedFromApprovedBaseline, readCatalogPortraits } from "./character-catalog-publish.mjs";
import { readReleaseState, prepareHandoff, beginHandoff, resumeHandoff, completeHandoff, abortUnfencedHandoff, replaceUnstagedHandoff, checkHandoffPreservation } from "./character-catalog-handoff.mjs";
import { canonicalJSON, prefixEvents } from "../worker/src/character-catalog-schema.js";

const ENGINE = "island-character-data-v1", SHA = /^[a-f0-9]{40}$/, REPO = "OogaBoogaX/oogaboogaland";
const origins = { staging: "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev", production: "https://oogabooga.land" };
const same = (a, b) => ["environment", "baseline", "engine"].every((key) => a[key] === b[key]);
const decode = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > STORE_MAX_BYTES) throw new Error("Deployment artifact exceeds its byte bound");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};
const validatedPlan = (plan, environment, now) => {
  if (!plan || plan.version !== 1 || !["handoff", "redeploy"].includes(plan.operation) || plan.context?.environment !== environment
    || !origins[environment] || plan.context.engine !== ENGINE || !SHA.test(plan.context.baseline || "")
    || typeof plan.releaseETag !== "string" || typeof plan.reuse !== "boolean"
    || plan.operation === "handoff" && !/^[a-f0-9]{32}$/.test(plan.token || "")) throw new Error("Invalid manual release plan");
  const encoded = encodeCatalog(plan.catalog, { now });
  validateActivation(plan.activation);
  if (!same(plan.context, encoded.catalog) || !same(plan.context, plan.activation) || encoded.digest !== plan.activation.revision
    || !prefixEvents(plan.catalog.events, plan.activation.events)) throw new Error("Manual release plan bytes changed");
  return encoded;
};
const gate = async (store, plan, environment) => {
  const release = await readReleaseState(store, environment);
  if (!release || release.etag !== plan.releaseETag) throw new CatalogConflict("Manual release state changed");
  if (plan.operation === "redeploy") {
    if (release.state.pending || !same(release.state.context, plan.context)) throw new CatalogConflict("Redeployment context changed");
  } else {
    const p = release.state.pending;
    if (!p || !p.fenced || p.token !== plan.token || !same(p.to, plan.context)) throw new CatalogConflict("Manual handoff is not fenced for this target");
    const source = await loadCatalogState(store, p.from);
    if (source.etag !== p.sourceETag || source.revision !== p.sourceRevision || source.activation?.generation !== p.sourceGeneration)
      throw new CatalogConflict("The source publication changed while the release was held");
    await checkHandoffPreservation(store, source, plan.catalog);
  }
  return release;
};
export const prepareManualRelease = async ({ gh, store, environment, target, resume = false, replaceHeldTarget = null,
  engine = ENGINE, token = randomBytes(16).toString("hex"), fetcher = fetch,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)), now = Date.now() }) => {
  if (resume && replaceHeldTarget !== null) throw new Error("Resume and target replacement cannot be combined");
  if (!origins[environment] || !SHA.test(target || "") || engine !== ENGINE
    || replaceHeldTarget !== null && (!SHA.test(replaceHeldTarget) || replaceHeldTarget === target)) throw new Error("Explicit approved release SHA and supported engine required");
  let release = await readReleaseState(store, environment);
  if (!release) throw new Error("Bootstrap and register the current production baseline before a catalog-aware deployment");
  if (replaceHeldTarget !== null && !release.state.pending) throw new CatalogConflict("There is no held target to replace");
  if (resume && !release.state.pending && release.state.context.baseline !== target) throw new Error("Resume SHA must match the held or already completed release");
  const context = { environment, baseline: target, engine };
  let encoded, operation, expectedETag, activation;
  if (release.state.pending) {
    const p = release.state.pending;
    if (!same(p.to, context)) {
      if (replaceHeldTarget !== p.to.baseline || !p.fenced) throw new CatalogConflict("A different release is held; resume its exact target SHA first");
      encoded = await seedFromApprovedBaseline(gh, context, { now });
      const verified = await verifyRuntimeCatalog({ context: p.from, revision: p.sourceRevision, generation: p.sourceGeneration, fetcher, wait, now });
      release = await replaceUnstagedHandoff({ store, environment, expectedETag: release.etag, token: p.token, expectedTarget: replaceHeldTarget,
        prepared: { ...encoded, context }, newToken: token, verified, now });
    }
    token = release.state.pending.token;
    release = await resumeHandoff({ store, environment, expectedETag: release.etag, token, now });
    encoded ||= await seedFromApprovedBaseline(gh, context, { now });
    const source = await loadCatalogState(store, release.state.context, { now });
    await checkHandoffPreservation(store, source, encoded.catalog, { now });
    operation = "handoff";
  } else if (same(release.state.context, context)) {
    const current = await loadCatalogState(store, context, { now });
    if (!current.catalog) throw new Error("Current release has no validated catalog");
    encoded = encodeCatalog(current.catalog, { now }); operation = "redeploy"; token = null;
  } else {
    const prepared = await prepareHandoff({ gh, store, currentContext: release.state.context, nextContext: context, now });
    release = await beginHandoff({ store, environment, expectedETag: release.etag, prepared, token, now });
    encoded = prepared; operation = "handoff";
  }
  const existing = await loadCatalogState(store, context, { now });
  if (existing.catalog) {
    if (existing.revision !== encoded.digest) throw new CatalogConflict("Target namespace already contains different catalog data");
    expectedETag = existing.etag; activation = existing.activation;
  } else { expectedETag = null; activation = activateCatalog(null, encoded.catalog, { expectedGeneration: 0, now }); }
  const portraits = await readCatalogPortraits(store, encoded.catalog, encoded.digest, { allowMissing: !existing.catalog });
  const plan = { version: 1, operation, context, catalog: encoded.catalog, activation, expectedETag, releaseETag: release.etag, token, reuse: !!portraits };
  return { plan, portraits };
};

export const stageManualRelease = async ({ gh, store, plan, environment, portraits, now = Date.now() }) => {
  const encoded = validatedPlan(plan, environment, now);
  await gate(store, plan, environment);
  if (plan.operation === "handoff") {
    const verified = await seedFromApprovedBaseline(gh, plan.context, { now });
    if (verified.digest !== encoded.digest) throw new Error("Manual target differs from the approved source tree");
  }
  const current = await loadCatalogState(store, plan.context, { now });
  const data = await readCatalogPortraits(store, plan.catalog, encoded.digest, { allowMissing: !current.catalog }) || portraits;
  await gate(store, plan, environment);
  return publishCatalog({ store, context: plan.context, catalog: plan.catalog, activation: plan.activation, portraits: data,
    expectedETag: plan.expectedETag, now });
};

const verifyRuntimeCatalog = async ({ context, revision, generation, fetcher, wait, now }) => {
  const url = new URL("/api/characters/catalog", origins[context.environment]);
  url.searchParams.set("baseline", context.baseline); url.searchParams.set("engine", context.engine);
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetcher(url.href, { credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (![409, 503].includes(response.status) || attempt === 4) break;
    response.body?.cancel().catch(() => {}); await wait(1000);
  }
  if (!response.ok || Number(response.headers.get("content-length") || 0) > STORE_MAX_BYTES) throw new Error("The deployed runtime did not confirm the target catalog");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The deployed runtime returned no catalog");
  const chunks = []; let count = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; count += item.value.byteLength;
      if (count > STORE_MAX_BYTES) throw new Error("Runtime catalog response exceeds its bound"); chunks.push(item.value); }
  } catch (error) { reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const value = JSON.parse(decode(Buffer.concat(chunks)));
  if (value.revision !== revision || value.generation !== generation || !same(value.catalog || {}, context)
    || encodeCatalog(value.catalog, { now }).digest !== revision) throw new Error("The deployed runtime answered a different catalog");
  return { ...context, revision: value.revision, generation: value.generation };
};

export const finishManualRelease = async ({ store, plan, environment, fetcher = fetch, wait = (ms) => new Promise((done) => setTimeout(done, ms)), now = Date.now() }) => {
  validatedPlan(plan, environment, now); await gate(store, plan, environment);
  const verified = await verifyRuntimeCatalog({ context: plan.context, revision: plan.activation.revision, generation: plan.activation.generation, fetcher, wait, now });
  if (plan.operation === "redeploy") { await gate(store, plan, environment); return { state: "verified", ...verified }; }
  return completeHandoff({ store, environment, expectedETag: plan.releaseETag, token: plan.token, verified, now });
};

// Read JSONC without evaluating it. Preserve strings while removing comments and trailing commas.
export const parseWranglerConfig = (source) => {
  let clean = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { clean += c; if (c === "\\") clean += source[++i] || ""; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; clean += c; continue; }
    if (c === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i++; clean += "\n"; continue; }
    if (c === "/" && source[i + 1] === "*") { const end = source.indexOf("*/", i + 2); if (end < 0) throw new Error("Unclosed config comment"); i = end + 1; clean += " "; continue; }
    if (c === "," && /^\s*[}\]]/.test(source.slice(i + 1))) continue;
    clean += c;
  }
  // Comments can separate a final comma from its closing token; repeat with the comment-free input once.
  if (clean !== source && /,\s*[}\]]/.test(clean)) return parseWranglerConfig(clean);
  return JSON.parse(clean);
};
export const deploymentConfig = (source, plan, { bucket, accountId }) => {
  validatedPlan(plan, plan.context.environment, Date.now());
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || "") || !/^[a-f0-9]{32}$/.test(accountId || "")) throw new Error("Invalid deployment bucket/account");
  const config = parseWranglerConfig(source), environment = plan.context.environment;
  if (config.name !== `oogaboogaland-${environment}` || config.account_id !== accountId || config.vars?.ENVIRONMENT !== environment
    || config.vars.SITE_ORIGIN !== origins[environment]) throw new Error("Wrangler target differs from the approved deployment environment");
  const buckets = config.r2_buckets || [];
  if (buckets.filter((row) => row.binding === "CHARACTER_CATALOGS").length > 1) throw new Error("Duplicate character catalog binding");
  config.r2_buckets = [...buckets.filter((row) => row.binding !== "CHARACTER_CATALOGS"), { binding: "CHARACTER_CATALOGS", bucket_name: bucket }];
  config.vars = { ...config.vars, CHARACTER_CATALOG_ENABLED: "1", CHARACTER_CATALOG_BASELINE: plan.context.baseline, CHARACTER_CATALOG_ENGINE: plan.context.engine };
  return config;
};

const file = (path) => {
  const stat = statSync(path); if (!stat.isFile() || stat.size > STORE_MAX_BYTES) throw new Error("Expected a bounded release artifact");
  const data = readFileSync(path); if (data.byteLength > STORE_MAX_BYTES) throw new Error("Release artifact exceeds its bound"); return data;
};
const argumentsOf = (args) => {
  const [command, ...rest] = args, values = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!["--environment", "--target", "--resume", "--replace-held-target", "--output", "--plan", "--portraits", "--release-dir", "--token", "--expected-etag"].includes(key) || values[key] || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error("Invalid manual release arguments");
    values[key] = rest[i + 1];
  }
  if (!["prepare", "stage", "finish", "config", "status", "cancel-unfenced"].includes(command) || !origins[values["--environment"]]) throw new Error("Explicit manual release command/environment required");
  const required = { prepare: ["--target", "--output"], stage: ["--plan", "--portraits"], finish: ["--plan"], config: ["--plan", "--release-dir"], status: [], "cancel-unfenced": ["--token", "--expected-etag"] }[command];
  if (required.some((key) => !values[key]) || Object.keys(values).some((key) => key !== "--environment" && !required.includes(key) && !(command === "prepare" && ["--resume", "--replace-held-target"].includes(key)))
    || values["--resume"] && !["true", "false"].includes(values["--resume"])) throw new Error("Missing or unexpected manual release argument");
  if (values["--resume"] === "true" && values["--replace-held-target"]) throw new Error("Resume and target replacement cannot be combined");
  return { command, values };
};
export const runCatalogDeploy = async (args, env = process.env) => {
  const { command, values } = argumentsOf(args), environment = values["--environment"];
  if (command === "config") {
    const plan = JSON.parse(decode(file(values["--plan"]))), root = resolve(values["--release-dir"]);
    if (plan.context.environment !== environment) throw new Error("Plan environment differs");
    const config = deploymentConfig(readFileSync(join(root, `wrangler.${environment}.jsonc`), "utf8"), plan,
      { bucket: env.CHARACTER_CATALOG_R2_BUCKET, accountId: env.CHARACTER_CATALOG_R2_ACCOUNT_ID });
    writeFileSync(join(root, ".catalog-wrangler.json"), JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
    return { configured: environment };
  }
  const store = catalogStoreFromEnv(env);
  if (command === "status") return readReleaseState(store, environment);
  if (command === "cancel-unfenced") return abortUnfencedHandoff({ store, environment, expectedETag: values["--expected-etag"], token: values["--token"] });
  if (command === "prepare") {
    const out = resolve(values["--output"]);
    if (existsSync(out) && (!statSync(out).isDirectory() || readdirSync(out).length)) throw new Error("Manual release output must be an empty directory");
    const gh = createGitHub(REPO, env.GH_TOKEN || env.GITHUB_TOKEN);
    const result = await prepareManualRelease({ gh, store, environment, target: values["--target"], resume: values["--resume"] === "true",
      replaceHeldTarget: values["--replace-held-target"] || null, engine: env.CHARACTER_CATALOG_ENGINE });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "plan.json"), canonicalJSON(result.plan), { flag: "wx" });
    writeFileSync(join(out, "catalog.json"), encodeCatalog(result.plan.catalog).json, { flag: "wx" });
    if (result.portraits) { writeFileSync(join(out, "portraits.json"), JSON.stringify(result.portraits.manifest) + "\n", { flag: "wx" }); writeFileSync(join(out, "portraits.png"), result.portraits.png, { flag: "wx" }); }
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `baseline=${result.plan.context.baseline}\nengine=${result.plan.context.engine}\nreuse=${result.plan.reuse}\n`);
    return { operation: result.plan.operation, baseline: result.plan.context.baseline, reuse: result.plan.reuse };
  }
  const plan = JSON.parse(decode(file(values["--plan"])));
  if (command === "finish") return finishManualRelease({ store, plan, environment });
  const root = resolve(values["--portraits"]), portraits = { manifest: JSON.parse(decode(file(join(root, "portraits.json")))), png: file(join(root, "portraits.png")) };
  return stageManualRelease({ gh: createGitHub(REPO, env.GH_TOKEN || env.GITHUB_TOKEN), store, plan, environment, portraits });
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await runCatalogDeploy(process.argv.slice(2))) + "\n"); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
