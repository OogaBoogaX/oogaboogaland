// Independent retained-close interleavings for VirtualHost.closeRetainedBody (#377, PR467).
// The oracle is the user-approved policy, not the production algorithm: a confirmed close
// freezes a live body once at its durable last accepted location; duplicate/stale closes and
// earlier-timestamp retries never move the original absolute 60-second deadline; a close is
// scoped to exactly one account/generation/token; expiry hands back with a green glyph at the
// original deadline (not the later observation time), with no forced spawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST, SESSION_PROTOCOL, VirtualHost } from "../src/virtual-host.js";

// Serial, rollback-capable storage: each transaction sees a private copy committed only on
// success. Models atomicity/ordering only, not Cloudflare scheduling or billing.
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
    failNext: () => { failWrite = true; },
  };
  return store;
}

// Data-only world fixture; explicitly not the Ooga/Clanker simulation. No NPC tick may run.
const simulation = {
  version: "retained-close-world-1", checkpointBytes: 30 * 1024,
  initial: () => ({ steps: 0 }),
  validate: s => !!s && Number.isSafeInteger(s.steps),
  step() { throw new Error("retained close must not tick NPCs"); },
  project: () => ({ npcs: [], hub: { pile: 0 } }),
  npcFor: () => null,
  handoff: () => { throw new Error("no NPC exists in this fixture"); },
};

function harness() {
  const store = storage(); let now = 100000;
  const make = () => new VirtualHost({ storage: store, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
  return { store, host: make(), make, at: t => { now = t; } };
}

const claim = (accountId = 1, bodyId = "resident") => ({ protocol: SESSION_PROTOCOL, world: simulation.version, accountId, bodyId,
  zone: "outside", body: { kind: "ooga", motion: { x: 1, y: 10, z: 2, yaw: 0.7, vx: 3, vy: -1, vz: 2, grounded: false },
    equipment: { weapon: "gun", mode: "combat", jetpack: true, primaryOwned: true, secondaryOwned: true,
      selectedSlot: 2, unlimited: false, jetpackOwned: true } } });
const row = (store, accountId) => store.read().sessions.sessions.find(s => s.accountId === accountId);
const ref = s => ({ accountId: s.accountId, generation: s.generation, token: s.token });

test("duplicate and earlier-timestamp stale closes racing a same-account reclaim never move the original deadline or touch the new generation", async () => {
  const h = harness(), ticket = await h.host.begin("owner", 120000);
  const a = (await h.host.connect(ticket, [], claim())).result;
  assert.equal(a.ok, true);
  h.at(101000);
  // Serial storage commits these in call order, interleaved as a Room would dispatch them.
  const [first, retry, reclaim, late] = await Promise.all([
    h.host.closeRetainedBody(ticket, ref(a.session), 100500),
    h.host.closeRetainedBody(ticket, ref(a.session), 100400), // lost-reply retry carrying an earlier time
    h.host.connect(ticket, [], claim()),
    h.host.closeRetainedBody(ticket, ref(a.session), 100500), // duplicate arriving after the new generation
  ]);
  assert.deepEqual(first, { changed: true });
  assert.deepEqual(retry, { changed: false }, "an already-retained generation cannot be re-closed earlier");
  assert.equal(reclaim.result.ok, true); assert.equal(reclaim.result.resumed, true);
  assert.notEqual(reclaim.result.session.generation, a.session.generation);
  assert.notEqual(reclaim.result.session.token, a.session.token);
  // Reclaim is at the frozen midair location with zero momentum.
  const m = reclaim.result.view.motion;
  assert.deepEqual([m.x, m.y, m.z, m.vx, m.vy, m.vz], [1, 10, 2, 0, 0, 0]);
  assert.deepEqual(late, { changed: false }, "a stale generation close is a no-op");

  const live = row(h.store, 1), revision = h.store.read().revision, writes = h.store.writes;
  assert.equal(live.state, "live"); assert.equal(live.generation, reclaim.result.session.generation);
  // Further stale/forged closes against the replacement: read-only, no write, no revision.
  assert.deepEqual(await h.host.closeRetainedBody(ticket, ref(a.session), 101000), { changed: false });
  assert.deepEqual(await h.host.closeRetainedBody(ticket, { ...ref(reclaim.result.session), token: a.session.token }, 101000), { changed: false });
  assert.deepEqual(await h.host.closeRetainedBody(ticket, { ...ref(reclaim.result.session), generation: a.session.generation }, 101000), { changed: false });
  assert.equal(h.store.writes, writes); assert.equal(h.store.read().revision, revision);
  assert.deepEqual(row(h.store, 1), live);
  // A close cannot predate the replacement's last presence, nor come from the future; both roll back.
  await assert.rejects(h.host.closeRetainedBody(ticket, ref(reclaim.result.session), 100900), /precede/);
  await assert.rejects(h.host.closeRetainedBody(ticket, ref(reclaim.result.session), 101001), /future retained body close/);
  assert.equal(h.store.writes, writes); assert.deepEqual(row(h.store, 1), live);
});

test("after the finite run ends the close is clamped to runUntil and expiry departs at that original deadline exactly", async () => {
  const h = harness(), ticket = await h.host.begin("owner", 5000); // runUntil 105000, lease 110000
  const a = (await h.host.connect(ticket, [], claim())).result;
  h.at(107000);
  await assert.rejects(h.host.closeRetainedBody(ticket, ref(a.session), 107001), /future/);
  assert.deepEqual(await h.host.closeRetainedBody(ticket, ref(a.session), 106000), { changed: true });
  const held = h.store.read();
  assert.equal(row(h.store, 1).deadline, 105000 + 60000, "live authority ended at runUntil, not at the later close");
  assert.equal(held.leaseUntil, 110000); assert.equal(held.runUntil, 105000);

  h.at(164999);
  const late = await h.make().claim("late-runner"), writes = h.store.writes;
  assert.deepEqual(await h.host.closeRetainedBody(late, ref(a.session), 106000), { changed: false }, "one ms before the deadline nothing expires");
  assert.equal(h.store.writes, writes); assert.equal(row(h.store, 1).state, "grace");

  h.at(165500); // observed after the deadline; departure must still be stamped at the deadline
  assert.deepEqual(await h.host.closeRetainedBody(late, ref(a.session), 106000), { changed: true });
  const done = h.store.read();
  assert.equal(done.sessions.sessions.length, 0, "no forced spawn or lingering body");
  assert.equal(done.sessions.pending.length, 1);
  const departure = done.sessions.pending[0];
  assert.equal(departure.at, 165000); assert.equal(departure.glyph, "green"); assert.equal(departure.reason, "expired");
  assert.equal(departure.handback, null, "no existing NPC, so no handback");
  assert.deepEqual([departure.body.motion.y, departure.body.motion.vx, departure.body.motion.vy, departure.body.motion.vz], [10, 0, 0, 0]);
  const finalWrites = h.store.writes;
  assert.deepEqual(await h.host.closeRetainedBody(late, ref(a.session), 106000), { changed: false });
  assert.equal(h.store.writes, finalWrites);
});
