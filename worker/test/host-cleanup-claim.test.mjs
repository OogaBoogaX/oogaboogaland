// Independent tests for VirtualHost.claimBodyCleanup / acknowledgeBodyDepartures (#377, PR467).
// The oracle is the stated contract, not the production algorithm:
// - claimBodyCleanup(owner) is a bounded cleanup claim ONLY after the finite NPC run and the prior
//   lease expired, with zero live/held sessions and >=1 already-applied pending departure. It raises
//   the fence, sets owner, status "draining", leaseUntil = now + HOST.leaseMs, and never extends
//   runUntil or steps/changes the world. A normal claim() cannot acquire this pending-only state.
// - acknowledgeBodyDepartures(ticket, {world, epoch, revision, ids}) is a trusted server-only hook.
//   Mismatched world/epoch/revision is superseded with no writes; any unknown/unapplied id throws
//   with no partial ACK; success touches nothing but the acknowledged departures, except that an
//   ended run with no held body and no remaining departure becomes stopped with leaseUntil = now.
// Data-only fixtures; no browser, Hub, scene or NPC simulation is imported or executed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BODY_VIEW, HOST, SESSION_PROTOCOL, VirtualHost } from "../src/virtual-host.js";

// Serial, rollback-capable storage: each transaction sees a private copy committed only on
// success. `edit` is a test-only raw durable write used to construct otherwise-transient states.
function storage() {
  let data = new Map(), tail = Promise.resolve(), failWrite = false;
  const store = {
    writes: 0,
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
    read: () => structuredClone(data.get(HOST.key)),
    edit: fn => { const r = structuredClone(data.get(HOST.key)); fn(r); data.set(HOST.key, r); },
    failNext: () => { failWrite = true; },
  };
  return store;
}

// No NPC exists, so expiry is a green glyph with no handback and no forced spawn. Any NPC step
// or world handoff during cleanup/ACK is a contract violation.
const simulation = {
  version: "cleanup-claim-world-1", checkpointBytes: 30 * 1024,
  initial: () => ({ steps: 0 }),
  validate: s => !!s && Number.isSafeInteger(s.steps),
  step() { throw new Error("cleanup must not tick NPCs"); },
  project: () => ({ npcs: [], hub: { pile: 0 } }),
  npcFor: () => null,
  handoff: () => { throw new Error("no NPC exists in this fixture"); },
};

function harness() {
  const store = storage(); let now = 100000;
  const passive = { calls: 0 };
  const make = () => new VirtualHost({ storage: store, simulation,
    sessionAdapter: { stepPassive: m => { passive.calls++; return m; } }, clock: () => now });
  return { store, passive, host: make(), make, at: t => { now = t; } };
}

const claim = (accountId, bodyId) => ({ protocol: SESSION_PROTOCOL, world: simulation.version, accountId, bodyId,
  zone: "outside", body: { kind: "ooga", motion: { x: accountId, y: 10, z: 2, yaw: 0.7, vx: 3, vy: -1, vz: 2, grounded: false },
    equipment: { weapon: "gun", mode: "combat", jetpack: true, primaryOwned: true, secondaryOwned: true,
      selectedSlot: 2, unlimited: false, jetpackOwned: true } } });
const ref = s => ({ accountId: s.accountId, generation: s.generation, token: s.token });
const durableTicket = r => ({ owner: r.owner, fence: r.fence, world: r.world });
const receiptOf = frame => ({ world: frame.world, epoch: frame.epoch, revision: frame.revision,
  ids: frame.departures.map(d => d.id) });

// Finite run 100000..105000 (lease to 110000). The body closes at 100500, so its original
// absolute deadline is 160500. A restarted runner claims (a held body exists), then a draining
// tick expires it into one applied departure and stops: pending-only, status "stopped".
async function pendingOnlyStopped() {
  const h = harness(), ticket = await h.host.begin("owner", 5000);
  const a = (await h.host.connect(ticket, [], claim(1, "resident"))).result;
  assert.equal(a.ok, true);
  h.at(100500);
  await h.host.disconnect(ticket, [], ref(a.session), 100500);
  h.at(160600);
  const late = await h.make().claim("late");
  const tick = await h.host.tick(late, []);
  assert.equal(tick.status, "stopped");
  const r = h.store.read();
  assert.equal(r.status, "stopped"); assert.equal(r.leaseUntil, 160600); assert.equal(r.runUntil, 105000);
  assert.equal(r.sessions.sessions.length, 0);
  assert.equal(r.sessions.pending.length, 1);
  assert.equal(r.sessions.pending[0].id, "depart:1"); assert.equal(r.sessions.pending[0].applied, true);
  assert.equal(r.sessions.pending[0].at, 160500); assert.equal(r.sessions.pending[0].glyph, "green");
  h.at(160700);
  return { h, late };
}

test("pending-only stopped host: only an explicit cleanup claim acquires it; lost reply is reconciled, then ACK fully stops", async () => {
  const { h, late } = await pendingOnlyStopped();
  const before = h.store.read(), writes = h.store.writes;
  await assert.rejects(h.host.claim("normal"), "a normal claim cannot acquire the pending-only stopped case");
  await assert.rejects(h.host.claimBodyCleanup(""), "invalid owner");
  h.store.failNext();
  await assert.rejects(h.host.claimBodyCleanup("cleaner"), /storage unavailable/);
  assert.deepEqual(h.store.read(), before, "failed cleanup claim rolls back atomically");
  assert.equal(h.store.writes, writes);

  // Lost reply: the return value is discarded; the caller reconciles from durable state.
  await h.host.claimBodyCleanup("cleaner");
  const claimed = h.store.read();
  assert.equal(claimed.fence, before.fence + 1); assert.equal(claimed.owner, "cleaner");
  assert.equal(claimed.status, "draining"); assert.equal(claimed.leaseUntil, 160700 + HOST.leaseMs);
  assert.equal(claimed.runUntil, before.runUntil, "never extends the finite run");
  assert.deepEqual(claimed.simulation, before.simulation, "no NPC step or world change");
  assert.deepEqual([claimed.simulatedAt, claimed.wallCursor, claimed.pausedMs], [before.simulatedAt, before.wallCursor, before.pausedMs]);
  assert.deepEqual(claimed.sessions.sessions, before.sessions.sessions);
  assert.deepEqual(claimed.sessions.pending, before.sessions.pending);
  await assert.rejects(h.host.bodyPresence(late), /fenced/, "the prior runner is fenced");

  const ticket = durableTicket(claimed);
  const { frame } = await h.host.bodyPresence(ticket);
  assert.equal(frame.epoch, claimed.fence); assert.equal(frame.revision, claimed.revision);
  assert.deepEqual(frame.views, []); assert.deepEqual(frame.departures.map(d => d.id), ["depart:1"]);

  // Retry after reconciliation: the active lease refuses a second claim, with no write.
  const claimedWrites = h.store.writes;
  await assert.rejects(h.host.claimBodyCleanup("cleaner"));
  await assert.rejects(h.host.claimBodyCleanup("other"));
  assert.equal(h.store.writes, claimedWrites); assert.deepEqual(h.store.read(), claimed);

  h.at(161000);
  const receipt = receiptOf(frame);
  assert.deepEqual(await h.host.acknowledgeBodyDepartures(ticket, receipt), { changed: true, superseded: false });
  const done = h.store.read();
  assert.equal(done.sessions.sessions.length, 0); assert.equal(done.sessions.pending.length, 0);
  assert.equal(done.status, "stopped", "ended run with nothing held or pending stops");
  assert.equal(done.leaseUntil, 161000);
  assert.equal(done.runUntil, before.runUntil); assert.equal(done.fence, claimed.fence);
  assert.deepEqual(done.simulation, before.simulation);
  // Duplicate old receipt after the full stop: ownership is fenced, no write.
  const doneWrites = h.store.writes;
  await assert.rejects(h.host.acknowledgeBodyDepartures(ticket, receipt), /fenced/);
  // Zero departures now: neither claim path can reacquire.
  await assert.rejects(h.host.claimBodyCleanup("cleaner"));
  await assert.rejects(h.host.claim("normal"));
  assert.equal(h.store.writes, doneWrites); assert.deepEqual(h.store.read(), done);
});

test("cleanup claim refuses held bodies, active run/lease, zero or unapplied departures, backlog and incompatible state", async () => {
  // Natural held case: account 2 closes later (deadline 164900) and is still held after account 1 departs.
  {
    const h = harness(), ticket = await h.host.begin("owner", 5000);
    const one = (await h.host.connect(ticket, [], claim(1, "resident"))).result;
    const two = (await h.host.connect(ticket, [one.session.token], claim(2, "neighbor"))).result;
    h.at(100500); await h.host.disconnect(ticket, [two.session.token], ref(one.session), 100500);
    h.at(104900); await h.host.disconnect(ticket, [], ref(two.session), 104900);
    h.at(160600);
    const late = await h.make().claim("late");
    assert.equal((await h.host.tick(late, [])).status, "draining");
    h.at(170700); // run ended, lease (170600) expired, one applied departure, one held body
    const r = h.store.read(), writes = h.store.writes;
    assert.equal(r.sessions.sessions.length, 1); assert.equal(r.sessions.pending[0].applied, true);
    await assert.rejects(h.host.claimBodyCleanup("cleaner"), "held body refuses cleanup claim");
    assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), r);
  }
  const refusals = {
    "active run": r => { r.status = "running"; r.runUntil = 170000; },
    "active lease": r => { r.status = "draining"; r.leaseUntil = 165000; },
    "zero departures": r => { r.sessions.pending = []; },
    "unapplied departure intent": r => { r.sessions.pending[0].applied = false; },
    "backlog": r => { r.status = "backlog"; },
    "incompatible world": r => { r.world = "other-world-1"; },
  };
  for (const [name, mutate] of Object.entries(refusals)) {
    const { h } = await pendingOnlyStopped();
    h.store.edit(mutate);
    const r = h.store.read(), writes = h.store.writes;
    await assert.rejects(h.host.claimBodyCleanup("cleaner"), `${name} refuses cleanup claim`);
    assert.equal(h.store.writes, writes, `${name}: no write`); assert.deepEqual(h.store.read(), r, `${name}: unchanged`);
  }
  // Allowed old statuses: an expired running/draining record is claimable too, never extending the run.
  for (const status of ["running", "draining"]) {
    const { h } = await pendingOnlyStopped();
    h.store.edit(r => { r.status = status; });
    const before = h.store.read();
    await h.host.claimBodyCleanup("cleaner");
    const after = h.store.read();
    assert.equal(after.status, "draining", status); assert.equal(after.fence, before.fence + 1);
    assert.equal(after.owner, "cleaner"); assert.equal(after.leaseUntil, 160700 + HOST.leaseMs);
    assert.equal(after.runUntil, before.runUntil); assert.deepEqual(after.simulation, before.simulation);
    assert.deepEqual(after.sessions.pending, before.sessions.pending);
  }
});

test("ACK during an active run: superseded/invalid receipts write nothing; partial ACK is impossible; live bodies stay protected", async () => {
  const h = harness(), old = await h.host.begin("owner", 120000); // runUntil 220000
  const one = (await h.host.connect(old, [], claim(1, "resident"))).result;
  const two = (await h.host.connect(old, [one.session.token], claim(2, "neighbor"))).result;
  const three = (await h.host.connect(old, [one.session.token, two.session.token], claim(3, "visitor"))).result;
  const live = three.session.token;
  h.at(100500);
  await h.host.disconnect(old, [two.session.token, live], ref(one.session), 100500);
  await h.host.disconnect(old, [live], ref(two.session), 100500);
  h.at(160600);
  const ticket = await h.make().claim("second");
  assert.equal((await h.host.reconcileBodies(ticket, [live])).changed, true);
  const { frame } = await h.host.bodyPresence(ticket);
  const ids = Object.fromEntries(frame.departures.map(d => [d.accountId, d.id]));
  assert.deepEqual(frame.views.map(v => [v.accountId, v.state]), [[3, "live"]]);
  const base = { world: frame.world, epoch: frame.epoch, revision: frame.revision };

  const before = h.store.read(), writes = h.store.writes, passive = h.passive.calls;
  for (const stale of [{ ...base, revision: base.revision - 1 }, { ...base, epoch: base.epoch - 1 }, { ...base, world: "other-world-1" }])
    assert.deepEqual(await h.host.acknowledgeBodyDepartures(ticket, { ...stale, ids: [ids[1]] }), { changed: false, superseded: true });
  const invalid = [
    { ...base, ids: [] }, { ...base, ids: [ids[1], ids[1]] }, { ...base, ids: ["depart:0"] }, { ...base, ids: ["depart:01"] },
    { ...base, ids: [1] }, { ...base, ids: ["depart:" + "9".repeat(200)] }, { ...base, ids: [ids[1]], extra: true },
    { world: base.world, epoch: base.epoch, ids: [ids[1]] },
    { ...base, ids: Array.from({ length: BODY_VIEW.maxBodies + 1 }, (_, i) => `depart:${i + 1}`) },
    { ...base, ids: [ids[1], "depart:99"] }, // unknown id alongside a valid one: no partial ACK
  ];
  for (const receipt of invalid) await assert.rejects(h.host.acknowledgeBodyDepartures(ticket, receipt));
  await assert.rejects(h.host.acknowledgeBodyDepartures(old, { ...base, ids: [ids[1]] }), /fenced/);
  assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), before);

  h.at(160800);
  assert.deepEqual(await h.host.acknowledgeBodyDepartures(ticket, { ...base, ids: [ids[1]] }), { changed: true, superseded: false });
  const acked = h.store.read();
  assert.deepEqual(acked.sessions.pending, before.sessions.pending.filter(p => p.id !== ids[1]), "only the acknowledged departure is removed");
  assert.deepEqual(acked.sessions.sessions, before.sessions.sessions, "live body kept without any census/absence inference");
  assert.equal(acked.sessions.clock, before.sessions.clock);
  for (const k of ["status", "owner", "fence", "leaseUntil", "runUntil", "simulatedAt", "wallCursor", "pausedMs"])
    assert.deepEqual(acked[k], before[k], `${k} unchanged by ACK`);
  assert.deepEqual(acked.simulation, before.simulation, "no NPC/world change");
  assert.equal(h.passive.calls, passive, "no physics/passive steps from ACK");

  // Duplicate old receipt while ownership is live: superseded, no write.
  const ackWrites = h.store.writes;
  assert.deepEqual(await h.host.acknowledgeBodyDepartures(ticket, { ...base, ids: [ids[1]] }), { changed: false, superseded: true });
  assert.equal(h.store.writes, ackWrites);

  // Same revision but an unapplied id throws without writing.
  h.store.edit(r => { r.sessions.pending.find(p => p.id === ids[2]).applied = false; });
  const unapplied = h.store.read();
  await assert.rejects(h.host.acknowledgeBodyDepartures(ticket,
    { world: unapplied.world, epoch: unapplied.fence, revision: unapplied.revision, ids: [ids[2]] }));
  assert.equal(h.store.writes, ackWrites); assert.deepEqual(h.store.read(), unapplied);
  h.store.edit(r => { r.sessions.pending.find(p => p.id === ids[2]).applied = true; });

  // Storage failure rolls back atomically; a retry then succeeds. Run active, so no stop.
  const fresh = receiptOf((await h.host.bodyPresence(ticket)).frame);
  assert.deepEqual(fresh.ids, [ids[2]]);
  const beforeFail = h.store.read();
  h.store.failNext();
  await assert.rejects(h.host.acknowledgeBodyDepartures(ticket, fresh), /storage unavailable/);
  assert.deepEqual(h.store.read(), beforeFail);
  assert.deepEqual(await h.host.acknowledgeBodyDepartures(ticket, fresh), { changed: true, superseded: false });
  const last = h.store.read();
  assert.equal(last.sessions.pending.length, 0);
  assert.deepEqual(last.sessions.sessions, before.sessions.sessions);
  assert.equal(last.status, "running"); assert.equal(last.leaseUntil, before.leaseUntil);
  assert.equal(last.runUntil, before.runUntil); assert.equal(h.passive.calls, passive);
});
