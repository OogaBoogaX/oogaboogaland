// Read-only release checks: retain all publicly offered versions before fencing, then recheck distinct
// saved D1 versions before deployment. Neither source contains account IDs or other player data.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { parseWranglerConfig } from "./character-catalog-deploy.mjs";

const MAX_RESULT_BYTES = 128 * 1024, MAX_VERSIONS = 256;
const HASH = /^[a-f0-9]{64}$/, ITEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORIGINS = { staging: "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev", production: "https://oogabooga.land" };
const schema = readFileSync(new URL("../src/js/equipment-hats.js", import.meta.url), "utf8");
const fail = message => { throw new Error(`Equipment retention: ${message}`); };
const read = (root, relative, limit) => {
  const path = join(root, relative);
  let stat, actual;
  try { stat = lstatSync(path); actual = realpathSync(path); } catch { fail("required target file is missing"); }
  if (!stat.isFile() || !actual.startsWith(root + sep) || stat.size > limit) fail("invalid target file");
  const bytes = readFileSync(path);
  if (bytes.byteLength > limit) fail("target file exceeds its bound");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("invalid target encoding"); }
};
const parse = (text, message) => { try { return JSON.parse(text); } catch { fail(message); } };
const enabledFor = config => {
  const enabled = config.vars?.EQUIPMENT_ENABLED;
  if (enabled === undefined || enabled === "0") return false;
  if (enabled !== "1") fail("invalid feature flag");
  return true;
};
const targetRegistry = root => {
  // An older target cannot silently opt into equipment without the retention-aware release tools.
  read(root, "scripts/equipment-retention.mjs", MAX_RESULT_BYTES);
  const catalog = parse(read(root, "src/equipment/hats/catalog.json", MAX_RESULT_BYTES), "invalid target catalog");
  if (![1, 2].includes(catalog.format) || !Array.isArray(catalog.items) || catalog.items.length > 32) fail("invalid target catalog");
  // Only the approved tool's shared validator executes; target catalog/archive inputs stay JSON.
  const context = vm.createContext({ rows: JSON.stringify(catalog.items) });
  vm.runInContext(schema, context, { timeout: 1000 });
  const archives = new Map(), revisions = {};
  let count = 0;
  for (const item of catalog.items) {
    if (!item || typeof item.id !== "string" || !ITEM.test(item.id) || item.id.length > 64
      || !Array.isArray(item.versions) || (count += item.versions.length) > MAX_VERSIONS) fail("invalid target registry");
    for (const version of item.versions) {
      if (!HASH.test(version || "")) fail("invalid target version");
      const text = read(root, `src/equipment/hats/${version}.json`, context.BL.equipmentHats.MAX_BYTES);
      if (createHash("sha256").update(text).digest("hex") !== version) fail("saved hat archive digest differs");
      context.archive = text; context.item = item.id;
      let archive;
      try {
        archive = vm.runInContext("BL.equipmentHats.validate(JSON.parse(archive),item)", context, { timeout: 1000 });
        if (context.BL.equipmentHats.encode(archive) !== text) fail("saved hat archive is not canonical");
      } catch { fail("saved hat archive is invalid or noncanonical"); }
      archives.set(version, archive);
      revisions[version] = { item: item.id, content: archive.format === 2 ? archive.content
        : createHash("sha256").update(context.BL.equipmentHats.encode(context.BL.equipmentHats.contentOf(archive))).digest("hex"),
      profile: archive.format === 2 ? archive.profile : context.BL.equipmentHats.legacyProfile(item.id), parent: archive.format === 2 ? archive.parent : null };
    }
  }
  context.revisions = JSON.stringify(revisions);
  try { vm.runInContext("BL.equipmentHats.register(JSON.parse(rows),JSON.parse(revisions))", context, { timeout: 1000 }); }
  catch { fail("invalid target registry"); }
  return { context, archives };
};
const retain = (root, { context, archives }, rows) => {
  const seen = new Set(), contents = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Object.keys(row).sort().join(",") !== "item,version"
      || typeof row.item !== "string" || row.item.length > 64 || row.item === "none" || !ITEM.test(row.item) || !HASH.test(row.version || ""))
      fail("expected only item/version pairs");
    const key = row.item + ":" + row.version;
    if (seen.has(key)) fail("version pairs are not distinct");
    seen.add(key);
    if (!context.BL.equipmentHats.has(row.item, row.version)) fail("target omits a retained hat version");
    const archive = archives.get(row.version);
    if (archive.format !== 2 || contents.has(archive.content)) continue;
    // A retained revision is usable only with its complete geometry. The manifest hash also pins
    // item, fit profile and parent, so a shared blob cannot silently refit or reparent a saved choice.
    const text = read(root, `src/equipment/hats/${archive.content}.json`, context.BL.equipmentHats.MAX_BYTES);
    if (createHash("sha256").update(text).digest("hex") !== archive.content) fail("saved hat content digest differs");
    context.content = text;
    try {
      if (vm.runInContext("BL.equipmentHats.encode(BL.equipmentHats.validateContent(JSON.parse(content)))", context, { timeout: 1000 }) !== text)
        fail("saved hat content is not canonical");
    } catch { fail("saved hat content is invalid or noncanonical"); }
    contents.add(archive.content);
  }
  return seen.size;
};

export const validateEquipmentRetention = (releaseDir, resultJSON) => {
  const root = realpathSync(releaseDir), config = parse(read(root, ".catalog-wrangler.json", MAX_RESULT_BYTES), "invalid release config");
  if (!enabledFor(config)) return { enabled: false, retained: 0 };
  const context = targetRegistry(root);
  if (typeof resultJSON !== "string" || Buffer.byteLength(resultJSON) > MAX_RESULT_BYTES) fail("invalid or oversized D1 result");
  const result = parse(resultJSON, "invalid D1 result");
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true || !Array.isArray(result[0].results)
    || result[0].results.length > MAX_VERSIONS) fail("incomplete or oversized D1 result");
  return { enabled: true, retained: retain(root, context, result[0].results) };
};

export const preflightEquipmentRetention = async ({ releaseDir, environment, fetcher = fetch, timeoutMs = 4000 }) => {
  if (!ORIGINS[environment] || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) fail("explicit valid environment required");
  const root = realpathSync(releaseDir);
  let config;
  try { config = parseWranglerConfig(read(root, `wrangler.${environment}.jsonc`, MAX_RESULT_BYTES)); } catch { fail("invalid target environment config"); }
  if (config.name !== `oogaboogaland-${environment}` || config.vars?.ENVIRONMENT !== environment || config.vars.SITE_ORIGIN !== ORIGINS[environment])
    fail("target environment differs");
  const enabled = enabledFor(config), context = enabled ? targetRegistry(root) : null, controller = new AbortController();
  let timer, reader = null;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reader?.cancel().catch(() => {}); reject(new Error("Equipment retention: public catalog deadline exceeded"));
  }, timeoutMs); });
  try {
    const response = await Promise.race([fetcher(`${ORIGINS[environment]}/api/equipment/catalog`, {
      credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" }, signal: controller.signal
    }), deadline]);
    // The first equipment deployment follows an older Worker that has no registry endpoint.
    if (response.status === 404) { await response.body?.cancel(); return { enabled, retained: 0, bootstrap: true }; }
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("application/json")
      || Number(response.headers.get("content-length")) > MAX_RESULT_BYTES || !response.body) fail("published catalog unavailable");
    reader = response.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
      size += part.value.byteLength; if (size > MAX_RESULT_BYTES) fail("published catalog exceeds its bound"); chunks.push(part.value);
    }
    const value = parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), "invalid published catalog");
    if (!value || Object.keys(value).sort().join(",") !== "format,items" || value.format !== 1 || !Array.isArray(value.items) || value.items.length > 32)
      fail("invalid published registry");
    const rows = [], ids = new Set();
    for (const item of value.items) {
      if (!item || Object.keys(item).sort().join(",") !== "id,versions" || typeof item.id !== "string" || ids.has(item.id)
        || !Array.isArray(item.versions) || !item.versions.length || item.versions.length > MAX_VERSIONS || rows.length + item.versions.length > MAX_VERSIONS)
        fail("invalid published versions");
      ids.add(item.id);
      for (const version of item.versions) rows.push({ item: item.id, version });
    }
    // Disabling wearers does not retire immutable archives. The public registry stays available while off,
    // so losing its history here would make a subsequent re-enable unable to recover unpublished selections.
    return { enabled, retained: retain(root, context || targetRegistry(root), rows) };
  } finally { clearTimeout(timer); if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const result = args.length === 1 ? validateEquipmentRetention(args[0], process.env.EQUIPMENT_RETENTION_RESULT)
      : args.length === 3 && args[0] === "preflight" ? await preflightEquipmentRetention({ environment: args[1], releaseDir: args[2] })
      : fail("provide the approved release directory, or preflight staging|production DIR");
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
