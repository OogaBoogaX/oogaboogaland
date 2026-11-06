import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { RoomNpcAuthority, npcAuthorityView } from '../src/room-npc-authority.js';
import { RoomBodyPresence } from '../src/room-body-presence.js';
import { retainHostBodyPresence } from '../src/host-body-room.js';

function storage() {
  let data = new Map(), serial = Promise.resolve(), fail = false;
  return { read: key => structuredClone(data.get(key)), fail() { fail = true; }, transaction(fn) {
    const work = serial.then(async () => {
      const draft = structuredClone(data);
      const result = await fn({ get: async key => structuredClone(draft.get(key)), put: async (key, value) => {
        if (fail) { fail = false; throw Error('storage unavailable'); } draft.set(key, structuredClone(value));
      } });
      data = draft; return result;
    });
    serial = work.catch(() => {}); return work;
  } };
}
async function fixture() {
  let now = 100000;
  const hs = storage(), rs = storage(), clock = () => now;
  const simulation = { version: 'body-presence-fixture', checkpointBytes: 30 * 1024,
    initial: () => ({ steps: 0 }), validate: s => s.steps === 0, step() { throw Error('no NPC tick'); },
    project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff() { throw Error('no NPC'); } };
  const host = new VirtualHost({ storage: hs, simulation, sessionAdapter: { stepPassive() { throw Error('no physics'); } }, clock });
  const first = await host.begin('first', 5000);
  const roomAuthority = await new RoomNpcAuthority(rs, clock).change(0, { mode: 'server', owner: 'first',
    world: first.world, epoch: first.fence, runUntil: 105000 });
  const roomTicket = { ...npcAuthorityView(roomAuthority), owner: 'first' };
  const joined = (await host.connect(first, [], { protocol: SESSION_PROTOCOL, world: first.world, accountId: 1,
    bodyId: 'resident', zone: 'outside', body: { kind: 'ooga',
      motion: { x: 1, y: 10, z: 2, yaw: 0, vx: 1, vy: 2, vz: 3, grounded: false },
      equipment: { weapon: 'gun', mode: 'combat', primaryOwned: true, secondaryOwned: false,
        selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } })).result;
  await host.disconnect(first, [], { accountId: 1, generation: joined.session.generation, token: joined.session.token }, now);
  now = 160001;
  await host.tick(await host.claim('drain'), []);
  const owner = await host.claimBodyCleanup('cleanup');
  const box = new RoomBodyPresence(rs, clock); let lose = false, sends = 0;
  const room = {
    async retainBodyPresence(...args) { const result = await box.retain(...args); if (lose) { lose = false; throw Error('lost Room reply'); } return result; },
    bodyPresenceStatus: ticket => box.snapshot(ticket),
    async deliverBodyPresence() { sends++; return { delivered: 0 }; }, // no sockets in this fixture
  };
  return { host, hs, rs, box, owner, roomTicket, room, lose: () => { lose = true; }, sends: () => sends,
    at: t => { now = t; } };
}

test('durable Room commit precedes host departure removal; lost reply and failed host ACK reconcile without losing the event', async () => {
  const f = await fixture(), before = f.hs.read(HOST.key);
  f.rs.fail();
  await assert.rejects(retainHostBodyPresence(f.host, f.room, f.owner, f.roomTicket), /storage/);
  assert.deepEqual(f.hs.read(HOST.key), before); assert.equal(f.sends(), 0);
  f.lose(); f.hs.fail();
  await assert.rejects(retainHostBodyPresence(f.host, f.room, f.owner, f.roomTicket), /storage/);
  assert.deepEqual(f.hs.read(HOST.key), before);
  const retained = await f.box.snapshot(f.roomTicket);
  assert.equal(retained.frame.departures.length, 1); assert.equal(retained.frame.departures[0].at, 160000);
  assert.equal(f.sends(), 1);
  const result = await retainHostBodyPresence(f.host, f.room, f.owner, f.roomTicket);
  assert.equal(result.status, 'acknowledged'); assert.equal(result.duplicate, true);
  const done = f.hs.read(HOST.key); assert.equal(done.sessions.pending.length, 0); assert.equal(done.status, 'stopped');
  assert.deepEqual((await new RoomBodyPresence(f.rs, () => 160001).snapshot(f.roomTicket)).frame, retained.frame);
  f.at(180000);
  assert.equal((await f.room.bodyPresenceStatus(f.roomTicket)).stale, true, 'Room retains the departure after the host stops');
});

test('superseded host read, forged Room receipt and a Room takeover never acknowledge a pending departure', async () => {
  const f = await fixture(), before = f.hs.read(HOST.key);
  const stale = { bodyPresence: (...args) => f.host.bodyPresence(...args), bodyLifecycleRevision: async () => before.revision + 1 };
  assert.deepEqual(await retainHostBodyPresence(stale, f.room, f.owner, f.roomTicket), { status: 'superseded', retained: false });
  assert.equal(await f.box.snapshot(f.roomTicket), null);
  await assert.rejects(retainHostBodyPresence(f.host, { ...f.room, retainBodyPresence: async () => ({ receipt: { ids: [] } }) }, f.owner, f.roomTicket), /receipt mismatch/);
  assert.deepEqual(f.hs.read(HOST.key), before); assert.equal(f.sends(), 0);
  const wrong = { ...f.roomTicket, revision: f.roomTicket.revision + 1 };
  await assert.rejects(retainHostBodyPresence(f.host, f.room, f.owner, wrong), /fenced/);
  assert.deepEqual(f.hs.read(HOST.key), before);
});
