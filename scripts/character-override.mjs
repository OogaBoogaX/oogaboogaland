// Maintainer override PRs: an opt-in branch of this repository whose authenticated
// PR author currently holds Maintain/Admin may add, correct, revert, delete, rename
// or re-attribute any character file, including one whose old source is malformed
// or hostile, and supersede competing queued revisions of those paths. Old sources
// are never read as code or parsed. Nothing is executed, approved or merged here:
// the PR keeps normal CI and a manual merge, and the queue changes only after it.
import { declaredIdentity } from "./character-identity.mjs";
import { CharacterRejection, characterPath, scanCharacter } from "./character-safety.mjs";
import { digest, isMaintainer, checkIdentities, queuedEntries } from "./character-submissions.mjs";

export const OVERRIDE_PREFIX = "character-override/";
export const OVERRIDE_VERIFIED = "Maintainer override verified";
const reject = (reason) => { throw new CharacterRejection(reason); };
const blob = (tree, path) => tree.get(path)?.sha || null;
export const isOverride = (pr) => !!pr?.head?.ref?.startsWith(OVERRIDE_PREFIX);

// Every path a character-only diff replaces or creates, from GitHub's file list.
export const overridePaths = (files) => {
  if (!Array.isArray(files) || files.length >= 300) throw new Error("Override diff is incomplete");
  if (!files.length) reject("A maintainer override must change at least one character file.");
  if (files.length > 32) reject("At most 32 character files per maintainer override.");
  const changes = files.map((file) => {
    if (!characterPath(file.filename) || file.previous_filename && !characterPath(file.previous_filename)
      || !["added", "modified", "removed", "renamed"].includes(file.status)) reject("A maintainer override may change only src/characters/<login>.js files; put other work in a normal PR.");
    return { status: file.status, path: file.status === "removed" ? null : file.filename,
      previous: file.status === "added" ? null : file.previous_filename || file.filename };
  });
  return { changes, touched: new Set(changes.flatMap((change) => [change.path, change.previous]).filter(Boolean)) };
};

// Read-only. Returns the exact changes and the queued revisions a merge would supersede.
export const inspectOverride = async (gh, pr, rock, bot) => {
  if (!isOverride(pr) || pr.state !== "open" || pr.base.ref !== "rock" || pr.draft) throw new Error("Maintainer override is not an open, ready PR against rock");
  if (pr.head.repo?.full_name !== gh.repo || pr.base.repo?.full_name !== gh.repo) reject("Maintainer overrides must come from a branch of this repository, never a fork.");
  if (pr.user?.type !== "User") reject("Maintainer overrides must be opened by a human GitHub account.");
  if (!await isMaintainer(gh, pr.user.login)) reject("The override PR's author lacks current Maintain/Admin permission.");
  const diff = await gh.api(`compare/${rock}...${pr.head.sha}`);
  if (!diff.merge_base_commit?.sha) throw new Error("Cannot establish override base");
  const { changes, touched } = overridePaths(diff.files);
  const rockTree = await gh.tree(rock), baseTree = await gh.tree(diff.merge_base_commit.sha);
  // Compared by blob ID only, so a symlink or unparseable old file can still be replaced.
  for (const path of touched) if (blob(rockTree, path) !== blob(baseTree, path)) throw new Error("Character changed on rock since this override was written; update the branch");
  const registry = new Map();
  const identity = (path, source, why) => { try { return declaredIdentity(source); } catch { return reject(`${path}: ${why}`); } };
  for (const change of changes) {
    change.before = change.previous ? blob(rockTree, change.previous) : null;
    if (!change.path) continue;
    const file = await gh.file(pr.head.sha, change.path);
    if (!file) throw new Error("Override source is missing");
    change.after = file.sha; change.hash = digest(file.source);
    change.identity = identity(change.path, file.source, "the new source must declare exactly one literal character identity.");
    scanCharacter(file.source);
  }
  const queued = await queuedEntries(gh, bot);
  // The registry after this merge and every unrelated queued revision: no duplicates.
  for (const [path] of rockTree) if (characterPath(path) && !touched.has(path)) {
    registry.set(path, identity(path, (await gh.file(rock, path)).source, "unreadable on rock; include it in this override."));
  }
  for (const { entry, source } of queued) if (!touched.has(entry.path)) {
    registry.set(entry.path, identity(entry.path, source, "unreadable queued revision; supersede it in this override."));
  }
  for (const change of changes) if (change.path) registry.set(change.path, change.identity);
  checkIdentities(registry);
  const superseded = queued.filter(({ entry }) => touched.has(entry.path)).map(({ bundle, lane, entry }) => ({ bundle, lane, ...entry }));
  return { changes, superseded };
};

// After the merge, withdraw revisions queued before it. The exact revisions the bot
// audited for the merged head are withdrawn by identity (base equality cannot order
// two overrides of one path when their cleanups are delayed). Any other revision at
// a touched path goes only when its base is neither the override's merged blob nor
// current rock, so submissions built on the override or on later rock stay queued.
export const supersededBy = (entry, touched, merged, rock, audited = new Set()) => touched.has(entry.path)
  && (audited.has(entryDigest(entry)) || entry.base !== blob(merged, entry.path) && entry.base !== blob(rock, entry.path));

// Exact queued-revision identity: a later submission always differs in head or base.
export const entryDigest = (entry) => digest(JSON.stringify([entry.lane, entry.path, entry.pr, entry.head, entry.author, entry.hash, entry.base]));
// Bounded machine record in the bot's audit comment: the head plus one 64-hex
// digest per superseded revision. The verified status carries its SHA-256, so an
// edited, copied or non-bot comment never matches.
const RECORD = /<!-- obl-override-record (\{[^<>]*\}) -->/;
export const overrideRecord = (pr, audit) => JSON.stringify({ head: pr.head.sha, entries: audit.superseded.map(entryDigest) });
export const readRecord = (comments, bot, head, expected) => {
  for (const row of comments) {
    const json = row.user?.login === bot && RECORD.exec(row.body || "")?.[1];
    if (!json || digest(json) !== expected) continue;
    const record = JSON.parse(json);
    if (record.head === head && Array.isArray(record.entries) && record.entries.every((value) => /^[a-f0-9]{64}$/.test(value))) return new Set(record.entries);
  }
  return null;
};

export const supersededLine = (entry) => `- ${entry.path} (${entry.lane}${entry.bundle ? ` bundle #${entry.bundle}` : ""}): ${entry.pr ? `#${entry.pr}` : "standalone commit"} at ${entry.head} by ${entry.author}, sha256 ${entry.hash}, base ${entry.base || "none"}`;
const after = (change) => `blob ${change.after}, sha256 ${change.hash}, owner ${change.identity.github || change.identity.handle}, handle ${change.identity.handle}`;
const describe = (change) => change.status === "added" ? `- added ${change.path}: ${after(change)}`
  : change.status === "removed" ? `- removed ${change.previous} (was blob ${change.before})`
    : change.status === "renamed" ? `- renamed ${change.previous} (was blob ${change.before}) to ${change.path}: ${after(change)}`
      : `- modified ${change.path} (was blob ${change.before}): ${after(change)}`;

export const overrideAudit = (pr, rock, audit) => [
  `${OVERRIDE_VERIFIED} for exact head ${pr.head.sha}, opened by ${pr.user.login} (id ${pr.user.id}) with current Maintain/Admin permission, against rock ${rock}.`,
  "Automation never extracts, closes, approves or merges this PR. It needs normal review, CI and a manual merge; a new head is verified again.",
  "Changes (old sources are compared by blob ID, never parsed):",
  audit.changes.map(describe).join("\n"),
  audit.superseded.length ? "Queued revisions withdrawn from their bundles after this merges (unchanged until then):" : "No queued revision is superseded.",
  ...audit.superseded.length ? [audit.superseded.map(supersededLine).join("\n")] : [],
  `<!-- obl-override-record ${overrideRecord(pr, audit)} -->`
].join("\n\n");
