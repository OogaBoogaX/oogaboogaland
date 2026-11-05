// Internal Room RPC adapter. No HTTP route, binding, alarm or automatic start.
// An operator/runner must coordinate these CAS transitions with VirtualHost's
// committed ticket. Room fencing cannot make two separate DO commits atomic.
import "../../src/js/npc-authority.js";
import "../../src/js/clanker-pose.js";
import "../../src/js/npc-pose-packet.js";
import { ROLLING_CADENCE, BURST_CADENCE, cadenceName, emptyCadence, validateCadence, nextCadenceAt, advanceCadence } from "./host-cadence.js";
import { validateRoomClaim } from "./host-room-claim.js";
const wire = globalThis.BL.npcAuthority;
export const ROOM_NPC = Object.freeze({ key: "npc-authority-v1", leaseMs: 10000, runMs: 900000, deliveryMs: 250 });
const integer = n => Number.isSafeInteger(n) && n >= 0;
const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const fail = () => { throw new Error("NPC authority fenced or invalid"); };
export const npcAuthorityView = r => r ? { v: r.v, ...(r.v === 2 ? { format: r.format } : {}), revision: r.revision, mode: r.mode, world: r.world, epoch: r.epoch } : null;
export const npcProtocolSupports = (protocol, r) => (protocol === 1 || protocol === 2) && (r.v === 1 || r.v === 2 && protocol === 2);
export const npcNextPublicationAt = r => Math.max(r?.gateAt || 0, r?.cadence ? nextCadenceAt(r.cadence) : r?.sequence ? r.at + ROOM_NPC.deliveryMs : 0);
export const npcCadenceName = r => cadenceName(r?.cadence);
function validateRecord(r, checkFrame) {
  const baseKeys = r?.v === 2 ? "at,epoch,format,frame,leaseUntil,mode,owner,revision,runUntil,sequence,v,world" : "at,epoch,frame,leaseUntil,mode,owner,revision,runUntil,sequence,v,world";
  let keys = Object.hasOwn(r || {}, 'cadence') ? baseKeys.replace('at,', 'at,cadence,') : baseKeys;
  if (Object.hasOwn(r || {}, 'fencePending')) keys = keys.replace('epoch,', 'epoch,fencePending,');
  if (Object.hasOwn(r || {}, 'gateAt')) keys = keys.replace('frame,', 'frame,gateAt,');
  if (!r || Object.keys(r).sort().join(",") !== keys || !wire.descriptor(r, true) || ![r.leaseUntil, r.runUntil, r.sequence, r.at].every(integer)) fail();
  if (Object.hasOwn(r, 'gateAt') && (!integer(r.gateAt) || r.gateAt > r.at + 1000)) fail();
  if (Object.hasOwn(r, 'fencePending') && (typeof r.fencePending !== 'boolean' || r.mode !== 'server'
    || !Object.hasOwn(r, 'gateAt') || r.fencePending && (r.sequence !== 0 || r.frame !== null))) fail();
  if (Object.hasOwn(r, 'cadence')) {
    validateCadence(r.cadence);
    const last = r.cadence.v === 1 ? r.cadence.times.at(-1) : r.cadence.at;
    if (last > r.at || r.sequence && (!r.cadence.count || last !== r.at)) fail();
  }
  if (r.mode === "server") {
    if (!id(r.owner) || r.leaseUntil > r.runUntil || r.leaseUntil - r.at > ROOM_NPC.leaseMs || r.runUntil - r.at > ROOM_NPC.runMs
      || (r.frame === null ? r.sequence !== 0 : !r.sequence || checkFrame && !wire.posesFor(r, r.frame, true))) fail();
  } else if (r.owner !== null || r.frame !== null || r.sequence !== 0 || r.leaseUntil !== 0 || r.runUntil !== 0) fail();
  return r;
}
export const validateNpcAuthority = r => validateRecord(r, true);
export class RoomNpcAuthority {
  constructor(storage, clock = Date.now) { this.storage = storage; this.clock = clock; }
  async read(tx = this.storage) { const r = await tx.get(ROOM_NPC.key); return r === undefined ? null : validateNpcAuthority(r); }
  // Step 2 of trusted takeover: host has already persisted this intent and
  // refuses raw claims. Fence delayed old frames before a replacement host is
  // granted its ticket. No cross-object clocks or expiring permits are assumed.
  async fence(intent) {
    const claim = structuredClone(validateRoomClaim(intent));
    if (claim.v !== 1) fail();
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!r || r.mode !== 'server' || !integer(now) || now < r.at
        || r.world !== claim.world || r.runUntil < claim.runUntil) fail();
      if (r.epoch === claim.epoch && r.owner === claim.owner) {
        if (r.runUntil !== claim.runUntil) fail();
        return r;
      }
      if (r.epoch !== claim.previousEpoch || r.owner !== claim.previousOwner
        || r.revision >= Number.MAX_SAFE_INTEGER) fail();
      const result = { ...r, revision: r.revision + 1, epoch: claim.epoch, owner: claim.owner,
        frame: null, sequence: 0, fencePending: true, at: now, gateAt: npcNextPublicationAt(r), runUntil: claim.runUntil,
        leaseUntil: Math.min(claim.runUntil, now + ROOM_NPC.leaseMs) };
      await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
      return result;
    });
  }
  async change(expected, next) {
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!integer(now) || !integer(expected) || expected !== (r?.revision || 0) || expected >= Number.MAX_SAFE_INTEGER || r && now < r.at) fail();
      const base = { v: 1, revision: expected + 1, sequence: 0, frame: null, at: now,
        // Explicit release/reacquisition must retain strict debt too, even if
        // this record has never passed through a coordinated takeover.
        ...(r ? { gateAt: npcNextPublicationAt(r) } : {}) };
      let result;
      if (next?.mode === "server") {
        if (next.cadence !== undefined && ![ROLLING_CADENCE, BURST_CADENCE].includes(next.cadence)) fail();
        // Migration cannot reset a recent rate budget. A different cadence
        // needs a quiet second; the same cadence retains its last four stamps.
        if (r && npcCadenceName(r) !== next.cadence && now - r.at < 1000) fail();
        if (next.format !== undefined && next.format !== "mixed-1") fail();
        if (!id(next.world) || !id(next.owner) || !integer(next.epoch) || !next.epoch || !integer(next.runUntil)
          || next.runUntil <= now || next.runUntil - now > ROOM_NPC.runMs
          || r?.mode === "server" && (now < r.leaseUntil || next.world === r.world && next.epoch <= r.epoch)) fail();
        result = { ...base, ...(next.format === "mixed-1" ? { v: 2, format: next.format } : {}), mode: "server", world: next.world, epoch: next.epoch, owner: next.owner,
          runUntil: next.runUntil, leaseUntil: Math.min(next.runUntil, now + ROOM_NPC.leaseMs),
          ...(next.cadence ? { cadence: npcCadenceName(r) === next.cadence ? r.cadence : emptyCadence(next.cadence) } : {}) };
      } else if (next?.mode === "browser") {
        // Explicit release must name the current private ticket, even after lease expiry.
        if (!r || r.mode !== "server" || next.owner !== r.owner || next.epoch !== r.epoch || next.world !== r.world) fail();
        result = { ...base, mode: "browser", world: null, epoch: 0, owner: null, leaseUntil: 0, runUntil: 0,
          ...(r.cadence ? { cadence: r.cadence } : {}) };
      } else fail();
      await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
      return result;
    });
  }
  // Explicit recovery of a released Room using the host's persisted intent.
  // Ordinary publish/fence never takes this path. Reuse the original finite
  // deadline, even when only expired-body cleanup remains; never restart a run.
  async reacquire(expected, intent, format) {
    const claim = structuredClone(validateRoomClaim(intent));
    if (claim.v !== 1 || !["legacy-1", "mixed-1"].includes(format)) fail();
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!r || r.mode !== "browser" || r.revision !== expected || !integer(expected)
        || expected >= Number.MAX_SAFE_INTEGER || !integer(now) || now < r.at
        || claim.runUntil - now > ROOM_NPC.runMs) fail();
      const result = { v: format === "mixed-1" ? 2 : 1, ...(format === "mixed-1" ? { format } : {}),
        revision: expected + 1, mode: "server", world: claim.world, epoch: claim.epoch, owner: claim.owner,
        sequence: 0, frame: null, fencePending: true, gateAt: npcNextPublicationAt(r), at: now,
        runUntil: claim.runUntil, leaseUntil: Math.min(claim.runUntil, now + ROOM_NPC.leaseMs),
        ...(r.cadence ? { cadence: r.cadence } : {}) };
      await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
      return result;
    });
  }
  // Caller owns the enclosing storage transaction so drained body markers and
  // the authority release commit together. The intent proves the trusted host
  // has already fenced admissions and found no held bodies or departures.
  async releaseDrained(tx, expected, intent) {
    const claim = validateRoomClaim(intent), r = await this.read(tx), now = this.clock();
    if (claim.v !== 2 || !r || r.mode !== "server" || r.revision !== expected || !integer(expected)
      || expected >= Number.MAX_SAFE_INTEGER || !integer(now) || now < r.at || r.world !== claim.world
      || !(r.epoch === claim.previousEpoch && r.owner === claim.previousOwner
        || r.epoch === claim.epoch && r.owner === claim.owner)) fail();
    const result = { v: 1, revision: expected + 1, sequence: 0, frame: null, at: now,
      gateAt: npcNextPublicationAt(r), mode: "browser", world: null, epoch: 0, owner: null,
      leaseUntil: 0, runUntil: 0, ...(r.cadence ? { cadence: r.cadence } : {}) };
    await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
    return result;
  }
  async publish(ticket, sequence, frame) {
    if (!(frame instanceof ArrayBuffer) || frame.byteLength > wire.MAX || !integer(sequence) || !sequence) fail();
    // Copy before the first await: the caller cannot change data during the commit.
    const copy = frame.slice(0);
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!r || r.mode !== "server" || !integer(now) || now < r.at
        || ticket?.revision !== r.revision || ticket.v !== r.v || ticket.format !== r.format
        || ticket.world !== r.world || ticket.epoch !== r.epoch || ticket.owner !== r.owner || !wire.posesFor(r, copy, true)) fail();
      if (sequence === r.sequence) {
        const old = new Uint8Array(r.frame), bytes = new Uint8Array(copy);
        if (old.length !== bytes.length || old.some((v, i) => v !== bytes[i])) fail();
        return { record: r, duplicate: true };
      }
      // A crash after fencing may outlive this Room lease before the host gets
      // its new ticket. Its first confirmed frame can establish the lease once;
      // later frames retain ordinary expiry. A newer Room fence always wins.
      if (now >= r.leaseUntil && r.fencePending !== true || now >= r.runUntil) fail();
      if (sequence < r.sequence || now < npcNextPublicationAt(r)) fail();
      const result = { ...r, sequence, frame: copy, at: now, leaseUntil: Math.min(r.runUntil, now + ROOM_NPC.leaseMs),
        ...(Object.hasOwn(r, 'fencePending') ? { fencePending: false } : {}),
        ...(r.cadence ? { cadence: advanceCadence(r.cadence, now) } : {}) };
      // r was validated by read(); copy was validated against that exact
      // authority above. Still recheck every structural/scalar/rate invariant.
      // Do not decode the entire bounded mixed pose packet a second time in
      // this transaction. Cold reads and external validation remain complete.
      await tx.put(ROOM_NPC.key, validateRecord(result, false));
      return { record: result, duplicate: false };
    });
  }
}
export const packNpcSnapshot = (r) => r?.mode === "server" && r.frame ? wire.pack(npcAuthorityView(r), r.sequence, r.frame, true) : null;
