// An account's display name changed (the island's `PATCH /api/me`, api.js, or Ooga Chat's Commons name field through
// the bridge, chat-display.js): every live connection that shows it takes the new name at once, with no reconnect. The
// island's Room, and each live hosted chat's copy of the island (the Room `chat:<id>`, room-copy.js), update their
// records and tell every page and Commons member (`renamed`), and Ooga Chat's public audience and every live hosted chat
// update the account's rows (`{ t: "renamed" }` and a delta). Best effort: an object that
// can't be reached now shows the name when its sockets next join, as before. Apart from audience.js, as chat-revoke.js
// is, so the island's account API reaches it without the Durable Object classes.

const AUDIENCE = "audience", DIRECTORY = "chats";

export const announceRename = async (env, id, display) => {
  const tasks = [], identity = `gh:${id}`;
  let chats = [];
  if (env.CHATS && (env.ROOM || env.AUDIENCE)) { try { chats = await env.CHATS.getByName(DIRECTORY).ids(); } catch { chats = []; } }
  const names = chats.map((chat) => `chat:${chat}`);
  if (env.ROOM) for (const name of ["island", ...names])
    tasks.push(Promise.resolve().then(() => env.ROOM.getByName(name).renamed(id, display)).catch(() => null));
  if (env.AUDIENCE) for (const name of [AUDIENCE, ...names])
    tasks.push(Promise.resolve().then(() => env.AUDIENCE.getByName(name).renamed(identity, display)).catch(() => null));
  await Promise.all(tasks);
};
