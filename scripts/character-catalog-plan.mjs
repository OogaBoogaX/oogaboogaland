// Read-only release planning. Every output goes to stdout: this command has no
// storage credentials, upload operation, checkout, or deployment path.
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { activateCatalog, CATALOG_MAX_BYTES, planCatalog, readCatalog, seedCatalog } from "./character-catalog.mjs";
import { verifyMergedCatalogBundle } from "./character-catalog-source.mjs";
import { createGitHub } from "./character-github.mjs";

const REPOSITORY = "OogaBoogaX/oogaboogaland";
const HELP = `Character catalog planning (never publishes):
  node scripts/character-catalog-plan.mjs seed <baseline-input.json>
  node scripts/character-catalog-plan.mjs verify <catalog.json>
  node scripts/character-catalog-plan.mjs plan <catalog.json> <activation.json> --pr <number> --merge <sha> --bot <login>
  node scripts/character-catalog-plan.mjs activate <catalog.json> --expected-generation 0
  node scripts/character-catalog-plan.mjs activate <catalog.json> <activation.json> --expected-generation <number> [--rollback]

seed takes an explicitly approved baseline: { environment, engine, baseline,
sources: [{ path, source, blob, kind }] }. Each source is text and blob its Git
blob SHA. No source files are discovered or executed. Custom baseline entries
must be explicitly marked kind: "custom"; daily changes are always plain data.

plan reads GitHub with GH_TOKEN or GITHUB_TOKEN and verifies the exact merged
daily bundle. It emits the proposed canonical catalog; activate emits a proposed
activation manifest. Neither command writes or advances a production pointer.
`;

const read = (path, limit = CATALOG_MAX_BYTES) => {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > limit) throw new Error("Expected a bounded JSON file");
  const bytes = readFileSync(path);
  if (bytes.length > limit) throw new Error("JSON input exceeds its byte bound");
  const text = bytes.toString("utf8");
  if (!bytes.equals(Buffer.from(text))) throw new Error("JSON input is not UTF-8");
  return text;
};
const json = (path, limit) => JSON.parse(read(path, limit));
const parse = (args) => {
  const [command, ...rest] = args, files = [], flags = new Map();
  const allowed = command === "plan" ? ["--pr", "--merge", "--bot"]
    : command === "activate" ? ["--expected-generation", "--rollback"] : [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) { files.push(arg); continue; }
    if (!allowed.includes(arg) || flags.has(arg)) throw new Error("Unknown or repeated option");
    if (arg === "--rollback") flags.set(arg, true);
    else {
      const value = rest[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing option value");
      flags.set(arg, value);
    }
  }
  const count = command === "plan" ? files.length === 2 : command === "activate" ? files.length >= 1 && files.length <= 2 : files.length === 1;
  if (!["seed", "verify", "plan", "activate"].includes(command) || !count) throw new Error("Invalid command; use --help for usage");
  return { command, files, flags };
};

export const runCatalogPlan = async (args, env = process.env) => {
  if (args.length === 1 && args[0] === "--help") return HELP;
  const { command, files, flags } = parse(args);
  if (command === "seed") {
    // Source text is larger than the resulting data-only snapshot. Still bound
    // the input before parsing, independently of the per-character source caps.
    const input = json(files[0], 16 * 1024 * 1024);
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).sort().join(",") !== "baseline,engine,environment,sources") throw new Error("Invalid baseline input fields");
    return seedCatalog(input).json;
  }
  const current = readCatalog(read(files[0]));
  if (command === "verify") return JSON.stringify({ revision: current.digest, environment: current.catalog.environment,
    engine: current.catalog.engine, baseline: current.catalog.baseline, characters: current.catalog.entries.length,
    events: current.catalog.events.length }) + "\n";
  const activation = files[1] ? json(files[1]) : null;
  if (command === "activate") {
    const generation = flags.get("--expected-generation");
    if (typeof generation !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(generation) || !Number.isSafeInteger(Number(generation))) throw new Error("An explicit expected generation is required");
    return JSON.stringify(activateCatalog(activation, current.catalog, {
      expectedGeneration: Number(generation), rollback: flags.has("--rollback")
    })) + "\n";
  }
  const pr = flags.get("--pr"), merge = flags.get("--merge"), bot = flags.get("--bot");
  if (!/^[1-9][0-9]*$/.test(pr || "") || !Number.isSafeInteger(Number(pr)) || !/^[a-f0-9]{40}$/.test(merge || "")
    || !/^[A-Za-z0-9-]+\[bot\]$/.test(bot || "")) throw new Error("An explicit PR, merge SHA and trusted bot login are required");
  const gh = createGitHub(REPOSITORY, env.GH_TOKEN || env.GITHUB_TOKEN);
  const bundle = await verifyMergedCatalogBundle(gh, { pr: Number(pr), merge, bot });
  return planCatalog(current.catalog, bundle, { environment: current.catalog.environment, engine: current.catalog.engine, activation }).json;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await runCatalogPlan(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
