// `npm run archive -- --rev <sha>`: writes src/js/cloud-archive-data.js, the Cloud Archive's shelves, from the git
// history of one explicit revision of the official rock (scripts/cloud-archive-lib.mjs has the rules). It reads the
// official branch's tip and its PRs' published heads with `git ls-remote` (no refs are written), refuses a revision
// that is not on that branch or not in this clone, and refuses a shallow clone, so the archive is never a fork's
// HEAD or a partial history. `--official <url or path>` and `--out <file>` exist for the suite's made-up histories.
// The PR-head matches depend on the PR refs as read at that moment as well as on --rev: the snapshot records when and
// from where they were read, how many there were and their digest, and `--pull-refs <file>` (saved `git ls-remote
// <official> 'refs/pull/*/head'` output) regenerates against exactly that ref snapshot.
// Authors come from GitHub's own records: `--github-authors <file>` is the REST commits API's author per commit, saved
// with (one line, run where `gh` is signed in):
//   gh api --paginate "repos/OogaBoogaX/oogaboogaland/commits?sha=<rev>&per_page=100" \
//     --jq '.[] | {sha: .sha, login: .author.login, id: .author.id, type: .author.type}' > github-authors-<rev>.ndjson
// It must cover every commit at --rev. Without it, `--provisional` writes a snapshot that says it has no GitHub records;
// with neither, the script refuses rather than guess.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { OFFICIAL, LOG_FORMAT, parseLog, parsePullHeads, parseGithubAuthors, checkRevision, buildArchive } from "./cloud-archive-lib.mjs";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const cwd = arg("cwd") || fileURLToPath(new URL("..", import.meta.url));
const official = arg("official") || OFFICIAL.url;
const out = arg("out") || fileURLToPath(new URL("../src/js/cloud-archive-data.js", import.meta.url));
const rev = arg("rev");
const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const fail = (why) => { console.error(`cloud-archive: ${why}`); process.exit(1); };

if (git("rev-parse", "--is-shallow-repository").trim() !== "false") fail("this clone is shallow; run `git fetch --unshallow` first so every commit is shelved");
const tipLine = git("ls-remote", official, `refs/heads/${OFFICIAL.branch}`).trim();
const officialTip = tipLine.split("\t")[0];
const present = (sha) => { try { git("cat-file", "-e", `${sha}^{commit}`); return true; } catch { return false; } };
if (/^[0-9a-f]{40}$/.test(officialTip || "") && !present(officialTip)) fail(`the official tip ${officialTip} is not in this clone; run \`git fetch ${official} ${OFFICIAL.branch}\``);
if (rev && /^[0-9a-f]{40}$/.test(rev) && !present(rev)) fail(`${rev} is not in this clone`);
const isAncestor = (a, b) => { try { git("merge-base", "--is-ancestor", a, b); return true; } catch { return false; } };
const refused = checkRevision({ rev, officialTip, isAncestor });
if (refused) fail(refused);

const commits = parseLog(git("log", rev, "--date=unix", `--format=${LOG_FORMAT}`));
const authorsFile = arg("github-authors"), provisional = process.argv.includes("--provisional");
if (!authorsFile && !provisional) fail("give --github-authors <file> (GitHub's author records; see the header), or --provisional to write a snapshot without them");
let github = null, githubInfo = {};
if (authorsFile) {
  const text = readFileSync(authorsFile, "utf8");
  github = parseGithubAuthors(text);
  const missing = commits.filter((c) => !github.has(c.sha));
  if (missing.length) fail(`${authorsFile} has no GitHub author record for ${missing.length} commit(s) at ${rev}, e.g. ${missing[0].sha}; save it again for this --rev`);
  githubInfo = { source: `GitHub REST API repos/${OFFICIAL.repo}/commits?sha=${rev} (author.login, id, type), saved as ${authorsFile.split(/[\\/]/).pop()}`,
    readAt: statSync(authorsFile).mtime.toISOString(), digest: createHash("sha256").update(text).digest("hex") };
}
const pullRefsFile = arg("pull-refs");
const pullRefs = pullRefsFile
  ? { text: readFileSync(pullRefsFile, "utf8"), fetchedAt: statSync(pullRefsFile).mtime.toISOString(), source: `saved ls-remote output (${pullRefsFile.split(/[\\/]/).pop()}; read time is the file's)` }
  : { text: git("ls-remote", official, "refs/pull/*/head"), fetchedAt: new Date().toISOString(), source: `git ls-remote ${official} 'refs/pull/*/head'` };
const pullHeads = parsePullHeads(pullRefs.text);
const identities = JSON.parse(readFileSync(new URL("./cloud-archive-identities.json", import.meta.url), "utf8")).identities;
const data = buildArchive({ commits, pullHeads, pullRefs: { fetchedAt: pullRefs.fetchedAt, source: pullRefs.source }, identities, github, githubInfo, rev, officialTip, repo: OFFICIAL.repo });
writeFileSync(out, `// Generated by \`npm run archive -- --rev ${rev}\` (scripts/cloud-archive.mjs). Do not edit; see its provenance.
// The Cloud Archive's shelves: one day a shelf, one commit a book, as [sha, person, title, pr (a PR-head match, else 0), flags (2 merge, 4 a head several PRs share)].
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  BL.cloudArchiveData = ${JSON.stringify(data)};
})();
`);
const c = data.counts, k = c.identities, r = data.provenance.pullRefs, a = data.provenance.authorRecords;
console.log(`cloud-archive: ${c.commits} commits on ${data.days.length} days at ${rev.slice(0, 12)} (official tip ${officialTip.slice(0, 12)}); `
  + `${c.prHeadMatches} PR numbers matched by ${c.prHeadMatchRows} merges, ${c.sharedHeadMerges} merges of a shared head credited to none, `
  + `against ${r.count} PR refs (digest ${r.digest.slice(0, 12)}); authors ${a.mode === "github" ? `from GitHub's records (${a.linked} commits linked, ${a.unlinked} not)` : "PROVISIONAL (no GitHub records)"}; author identities: ${k.account} account, ${k.unlinked} unlinked, ${k.automation} automation, ${k.agent} agent, ${k.organisation} organisation, ${c.uncertainIdentities} uncertain`);
