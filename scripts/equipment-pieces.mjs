// The equipment pipeline (.github/workflows/equipment-pieces.yml): after character files reach rock, what the wardrobe
// and the hats would publish from them, for a maintainer to review in a PR. Two modes, run in two jobs so the job that
// runs character code never holds a write token:
//   --author <dir>   runs the wardrobe's authoring (scripts/equipment-wardrobe.mjs, which runs every character file in a
//                    sandbox) and the hats' source check, and writes the report to <dir> (report.md, report.json).
//   --labels <base> <branch>
//                    merges the names a maintainer gave on the open PR's branch into rock's labels.json: a name the
//                    branch added, changed or took away since <base> (its labels where it was cut) wins, every other
//                    entry stays rock's.
//   --apply <from>   copies the authored wardrobe data from <from> (a copy of src/equipment/wardrobe) over the checkout,
//                    data files only, and checks it as every build does, without running any character's code.
// Hats are only reported: publishing one advances a version its wearers are offered, so a maintainer decides.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorWardrobe, writeWardrobe } from "./equipment-wardrobe.mjs";
import { checkEquipmentHatSources } from "./equipment-hats.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wardrobe = join(root, "src/equipment/wardrobe");
const PIECE = /^[a-f0-9]{64}\.json$/;
const read = (file) => readFileSync(file, "utf8");
const catalogOf = (dir) => existsSync(join(dir, "catalog.json")) ? JSON.parse(read(join(dir, "catalog.json"))).items : [];

// A reviewed name for a piece: `<slot>:<handle>` to a short name.
const checkLabels = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 512) throw new Error("Invalid wardrobe labels");
  for (const [key, label] of Object.entries(value))
    if (!/^[a-zA-Z]+:[A-Za-z0-9-]{1,39}$/.test(key) || typeof label !== "string" || !label.trim() || label.length > 80) throw new Error(`Invalid wardrobe label ${key}`);
  return value;
};

// Characters whose file has a hat hook no reviewed hat definition names.
const unlistedHats = () => {
  const listed = new Set(JSON.parse(read(join(root, "src/equipment/hats/sources.json"))).items
    .filter((row) => row.source.kind === "character").map((row) => row.source.handle.toLowerCase()));
  return readdirSync(join(root, "src/characters")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3))
    .filter((handle) => /\b(hat|hatNodes)\s*(\(\s*k\b|:)/.test(read(join(root, "src/characters", handle + ".js"))) && !listed.has(handle.toLowerCase()));
};

const author = (out) => {
  const before = new Map(catalogOf(wardrobe).map((row) => [row.version, row]));
  authorWardrobe(root);
  const after = catalogOf(wardrobe);
  const added = after.filter((row) => !before.has(row.version) && !row.retired);
  const retired = after.filter((row) => row.retired && before.has(row.version) && !before.get(row.version).retired);
  const renamed = after.filter((row) => before.has(row.version) && before.get(row.version).label !== row.label)
    .map((row) => ({ ...row, was: before.get(row.version).label }));
  // Each reviewed hat is built on its own: one that no longer builds is reported, never stopping the wardrobe's run.
  const drift = checkEquipmentHatSources(root), unlisted = unlistedHats();
  const report = { added, retired, renamed, hats: { geometryChanged: drift.geometryChanged.map((row) => row.id), failed: drift.failed, unlisted } };
  const who = (row) => row.creators.join(", ");
  const lines = ["## Equipment pieces from rock", ""];
  if (added.length) {
    lines.push("**New wardrobe pieces**", "", "| Slot | Name | From |", "|---|---|---|");
    for (const row of added) lines.push(`| ${row.slot} | ${row.label} | ${who(row)} |`);
    lines.push("", "A generic name (\"X's shirt\") can be replaced on this branch in `src/equipment/wardrobe/labels.json`, keyed `<slot>:<handle>`, and the next run keeps it.", "");
  }
  if (retired.length) {
    lines.push("**Retired** (no character makes these any more; whoever wears one keeps it)", "", "| Slot | Name | From |", "|---|---|---|");
    for (const row of retired) lines.push(`| ${row.slot} | ${row.label} | ${who(row)} |`);
    lines.push("");
  }
  if (renamed.length) {
    lines.push("**Renamed**", "");
    for (const row of renamed) lines.push(`- ${row.slot}: ${row.was} → ${row.label}`);
    lines.push("");
  }
  const hatLines = [];
  if (report.hats.geometryChanged.length || drift.failed.length || unlisted.length) {
    hatLines.push("**Hats need a maintainer** (never published by this pipeline)", "");
    for (const id of report.hats.geometryChanged) hatLines.push(`- \`${id}\`: its creator's hat hook draws something new. Publish it as an update to its wearers (\`node scripts/equipment-hats.mjs --author ${id}\`), or, if it is a different hat, add a new reviewed definition in \`src/equipment/hats/sources.json\` and leave this one as it is.`);
    for (const { id, error } of drift.failed) hatLines.push(`- \`${id}\` no longer builds from its creator's file (${error}). Fix the file, or take the definition out of \`src/equipment/hats/sources.json\`; its published versions stay for their wearers.`);
    for (const handle of unlisted) hatLines.push(`- \`${handle}\` has a hat hook no reviewed definition names: add one to \`src/equipment/hats/sources.json\` and run \`node scripts/equipment-hats.mjs --author <id>\`.`);
    hatLines.push("");
  }
  lines.push(...hatLines);
  if (lines.length === 2) lines.push("Nothing new: every piece the characters make is published.");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(out, "report.md"), lines.join("\n") + "\n");
  writeFileSync(join(out, "hats.md"), hatLines.length ? ["## Hats waiting on a maintainer", "", ...hatLines.slice(2)].join("\n") + "\n" : "");
  return report;
};

const mergeLabels = (baseFile, branchFile) => {
  const file = join(wardrobe, "labels.json"), rock = existsSync(file) ? checkLabels(JSON.parse(read(file))) : {};
  const base = checkLabels(JSON.parse(read(baseFile))), branch = checkLabels(JSON.parse(read(branchFile)));
  // A name added, changed or taken away on the branch since it was cut is the maintainer's; every other entry is rock's.
  for (const key of new Set([...Object.keys(base), ...Object.keys(branch)])) {
    if (base[key] === branch[key]) continue;
    if (Object.hasOwn(branch, key)) rock[key] = branch[key]; else delete rock[key];
  }
  writeFileSync(file, JSON.stringify(checkLabels(rock), null, 2) + "\n");
  return { labels: Object.keys(rock).length };
};

const apply = (from) => {
  for (const name of readdirSync(from)) {
    if (name === "labels.json") checkLabels(JSON.parse(read(join(from, name))));
    else if (name !== "catalog.json" && !PIECE.test(name)) throw new Error(`Unexpected file in the authored wardrobe: ${name}`);
    // A piece is immutable: an existing one is never replaced, only new ones added.
    if (PIECE.test(name) && existsSync(join(wardrobe, name))) {
      if (read(join(wardrobe, name)) !== read(join(from, name))) throw new Error(`Authored piece ${name} differs from the published one`);
      continue;
    }
    copyFileSync(join(from, name), join(wardrobe, name));
  }
  return writeWardrobe(root);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, dir, other] = process.argv.slice(2);
  if (!["--author", "--apply", "--labels"].includes(mode) || !dir || mode === "--labels" && !other)
    throw new Error("Usage: node scripts/equipment-pieces.mjs --author <report dir> | --labels <base labels> <branch labels> | --apply <authored wardrobe dir>");
  console.log(JSON.stringify(mode === "--author" ? author(dir) : mode === "--labels" ? mergeLabels(dir, other) : apply(dir)));
}
