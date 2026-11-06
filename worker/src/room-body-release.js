// Final connected-mode receipt, committed atomically with drained NPC release.
// It grants no body: each retained connection must make a fresh ordinary claim.
import { boundedJSON } from "./virtual-host.js";
export const ROOM_BODY_RELEASE = Object.freeze({ key: "room-body-release-v1", bytes: 4096, max: 32 });
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
export const validBodyQuiescence = q => exact(q, ["request", "revision", "acknowledged"])
  && typeof q.request === "string" && /^[0-9a-f]{32}$/.test(q.request)
  && Number.isSafeInteger(q.revision) && q.revision > 0 && typeof q.acknowledged === "boolean";
export function validateBodyRelease(r) {
  boundedJSON(r, ROOM_BODY_RELEASE.bytes, 256);
  const a = r?.authority, seen = new Set();
  if (!exact(r, ["v", "authority", "clients"]) || r.v !== 1
    || !exact(a, ["v", "revision", "mode", "world", "epoch"]) || a.v !== 1
    || !Number.isSafeInteger(a.revision) || a.revision < 1 || a.mode !== "browser" || a.world !== null || a.epoch !== 0
    || !Array.isArray(r.clients) || r.clients.length > ROOM_BODY_RELEASE.max) throw Error("invalid body release receipt");
  for (const c of r.clients) {
    if (!exact(c, ["accountId", "connection"]) || !Number.isSafeInteger(c.accountId) || c.accountId < 1
      || typeof c.connection !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(c.connection) || seen.has(c.accountId))
      throw Error("invalid body release recipient");
    seen.add(c.accountId);
  }
  return r;
}
