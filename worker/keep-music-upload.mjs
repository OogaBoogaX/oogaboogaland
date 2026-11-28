// Puts Valhodl's music into an environment's KEEP_MUSIC bucket, before a deploy that names it:
//   npm --prefix worker run keep-music:staging      (or keep-music:production, or keep-music:local for `npm run dev`)
// Every track src/js/keep-music-data.js names (`<name>-<hash>.mp3`) is read from the gitignored untracked/keep-music/,
// where `node scripts/keep-music.mjs` keeps it, checked against the hash in its name and put at `keep-music/<file>`.
// One the deployed site already serves is left alone: a name never changes what it holds.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRACK_FILE, tracks } from "../scripts/keep-music.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const fail = (message) => { console.error(message); process.exit(1); };
const target = process.argv[2];
if (!["staging", "production", "local"].includes(target)) fail("Which environment? staging, production or local");
const configFile = join(root, `wrangler.${target === "local" ? "staging" : target}.jsonc`);
const config = readFileSync(configFile, "utf8");
const bucket = /"binding":\s*"KEEP_MUSIC",\s*"bucket_name":\s*"([^"]+)"/.exec(config)?.[1] || fail(`${configFile} binds no KEEP_MUSIC bucket`);
const origin = target === "local" ? null : /"SITE_ORIGIN":\s*"([^"]+)"/.exec(config)?.[1];

const kept = join(root, "untracked", "keep-music"), files = Object.values(tracks());
if (!files.length) fail("keep-music-data.js names no track.");
for (const file of files) {
  if (!TRACK_FILE.test(file)) fail(`${file.slice(0, 40)}: not a track's name; run node scripts/keep-music.mjs`);
  if (origin) {
    const served = await fetch(`${origin}/media/keep/${file}`, { method: "HEAD", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (served && served.ok && served.headers.get("content-type") === "audio/mpeg") { console.log(`${file}: already served at ${origin}`); continue; }
  }
  const path = join(kept, file);
  if (!existsSync(path)) fail(`${file}: not in untracked/keep-music/; bring the track in again with node scripts/keep-music.mjs --import`);
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
  if (!file.endsWith(`-${hash}.mp3`)) fail(`${file}: the file in untracked/keep-music/ is not that track (its hash starts ${hash})`);
  console.log(`${file}: putting it in ${bucket}${target === "local" ? " (local)" : ""}`);
  const put = spawnSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/keep-music/${file}`, "--file", path, "--content-type", "audio/mpeg",
    "--cache-control", "public, max-age=31536000, immutable", target === "local" ? "--local" : "--remote", "--config", configFile], { cwd: here, stdio: "inherit" });
  if (put.status !== 0) fail(`${file}: wrangler could not put it (exit ${put.status})`);
}
