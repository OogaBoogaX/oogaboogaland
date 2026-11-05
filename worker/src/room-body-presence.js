// One durable latest presentation, separate from control grants and movement.
// Internal preview RPCs only. No timer, route, lease renewal or socket queue.
import { BODY_VIEW, HOST, SESSION_PROTOCOL, boundedJSON, sameCheckpointValue } from "./virtual-host.js";
import "../../src/js/npc-authority.js";
import "../../src/js/body-presence.js";
import { ROOM_NPC, validateNpcAuthority, npcAuthorityView } from "./room-npc-authority.js";
export const ROOM_BODY_PRESENCE = Object.freeze({ key: "room-body-presence-v1", rowBytes: BODY_VIEW.maxBytes + 1024 });
const time = n => Number.isSafeInteger(n) && n >= 0;
const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const fail = () => { throw Error("invalid or fenced Room body presence"); };
const authorityKeys = a => ["v", ...(a?.v === 2 ? ["format"] : []), "revision", "mode", "world", "epoch", "owner"];
function authority(a) {
  if (!exact(a, authorityKeys(a)) || ![1, 2].includes(a.v) || a.v === 2 && a.format !== "mixed-1"
    || a.mode !== "server" || !id(a.world) || !id(a.owner)
    || !time(a.revision) || !a.revision || !time(a.epoch) || !a.epoch) fail();
  return a;
}
const sameAuthority = (a, b) => authorityKeys(a).length === authorityKeys(b).length
  && authorityKeys(a).every(k => a[k] === b[k]);
export function validateBodyPresenceFrame(frame) {
  // The browser and durable store accept the same public schema. Private
  // registry tokens and body checkpoints never enter this wire format.
  if (BODY_VIEW.maxBodies !== globalThis.BL.bodyPresence.MAX || BODY_VIEW.maxBytes !== globalThis.BL.bodyPresence.MAX_BYTES
    || frame?.v !== BODY_VIEW.version || frame?.protocol !== SESSION_PROTOCOL) fail();
  return globalThis.BL.bodyPresence.validate(frame);
}
function rowValid(row) {
  boundedJSON(row, ROOM_BODY_PRESENCE.rowBytes);
  if (!exact(row, ["v", "authority", "owner", "retainedAt", "frame"]) || row.v !== 1 || !id(row.owner) || !time(row.retainedAt)) fail();
  authority(row.authority); validateBodyPresenceFrame(row.frame);
  if (row.frame.world !== row.authority.world || row.frame.epoch < row.authority.epoch
    || row.frame.epoch === row.authority.epoch && row.owner !== row.authority.owner
    || row.retainedAt < row.frame.now || row.retainedAt >= row.frame.expiresAt) fail();
  return row;
}
const receipt = frame => ({ world: frame.world, epoch: frame.epoch, revision: frame.revision, ids: frame.departures.map(p => p.id) });
export class RoomBodyPresence {
  constructor(storage, clock = Date.now) { this.storage = storage; this.clock = clock; }
  async current(tx, ticket) {
    authority(ticket);
    const raw = await tx.get(ROOM_NPC.key), current = raw && validateNpcAuthority(raw);
    if (!current || current.mode !== "server"
      || !sameAuthority(ticket, { ...npcAuthorityView(current), owner: current.owner })) fail();
    return current;
  }
  async retain(roomTicket, hostTicket, input) {
    // Copy/validate before the first await, bounding data and excluding private
    // fields before a caller can mutate an in-flight object.
    authority(roomTicket); validateBodyPresenceFrame(input);
    const a = { ...roomTicket }, h = { ...hostTicket }, frame = structuredClone(input);
    if (!exact(h, ["owner", "fence", "world"]) || !id(h.owner) || h.world !== a.world
      || !time(h.fence) || h.fence < a.epoch || h.fence === a.epoch && h.owner !== a.owner
      || frame.world !== h.world || frame.epoch !== h.fence) fail();
    return this.storage.transaction(async tx => {
      await this.current(tx, a);
      const now = this.clock(), saved = await tx.get(ROOM_BODY_PRESENCE.key), previous = saved && rowValid(saved);
      if (!time(now) || frame.now > now || previous && now < previous.retainedAt) fail();
      if (previous?.frame.world === frame.world) {
        if (frame.epoch < previous.frame.epoch) fail();
        const oldEntries = [...previous.frame.views, ...previous.frame.departures];
        for (const entry of [...frame.views, ...frame.departures]) {
          const old = oldEntries.find(p => p.bodyId === entry.bodyId);
          if (old && entry.generation < old.generation) fail();
        }
        if (frame.epoch === previous.frame.epoch) {
          if (h.owner !== previous.owner || frame.revision < previous.frame.revision) fail();
          if (frame.revision === previous.frame.revision) {
            const immutable = f => ({ ...f, now: 0, expiresAt: 0 });
            if (!sameCheckpointValue(immutable(frame), immutable(previous.frame))) fail();
            if (sameAuthority(a, previous.authority) && sameCheckpointValue(frame, previous.frame))
              return { duplicate: true, receipt: receipt(previous.frame) };
            if (frame.now < previous.frame.now || frame.expiresAt < previous.frame.expiresAt) fail();
          }
        }
      }
      if (now >= frame.expiresAt) fail();
      const row = rowValid({ v: 1, authority: a, owner: h.owner, retainedAt: now, frame });
      await tx.put(ROOM_BODY_PRESENCE.key, row);
      return { duplicate: false, receipt: receipt(frame) };
    });
  }
  async snapshot(roomTicket) {
    authority(roomTicket); const a = { ...roomTicket };
    return this.storage.transaction(async tx => {
      await this.current(tx, a);
      const now = this.clock(), saved = await tx.get(ROOM_BODY_PRESENCE.key);
      if (!time(now)) fail();
      if (!saved) return null;
      const row = rowValid(saved);
      if (now < row.retainedAt) fail();
      if (!sameAuthority(a, row.authority)) return null;
      return { frame: structuredClone(row.frame), stale: now >= row.frame.expiresAt };
    });
  }
}
