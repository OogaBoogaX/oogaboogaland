// Ooga Chat's public panel data from the island (#664): the registered cast as the island's build wrote it
// (characters.gen.json), the authority for who has an Ooga, answered over the private bridge (`cast`) so the edge, which
// never has the island's build, can serve the native Contributing Oogas panel. Only the fields the panel shows: handle,
// GitHub login, display name and the two dates. The rows are sorted (by join, then handle) and carry a revision, the hash
// of exactly what is sent, so a client and a cache can tell when the cast changed. Public data only: nobody's session,
// account, voice or position.

const CAST_MAX = 4096;

export const castRows = (cast) => cast.slice(0, CAST_MAX).map((row) => ({
  handle: row.handle,
  github: row.github_login || row.handle,
  display: typeof row.display === "string" && row.display ? row.display : null,
  joinedAt: Date.parse(row.joined_at) || 0,
  lastCommitAt: Date.parse(row.last_commit_at) || 0,
})).sort((a, b) => a.joinedAt - b.joinedAt || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));

const hex = async (text) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let out = "";
  for (const b of digest) out += b.toString(16).padStart(2, "0");
  return out;
};

export const publicOps = ({ cast }) => {
  let answer = null;
  return {
    // Public browsing stays up whatever the bridge's switch says: nothing outward depends on it.
    cast: {
      always: true,
      run: async () => {
        if (!answer) {
          const rows = castRows(cast);
          answer = { rows, revision: (await hex(JSON.stringify(rows))).slice(0, 16), count: rows.length };
        }
        return answer;
      },
    },
  };
};
