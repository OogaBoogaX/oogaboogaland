// Publication reads a merged daily bundle at immutable revisions. It never
// checks out source, executes a character, or consults today's rock/head files.
import { createHash } from "node:crypto";
import { BOT } from "./character-operators.mjs";
import { parseSafeCharacter } from "./character-safety.mjs";
import { branchPrefix, checkRegistry, digest, inspectSubmission, manifestPath, readManifest } from "./character-submissions.mjs";

const SHA = /^[a-f0-9]{40}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const fail = (message) => { throw new Error(`Character catalog source: ${message}`); };
const same = (a, b) => a?.sha === b?.sha && a?.mode === b?.mode && a?.type === b?.type;

// gh.tree refuses GitHub's truncated response before exposing the Map. Compare
// whole leaf trees here: the compare/commits endpoints cap their file lists.
const leaves = async (gh, ref) => {
  const tree = await gh.tree(ref);
  if (!(tree instanceof Map)) fail("missing complete Git tree");
  const result = new Map();
  for (const [path, entry] of tree) {
    if (typeof path !== "string" || !entry || entry.path !== path || !SHA.test(entry.sha)) fail("invalid Git tree entry");
    if (entry.type !== "tree") result.set(path, entry);
  }
  return result;
};
const regular = async (gh, ref, tree, path, max = 32768) => {
  const entry = tree.get(path);
  if (!entry) return null;
  if (entry.type !== "blob" || entry.mode !== "100644" || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > max) fail("expected a bounded regular file");
  const file = await gh.file(ref, path, max);
  if (!file || file.sha !== entry.sha || typeof file.source !== "string" || Buffer.byteLength(file.source) !== entry.size
    || createHash("sha1").update(`blob ${entry.size}\0`).update(file.source, "utf8").digest("hex") !== entry.sha) fail("file differs from its Git tree");
  return file;
};
const sameTree = (a, b) => a.size === b.size && [...a].every(([path, entry]) => same(entry, b.get(path)));

// pr is the bundle's number, merge its expected merge commit, and bot the
// configured trusted bundle App login. The result contains only immutable
// GitHub evidence; the planner supplies production engine/environment policy.
export const verifyMergedCatalogBundle = async (gh, { pr, merge, bot, now = Date.now() }) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(gh.repo || "") || !Number.isSafeInteger(pr) || pr <= 0
    || !SHA.test(merge || "") || !/^[A-Za-z0-9-]+\[bot\]$/.test(bot || "") || !Number.isFinite(now)) fail("invalid publication request");
  const bundle = await gh.api(`pulls/${pr}`);
  const mergedAt = Date.parse(bundle?.merged_at);
  if (bundle?.number !== pr || bundle.state !== "closed" || bundle.draft !== false || !Number.isFinite(mergedAt) || mergedAt > now || bundle.merged !== true
    || bundle.merge_commit_sha !== merge || bundle.base?.ref !== "rock" || bundle.base?.repo?.full_name !== gh.repo
    || bundle.head?.repo?.full_name !== gh.repo || !bundle.head.ref?.startsWith(branchPrefix("daily"))
    || !SHA.test(bundle.head.sha || "") || ![bot, BOT].includes(bundle.user?.login)) fail("not a merged daily bundle in this repository");
  const head = bundle.head.sha;
  const headCommit = await gh.api(`commits/${head}`);
  if (headCommit?.sha !== head || headCommit.author?.login !== bot || headCommit.commit?.verification?.verified !== true) fail("bundle head is not signed by the trusted bot");
  const mergeCommit = await gh.api(`commits/${merge}`);
  const parents = mergeCommit?.parents;
  if (mergeCommit?.sha !== merge || !Array.isArray(parents) || ![1, 2].includes(parents.length)
    || parents.some((parent) => !SHA.test(parent.sha || "")) || parents[0].sha === merge
    || parents.length === 2 && parents[1].sha !== head) fail("merge does not identify the reviewed head and base");
  const base = parents[0].sha;
  const before = await leaves(gh, base), reviewed = await leaves(gh, head), after = await leaves(gh, merge);
  // A squash has no head parent. GitHub's merged PR binds the two commits, and
  // exact leaf-tree equality proves that the squash shipped the reviewed tree.
  if (parents.length === 1 && !sameTree(reviewed, after)) fail("squash differs from the reviewed bundle tree");
  const path = manifestPath("daily");
  const manifest = await regular(gh, head, reviewed, path, 262144);
  const mergedManifest = await regular(gh, merge, after, path, 262144);
  if (!manifest || !mergedManifest || manifest.sha !== mergedManifest.sha || manifest.source !== mergedManifest.source) fail("merged manifest differs from the reviewed head");
  const state = readManifest(manifest.source, "daily");
  // Adopted Actions placeholders record automation; newly opened App bundles
  // omit it. The verified head identifies the bot in either case.
  if (state.automation !== undefined && state.automation !== bot) fail("manifest names a different automation");
  if (!state.entries.length) fail("empty bundles cannot publish");
  const allowed = new Set([path, ...state.entries.map((entry) => entry.path)]);
  const changed = new Set();
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (same(before.get(name), after.get(name))) continue;
    if (!allowed.has(name) || !after.has(name)) fail("merge changes files outside the daily bundle");
    changed.add(name);
  }
  if (changed.size !== allowed.size) fail("bundle manifest contains unchanged or missing files");

  const groups = new Map(), entries = [];
  for (const entry of state.entries) {
    if (!LOGIN.test(entry.author || "") || entry.author.includes("--")) fail("invalid source author");
    const previous = await regular(gh, base, before, entry.path);
    if ((previous?.sha || null) !== entry.base) fail("character base differs from the merge parent");
    const file = await regular(gh, head, reviewed, entry.path);
    const mergedFile = await regular(gh, merge, after, entry.path);
    if (!file || !mergedFile || file.sha !== mergedFile.sha || file.source !== mergedFile.source || digest(file.source) !== entry.hash) fail("character differs from its reviewed hash");
    parseSafeCharacter(file.source, now);
    const key = `${entry.pr}:${entry.head}`;
    if (!groups.has(key)) {
      // A source PR's authenticated author is evidence; its current head is
      // not. Later commits, branch deletion and reopened source PRs must not
      // change the immutable history that intake approved in this manifest.
      let sourcePR = null;
      if (entry.pr !== null) {
        const current = await gh.api(`pulls/${entry.pr}`);
        if (current?.number !== entry.pr || current.base?.repo?.full_name !== gh.repo || current.user?.login !== entry.author) fail("source PR ownership differs from the manifest");
        sourcePR = { ...current, base: { ...current.base, ref: "rock" }, head: { ...current.head, sha: entry.head } };
      }
      const pinned = { ...gh, api: (route, ...args) => sourcePR && route === `pulls/${entry.pr}` ? Promise.resolve(sourcePR) : gh.api(route, ...args) };
      groups.set(key, await inspectSubmission(pinned, { pr: entry.pr, head: entry.head, archived: true }, base));
    }
    const inspected = groups.get(key);
    const verified = inspected.entries.find((row) => row.path === entry.path && row.lane === "daily"
      && row.pr === entry.pr && row.head === entry.head && row.author === entry.author && row.base === entry.base && row.hash === entry.hash);
    if (!verified || verified.source !== file.source || inspected.author !== entry.author) fail("source history does not match the daily bundle evidence");
    entries.push(Object.freeze({ pr: entry.pr, head: entry.head, author: entry.author, path: entry.path,
      base: entry.base, hash: entry.hash, lane: "daily", source: file.source, blob: mergedFile.sha }));
  }
  await checkRegistry(gh, merge, []);
  return Object.freeze({ repository: gh.repo, pr, merge, head, lane: "daily", entries: Object.freeze(entries) });
};
