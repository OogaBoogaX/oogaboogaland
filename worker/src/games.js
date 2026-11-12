// The games the Worker hosts itself (game-host.js), by the name a page asks for (`/game/<kind>/<venue>`): each kind's
// rules (`create`), the venues it may be played at, how its pages' messages are read (`parse`, false to close the socket,
// null to ignore the message) and limited (`buckets`, by `bucketOf` a message's `t`), how many sockets an instance takes
// and how long a message may be (`limits`), and how often it steps and sends its whole state (`tickMs`, `stateEvery`).
// Only these names reach an object, so no page makes an instance: one object per kind and venue, named
// `<kind>:<venue>:v<version>`. A new version starts fresh objects, which is also how one moves: a Durable Object stays
// where it was first made.
import { ghostHunt } from "./games/ghost-hunt.js"; // HALLOWEEN

export const GAME_KINDS = new Map([[ghostHunt.id, ghostHunt]]); // HALLOWEEN

/** The object name for `kind` at `venue`, or "" when the Worker hosts no such game. */
export const gameName = (kind, venue) => {
  const k = GAME_KINDS.get(kind);
  return k && k.venues.includes(venue) ? `${kind}:${venue}:v${k.version}` : "";
};

/** The kind an object name stands for, or null. */
export const kindOf = (name) => {
  const [kind, venue, version, rest] = String(name).split(":");
  const k = GAME_KINDS.get(kind);
  return k && rest === undefined && k.venues.includes(venue) && version === `v${k.version}` ? k : null;
};
