// Private, bounded takeover intent. This is not a browser capability or a
// timestamp-based lease proof; trusted host/Room orchestration owns the steps.
import "../../src/js/npc-authority.js";
const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const keys = "cleanup,epoch,owner,previousEpoch,previousOwner,runUntil,v,world";
export function validateRoomClaim(c) {
  const release = c?.v === 2 && c.action === "release";
  if (!c || Object.keys(c).sort().join(",") !== (release ? "action," + keys : keys) || !release && c.v !== 1
    || ![c.world, c.owner, c.previousOwner].every(id)
    || ![c.epoch, c.previousEpoch, c.runUntil].every(integer)
    || c.previousEpoch < 1 || c.epoch !== c.previousEpoch + 1
    || typeof c.cleanup !== "boolean" || release && c.cleanup) throw Error("invalid Room takeover intent");
  return c;
}
export const sameRoomClaim = (a, b) => !!a && !!b && a.action === b.action && keys.split(",").every(k => a[k] === b[k]);
export function validateRoomReleaseReceipt(receipt) {
  const a = receipt?.authority;
  if (!a || !globalThis.BL.npcAuthority.descriptor(a, true) || a.v !== 1 || a.mode !== "browser"
    || Object.keys(a).sort().join(",") !== "epoch,mode,revision,v,world") throw Error("Room release receipt mismatch");
  return receipt;
}
export function validateRoomClaimReceipt(claim, receipt, expected = receipt?.authority) {
  const a = receipt?.authority, names = a?.v === 2 ? "epoch,format,mode,revision,v,world" : "epoch,mode,revision,v,world";
  if (claim.v !== 1 || receipt?.owns !== true || receipt.owner !== claim.owner || receipt.runUntil !== claim.runUntil
    || !globalThis.BL.npcAuthority.descriptor(a, true) || Object.keys(a).sort().join(",") !== names
    || a.mode !== "server" || a.world !== claim.world || a.epoch !== claim.epoch
    || !expected || Object.keys(expected).sort().join(",") !== names
    || names.split(",").some(k => a[k] !== expected[k])) throw Error("Room takeover receipt mismatch");
  return receipt;
}
export function validateRoomBinding(binding, host) {
  if (!binding || Object.keys(binding).sort().join(",") !== "claim,pending,v" || binding.v !== 1
    || typeof binding.pending !== "boolean") throw Error("invalid host Room binding");
  if (binding.claim === null) {
    if (binding.pending) throw Error("missing Room takeover intent");
    return;
  }
  const c = validateRoomClaim(binding.claim);
  if (c.v === 2 && !binding.pending || c.world !== host.world || (binding.pending ? c.runUntil !== host.runUntil : c.runUntil < host.runUntil)
    || host.fence !== (binding.pending ? c.previousEpoch : c.epoch)
    || host.owner !== (binding.pending ? c.previousOwner : c.owner)) throw Error("host Room takeover mismatch");
}
