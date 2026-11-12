// Says where a character file would go in the intake before it is pushed: `npm run character:check -- <handle> ...`
// takes handles or paths, and with none reads every file in src/characters. It runs the intake's own screen
// (scripts/character-safety.mjs) on each file as text and never runs the file. It cannot say who owns a character:
// the intake settles that from the PR's author and every commit's author on GitHub.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CharacterRejection, SOURCE_LIMIT, characterPath, scanCharacter, screenFinding } from "./character-safety.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "characters");
const named = process.argv.slice(2);
const files = named.length
  ? named.map((arg) => existsSync(arg) ? arg : join(dir, `${arg.replace(/\.js$/, "")}.js`))
  : readdirSync(dir).filter((name) => name.endsWith(".js")).sort().map((name) => join(dir, name));
let refused = 0;
for (const file of files) {
  const name = basename(file);
  if (!existsSync(file)) { console.log(`${name}: no such file in src/characters.`); refused++; continue; }
  const source = readFileSync(file, "utf8"), bytes = Buffer.byteLength(source);
  const size = `${bytes} of ${SOURCE_LIMIT} bytes (${Math.round(bytes / SOURCE_LIMIT * 100)}%)`;
  if (!characterPath(`src/characters/${name}`)) {
    console.log(`${name}: refused. A character file is named for its handle: letters, digits and hyphens, 39 at most, then .js.`);
    refused++; continue;
  }
  try {
    const scanned = scanCharacter(source), row = scanned.row;
    const who = row.github && row.github.toLowerCase() !== row.handle.toLowerCase() ? `${row.handle}, owned by ${row.github}` : row.handle;
    if (scanned.lane === "daily") {
      console.log(`${name}: automatic lane, for ${who}. Plain data: it merges with the next daily bundle, rewritten from its data (comments are not kept). ${size}.`);
    } else {
      console.log(`${name}: manual review, for ${who}. Custom code: a maintainer reads and merges it. ${size}.`);
      console.log(`  Not plain data because: ${scanned.why}`);
    }
  } catch (error) {
    if (!(error instanceof CharacterRejection)) throw error;
    refused++;
    const hit = screenFinding(source);
    console.log(`${name}: refused. ${error.message} ${size}.`);
    if (hit) console.log(`  Line ${hit.line}: "${hit.text}". The screen reads comments and strings as well as code.`);
  }
}
process.exitCode = refused ? 1 : 0;
