// Test the github-only rename with the same fresh activity bake as deployment.
// This unprivileged preparation grants no identity/approval status and publishes nothing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onlyAccountLoginChanged } from "./character-account-rename.mjs";
import { declaredIdentity } from "./character-identity.mjs";
import { contributorRows, readContributorSnapshot } from "../worker/src/contributor-policy.js";

export const snapshotRename = (files, readBase, readHead) => {
  if (files.length !== 1 || !/^src\/characters\/[A-Za-z0-9-]+\.js$/.test(files[0])) return null;
  const path = files[0], before = readBase(path), after = readHead(path);
  if (!before || !after || !onlyAccountLoginChanged(before, after)) return null;
  const next = declaredIdentity(after), account = globalThis.BL.accountIdentities.accountForHandle(next.handle);
  return account && path === `src/characters/${account.handle}.js` ? next.github : null;
};

export const refreshRenameSnapshot = async (login, bake, fetcher = fetch, now = Date.now()) => {
  if (!login) return false;
  const stats = await readContributorSnapshot(fetcher);
  if (!contributorRows(stats, now).some((row) => row.handle === login.toLowerCase())) {
    throw new Error("Fresh Oogatron snapshot does not contain the proposed account login");
  }
  await bake(stats);
  return true;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.CHARACTER_SNAPSHOT_BASE;
  if (!/^[0-9a-f]{40}$/.test(base || "")) throw new Error("Expected an exact PR base commit");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  // Include every path/status, so additions, deletions and mixed PRs cannot qualify.
  const files = git("diff", "--name-only", "--no-renames", "-z", base, "HEAD").split("\0").filter(Boolean);
  const read = (ref, path) => {
    try { return git("show", `${ref}:${path}`); }
    catch { return null; }
  };
  const login = snapshotRename(files, (path) => read(base, path), (path) => read("HEAD", path));
  const refreshed = await refreshRenameSnapshot(login, (stats) => {
    const scratch = mkdtempSync(join(tmpdir(), "account-rename-snapshot-"));
    try {
      const input = join(scratch, "stats.json");
      writeFileSync(input, JSON.stringify(stats), { mode: 0o600 });
      execFileSync(process.execPath, [join(root, "scripts/jumbotron-data.mjs"), input], { cwd: root, stdio: "inherit" });
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
  console.log(refreshed ? "Account rename: refreshed the local activity bake; all unit checks still required" : "No pinned github-only rename; keeping the committed activity bake");
}
