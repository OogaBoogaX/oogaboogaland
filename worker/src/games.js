// The games the Worker hosts itself (game-host.js), by the name a page asks for (`/game/<kind>/<venue>`): each kind's
// rules (`create`), the venues it may be played at, how its pages' messages are read (`parse`, false to close the socket,
// null to ignore the message) and limited (`buckets`, by `bucketOf` a message's `t`), how many sockets an instance takes
// and how long a message may be (`limits`), and how often it steps and sends its whole state (`tickMs`, `stateEvery`).
// Only these names reach an object, so no page makes an instance: one object per kind and venue, named
// `<kind>:<venue>:v<version>`. A new version starts fresh objects, which is also how one moves: a Durable Object stays
// where it was first made. A kind marked `optional` is off unless the Worker's `GAME_FEATURES` (comma-separated kinds)
// names it: off, /api/me does not offer it and its route answers 404, so every page plays it on its own as before.
import { ghostHunt } from "./games/ghost-hunt.js"; // HALLOWEEN
import { hangar } from "./games/hangar.js";
import { island } from "./games/island.js";

export const GAME_KINDS = new Map([[island.id, island]]);
GAME_KINDS.set(ghostHunt.id, ghostHunt); // HALLOWEEN
GAME_KINDS.set(hangar.id, hangar);

const switchedOn = (env) => new Set(String((env && env.GAME_FEATURES) || "").split(",").map((s) => s.trim()).filter(Boolean));
const on = (k, names) => !k.optional || names.has(k.id);

/** The kinds this Worker hosts now: every kind but an optional one `GAME_FEATURES` leaves out. */
export const gamesOn = (env) => {
  const names = switchedOn(env);
  return [...GAME_KINDS.values()].filter((k) => on(k, names)).map((k) => k.id);
};

/** The object name for `kind` at `venue`, or "" when the Worker hosts no such game, or has it switched off. */
export const gameName = (kind, venue, env) => {
  const k = GAME_KINDS.get(kind);
  return k && on(k, switchedOn(env)) && k.venues.includes(venue) ? `${kind}:${venue}:v${k.version}` : "";
};

/** The kind an object name stands for, or null. */
export const kindOf = (name) => {
  const [kind, venue, version, rest] = String(name).split(":");
  const k = GAME_KINDS.get(kind);
  return k && rest === undefined && k.venues.includes(venue) && version === `v${k.version}` ? k : null;
};
