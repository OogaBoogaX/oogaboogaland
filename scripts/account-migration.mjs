// Read-only GitHub verification and reviewable cutover SQL. Never executes SQL,
// deploys a Worker, edits a character or renames a GitHub account.
import { pathToFileURL } from "node:url";

export const prepareAccountMigration = async ({ id, oldLogin, newLogin, lastOldAt }, fetcher = fetch, now = Date.now()) => {
  const login = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
  if (!Number.isSafeInteger(id) || id <= 0 || ![oldLogin,newLogin].every(value => typeof value === "string" && login.test(value) && !value.includes("--"))
    || oldLogin.toLowerCase() === newLogin.toLowerCase()) throw new Error("Invalid account transition");
  const cutoff = Date.parse(lastOldAt);
  if (!Number.isFinite(cutoff) || cutoff > now || new Date(cutoff).toISOString() !== lastOldAt) throw new Error("Supply the recorded last verification of the old login as an ISO UTC timestamp");
  const read = async path => {
    const response = await fetcher(`https://api.github.com/${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "oogaboogaland-migration-preflight" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`GitHub verification failed: ${response.status}`);
    return response.json();
  };
  const account = await read(`user/${id}`);
  if (account.id !== id || account.login?.toLowerCase() !== newLogin.toLowerCase()) throw new Error(`Rename not verified: account ${id} currently resolves to ${account.login}`);
  const target = await read(`users/${newLogin}`);
  if (target.id !== id || target.login?.toLowerCase() !== newLogin.toLowerCase()) throw new Error("New login belongs to a different account");
  const old = `'${oldLogin.toLowerCase()}'`, next = `'${account.login}'`;
  return {
    id, oldLogin, newLogin: account.login, lastOldAt, verifiedAt: new Date(now).toISOString(),
    prerequisites: "Review fresh D1/R2/browser backups, collision queries and affected-row counts. Apply each database's statements atomically during the paused-ingestion window; verify invariants before resuming. This tool executed no SQL.",
    sql: {
      oogaboogaland: [
        `UPDATE players SET login=${next} WHERE id=${id} AND lower(login)=${old};`,
        `DELETE FROM sessions WHERE player_id=${id};`,
      ],
      oogatron: [
        `INSERT INTO contributor_login_history(login,github_id,valid_before) SELECT ${old},${id},'${lastOldAt}' WHERE EXISTS (SELECT 1 FROM contributors WHERE github_id=${id} AND lower(login)=${old}) ON CONFLICT(login) DO UPDATE SET github_id=excluded.github_id, valid_before=excluded.valid_before;`,
        `UPDATE contributors SET login=${next} WHERE github_id=${id} AND lower(login)=${old};`,
      ],
      bananapayserver: [
        `INSERT INTO donor_login_migrations(github_id,old_login,new_login) VALUES(${id},${old},${next}) ON CONFLICT(github_id) DO UPDATE SET old_login=excluded.old_login, new_login=excluded.new_login;`,
      ],
    },
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id,oldLogin,newLogin,lastOldAt] = process.argv.slice(2);
  try { console.log(JSON.stringify(await prepareAccountMigration({ id:Number(id),oldLogin,newLogin,lastOldAt }),null,2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
