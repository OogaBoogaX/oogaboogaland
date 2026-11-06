import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST, BODY_VIEW, SESSION_PROTOCOL, VirtualHost, LatestHostDelivery, boundedJSON, publicSnapshot } from "../src/virtual-host.js";
import { createNpcPose } from "../src/npc-pose.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";
import { reconcileRoomBodies, tickRoomWorld } from "../src/host-body-room.js";

// A serial, rollback-capable storage fixture. It models transaction atomicity, not Cloudflare
// scheduling, CPU billing, alarm precision or the production scene's collision geometry.
function storage() {
  let data = new Map(), tail = Promise.resolve(), failWrite = false;
  const store = {
    writes: 0, bytes: 0,
    transaction(fn) {
      const work = tail.then(async () => {
        const pending = structuredClone(data);
        let writes = 0, bytes = 0;
        const result = await fn({
          get: async key => structuredClone(pending.get(key)),
          put: async (key, value) => {
            if (failWrite) { failWrite = false; throw new Error("storage unavailable"); }
            pending.set(key, structuredClone(value)); writes++; bytes += Buffer.byteLength(JSON.stringify(value));
          },
        });
        data = pending; store.writes += writes; store.bytes += bytes; return result;
      });
      tail = work.catch(() => {}); return work;
    },
    read: () => structuredClone(data.get(HOST.key)),
    corrupt: value => data.set(HOST.key, structuredClone(value)),
    failNext: () => { failWrite = true; },
  };
  return store;
}

// A deterministic data-only fixture, explicitly NOT the existing Ooga/Clanker simulation.
// Random state, a travel phase and a timer must survive a new host object without reseeding.
const simulation = {
  version: "fixture-world-1", checkpointBytes: 30 * 1024,
  initial: () => ({ seed: 17, steps: 0, x: 0, phase: "outbound", timer: 0 }),
  validate: s => s && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 0xffffffff
    && Number.isSafeInteger(s.steps) && Number.isFinite(s.x) && Number.isFinite(s.timer)
    && ["outbound", "return"].includes(s.phase),
  step(s, ms) {
    s.steps++; s.timer += ms; s.x += s.phase === "outbound" ? 0.25 : -0.25;
    if (s.timer >= 1000) { s.timer -= 1000; s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; s.phase = s.seed % 2 ? "return" : "outbound"; }
  },
  project: s => ({ npcs: [{ id: "fixture", kind: "ooga", x: s.x, y: 0, z: 0, yaw: 0,
    activity: "working", phase: s.phase, route: "fixture-route", progress: s.timer / 1000, seed: s.seed }], hub: { pile: 12 } }),
  npcFor: () => null,
  handoff: () => { throw new Error("no NPC exists in this fixture"); },
};
function harness(adapter = simulation, passive = m => m) {
  const store = storage(); let now = 100000;
  const make = () => new VirtualHost({ storage: store, simulation: adapter, sessionAdapter: { stepPassive: passive }, clock: () => now });
  return { store, host: make(), make, at: t => { now = t; }, now: () => now };
}

const bodyClaim = () => ({ protocol: SESSION_PROTOCOL, world: simulation.version, accountId: 1, bodyId: "resident", zone: "outside",
  body: { kind: "ooga", motion: { x: 1, y: 10, z: 2, yaw: 0.7, vx: 3, vy: -1, vz: 2, grounded: false },
    equipment: { weapon: "gun", mode: "combat", jetpack: true,
      primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpackOwned: true } } });

test("body events freeze once, survive restart and expire atomically without NPC or physics ticks", async () => {
  const h = harness({ ...simulation, step() { throw Error("no NPC tick"); } }, () => { throw Error("no physics"); });
  const old = await h.host.begin("owner", 120000), first = (await h.host.connect(old, [], bodyClaim())).result;
  h.at(105000); const before = h.store.read();
  const close = { ref: first.session, at: 103000 };
  // The public connect result includes bodyId; trusted close refs deliberately do not.
  delete close.ref.bodyId;
  h.store.failNext();
  await assert.rejects(h.host.reconcileBodies(old, [], [close]), /storage unavailable/);
  assert.deepEqual(h.store.read(), before);
  const frozen = await h.host.reconcileBodies(old, [], [close]);
  assert.equal(frozen.changed, true); assert.equal(frozen.wakeAt, 163000);
  const committed = h.store.read(), writes = h.store.writes;
  h.at(106000);
  assert.equal((await h.host.reconcileBodies(old, [], [close])).changed, false);
  assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), committed);
  assert.equal(committed.leaseUntil, before.leaseUntil, "a body event cannot extend host ownership");
  assert.deepEqual(committed.simulation, before.simulation);
  const frame = (await h.host.bodyPresence(old)).frame, view = frame.views[0];
  assert.equal(view.motion.y, 10); assert.equal(view.motion.vx + view.motion.vy + view.motion.vz, 0);
  assert.equal(view.deadline, 163000); assert.equal(view.state, "grace");
  assert.equal(JSON.stringify(frame).includes(first.session.token), false);
  h.at(163000); const fresh = await h.make().claim("restarted");
  await assert.rejects(h.host.bodyPresence(old), /fenced/);
  await assert.rejects(h.host.bodyPresence(fresh), /lifecycle due/);
  const atExpiry = h.store.read(); h.store.failNext();
  await assert.rejects(h.host.reconcileBodies(fresh, []), /storage unavailable/);
  assert.deepEqual(h.store.read(), atExpiry);
  const expired = await h.host.reconcileBodies(fresh, []);
  assert.equal(expired.wakeAt, null); assert.equal(expired.changed, true);
  const departure = (await h.host.bodyPresence(fresh)).frame.departures[0];
  assert.equal(departure.at, 163000); assert.equal(departure.glyph, "green");
  assert.equal(departure.handback, null); assert.equal(departure.applied, true);
  assert.equal(departure.body.motion.y, 10);
  const doneWrites = h.store.writes;
  assert.equal((await h.make().reconcileBodies(fresh, [])).changed, false);
  assert.equal(h.store.writes, doneWrites);
});

test("Room census reconciliation refuses uncertain closes and fences concurrent host admission", async () => {
  const h = harness(), ticket = await h.host.begin("owner", 120000);
  const authority = { owner: ticket.owner, epoch: ticket.fence, world: ticket.world };
  const first = (await h.host.connect(ticket, [], bodyClaim())).result;
  const blocked = { ready: false, tokens: [first.session.token], closed: [{ accountId: 1, connection: "old" }], pending: [], unobserved: [] };
  let census = blocked, during = null;
  const room = { async bodyCensus(t) { assert.deepEqual(t, authority); if (during) await during(); return census; } };
  const before = h.store.read();
  assert.equal((await reconcileRoomBodies(h.host, room, ticket, authority)).status, "blocked");
  assert.deepEqual(h.store.read(), before, "known closes cannot fall back to an earlier inferred deadline");
  census = { ...blocked, ready: true, tokens: [], closed: [] };
  during = () => h.host.connect(ticket, [first.session.token], { ...bodyClaim(), accountId: 2, bodyId: "new-player" });
  const stale = await reconcileRoomBodies(h.host, room, ticket, authority);
  assert.equal(stale.status, "superseded");
  assert.ok(h.store.read().sessions.sessions.every(s => s.state === "live"), "in-flight admission is never inferred offline");
  during = null; const writes = h.store.writes;
  assert.equal((await reconcileRoomBodies(h.host, room, ticket, authority)).status, "reconciled");
  assert.equal(h.store.writes, writes + 1);
  assert.ok(h.store.read().sessions.sessions.every(s => s.state === "grace"));
  await assert.rejects(reconcileRoomBodies(h.host, room, ticket, { ...authority, epoch: 99 }), /authorities differ/);
  await assert.rejects(h.host.reconcileBodies(ticket, [], [], { expectedRevision: NaN }), /census revision/);
});

test('Room world ticks fence stale censuses before recovery and simulation, including transaction retries', async () => {
  const h = harness(), ticket = await h.host.begin('owner', 120000);
  const authority = { owner: ticket.owner, epoch: ticket.fence, world: ticket.world };
  const first = (await h.host.connect(ticket, [], bodyClaim())).result;
  h.at(100250);
  let census = { ready: false, tokens: [first.session.token], closed: [], pending: [{ accountId: 1, connection: 'pending' }], unobserved: [] };
  let during;
  const room = { async bodyCensus(t) { assert.deepEqual(t, authority); if (during) await during(); return structuredClone(census); } };
  const before = h.store.read();
  assert.equal((await tickRoomWorld(h.host, room, ticket, authority)).status, 'blocked');
  assert.deepEqual(h.store.read(), before);
  census = { ready: true, tokens: [first.session.token], closed: [], pending: [], unobserved: [] };
  during = () => h.host.connect(ticket, [first.session.token], { ...bodyClaim(), accountId: 2, bodyId: 'new-player' });
  const rejected = await tickRoomWorld(h.host, room, ticket, authority);
  assert.equal(rejected.status, 'superseded'); assert.equal(rejected.result.steps, 0);
  assert.equal(h.store.read().simulation.steps, 0);
  assert.ok(h.store.read().sessions.sessions.every(s => s.state === 'live'));
  during = null;
  census.tokens = h.store.read().sessions.sessions.map(s => s.token);
  const accepted = await tickRoomWorld(h.host, room, ticket, authority);
  assert.equal(accepted.status, 'advanced'); assert.equal(accepted.result.steps, 1);
  assert.ok(h.store.read().sessions.sessions.every(s => s.state === 'live'));
  // The storage callback may be retried against a later commit. The same
  // expected revision must fence that retry too, without rerunning simulation.
  const expectedRevision = await h.host.bodyLifecycleRevision(ticket), store = h.store;
  let attempts = 0, retry;
  const competing = { ...store, transaction: fn => store.transaction(async tx => {
    attempts++; const result = await fn(tx);
    if (attempts === 1) { retry = result; throw Error('optimistic conflict'); }
    return result;
  }).catch(async error => {
    if (error.message !== 'optimistic conflict') throw error;
    await h.host.connect(ticket, census.tokens, { ...bodyClaim(), accountId: 3, bodyId: 'third-player' });
    return store.transaction(fn);
  }) };
  h.at(100500);
  const retriedHost = new VirtualHost({ storage: competing, simulation, sessionAdapter: { stepPassive: m => m }, clock: h.now });
  const retried = await retriedHost.tick(ticket, census.tokens, { expectedRevision });
  assert.equal(retry.steps, 1); assert.equal(retried.superseded, true);
  assert.equal(store.read().simulation.steps, 1, 'rolled-back simulation cannot leak into the committed world');
  assert.ok(store.read().sessions.sessions.every(s => s.state === 'live'));
  await assert.rejects(h.host.tick(ticket, [], { expectedRevision: NaN }), /census revision/);
  const saved = store.read(); census.ready = true; census.pending = [{}];
  await assert.rejects(tickRoomWorld(h.host, room, ticket, authority), /invalid world census/);
  assert.deepEqual(store.read(), saved);
  await assert.rejects(tickRoomWorld(h.host, room, ticket, { ...authority, epoch: 99 }), /authorities differ/);
});

test("body-only events validate empty censuses, preserve occupancy and leave the independent NPC untouched", async () => {
  const h = harness({ ...simulation, initial: () => ({ ...simulation.initial(), handbacks: 0 }),
    npcFor: () => "existing-npc", handoff(s) { s.handbacks++; return true; } });
  const ticket = await h.host.begin("owner", 120000), empty = h.store.read();
  await assert.rejects(h.host.reconcileBodies(ticket), /census/);
  await assert.rejects(h.host.reconcileBodies(ticket, [], [{ at: 100000 }]), /close/);
  assert.equal((await h.host.reconcileBodies(ticket, [])).changed, false);
  assert.deepEqual(h.store.read(), empty);
  h.host.sessionAdapter.validateOccupancy = () => true;
  const first = (await h.host.connect(ticket, [], bodyClaim())).result;
  await h.host.sessions(ticket, [first.session.token], (r, at) => {
    assert.equal(r.occupy(first.session, { kind: "hammock", id: "reserved" }, at).ok, true);
  });
  await h.host.reconcileBodies(ticket, []);
  assert.deepEqual((await h.host.bodyPresence(ticket)).frame.views[0].occupancy, { kind: "hammock", id: "reserved" });
  h.at(160000); const fresh = await h.make().claim("restart");
  await h.host.reconcileBodies(fresh, []); await h.host.reconcileBodies(fresh, []);
  assert.equal(h.store.read().simulation.handbacks, 0);
  assert.equal(h.store.read().sessions.sessions.length, 0);
  assert.equal((await h.host.bodyPresence(fresh)).frame.departures[0].handback, null);
});

test("lost body acknowledgement wakes at its short lease, retaining the original grace and run deadlines", async () => {
  const h = harness(), ticket = await h.host.begin("owner", 500);
  const offer = (await h.host.sessions(ticket, [], (r, at) => r.offer(bodyClaim(), at))).result;
  await h.host.sessions(ticket, [], (r, at) => assert.equal(r.activate(offer.session, at).ok, true));
  assert.equal((await h.host.bodyPresence(ticket)).wakeAt, 101000);
  h.at(101000);
  await assert.rejects(h.host.bodyPresence(ticket), /lifecycle due/);
  const result = await h.host.reconcileBodies(ticket, []);
  assert.equal(result.wakeAt, 160000, "lost ACK cannot restart the 60-second deadline");
  const view = (await h.host.bodyPresence(ticket)).frame.views[0];
  assert.equal(view.state, "grace"); assert.equal(view.motion.y, 10);
  assert.equal(h.store.read().runUntil, 100500);
  await assert.rejects(h.host.connect(ticket, [], bodyClaim()), /run closed/);
  const live = harness(), t = await live.host.begin("owner", 500);
  const joined = (await live.host.connect(t, [], bodyClaim())).result;
  assert.equal((await live.host.bodyPresence(t)).wakeAt, 100500);
  live.at(100500); await live.host.reconcileBodies(t, [joined.session.token]);
  assert.equal((await live.host.bodyPresence(t)).frame.views[0].deadline, 160500);
  assert.equal(live.store.read().simulation.steps, 0);
});

test("bounded body snapshots give concurrent late joiners one committed view and refuse excess capacity", async t => {
  const h = harness(), ticket = await h.host.begin("owner", 120000);
  await h.host.sessions(ticket, [], (r, at) => {
    for (let i = 1; i <= BODY_VIEW.maxBodies; i++) {
      const claim = bodyClaim(); claim.accountId = Number.MAX_SAFE_INTEGER - i;
      claim.bodyId = String(i).padEnd(64, "b"); claim.zone = "z".repeat(64);
      claim.body.motion = { x: -999999.123456789, y: 999999.123456789, z: -999999.123456789,
        yaw: 6.123456789012345, vx: 9999.123456789, vy: -9999.123456789, vz: 9999.123456789, grounded: false };
      assert.equal(r.connect(claim, at).ok, true);
    }
  });
  await h.host.reconcileBodies(ticket, []);
  const before = h.store.read(), writes = h.store.writes;
  const frames = await Promise.all(Array.from({ length: 32 }, () => h.make().bodyPresence(ticket)));
  for (const f of frames) assert.deepEqual(f, frames[0]);
  assert.equal(frames[0].frame.views.length, BODY_VIEW.maxBodies);
  const viewBytes = Buffer.byteLength(JSON.stringify(frames[0].frame));
  assert.ok(viewBytes <= BODY_VIEW.maxBytes);
  frames[0].frame.views[0].motion.x = 0;
  assert.notEqual(frames[1].frame.views[0].motion.x, 0);
  assert.deepEqual(h.store.read(), before); assert.equal(h.store.writes, writes);
  assert.equal((await h.host.connect(ticket, [], bodyClaim())).result.ok, true);
  await assert.rejects(h.host.bodyPresence(ticket), /presentation capacity/);
  // The excess record is never silently omitted. Remove it explicitly before
  // observing all 32 original departures at their original deadline.
  await h.host.sessions(ticket, [], (r, at) => assert.equal(r.revoke(1, at).ok, true));
  await h.host.sessions(ticket, [], r => assert.equal(r.acknowledge(r.pending()[0].id), true));
  h.at(160000); const fresh = await h.make().claim("restarted");
  await h.host.reconcileBodies(fresh, []);
  const departed = (await h.host.bodyPresence(fresh)).frame;
  assert.equal(departed.views.length, 0); assert.equal(departed.departures.length, BODY_VIEW.maxBodies);
  const departureBytes = Buffer.byteLength(JSON.stringify(departed));
  assert.ok(departureBytes <= BODY_VIEW.maxBytes);
  t.diagnostic(`32 long-ID/high-precision records: ${viewBytes} view bytes, ${departureBytes} departure bytes`);
});

test("releasing multiple bodies commits atomically without consulting or changing NPC ownership", async () => {
  const adapter = compactSimulation({ ...simulation, initial: () => ({ ...simulation.initial(), owners: { resident: "first", second: "second" } }),
    npcFor: (s, id) => s.owners[id] || null,
    handoff(s) { s.owners.second = "replacement"; return true; } }, 4096);
  const h = harness(adapter), ticket = await h.host.begin("owner", 60000);
  const joined = (await h.host.sessions(ticket, [], (r, at) => [
    r.connect({ ...bodyClaim(), world: adapter.version }, at),
    r.connect({ ...bodyClaim(), world: adapter.version, accountId: 2, bodyId: "second" }, at),
  ])).result;
  assert.ok(joined.every(j => j.ok)); const before = h.store.read();
  const release = () => h.host.sessions(ticket, joined.map(j => j.session.token), (r, at) => {
    for (const j of joined) assert.equal(r.release(j.session, at).ok, true);
  });
  h.store.failNext(); await assert.rejects(release(), /storage unavailable/);
  assert.deepEqual(h.store.read(), before, "neither departure commits on a failed write");
  await release();
  const saved = h.store.read(), decoded = adapter.readQueries(saved.simulation);
  assert.equal(decoded.npcFor('resident'), 'first'); assert.equal(decoded.npcFor('second'), 'second');
  assert.equal(saved.sessions.pending.length, 2);
  assert.ok(saved.sessions.pending.every(p => p.applied && p.handback === null));
});

test("recovered expiry and a following release leave both independent NPC identities intact", async () => {
  const adapter = compactSimulation({ ...simulation, initial: () => ({ ...simulation.initial(), owners: { resident: "first", second: "second" } }),
    npcFor: (s, id) => s.owners[id] || null,
    handoff(s) { s.owners.second = "replacement"; return true; } }, 4096);
  const h = harness(adapter); let ticket = await h.host.begin("owner", 120000);
  const joined = (await h.host.sessions(ticket, [], (r, at) => [
    r.connect({ ...bodyClaim(), world: adapter.version }, at),
    r.connect({ ...bodyClaim(), world: adapter.version, accountId: 2, bodyId: "second" }, at),
  ])).result;
  await h.host.disconnect(ticket, joined.map(j => j.session.token), joined[0].session, 100000);
  h.at(160000); ticket = await h.make().claim("replacement-owner");
  await h.host.sessions(ticket, [joined[1].session.token], (r, at) => assert.equal(r.release(joined[1].session, at).ok, true));
  const pending = h.store.read().sessions.pending;
  assert.equal(pending.find(p => p.bodyId === "resident").handback, null);
  assert.equal(pending.find(p => p.bodyId === "second").handback, null);
  assert.ok(pending.every(p => p.applied));
  const queried = adapter.readQueries(h.store.read().simulation);
  assert.equal(queried.npcFor('resident'), 'first'); assert.equal(queried.npcFor('second'), 'second');
});

test("pose publication requires a valid adapter, cannot mutate saved state, and fences closed runs", async () => {
  const missing = harness(), ticket = await missing.host.begin("a", 60000);
  await assert.rejects(missing.host.poses(ticket), /adapter required/);
  const actor = rig(), project = createNpcPose(123, 1);
  const adapter = { ...simulation, poses(s) { s.x = 999; return project([{ index: 0, actor }]); } };
  const h = harness(adapter), t = await h.host.begin("a", 1000), before = h.store.read();
  const first = await h.host.poses(t); new Float32Array(first.frame, 16)[2] = 99;
  assert.deepEqual(h.store.read(), before);
  assert.equal(new Float32Array((await h.host.poses(t)).frame, 16)[2], 0);
  adapter.poses = () => new ArrayBuffer(0);
  await assert.rejects(h.host.poses(t), /invalid host poses/);
  adapter.poses = () => project([{ index: 0, actor }]);
  h.at(101000);
  await assert.rejects(h.host.poses(t), /closed/);
  await assert.rejects(h.host.confirmPoses(t, first), /closed/);
  assert.equal(h.store.writes, 1);
});

test("pose revision confirmation validates committed state and fences changes without reprojecting or renewing",async()=>{
  const actor=rig(),project=createNpcPose(123,1);let projections=0;
  const h=harness({...simulation,poses(){projections++;return project([{index:0,actor}]);}}),ticket=await h.host.begin('owner',60000);
  const frame=await h.host.poses(ticket),before=h.store.read();
  assert.equal(await h.host.confirmPoses(ticket,frame),true);assert.equal(projections,1);assert.deepEqual(h.store.read(),before);
  for(const delta of [{at:frame.at+1},{runUntil:frame.runUntil+1},{sequence:frame.sequence+1}])assert.equal(await h.host.confirmPoses(ticket,{...frame,...delta}),false);
  await assert.rejects(h.host.confirmPoses(ticket,{...frame,sequence:NaN}),/invalid pose revision/);
  h.at(100250);h.store.failNext();await assert.rejects(h.host.tick(ticket),/storage unavailable/);
  assert.equal(await h.make().confirmPoses(ticket,frame),true,'failed write cannot invalidate the committed revision');
  await h.host.tick(ticket);assert.equal(await h.host.confirmPoses(ticket,frame),false);assert.equal(projections,1);
  const valid=h.store.read();h.store.corrupt({...valid,simulation:{...valid.simulation,x:Infinity}});
  await assert.rejects(h.host.confirmPoses(ticket,frame),/nonfinite/);h.store.corrupt(valid);
  h.at(110250);await h.make().claim('next');await assert.rejects(h.host.confirmPoses(ticket,frame),/fenced/);
});

test("frozen bodies do not block NPC publication but lifecycle changes still fence old revisions", async () => {
  const actor = rig(), project = createNpcPose(123, 1);
  const h = harness({ ...simulation, poses: () => project([{ index: 0, actor }]) });
  const ticket = await h.host.begin('owner', 120000);
  await h.host.connect(ticket, [], bodyClaim());
  const snapshot = await h.host.poses(ticket);
  h.host.sessionAdapter.canStep = () => { throw Error('no disconnected physics admission'); }; h.at(100250);
  const frozen = await h.host.tick(ticket, []);
  assert.equal(frozen.work.pendingSteps, 0); assert.equal(frozen.work.steps, 0);
  assert.equal(await h.host.confirmPoses(ticket, snapshot), false);
  assert.ok(await h.host.poses(ticket));
  await assert.rejects(h.host.poses({ ...ticket, fence: 0 }), /fenced/);
  for (let at = 101000; at <= 159000; at += 1000) { h.at(at); await h.host.tick(ticket, []); }
  h.at(160000); const fresh = ticket;
  assert.equal(await h.host.poses(fresh, { skipPending: true }), null);
  await assert.rejects(h.host.poses(fresh), /body recovery pending/);
  await h.host.tick(fresh, []);
  assert.ok(await h.host.poses(fresh));
});

test("host progresses with zero players and persists simulation before returning snapshots", async () => {
  const h = harness(), ticket = await h.host.begin("runner-a", 60000);
  for (let i = 1; i <= 5; i++) {
    h.at(100000 + i * 1000);
    const result = await h.host.tick(ticket), saved = h.store.read();
    assert.equal(result.steps, 4); assert.equal(result.lagMs, 0);
    assert.equal(saved.simulation.steps, i * 4);
    assert.equal(result.snapshot.sequence, saved.revision);
    assert.equal(result.snapshot.npcs[0].seed, saved.simulation.seed);
    assert.equal(saved.sessions, null);
  }
  assert.equal(h.store.writes, 6);
});

test("simulation transaction scopes are fresh on storage retry, close on failure and never publish speculative steps",async()=>{
  const adapter=compactSimulation(simulation,4096,{intern:true}),factory=adapter.forTransaction,scopes=[];
  adapter.forTransaction=()=>{const scope=factory();scopes.push(scope);return scope;};
  const h=harness(adapter),transaction=h.store.transaction.bind(h.store);let retry=false;
  h.store.transaction=fn=>transaction(async tx=>{
    if(retry){retry=false;let speculative=await tx.get(HOST.key);await fn({get:async()=>structuredClone(speculative),put:async(_,v)=>{speculative=structuredClone(v);}});}
    return fn(tx);
  });
  const ticket=await h.host.begin('owner',60000);h.at(100250);retry=true;
  const result=await h.host.tick(ticket);assert.equal(result.snapshot.npcs[0].x,.25);assert.equal(scopes.length,3);
  for(const scope of scopes)assert.throws(()=>scope.project(h.store.read().simulation),/closed/);
  const before=h.store.read();h.at(100500);h.store.failNext();await assert.rejects(h.host.tick(ticket),/storage unavailable/);
  assert.deepEqual(h.store.read(),before);assert.throws(()=>scopes.at(-1).validate(before.simulation),/closed/);
  assert.equal((await h.make().tick(ticket)).snapshot.npcs[0].x,.5);
  const incompatible={...adapter,forTransaction:()=>({...factory(),version:'other'})};
  await assert.rejects(harness(incompatible).host.begin('owner',60000),/invalid simulation transaction/);
  const stable=h.store.read();
  h.host.sessionAdapter={stepPassive:()=>{},forTransaction:async()=>{throw Error('body scope failed');}};
  await assert.rejects(h.host.tick(ticket),/body scope failed/);
  assert.deepEqual(h.store.read(),stable);assert.throws(()=>scopes.at(-1).validate(stable.simulation),/closed/);
});

test("committed pose reads share the validated immutable transaction snapshot and cannot mutate it",async()=>{
  const actor=rig(),encode=createNpcPose(123,1);let validated,mutate=false;
  const adapter=compactSimulation({...simulation,validate(s){validated=s;return simulation.validate(s);},
    poses(s){assert.equal(s,validated);assert.ok(Object.isFrozen(s));if(mutate)s.x=99;return encode([{index:0,actor}]);}},4096,{intern:true});
  const h=harness(adapter),ticket=await h.host.begin('owner',60000),before=h.store.read();
  assert.ok((await h.host.poses(ticket)).frame.byteLength);assert.deepEqual(h.store.read(),before);
  mutate=true;await assert.rejects(h.host.poses(ticket),TypeError);assert.deepEqual(h.store.read(),before);
});

test("competing hosts serialize acquisition; stale epochs cannot write after restart", async () => {
  const h = harness();
  const starts = await Promise.allSettled([h.host.begin("a", 60000), h.make().begin("b", 60000)]);
  assert.deepEqual(starts.map(r => r.status), ["fulfilled", "rejected"]);
  const old = starts[0].value;
  await assert.rejects(h.make().claim("b"), /unavailable/);
  h.at(110000); const current = await h.make().claim("b");
  assert.ok(current.fence > old.fence);
  const before = h.store.read();
  await assert.rejects(h.host.tick(old), /fenced/);
  await assert.rejects(h.host.sessions(old, [], () => { throw new Error("must not run"); }), /fenced/);
  await assert.rejects(h.host.stop(old), /fenced/);
  assert.deepEqual(h.store.read(), before);
  const tick = await h.make().tick(current);
  assert.equal(tick.steps, HOST.maxSteps); assert.equal(tick.lagMs, 8000);
});

test("restart preserves random decisions, routes and timers, matching uninterrupted fixed steps", async () => {
  const a = harness(), b = harness();
  const ta = await a.host.begin("uninterrupted", 60000), tb = await b.host.begin("before-restart", 60000);
  for (let i = 1; i <= 2; i++) { a.at(100000 + i * 1000); b.at(a.now()); await a.host.tick(ta); await b.host.tick(tb); }
  for (let i = 3; i <= 12; i++) { a.at(100000 + i * 1000); await a.host.tick(ta); }
  b.at(112000); const restarted = b.make(), fresh = await restarted.claim("after-restart");
  for (let i = 0; i < 5; i++) await restarted.tick(fresh);
  assert.deepEqual(b.store.read().simulation, a.store.read().simulation);
  assert.equal(b.store.read().simulatedAt, a.store.read().simulatedAt);
});

test("failed commits publish nothing, retain the previous world, and allow deterministic recovery", async () => {
  const h = harness(), ticket = await h.host.begin("a", 60000), before = h.store.read();
  h.at(101000); h.store.failNext();
  await assert.rejects(h.host.tick(ticket), /storage unavailable/);
  assert.deepEqual(h.store.read(), before);
  const result = await h.host.tick(ticket);
  assert.equal(result.snapshot.sequence, before.revision + 1);
  assert.equal(h.store.read().simulation.steps, 4);
});

test("duplicate wakes do not step twice; permanent running and unbounded catch-up are refused", async () => {
  const h = harness();
  await assert.rejects(h.host.begin("a", Infinity), /bounded/);
  await assert.rejects(h.host.begin("a", HOST.maxRunMs + 1), /bounded/);
  const ticket = await h.host.begin("a", 1000);
  h.at(100500); await h.host.tick(ticket);
  const before = h.store.read(), writes = h.store.writes;
  assert.equal((await h.host.tick(ticket)).steps, 0);
  assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), before);
  h.at(101000); assert.equal((await h.host.tick(ticket)).status, "stopped");
  const stopped = h.store.read();
  await assert.rejects(h.host.claim("b"), /unavailable/);
  h.at(200000); await assert.rejects(h.host.begin("b", 60000), /explicit recovery/);
  assert.deepEqual(h.store.read(), stopped, "a stale world is never silently reset");
  const resumed = await h.host.begin("b", 60000, { resumePaused: true });
  assert.equal(h.store.read().pausedMs, 99500);
  assert.deepEqual(h.store.read().simulation, before.simulation, "operator resume preserves RNG, routes and timers");
  assert.ok(resumed.fence > ticket.fence);
});

test("long outages record a recovery gate instead of skipping world time", async () => {
  const h = harness(); await h.host.begin("a", 120000);
  h.at(140000); const ticket = await h.host.claim("b");
  const result = await h.host.tick(ticket);
  assert.equal(result.status, "backlog"); assert.equal(result.snapshot, null);
  assert.equal(h.store.read().simulatedAt, 100000);
  assert.equal(h.store.read().simulation.steps, 0);
});

test("unknown schema/world and invalid or oversized state fail closed without resetting storage", async () => {
  const h = harness(), ticket = await h.host.begin("a", 60000), saved = h.store.read();
  for (const patch of [{ schema: 1 }, { schema: 2 }, { schema: 3 }, { schema: 5 }, { world: "future-world" }, { runUntil: saved.wallAt + HOST.maxRunMs + 1 },
    { leaseUntil: saved.wallAt + HOST.leaseMs + 1 }, { simulation: { ...saved.simulation, seed: NaN } },
    { simulation: { ...saved.simulation, padding: "x".repeat(HOST.checkpointBytes) } }]) {
    const damaged = { ...saved, ...patch }; h.store.corrupt(damaged);
    await assert.rejects(h.host.tick(ticket)); assert.deepEqual(h.store.read(), damaged);
  }
  h.store.corrupt(saved); h.at(99999);
  await assert.rejects(h.host.tick(ticket), /clock moved backwards/);
  assert.deepEqual(h.store.read(), saved);
});

test("public snapshots exclude session/equipment data and enforce item and UTF-8 byte limits", () => {
  const record = { world: simulation.version, fence: 1, revision: 1, simulatedAt: 100000, sessions: { token: "private" } };
  const valid = simulation.project(simulation.initial());
  const result = publicSnapshot(record, valid);
  assert.equal(JSON.stringify(result).includes("private"), false);
  for (const projected of [{ ...valid, sessions: [] }, { ...valid, hub: { pile: 1, player: "private" } },
    { ...valid, npcs: [{ ...valid.npcs[0], equipment: { ammo: 30 } }] },
    { ...valid, npcs: [valid.npcs[0], valid.npcs[0]] },
    { ...valid, npcs: Array.from({ length: HOST.maxNpcs + 1 }, (_, i) => ({ ...valid.npcs[0], id: `npc-${i}` })) }]) {
    assert.throws(() => publicSnapshot(record, projected));
  }
  assert.throws(() => boundedJSON({ text: "💚".repeat(100) }, 200), /size/);
  for (const bad of [{ x: NaN }, { x: undefined }, { x: new Set() }, { x: Array(2) }]) assert.throws(() => boundedJSON(bad, 1000));
});

test("latest delivery bounds fanout, rate and backlog; a slow follower converges without history replay", () => {
  const delivery = new LatestHostDelivery(simulation.version);
  for (let i = 0; i < HOST.maxFollowers; i++) assert.equal(delivery.join(i), true);
  assert.equal(delivery.join("overflow"), false);
  const frame = sequence => publicSnapshot({ world: simulation.version, fence: 1, revision: sequence, simulatedAt: 100000 + sequence }, simulation.project(simulation.initial()));
  delivery.offer(frame(1)); const received = [];
  assert.equal(delivery.flush(0, 100000, HOST.snapshotBytes, text => { received.push(text); return true; }), false);
  for (let i = 2; i <= 20; i++) delivery.offer(frame(i));
  assert.equal(delivery.offer(frame(3)), false);
  assert.equal(delivery.flush(0, 100000, 0, text => { received.push(text); return true; }), true);
  assert.equal(received.length, 1); assert.equal(JSON.parse(received[0]).sequence, 20);
  delivery.offer(frame(21));
  delivery.join(0);
  assert.equal(delivery.flush(0, 100100, 0, () => true), false);
  assert.equal(delivery.flush(0, 100250, 0, () => false), false);
  assert.equal(delivery.flush(0, 100250, 0, () => true), true);
  assert.equal(delivery.stats.messages, 2); assert.equal(delivery.stats.skipped, 2);
  delivery.leave(0); assert.equal(delivery.flush(0, 100500, 0, () => true), false);
  assert.equal(delivery.join("replacement"), true);
  assert.throws(() => delivery.offer({ ...frame(22), world: "old-build" }), /version/);
  const newEpoch = { ...frame(1), epoch: 2 }; assert.equal(delivery.offer(newEpoch), true);
  assert.equal(delivery.offer(frame(99)), false);
});

test("session ownership, deadlines and departure intents commit atomically with host fencing", async () => {
  const h = harness(), old = await h.host.begin("a", 120000);
  const empty = h.store.read();
  await assert.rejects(h.host.sessions(old, Array(65).fill("unexpected"), () => null), /MAX_SESSIONS/);
  await assert.rejects(h.host.disconnect(old, [], { accountId: 1, generation: 1, token: "0".repeat(32) }, 100001), /no later/);
  assert.deepEqual(h.store.read(), empty, "first admission validates the same input bounds as restore");
  h.store.failNext();
  const claim = { protocol: SESSION_PROTOCOL, world: simulation.version, accountId: 1, bodyId: "same-body", zone: "outside",
    body: { kind: "ooga", motion: { x: 1, y: 2, z: 3, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
      equipment: { weapon: "gun", mode: "carry", jetpack: true,
        primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpackOwned: true } } };
  const connect = (registry, now) => registry.connect(claim, now);
  await assert.rejects(h.host.sessions(old, [], connect), /storage unavailable/);
  assert.equal(h.store.read().sessions, null);
  const first = (await h.host.sessions(old, [], connect)).result;
  assert.equal(first.ok, true);
  h.at(110000); const fresh = await h.make().claim("b");
  const recovered = await h.host.sessions(fresh, [], registry => registry.view(1));
  assert.equal(recovered.result.state, "grace"); assert.equal(recovered.result.deadline, 160000);
  assert.equal(recovered.result.presentation, "open-hand");
  assert.deepEqual(recovered.result.equipment, claim.body.equipment);
  await assert.rejects(h.host.sessions(old, [], connect), /fenced/);
  const back = (await h.host.sessions(fresh, [], connect)).result;
  assert.equal(back.resumed, true); assert.equal(back.view.bodyId, "same-body");
  assert.equal(back.view.presentation, null); assert.notEqual(back.session.token, first.session.token);
  assert.equal((await h.host.sessions(fresh, [back.session.token], (registry, now) => registry.confirm(first.session, now))).result, false);
  await h.host.sessions(fresh, [back.session.token], (registry, now) => registry.disconnect(back.session, now));
  h.at(170000); const expiryHost = await h.host.claim("c");
  const gone = (await h.host.sessions(expiryHost, [], registry => registry.pending())).result;
  assert.equal(gone.length, 1); assert.equal(gone[0].at, 170000);
  assert.equal(gone[0].glyph, "green"); assert.equal(gone[0].handback, null);
  h.store.failNext();
  await assert.rejects(h.host.sessions(expiryHost, [], registry => registry.acknowledge(gone[0].id)), /storage unavailable/);
  assert.deepEqual((await h.host.sessions(expiryHost, [], registry => registry.pending())).result, gone);
  await h.host.sessions(expiryHost, [], registry => registry.acknowledge(gone[0].id));
  assert.deepEqual((await h.host.sessions(expiryHost, [], registry => registry.pending())).result, []);
});

test("confirmed close retains a frozen body and expires on deadline with zero viewers", async () => {
  const h = harness(simulation, (m, ms) => ({ ...m, y: Math.max(0, m.y - ms / 1000) }));
  const ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  h.at(105000);
  const closed = await h.host.disconnect(ticket, [], first.session, 105000);
  assert.equal(closed.result.deadline, 165000);
  h.at(106000); await h.host.tick(ticket, []);
  let body = h.store.read().sessions.sessions[0];
  assert.equal(body.stepAt, 105000); assert.equal(body.motion.y, 10);
  assert.deepEqual(body.equipment, claim.body.equipment);
  await h.host.disconnect(ticket, [], first.session, 106000);
  assert.equal(h.store.read().sessions.sessions[0].deadline, 165000, "duplicate close cannot extend grace");
  for (let at = 107000; at < 165000; at += 1000) { h.at(at); await h.host.tick(ticket, []); }
  h.at(165000); await h.host.tick(ticket, []);
  const saved = h.store.read();
  assert.equal(saved.sessions.sessions.length, 0);
  assert.equal(saved.sessions.pending.length, 1);
  assert.equal(saved.sessions.pending[0].at, 165000);
  assert.equal(saved.sessions.pending[0].body.motion.y, 10);
  assert.equal(saved.sessions.pending[0].zone, "outside");
  assert.deepEqual(saved.sessions.pending[0].body.equipment, claim.body.equipment);
  assert.equal(saved.sessions.pending[0].applied, true);
  await assert.rejects(h.host.tick(ticket), /census/);
});

test("run deadline drains existing bodies for at most their remaining grace without accepting new claims", async () => {
  const h = harness(), ticket = await h.host.begin("a", 1000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  h.at(101000);
  await assert.rejects(h.host.sessions(ticket, [first.session.token], (r, now) => r.connect(claim, now)), /run closed/);
  const result = await h.host.tick(ticket, [first.session.token]);
  assert.equal(result.status, "draining");
  assert.equal(h.store.read().sessions.sessions[0].deadline, 161000);
  await assert.rejects(h.host.begin("another", 60000), /drain/);
  const steps = h.store.read().simulation.steps;
  for (let at = 102000; at < 161000; at += 1000) { h.at(at); await h.host.tick(ticket, []); }
  h.at(161000); assert.equal((await h.host.tick(ticket, [])).status, "stopped");
  assert.equal(h.store.read().simulation.steps, steps, "drain cannot keep NPC simulation running");
  assert.equal(h.store.read().sessions.sessions.length, 0);
  await assert.rejects(h.host.tick(ticket, []), /fenced/);

  // A late restart completes the persisted expiry; it never grants another 60 seconds.
  const late = harness(), old = await late.host.begin("a", 1000);
  const live = (await late.host.sessions(old, [], (r, now) => r.connect(bodyClaim(), now))).result;
  late.at(200000); const fresh = await late.make().claim("recovered");
  await late.make().tick(fresh, [live.session.token]);
  assert.equal(late.store.read().status, "stopped");
  assert.equal(late.store.read().sessions.pending[0].at, 161000);
});

test("explicit stop preserves earlier disconnect deadlines while draining a still-live body", async () => {
  const h = harness(), ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  const secondClaim = { ...bodyClaim(), accountId: 2, bodyId: "second" };
  const second = (await h.host.sessions(ticket, [first.session.token], (r, now) => r.connect(secondClaim, now))).result;
  h.at(101000); await h.host.disconnect(ticket, [second.session.token], first.session, 101000);
  h.at(102000); assert.equal((await h.host.stop(ticket, [second.session.token])).status, "draining");
  assert.deepEqual(h.store.read().sessions.sessions.map(s => s.deadline), [161000, 162000]);
  h.at(170000); const fresh = await h.host.claim("restart");
  assert.equal((await h.host.tick(fresh, [])).status, "stopped");
  assert.deepEqual(h.store.read().sessions.pending.map(s => s.at), [161000, 162000]);
});

test("paused resume preserves absolute logical AI deadlines while wall-clock grace still expires", async () => {
  const adapter = { ...simulation,
    initial: now => ({ ...simulation.initial(), deadline: now + 20000, completed: false }),
    step(s, ms, now) { simulation.step(s, ms); s.completed ||= now >= s.deadline; },
  };
  const h = harness(adapter), old = await h.host.begin("a", 60000);
  h.at(101000); await h.host.tick(old); await h.host.stop(old);
  h.at(200000); const fresh = await h.host.begin("b", 60000, { resumePaused: true });
  assert.equal(h.store.read().simulatedAt, 101000);
  assert.equal(h.store.read().wallCursor, 200000);
  h.at(200250); await h.host.tick(fresh);
  assert.equal(h.store.read().simulation.completed, false);
  for (let i = 1; i <= 19; i++) { h.at(200250 + i * 1000); await h.host.tick(fresh); }
  assert.equal(h.store.read().simulation.completed, true, "logical time reaches its original deadline");
});

test("body tombstones apply atomically across restart without moving, transferring or spawning NPCs", async () => {
  const adapter = { ...simulation,
    initial: () => ({ ...simulation.initial(), npcs: [{ id: "existing", bodyId: "resident", owner: "npc", handedBack: 0 }] }),
    npcFor: (s, bodyId) => s.npcs.find(n => n.bodyId === bodyId)?.id ?? null,
    handoff(s, intent) {
      const npc = s.npcs.find(n => n.id === intent.handback.npc);
      npc.owner = "npc"; npc.handedBack++; npc.body = intent.body;
      return true;
    },
  };
  const h = harness(adapter), ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  const absent = (await h.host.sessions(ticket, [first.session.token], (r, now) => r.connect({ ...bodyClaim(), accountId: 2, bodyId: "absent" }, now))).result;
  await h.host.disconnect(ticket, [absent.session.token], first.session, 100000);
  await h.host.disconnect(ticket, [], absent.session, 100000);
  h.at(160000); const fresh = await h.host.claim("b"), before = h.store.read();
  h.store.failNext(); await assert.rejects(h.host.tick(fresh, []), /storage unavailable/);
  assert.deepEqual(h.store.read(), before, "neither ownership nor tombstone applies on a failed commit");
  await h.host.tick(fresh, []);
  let saved = h.store.read();
  assert.equal(saved.simulation.npcs.length, 1);
  assert.equal(saved.simulation.npcs[0].handedBack, 0);
  assert.equal(saved.simulation.npcs[0].owner, "npc");
  assert.deepEqual(saved.simulation.npcs, before.simulation.npcs);
  assert.deepEqual(saved.sessions.pending.find(p => p.bodyId === 'resident').body.equipment, claim.body.equipment);
  assert.ok(saved.sessions.pending.every(p => p.applied));
  h.at(200000);
  const resumed = await h.host.begin("c", 60000, { resumePaused: true });
  await h.make().tick(resumed, []);
  saved = h.store.read();
  assert.equal(saved.simulation.npcs[0].handedBack, 0, "applied tombstone never transfers state to the NPC");
  assert.equal(saved.sessions.pending[1].handback, null);
});


test("expensive simulation profiles can lower catch-up work without changing recovered state", async () => {
  for (const maxSteps of [0, -1, HOST.maxSteps + 1, NaN, 1.5])
    assert.throws(() => harness({ ...simulation, maxSteps }), /host adapters/);
  const ordinary = harness(), bounded = harness({ ...simulation, maxSteps: 4 });
  const tickets = await Promise.all([ordinary.host.begin('ordinary', 60000), bounded.host.begin('bounded', 60000)]);
  for (const h of [ordinary, bounded]) h.at(110001);
  tickets[0] = await ordinary.host.claim('ordinary-restart'); tickets[1] = await bounded.host.claim('bounded-restart');
  const before = bounded.store.read(); bounded.store.failNext();
  await assert.rejects(bounded.host.tick(tickets[1]), /storage unavailable/); assert.deepEqual(bounded.store.read(), before);
  const commits = [];
  for (const [index, h] of [ordinary, bounded].entries()) {
    let count = 0, result;
    do {
      result = await h.make().tick(tickets[index]); count++;
      assert.ok(result.steps <= (index ? 4 : HOST.maxSteps)); assert.ok(count <= 10);
    } while (result.lagMs >= HOST.stepMs);
    commits.push(count);
  }
  assert.deepEqual(commits, [5, 10]);
  assert.deepEqual(bounded.store.read().simulation, ordinary.store.read().simulation);
  assert.equal(bounded.store.read().simulatedAt, ordinary.store.read().simulatedAt);
});


test('one retained close after run expiry preserves unrelated live sessions and cannot renew or replay', async () => {
  const h = harness({ ...simulation, step() { throw Error('no NPC step'); } }, () => { throw Error('no physics'); });
  const ticket = await h.host.begin('owner', 500);
  const first = (await h.host.connect(ticket, [], bodyClaim())).result.session;
  const second = (await h.host.connect(ticket, [first.token], { ...bodyClaim(), accountId: 2, bodyId: 'second' })).result.session;
  h.at(100800); const before = h.store.read();
  await assert.rejects(h.host.closeRetainedBody(ticket, first, 100801), /future/);
  h.store.failNext(); await assert.rejects(h.host.closeRetainedBody(ticket, first, 100700), /storage unavailable/);
  assert.deepEqual(h.store.read(), before);
  assert.equal((await h.host.closeRetainedBody(ticket, first, 100700)).changed, true);
  const saved = h.store.read(), [a, b] = saved.sessions.sessions;
  assert.equal(a.state, 'grace'); assert.equal(a.deadline, 160500, 'finite run stop bounds a later close');
  assert.equal(a.motion.y, 10); assert.equal(a.motion.vy, 0);
  assert.equal(b.state, 'live'); assert.equal(b.token, second.token);
  assert.equal(saved.leaseUntil, before.leaseUntil); assert.equal(saved.runUntil, before.runUntil);
  assert.deepEqual(saved.simulation, before.simulation);
  const writes = h.store.writes;
  assert.equal((await h.host.closeRetainedBody(ticket, first, 100700)).changed, false);
  assert.equal((await h.host.closeRetainedBody(ticket, { ...second, generation: second.generation + 1 }, 100700)).changed, false);
  assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), saved);
  await assert.rejects(h.host.connect(ticket, [], bodyClaim()), /run closed/);
  h.at(160500); const replacement = await h.host.claim('cleanup');
  await assert.rejects(h.host.closeRetainedBody(ticket, first, 100700), /fenced/);
  await h.host.reconcileBodies(replacement, []);
  assert.equal(h.store.read().sessions.sessions.length, 0);
});
