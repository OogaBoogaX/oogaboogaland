// Independent tests for RoomBodyPresence (#377, PR467). Written against the stated contract before the
// module existed locally; the oracle is the contract, not the production algorithm.
// - retain(roomTicket, hostTicket, frame) transactionally checks the current stored RoomNpcAuthority
//   (exact private tuple, even if its lease expired), fences the host ticket (same world, fence >= Room
//   epoch, equal fence requires same owner) and keeps ONE latest row
//   { v: 1, authority: roomTicket, owner, retainedAt, frame }. Never a queue or timer.
// - snapshot(roomTicket) returns { frame: clone, stale } for the row under that exact current authority,
//   else null; expired frames stay readable as stale presentation only.
// Assumptions (stated, not verified against the implementation):
// - Any refusal is a rejected promise (assert.rejects); the error text is not asserted.
// - snapshot() of a ticket that is no longer the current Room authority rejects (it "validates the
//   current Room ticket"); a current authority without its own row returns null.
// - An exact duplicate retry after frame expiry (Room authority unchanged) resolves { duplicate: true }.
// - Host views for held bodies carry a numeric `deadline` (they did in VirtualHost.bodyPresence frames).
// Frames come from the actual VirtualHost.bodyPresence / SessionRegistry; Room authority rows from the
// actual RoomNpcAuthority. No Hub, browser or scene import; no network delivery or host ACK is certified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_PROTOCOL, VirtualHost } from "../src/virtual-host.js";
import { ROOM_NPC, RoomNpcAuthority } from "../src/room-npc-authority.js";
import { ROOM_BODY_PRESENCE, RoomBodyPresence } from "../src/room-body-presence.js";

// Serial, rollback-capable storage: each transaction sees a private copy committed only on success.
function storage() {
  let data = new Map(), tail = Promise.resolve(), failWrite = false;
  const store = {
    writes: 0,
    get: async key => structuredClone(data.get(key)),
    transaction(fn) {
      const work = tail.then(async () => {
        const pending = structuredClone(data);
        let writes = 0;
        const result = await fn({
          get: async key => structuredClone(pending.get(key)),
          put: async (key, value) => {
            if (failWrite) { failWrite = false; throw new Error("storage unavailable"); }
            pending.set(key, structuredClone(value)); writes++;
          },
        });
        data = pending; store.writes += writes; return result;
      });
      tail = work.catch(() => {}); return work;
    },
    read: key => structuredClone(data.get(key)),
    dump: () => Object.fromEntries(structuredClone(data)),
    failNext: () => { failWrite = true; },
  };
  return store;
}

const WORLD = "presence-world-1";
const simulation = {
  version: WORLD, checkpointBytes: 30 * 1024,
  initial: () => ({ steps: 0 }),
  validate: s => !!s && Number.isSafeInteger(s.steps),
  step: s => ({ steps: s.steps + 1 }),
  project: () => ({ npcs: [], hub: { pile: 0 } }),
  npcFor: () => null,
  handoff: () => { throw new Error("no NPC exists in this fixture"); },
};
const claim = (accountId, bodyId) => ({ protocol: SESSION_PROTOCOL, world: WORLD, accountId, bodyId,
  zone: "outside", body: { kind: "ooga", motion: { x: accountId, y: 10, z: 2, yaw: 0.7, vx: 3, vy: -1, vz: 2, grounded: false },
    equipment: { weapon: "gun", mode: "combat", jetpack: true, primaryOwned: true, secondaryOwned: true,
      selectedSlot: 2, unlimited: false, jetpackOwned: true } } });
const ref = s => ({ accountId: s.accountId, generation: s.generation, token: s.token });
const roomTicketOf = r => ({ v: r.v, ...(r.v === 2 ? { format: r.format } : {}), revision: r.revision,
  mode: r.mode, world: r.world, epoch: r.epoch, owner: r.owner });
const receiptOf = f => ({ world: f.world, epoch: f.epoch, revision: f.revision, ids: f.departures.map(d => d.id) });

// One shared fake clock. Host run 100000..220000 (fence 1, owner "owner"); Room authority epoch 1,
// owner "owner" from 100000. Account 1 closes at 100500 (deadline 160500), account 2 at 105000
// (deadline 165000), account 3 stays live. At 160600 a second runner claims (fence 2) and reconciles:
// frame2 = views [held 2, live 3] + one applied departure of account 1, expiresAt 165000.
async function fixture() {
  let now = 100000;
  const clock = () => now, at = t => { now = t; };
  const hostStore = storage(), roomStore = storage();
  const host = new VirtualHost({ storage: hostStore, simulation, sessionAdapter: { stepPassive: m => m }, clock });
  const npc = new RoomNpcAuthority(roomStore, clock);
  const t1 = await host.begin("owner", 120000);
  const room = await npc.change(0, { mode: "server", world: WORLD, epoch: 1, owner: "owner", runUntil: now + ROOM_NPC.runMs });
  const one = (await host.connect(t1, [], claim(1, "resident"))).result;
  const two = (await host.connect(t1, [one.session.token], claim(2, "neighbor"))).result;
  const three = (await host.connect(t1, [one.session.token, two.session.token], claim(3, "visitor"))).result;
  const live = three.session.token;
  at(100500);
  await host.disconnect(t1, [two.session.token, live], ref(one.session), 100500);
  const frame1 = (await host.bodyPresence(t1)).frame;
  at(105000);
  await host.disconnect(t1, [live], ref(two.session), 105000);
  at(160600);
  const t2 = await new VirtualHost({ storage: hostStore, simulation, sessionAdapter: { stepPassive: m => m }, clock }).claim("second");
  await host.reconcileBodies(t2, [live]);
  const frame2 = (await host.bodyPresence(t2)).frame;
  // Fixture sanity: a real, non-trivial frame within the contract's limits.
  assert.equal(t1.fence, 1); assert.equal(t2.fence, 2); assert.equal(frame2.epoch, 2);
  assert.ok(frame2.views.length === 2 && frame2.departures.length === 1 && frame2.departures[0].applied === true);
  assert.ok(frame2.expiresAt > 160600 && frame2.expiresAt <= 160600 + 10000);
  return { at, clock, roomStore, npc, host, t1, t2, frame1, frame2, liveToken: live,
    roomTicket: roomTicketOf(room), presence: () => new RoomBodyPresence(roomStore, clock) };
}

test("atomic retain: storage failure rolls back, input mutation cannot leak, lost reply is a read-only retry, restart keeps latest", async () => {
  const f = await fixture(), p = f.presence();
  const authorityRow = f.roomStore.read(ROOM_NPC.key);
  assert.equal(await p.snapshot(f.roomTicket), null, "nothing retained yet");

  const empty = f.roomStore.dump(), emptyWrites = f.roomStore.writes;
  f.roomStore.failNext();
  await assert.rejects(p.retain(f.roomTicket, f.t2, structuredClone(f.frame2)), /storage unavailable/);
  assert.deepEqual(f.roomStore.dump(), empty, "failed commit rolls back"); assert.equal(f.roomStore.writes, emptyWrites);
  assert.equal(await p.snapshot(f.roomTicket), null);

  // Caller mutates every input synchronously after invocation; the commit must use the original values.
  const room = structuredClone(f.roomTicket), hostTicket = structuredClone(f.t2), frame = structuredClone(f.frame2);
  const pending = p.retain(room, hostTicket, frame);
  room.owner = "mallory"; hostTicket.owner = "mallory"; hostTicket.fence = 99;
  frame.now = 0; frame.views[0].state = "live"; frame.views.reverse(); frame.departures.length = 0;
  const receipt = receiptOf(f.frame2);
  assert.deepEqual(await pending, { duplicate: false, receipt });
  assert.deepEqual(receipt.ids, f.frame2.departures.map(d => d.id));
  const row = { v: 1, authority: f.roomTicket, owner: "second", retainedAt: 160600, frame: f.frame2 };
  assert.deepEqual(f.roomStore.read(ROOM_BODY_PRESENCE.key), row);
  assert.deepEqual(f.roomStore.read(ROOM_NPC.key), authorityRow, "Room authority row untouched");
  assert.deepEqual(Object.keys(f.roomStore.dump()).sort(), [ROOM_NPC.key, ROOM_BODY_PRESENCE.key].sort(), "one row, no queue");

  // Lost reply: the exact retry is read-only and returns the same receipt.
  f.at(160700);
  const committed = f.roomStore.dump(), writes = f.roomStore.writes;
  assert.deepEqual(await p.retain(f.roomTicket, f.t2, structuredClone(f.frame2)), { duplicate: true, receipt });
  assert.equal(f.roomStore.writes, writes); assert.deepEqual(f.roomStore.dump(), committed);

  // Restart: a fresh instance over the same storage reads the latest row; returned frames are clones.
  const restarted = f.presence();
  const snap = await restarted.snapshot(f.roomTicket);
  assert.deepEqual(snap, { frame: f.frame2, stale: false });
  snap.frame.views.length = 0;
  assert.deepEqual((await restarted.snapshot(f.roomTicket)).frame, f.frame2, "snapshot returns a clone");

  // Same-epoch/revision refresh (only now/expiresAt may change) replaces the single row.
  f.at(161000);
  const refresh = (await f.host.bodyPresence(f.t2)).frame;
  assert.equal(refresh.revision, f.frame2.revision); assert.equal(refresh.now, 161000);
  assert.deepEqual(await restarted.retain(f.roomTicket, f.t2, refresh), { duplicate: false, receipt });
  assert.deepEqual(f.roomStore.read(ROOM_BODY_PRESENCE.key), { ...row, retainedAt: 161000, frame: refresh });
  const refreshed = f.roomStore.dump(), refreshedWrites = f.roomStore.writes;
  await assert.rejects(restarted.retain(f.roomTicket, f.t2, structuredClone(f.frame2)), "older now cannot regress the row");
  assert.equal(f.roomStore.writes, refreshedWrites); assert.deepEqual(f.roomStore.dump(), refreshed);

  // After expiry: stale presentation only. The exact duplicate still reconciles read-only.
  f.at(refresh.expiresAt + 1);
  assert.deepEqual(await f.presence().snapshot(f.roomTicket), { frame: refresh, stale: true });
  assert.deepEqual(await f.presence().retain(f.roomTicket, f.t2, structuredClone(refresh)), { duplicate: true, receipt });
  assert.equal(f.roomStore.writes, refreshedWrites); assert.deepEqual(f.roomStore.dump(), refreshed);
});

test("fencing: stale host epoch/revision, owner mismatch, same-revision payload change and Room takeover", async () => {
  const f = await fixture(), p = f.presence();
  const writesBefore = f.roomStore.writes;
  // Forged copies of frame2 that would otherwise be valid at 160600.
  const olderEpoch = { ...structuredClone(f.frame2), epoch: 1 };
  const olderTicket = { owner: "owner", fence: 1, world: WORLD };
  for (const [name, room, hostTicket] of [
    ["equal fence, different owner", f.roomTicket, { owner: "intruder", fence: 1, world: WORLD }],
    ["host world mismatch", f.roomTicket, { ...f.t2, world: "other-world-1" }],
    ["frame epoch != host fence", f.roomTicket, { ...f.t2, fence: 3 }],
    ["Room revision not current", { ...f.roomTicket, revision: f.roomTicket.revision + 1 }, f.t2],
    ["Room owner not exact", { ...f.roomTicket, owner: "second" }, f.t2],
    ["Room ticket extra field", { ...f.roomTicket, leaseUntil: 0 }, f.t2],
  ]) {
    const frame = name === "equal fence, different owner" ? olderEpoch : f.frame2;
    await assert.rejects(p.retain(room, hostTicket, structuredClone(frame)), name);
  }
  assert.equal(f.roomStore.writes, writesBefore); assert.equal(f.roomStore.read(ROOM_BODY_PRESENCE.key), undefined);

  // Retain epoch 2, then every rollback is refused with storage unchanged.
  await p.retain(f.roomTicket, f.t2, structuredClone(f.frame2));
  const kept = f.roomStore.dump(), writes = f.roomStore.writes;
  f.at(160700);
  const reversed = { ...structuredClone(f.frame2), now: 160700 };
  reversed.views.reverse();
  for (const [name, hostTicket, frame] of [
    ["older host epoch (same owner as Room)", olderTicket, olderEpoch],
    ["older revision, same epoch", f.t2, { ...structuredClone(f.frame2), revision: f.frame2.revision - 1 }],
    ["same epoch, different owner", { ...f.t2, owner: "third" }, structuredClone(f.frame2)],
    ["same revision, different payload, newer timestamp", f.t2, reversed],
  ]) {
    await assert.rejects(p.retain(f.roomTicket, hostTicket, frame), name);
    assert.equal(f.roomStore.writes, writes, name); assert.deepEqual(f.roomStore.dump(), kept, name);
  }

  // Room takeover: explicit release, then a new server authority in the SAME world with a LOWER Room epoch
  // than the retained host epoch (allowed by RoomNpcAuthority after a browser interval).
  const released = await f.npc.change(f.roomTicket.revision, { mode: "browser", owner: "owner", epoch: 1, world: WORLD });
  const next = roomTicketOf(await f.npc.change(released.revision, { mode: "server", world: WORLD, epoch: 1, owner: "owner",
    runUntil: 160700 + ROOM_NPC.runMs }));
  const authorityWrites = f.roomStore.writes;
  await assert.rejects(p.snapshot(f.roomTicket), "old Room ticket is no longer current");
  await assert.rejects(p.retain(f.roomTicket, f.t2, structuredClone(f.frame2)), "no duplicate reconcile after takeover");
  assert.equal(await p.snapshot(next), null, "old authority's row is not presented under the new authority");
  await assert.rejects(p.retain(next, olderTicket, olderEpoch), "new Room authority cannot roll back the host epoch");
  assert.equal(f.roomStore.writes, authorityWrites);
  assert.deepEqual(f.roomStore.read(ROOM_BODY_PRESENCE.key), kept[ROOM_BODY_PRESENCE.key]);

  // Superseding under the new authority after its exact check.
  assert.deepEqual(await p.retain(next, f.t2, structuredClone(f.frame2)), { duplicate: false, receipt: receiptOf(f.frame2) });
  assert.deepEqual(f.roomStore.read(ROOM_BODY_PRESENCE.key),
    { v: 1, authority: next, owner: "second", retainedAt: 160700, frame: f.frame2 });
  assert.deepEqual(await p.snapshot(next), { frame: f.frame2, stale: false });
  // A genuine but expired epoch-1 host frame (captured at 100500) can never become a NEW commit.
  await assert.rejects(p.retain(next, olderTicket, structuredClone(f.frame1)), "expired older-epoch frame refused");
});

test("malformed, private, oversized or out-of-window frames refuse the whole frame with storage unchanged", async () => {
  const f = await fixture(), p = f.presence();
  const base = f.frame2, before = f.roomStore.dump(), writes = f.roomStore.writes;
  const held = base.views.findIndex(v => v.state !== "live");
  assert.ok(held >= 0 && Number.isSafeInteger(base.views[held].deadline), "fixture has a held view with a deadline");
  const edit = fn => { const c = structuredClone(base); fn(c); return c; };
  const extraDepartures = n => Array.from({ length: n }, (_, i) => ({ ...structuredClone(base.departures[0]), id: `depart:${100 + i}`, generation: 100 + i, accountId: 100 + i, bodyId: `extra-${i}` }));
  const bad = {
    "unknown top-level field": edit(c => { c.extra = 1; }),
    "missing departures": edit(c => { delete c.departures; }),
    "wrong protocol": edit(c => { c.protocol = "host-session-v4"; }),
    "wrong version": edit(c => { c.v = 2; }),
    "private token in a view": edit(c => { c.views[0].token = f.liveToken; }),
    "unknown field in a departure": edit(c => { c.departures[0].secret = true; }),
    "malformed tail in views": edit(c => { c.views.push(null); }),
    "unapplied departure": edit(c => { c.departures[0].applied = false; }),
    "departure after frame.now": edit(c => { c.departures[0].at = c.now + 1; }),
    "held deadline not after now": edit(c => { c.views[held].deadline = c.now; }),
    "expiresAt not after now": edit(c => { c.expiresAt = c.now; }),
    "expiresAt beyond a held deadline": edit(c => { c.expiresAt = c.views[held].deadline + 1; }),
    "expiresAt beyond 10s lifetime": edit(c => { c.expiresAt = c.now + 10001; }),
    "frame.now in the future": edit(c => { c.now = 160601; }),
    "epoch differs from host fence": edit(c => { c.epoch = 1; }),
    "more than 32 combined entries": edit(c => { c.departures.push(...extraDepartures(32 - c.views.length)); }),
    "over 32768 JSON bytes": edit(c => { c.views[0].zone = "z".repeat(32768); }),
  };
  assert.equal(bad["more than 32 combined entries"].views.length + bad["more than 32 combined entries"].departures.length, 33);
  for (const [name, frame] of Object.entries(bad)) {
    await assert.rejects(p.retain(f.roomTicket, f.t2, frame), name);
    assert.equal(f.roomStore.writes, writes, name); assert.deepEqual(f.roomStore.dump(), before, name);
  }
  assert.equal(await p.snapshot(f.roomTicket), null);
  // Positive control: the untouched frame is accepted, so each refusal above came from its single defect.
  assert.equal((await p.retain(f.roomTicket, f.t2, structuredClone(base))).duplicate, false);
  // A malformed same-revision "refresh" after a valid row also leaves the row unchanged.
  const kept = f.roomStore.dump(), keptWrites = f.roomStore.writes;
  await assert.rejects(p.retain(f.roomTicket, f.t2, edit(c => { c.views[0].token = f.liveToken; })));
  assert.equal(f.roomStore.writes, keptWrites); assert.deepEqual(f.roomStore.dump(), kept);
});


test("a higher host epoch cannot roll a known body generation backwards", async () => {
  const f = await fixture(), p = f.presence(), newer = structuredClone(f.frame2);
  newer.revision++; newer.views[0].generation = 20;
  await p.retain(f.roomTicket, f.t2, newer);
  const before = f.roomStore.dump(), writes = f.roomStore.writes;
  const rolled = structuredClone(newer); rolled.epoch++; rolled.revision++; rolled.views[0].generation = 2;
  await assert.rejects(p.retain(f.roomTicket, { ...f.t2, fence: rolled.epoch, owner: 'third' }, rolled));
  assert.deepEqual(f.roomStore.dump(), before); assert.equal(f.roomStore.writes, writes);
});
