// Valhodl's music lives outside git and the page (src/js/keep-music-data.js names each track; the Worker serves it from
// the KEEP_MUSIC R2 bucket at /media/keep/<name>-<hash>.mp3, worker/src/lecture-audio.js). This keeps the names:
//   node scripts/keep-music.mjs                       lists every track and whether untracked/keep-music/ holds it
//   node scripts/keep-music.mjs --import <name> <mp3>  brings a track in (new, or in an old one's place)
// A track is named by the first 16 hex of its SHA-256, so a name once published never changes what it holds. A manifest
// still carrying a track's bytes as base64 (as all did before R2) has them written out and replaced by its name.
// `npm --prefix worker run keep-music:<staging|production|local>` then puts them in that environment's bucket.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = join(root, "src/js/keep-music-data.js"), kept = join(root, "untracked/keep-music");
export const TRACK_FILE = /^[a-z]+-[0-9a-f]{16}\.mp3$/;
const fail = (message) => { console.error(message); process.exit(1); };
const nameOf = (track, bytes) => `${track}-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp3`;
const ENTRY = /([a-z]+): "([^"]*)"/g;
/** Every track the manifest names: `{ track: file }`. */
export const tracks = (text = readFileSync(manifest, "utf8")) => {
  const body = /BL\.keepMusicData = \{([\s\S]*?)\};/.exec(text)?.[1];
  if (body == null) throw new Error("keep-music-data.js: no BL.keepMusicData");
  return Object.fromEntries([...body.matchAll(ENTRY)].map((m) => [m[1], m[2]]));
};
const put = (track, bytes) => {
  mkdirSync(kept, { recursive: true });
  const file = nameOf(track, bytes);
  if (!existsSync(join(kept, file))) writeFileSync(join(kept, file), bytes);
  return file;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let text = readFileSync(manifest, "utf8");
  const at = process.argv.indexOf("--import");
  if (at > 0) {
    const [track, path] = process.argv.slice(at + 1);
    if (!/^[a-z]+$/.test(track || "") || !path || !existsSync(path)) fail("Usage: node scripts/keep-music.mjs --import <name> <file.mp3>  (a name of lower-case letters)");
    const file = put(track, readFileSync(path)), now = tracks(text);
    if (track in now) text = text.replace(new RegExp(`\\b${track}: "[^"]*"`), `${track}: "${file}"`);
    else text = text.replace(/(BL\.keepMusicData = \{[\s\S]*?) \};/, `$1, ${track}: "${file}" };`);
    writeFileSync(manifest, text);
    console.log(`${track}: ${file}`);
  } else {
    let moved = 0;
    for (const [track, value] of Object.entries(tracks(text))) {
      if (TRACK_FILE.test(value)) { console.log(`${value}${existsSync(join(kept, value)) ? "" : "  (not in untracked/keep-music/)"}`); continue; }
      const file = put(track, Buffer.from(value, "base64"));
      text = text.replace(`${track}: "${value}"`, `${track}: "${file}"`);
      console.log(`${file}  (written out of the manifest)`);
      moved++;
    }
    if (moved) writeFileSync(manifest, text);
  }
}
