// A separate, operator-reviewed PR for an existing pinned account's GitHub rename.
// Never execute submitted character code or accept a login as proof of ownership.
import "../src/js/contributor-identities.js";
import { declaredIdentity } from "./character-identity.mjs";
import { CharacterRejection, touchesCharacters } from "./character-safety.mjs";
import { isOperator } from "./character-operators.mjs";

const reject = (reason) => { throw new CharacterRejection(reason); };
const owner = (row) => (row.github || row.handle).toLowerCase();

export const onlyAccountLoginChanged = (before, after) => {
  const lines = [...before.matchAll(/^([ \t]+github: )(["'])([A-Za-z0-9-]+)\2(,[ \t]*\n)/gm)];
  if (lines.length !== 1) return false;
  const next = declaredIdentity(after), previous = declaredIdentity(before), match = lines[0];
  if (!previous.github || !next.github || previous.handle !== next.handle
    || previous.github === next.github || match[3] !== previous.github) return false;
  const replacement = match[1] + match[2] + next.github + match[2] + match[4];
  return before.slice(0, match.index) + replacement + before.slice(match.index + match[0].length) === after;
};

export const inspectAccountRename = async (gh, pr, rock, onIdentified = () => {}) => {
  if (!pr || pr.state !== "open" || pr.base.ref !== "rock" || pr.draft) return null;
  const diff = await gh.api(`compare/${rock}...${pr.head.sha}`);
  if (!Array.isArray(diff.files) || diff.files.length >= 300 || !diff.merge_base_commit?.sha) throw new Error("Incomplete account-rename comparison");
  const pinned = diff.files.filter((file) => touchesCharacters(file)
    && globalThis.BL.accountIdentities.accountForHandle(file.filename.slice("src/characters/".length, -3)));
  if (!pinned.length) return null;
  const file = pinned[0], path = file.filename;
  const base = await gh.file(diff.merge_base_commit.sha, path), next = await gh.file(pr.head.sha, path);
  if (!base || !next) return null; // Ordinary intake handles additions/deletions.
  const previous = declaredIdentity(base.source), proposed = declaredIdentity(next.source);
  if (owner(previous) === owner(proposed)) return null;
  // Discovery errors must not overwrite required checks on unrelated PRs.
  onIdentified();
  const account = globalThis.BL.accountIdentities.accountForHandle(previous.handle);
  if (!account || path !== `src/characters/${account.handle}.js` || diff.files.length !== 1
    || file.status !== "modified" || file.previous_filename || !onlyAccountLoginChanged(base.source, next.source)) {
    reject("An account rename must change only the existing pinned character's literal github line.");
  }
  if (!isOperator(pr.user) || pr.head.repo?.full_name !== gh.repo) reject("Account renames require an operator-authored PR in this repository.");
  const permission = await gh.api(`collaborators/${encodeURIComponent(pr.user.login)}/permission`, "GET", undefined, true);
  if (permission?.permission !== "admin" && permission?.role_name !== "maintain") reject("Account rename operator lacks Maintain/Admin permission.");
  const current = await gh.file(rock, path);
  if (current?.sha !== base.sha) throw new Error("Character changed on rock; rebase the account rename before review");
  const commits = await gh.list(`pulls/${pr.number}/commits`, 1);
  if (!commits.length || commits.length > 100 || diff.total_commits > 100) reject("Account rename history is incomplete or too large.");
  for (const item of commits) {
    const revision = await gh.api(`commits/${item.sha}?per_page=100`);
    if (!isOperator(revision.author) || revision.author.id !== pr.user.id || !revision.commit?.verification?.verified
      || revision.parents?.length !== 1 || !Array.isArray(revision.files) || revision.files.length !== 1
      || revision.files[0].filename !== path || revision.files[0].status !== "modified" || revision.files[0].previous_filename) {
      reject("Every account-rename revision must be a signed operator commit changing only that character.");
    }
    const version = await gh.file(item.sha, path);
    if (!version || !onlyAccountLoginChanged(base.source, version.source)
      || declaredIdentity(version.source).github !== proposed.github) reject("Account rename history contains another change.");
  }
  // These are fresh GitHub reads, not an alias table or historical login lookup.
  const byId = await gh.account(account.id), byLogin = await gh.account(proposed.github);
  if (byId?.type !== "User" || byLogin?.type !== "User" || byId.id !== account.id || byLogin.id !== account.id
    || byId.login?.toLowerCase() !== proposed.github.toLowerCase() || byLogin.login?.toLowerCase() !== proposed.github.toLowerCase()) {
    reject("GitHub has not verified this new login for the pinned numeric account.");
  }
  const latest = await gh.api(`pulls/${pr.number}`);
  if (latest.state !== "open" || latest.head.sha !== pr.head.sha || latest.user.id !== pr.user.id
    || latest.base.ref !== "rock" || latest.draft) throw new Error("Account rename PR changed during verification");
  return { path, source: next.source, githubId: account.id, previousLogin: previous.github, newLogin: proposed.github };
};
