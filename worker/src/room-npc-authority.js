// Internal Room RPC adapter. No HTTP route, binding, alarm or automatic start.
// An operator/runner must coordinate these CAS transitions with VirtualHost's
// committed ticket. Room fencing cannot make two separate DO commits atomic.
import "../../src/js/npc-authority.js";
const wire = globalThis.BL.npcAuthority;
export const ROOM_NPC = Object.freeze({ key: "npc-authority-v1", leaseMs: 10000, runMs: 900000, deliveryMs: 250 });
const integer = n => Number.isSafeInteger(n) && n >= 0;
const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const fail = () => { throw new Error("NPC authority fenced or invalid"); };
export const npcAuthorityView = r => r ? { v: 1, revision: r.revision, mode: r.mode, world: r.world, epoch: r.epoch } : null;
export function validateNpcAuthority(r) {
  if (!r || Object.keys(r).sort().join(",") !== "at,epoch,frame,leaseUntil,mode,owner,revision,runUntil,sequence,v,world" || !wire.descriptor(r) || ![r.leaseUntil, r.runUntil, r.sequence, r.at].every(integer)) fail();
  if (r.mode === "server") {
    if (!id(r.owner) || r.leaseUntil > r.runUntil || r.leaseUntil - r.at > ROOM_NPC.leaseMs || r.runUntil - r.at > ROOM_NPC.runMs
      || (r.frame === null ? r.sequence !== 0 : !r.sequence || !wire.poses(r.frame))) fail();
  } else if (r.owner !== null || r.frame !== null || r.sequence !== 0 || r.leaseUntil !== 0 || r.runUntil !== 0) fail();
  return r;
}
export class RoomNpcAuthority {
  constructor(storage, clock = Date.now) { this.storage = storage; this.clock = clock; }
  async read(tx = this.storage) { const r = await tx.get(ROOM_NPC.key); return r === undefined ? null : validateNpcAuthority(r); }
  async change(expected, next) {
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!integer(now) || !integer(expected) || expected !== (r?.revision || 0) || expected >= Number.MAX_SAFE_INTEGER || r && now < r.at) fail();
      const base = { v: 1, revision: expected + 1, sequence: 0, frame: null, at: now };
      let result;
      if (next?.mode === "server") {
        if (!id(next.world) || !id(next.owner) || !integer(next.epoch) || !next.epoch || !integer(next.runUntil)
          || next.runUntil <= now || next.runUntil - now > ROOM_NPC.runMs
          || r?.mode === "server" && (now < r.leaseUntil || next.world === r.world && next.epoch <= r.epoch)) fail();
        result = { ...base, mode: "server", world: next.world, epoch: next.epoch, owner: next.owner,
          runUntil: next.runUntil, leaseUntil: Math.min(next.runUntil, now + ROOM_NPC.leaseMs) };
      } else if (next?.mode === "browser") {
        // Explicit release must name the current private ticket, even after lease expiry.
        if (!r || r.mode !== "server" || next.owner !== r.owner || next.epoch !== r.epoch || next.world !== r.world) fail();
        result = { ...base, mode: "browser", world: null, epoch: 0, owner: null, leaseUntil: 0, runUntil: 0 };
      } else fail();
      await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
      return result;
    });
  }
  async publish(ticket, sequence, frame) {
    if (!wire.poses(frame) || !integer(sequence) || !sequence) fail();
    // Copy before the first await: the caller cannot change data during the commit.
    const copy = frame.slice(0);
    return this.storage.transaction(async tx => {
      const r = await this.read(tx), now = this.clock();
      if (!r || r.mode !== "server" || !integer(now) || now < r.at
        || ticket?.revision !== r.revision || ticket.world !== r.world || ticket.epoch !== r.epoch || ticket.owner !== r.owner) fail();
      if (sequence === r.sequence) {
        const old = new Uint8Array(r.frame), bytes = new Uint8Array(copy);
        if (old.length !== bytes.length || old.some((v, i) => v !== bytes[i])) fail();
        return { record: r, duplicate: true };
      }
      if (now >= r.leaseUntil || now >= r.runUntil) fail();
      if (sequence < r.sequence || r.sequence && now - r.at < ROOM_NPC.deliveryMs) fail();
      const result = { ...r, sequence, frame: copy, at: now, leaseUntil: Math.min(r.runUntil, now + ROOM_NPC.leaseMs) };
      await tx.put(ROOM_NPC.key, validateNpcAuthority(result));
      return { record: result, duplicate: false };
    });
  }
}
export const packNpcSnapshot = (r) => r?.mode === "server" && r.frame ? wire.pack(npcAuthorityView(r), r.sequence, r.frame) : null;
