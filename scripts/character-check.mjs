// Says where a character file would go in the intake before it is pushed: `npm run character:check -- <handle> ...`
// takes handles or paths, and with none reads every file in src/characters. It runs the intake's own screen
// (scripts/character-safety.mjs) on each file as text and never runs the file. It cannot say who owns a character:
// the intake settles that from the PR's author and every commit's author on GitHub. `describe(file)` is the same
// reading for another script (the studio says it on every save).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CharacterRejection, SOURCE_LIMIT, characterPath, scanCharacter, screenFinding } from "./character-safety.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "characters");

// One file's reading: `refused`, the lines that say its lane, why, and how full it is, and `brief`, the same in a
// few words; and the same as data for the studio's panel: `bytes` of `limit`, `lane` ("daily", "manual", or "" when
// refused), `why` (what keeps it out of the automatic lane, or why it is refused) and `finding` (the screen's
// line and text, or null).
export const describe = (file) => {
  const name = basename(file);
  if (!existsSync(file)) return { refused: true, brief: `${name}: no such file`, lines: [`${name}: no such file in src/characters.`], bytes: 0, limit: SOURCE_LIMIT, lane: "", why: "no such file", finding: null };
  const source = readFileSync(file, "utf8"), bytes = Buffer.byteLength(source), full = Math.round(bytes / SOURCE_LIMIT * 100);
  const size = `${bytes} of ${SOURCE_LIMIT} bytes (${full}%)`, data = { bytes, limit: SOURCE_LIMIT, finding: null };
  if (!characterPath(`src/characters/${name}`)) {
    return { refused: true, brief: `${name}: refused, a file is named for its handle`, lines: [`${name}: refused. A character file is named for its handle: letters, digits and hyphens, 39 at most, then .js.`],
      ...data, lane: "", why: "A character file is named for its handle." };
  }
  try {
    const scanned = scanCharacter(source), row = scanned.row;
    const who = row.github && row.github.toLowerCase() !== row.handle.toLowerCase() ? `${row.handle}, owned by ${row.github}` : row.handle;
    if (scanned.lane === "daily") {
      return { refused: false, brief: `${name}: plain data, the automatic lane · ${full}% of the size limit`,
        lines: [`${name}: automatic lane, for ${who}. Plain data: it merges with the next daily bundle, rewritten from its data (comments are not kept). ${size}.`], ...data, lane: "daily", why: "" };
    }
    return { refused: false, brief: `${name}: custom code, a maintainer's review · ${full}% of the size limit`,
      lines: [`${name}: manual review, for ${who}. Custom code: a maintainer reads and merges it. ${size}.`, `  Not plain data because: ${scanned.why}`], ...data, lane: "manual", why: scanned.why };
  } catch (error) {
    if (!(error instanceof CharacterRejection)) throw error;
    const hit = screenFinding(source), lines = [`${name}: refused. ${error.message} ${size}.`];
    if (hit) lines.push(`  Line ${hit.line}: "${hit.text}". The screen reads comments and strings as well as code.`);
    return { refused: true, brief: `${name}: the intake would refuse this${hit ? ` · line ${hit.line}: "${hit.text}"` : ""} · ${error.message}`, lines, ...data, lane: "", why: error.message, finding: hit };
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const named = process.argv.slice(2);
  const files = named.length
    ? named.map((arg) => existsSync(arg) ? arg : join(dir, `${arg.replace(/\.js$/, "")}.js`))
    : readdirSync(dir).filter((name) => name.endsWith(".js")).sort().map((name) => join(dir, name));
  let refused = 0;
  for (const file of files) {
    const reading = describe(file);
    if (reading.refused) refused++;
    for (const line of reading.lines) console.log(line);
  }
  process.exitCode = refused ? 1 : 0;
}
