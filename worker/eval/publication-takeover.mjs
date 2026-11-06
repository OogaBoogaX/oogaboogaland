// Finite takeover regression diagnostic. Actual host/Room authority and
// bridge; authored data-only simulation and serial in-memory transactions.
// No Hub, scene, sockets, browser, network, timers or production resources.
import assert from 'node:assert/strict';
import { VirtualHost, HOST } from '../src/virtual-host.js';
import { RoomNpcAuthority, ROOM_NPC, npcAuthorityView, npcCadenceName } from '../src/room-npc-authority.js';
import { publishHostPoses, claimHostRoom } from '../src/host-room.js';

function storage() {
  let data = new Map(), tail = Promise.resolve();
  return { get: async key => structuredClone(data.get(key)), transaction(fn) {
    const work = tail.then(async () => {
      const pending = structuredClone(data);
      const result = await fn({ get: async key => structuredClone(pending.get(key)),
        put: async (key, value) => pending.set(key, structuredClone(value)),
        delete: async key => pending.delete(key) });
      data = pending; return result;
    });
    tail = work.catch(() => {}); return work;
  } };
}
const frame = () => {
  const data = new ArrayBuffer(16 + 112 * 4), h = new Uint32Array(data, 0, 4), f = new Float32Array(data, 16);
  h.set([2, 0, 1, 0]); f[1] = 1; f[12] = f[13] = f[14] = f[43] = 1;
  return data;
};
let now = 100000;
const hostStore = storage(), roomStore = storage();
const simulation = { version: 'takeover-diagnostic-1', checkpointBytes: 30 * 1024,
  initial: () => ({ steps: 0 }), validate: s => Number.isSafeInteger(s.steps),
  step(s) { s.steps++; }, project: () => ({ npcs: [], hub: { pile: 0 } }),
  npcFor: () => null, handoff: () => false, poses: frame };
const host = new VirtualHost({ storage: hostStore, simulation, clock: () => now, sessionAdapter: { stepPassive: m => m } });
const authority = new RoomNpcAuthority(roomStore, () => now), events = [];
const room = {
  async npcAuthorityStatus(ticket) {
    const r = await authority.read();
    return { authority: npcAuthorityView(r), owns: !!r && r.mode === 'server' && ticket?.revision === r.revision
      && ticket.owner === r.owner && ticket.world === r.world && ticket.epoch === r.epoch,
      sequence: r?.sequence, runUntil: r?.runUntil, cadence: npcCadenceName(r) };
  },
  async fenceNpcAuthority(intent) { return npcAuthorityView(await authority.fence(intent)); },
  async configureNpcAuthority(expected, next) { return npcAuthorityView(await authority.change(expected, next)); },
  async publishNpcSnapshot(ticket, sequence, data) {
    const { record, duplicate } = await authority.publish(ticket, sequence, data);
    events.push({ at: now, roomEpoch: record.epoch, sequence, duplicate });
    return { revision: record.revision, sequence: record.sequence, publishedAt: record.at, duplicate };
  }
};
const oldTicket = await host.begin('runner-a', 60000);
now = 109750;
const first = await publishHostPoses(host, room, oldTicket, { acquire: true });
assert.equal(first.status, 'published');
now = 109751;
await host.sessions(oldTicket, [], () => true);
const before = await hostStore.get(HOST.key), roomBefore = await roomStore.get(ROOM_NPC.key);
assert.equal(before.leaseUntil, 110000, 'session mutation cannot renew host ownership');
let replacement;
const delayedRoom = { ...room, async publishNpcSnapshot(...args) {
  // Confirmation has returned. Delay only the final cross-object call until
  // host takeover is legal while the independent Room lease remains live.
  now = 110001;
  replacement = await claimHostRoom(host, room, 'runner-b');
  return room.publishNpcSnapshot(...args);
} };
let delayed;
try {
  await publishHostPoses(host, delayedRoom, oldTicket, { roomState: first.roomState });
  delayed = 'published';
} catch (error) { delayed = error.message; }
const after = await hostStore.get(HOST.key), roomAfter = await roomStore.get(ROOM_NPC.key);
let oldHostFence, newRoomClaim;
try { await host.poses(oldTicket); oldHostFence = 'accepted'; } catch (error) { oldHostFence = error.message; }
try {
  await authority.change(roomAfter.revision, { mode: 'server', world: replacement.world,
    epoch: replacement.fence, owner: replacement.owner, runUntil: after.runUntil });
  newRoomClaim = 'accepted';
} catch (error) { newRoomClaim = error.message; }
assert.match(delayed, /fenced/);
assert.equal(roomAfter.epoch, after.fence);
assert.equal(roomAfter.sequence, 0, 'old frame was not committed under the replacement');
console.log(JSON.stringify({ scope: 'actual authority source; deterministic shared fake clock and in-memory transactions; no production latency estimate',
  hostLeaseBefore: before.leaseUntil, roomLeaseBefore: roomBefore.leaseUntil, confirmationAt: 109751,
  takeoverAt: now, hostEpochAfter: after.fence, delayedPublication: delayed, roomEpochAfter: roomAfter.epoch,
  roomLeaseAfter: roomAfter.leaseUntil, oldHostFence, newRoomClaim, events,
  unsafeOldEpochPublication: roomAfter.epoch < after.fence }, null, 2));
