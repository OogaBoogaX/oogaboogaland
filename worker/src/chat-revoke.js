// A principal's access ends (docs/ooga-chat-hosts.md): every live hosted chat closes or narrows that principal's
// sockets, as the old public audience object does. Apart from chat-directory.js so the island's sign-out and account
// deletion (auth.js, api.js) reach it without the Durable Object classes. An Ooga Chat principal is `pr_…`, an island
// account's `ob_<GitHub id>` (chats.js).

const DIRECTORY = "chats";

export const revokeChats = async (env, principal, reason) => {
  if (!env.CHATS || !env.AUDIENCE) return 0;
  let revoked = 0, ids = [];
  try { ids = await env.CHATS.getByName(DIRECTORY).ids(); } catch { return 0; }
  for (const id of ids) {
    try { revoked += (await env.AUDIENCE.getByName(`chat:${id}`).revoke(principal, reason)).revoked; } catch { /* that chat's sockets re-authenticate within the hour */ }
  }
  return revoked;
};
