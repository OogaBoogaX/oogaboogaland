// Puts the lecture recordings into an environment's LECTURE_AUDIO bucket, before a deploy that names them:
//   npm --prefix worker run lectures:staging        (or lectures:production, or lectures:local for `npm run dev`)
// Every recording a timing file names (src/js/lecture-<id>.timing.js, `<id>-<hash>.m4a`) is read from the gitignored
// untracked/lectures/, where `npm run lecture:script -- --import` keeps it, checked against the hash in its name and put
// at `lectures/<file>`. One the deployed site already serves is left alone: a name never changes what it holds.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const fail = (message) => { console.error(message); process.exit(1); };
const target = process.argv[2];
if (!["staging", "production", "local"].includes(target)) fail("Which environment? staging, production or local");
const configFile = join(root, `wrangler.${target === "local" ? "staging" : target}.jsonc`);
const config = readFileSync(configFile, "utf8");
const bucket = /"binding":\s*"LECTURE_AUDIO",\s*"bucket_name":\s*"([^"]+)"/.exec(config)?.[1] || fail(`${configFile} binds no LECTURE_AUDIO bucket`);
const origin = target === "local" ? null : /"SITE_ORIGIN":\s*"([^"]+)"/.exec(config)?.[1];

const js = join(root, "src", "js"), kept = join(root, "untracked", "lectures");
const files = readdirSync(js).filter((f) => /^lecture-[a-z]+-\d\d\.timing\.js$/.test(f)).sort().map((f) => {
  const name = /"([a-z]+-\d\d-[0-9a-f]{16}\.m4a)"\);\s*$/.exec(readFileSync(join(js, f), "utf8"))?.[1];
  return name || fail(`${f} names no recording; bring it in again with npm run lecture:script -- --import <folder>`);
});
if (!files.length) fail("No lecture has a recording yet.");

for (const file of files) {
  if (origin) {
    const served = await fetch(`${origin}/media/lectures/${file}`, { method: "HEAD", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (served && served.ok && served.headers.get("content-type") === "audio/mp4") { console.log(`${file}: already served at ${origin}`); continue; }
  }
  const path = join(kept, file);
  if (!existsSync(path)) fail(`${file}: not in untracked/lectures/; bring the recording in again, or copy it there from where it was imported`);
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
  if (!file.endsWith(`-${hash}.m4a`)) fail(`${file}: the file in untracked/lectures/ is not that recording (its hash starts ${hash})`);
  console.log(`${file}: putting it in ${bucket}${target === "local" ? " (local)" : ""}`);
  const put = spawnSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/lectures/${file}`, "--file", path, "--content-type", "audio/mp4",
    "--cache-control", "public, max-age=31536000, immutable", target === "local" ? "--local" : "--remote", "--config", configFile], { cwd: here, stdio: "inherit" });
  if (put.status !== 0) fail(`${file}: wrangler could not put it (exit ${put.status})`);
}
