import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createHostBodyStorage, BODY_STORAGE } from "../src/host-body-storage.js";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
import { createClankerBodySessions } from "../src/clanker-body-sessions.js";
const world = "body-store-fixture", profile = "clanker-body-3";
const equipment = { weapon: null, mode: "carry", primaryOwned: false,
  secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false };
const claim = i => ({ protocol: SESSION_PROTOCOL, world, accountId: i + 1, bodyId: `body-${i}`, zone: "outside",
  body: { kind: "clanker", motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true }, equipment } });

// Atomic map fixture, with partial writes, deletes and optimistic retry. This
// tests storage composition; fixed session motion is not full-body simulation.
function harness(component = { state: "fixture" }, validate = () => true) {
  let data = new Map(), now = 100000, failAfter = Infinity, retry = false, captures = 0, captureOverride;
  const execute = async callback => {
    const pending = structuredClone(data); let count = 0;
    const result = await callback({
      get: async k => Array.isArray(k) ? new Map(k.filter(k => pending.has(k)).map(k => [k, structuredClone(pending.get(k))])) : structuredClone(pending.get(k)),
      put: async (k, v) => {
        for (const [key, value] of typeof k === "string" ? [[k, v]] : Object.entries(k)) {
          pending.set(key, structuredClone(value)); if (++count === failAfter) { failAfter = Infinity; throw Error("injected partial write"); }
        }
      },
      delete: async keys => { for (const k of keys) pending.delete(k); if (failAfter === -1) { failAfter = Infinity; throw Error("injected delete"); } },
    });
    return { result, pending };
  };
  const storage = { async transaction(callback) {
    if (retry) { retry = false; await execute(callback); }
    const { result, pending } = await execute(callback); data = pending; return result;
  } };
  const capture = (r, previous) => {
    captures++;
    if (captureOverride) return captureOverride(r, previous);
    return [...(r.sessions?.sessions || []), ...(r.sessions?.pending || [])].sort((a, b) => a.generation - b.generation).map(s => ({
      accountId: s.accountId, bodyId: s.bodyId, generation: s.generation, kind: s.kind || s.body.kind,
      checkpoint: previous.find(p => p.bodyId === s.bodyId)?.checkpoint || component,
    }));
  };
  const bank = () => createHostBodyStorage({ storage, profile, capture, validate });
  const simulation = { version: world, checkpointBytes: 65536, initial: () => ({ n: 0 }), validate: s => Number.isSafeInteger(s.n),
    step: s => { s.n++; }, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const make = (store = bank(), sessionAdapter = { stepPassive: m => m }) => new VirtualHost({ storage: store, simulation, clock: () => now, sessionAdapter });
  return { storage, bank, make, read: () => structuredClone(data), at: t => { now = t; },
    corrupt: (k, v) => { if (v === undefined) data.delete(k); else data.set(k, structuredClone(v)); },
    fail: n => { failAfter = n; }, retry: () => { retry = true; }, captures: () => captures,
    capture: fn => { captureOverride = fn; } };
}

test("complete actual body survives host ownership replacement and timely reclaim with the original deadline", async () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
  const codec = createClankerBodyCheckpoint(f.sim, world, f.B.clankerState), pack = createCheckpointPack(8192, { intern: true });
  let restored;
  try {
    f.start(); f.sim.possess(f.sim.list[0]); codec.neutralize(); for (let i = 0; i < 4; i++) f.step();
    f.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true }); f.step(); codec.neutralize();
    const component = codec.capture(), h = harness(component, v => pack.unpack(v).world === world), host = h.make();
    let ticket = await host.begin("owner", 120000);
    const ref = (await host.connect(ticket, [], claim(0))).result.session;
    await host.disconnect(ticket, [ref.token], ref, 100000);
    const before = h.read(); assert.equal(before.get(HOST.key).host.sessions.sessions[0].deadline, 160000);
    h.at(110000); ticket = await h.make().claim("replacement");
    const deadline = h.read().get(HOST.key).host.sessions.sessions[0].deadline; assert.equal(deadline, 160000);
    const next = (await h.make().connect(ticket, [], { ...claim(0), body: undefined })).result;
    assert.equal(next.resumed, true); assert.ok(next.session.generation > ref.generation);
    assert.equal((await h.make().disconnect(ticket, [next.session.token], ref, 100000)).result.state, "live");
    const rows = await h.bank().transaction(tx => tx.bodies());
    assert.equal(rows[0].generation, next.session.generation); assert.deepEqual(rows[0].checkpoint, component);
    restored = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
    const replacement = createClankerBodyCheckpoint(restored.sim, world, restored.B.clankerState);
    replacement.restore(rows[0].checkpoint);
    assert.deepEqual(pack.unpack(replacement.capture()).body.slice(1, 4), pack.unpack(component).body.slice(1, 4));
    assert.equal(restored.sim.player.animation.updates, 0, 'host recovery starts a fresh standard pose');
    assert.equal(restored.sim.player.drive.jumps, 1); assert.equal(restored.sim.player.drive.airborne, true);
    const snapshot = (await h.make().tick(ticket, [next.session.token])).snapshot;
    assert.equal(JSON.stringify(snapshot).includes('checkpoint'), false);
  } finally { f.dispose(); restored?.dispose(); }
});

test("body slots reserve the component cap, stay bounded through departures, and clean up atomically", async () => {
  // Exactly the component ceiling, without relying on compressibility. Tests the
  // storage reservation, not the supported Clanker profile's maximum dynamics.
  const component = "x".repeat(BODY_STORAGE.componentBytes - 2), h = harness(component), host = h.make();
  const ticket = await host.begin("owner", 120000);
  const joined = (await host.sessions(ticket, [], (r, at) => Array.from({ length: 31 }, (_, i) => r.connect(claim(i), at)))).result;
  assert.ok(joined.slice(0, 30).every(r => r.ok)); assert.equal(joined[30].reason, "full");
  assert.equal(h.read().size, 31); let total = 0;
  for (const [k, v] of h.read()) {
    const bytes = Buffer.byteLength(JSON.stringify(v)); total += bytes;
    assert.ok(bytes <= (k === HOST.key ? BODY_STORAGE.rootBytes : BODY_STORAGE.rowBytes));
  }
  assert.ok(total <= BODY_STORAGE.rootBytes + 30 * BODY_STORAGE.rowBytes);
  const refs = joined.slice(0, 30).map(r => r.session), tokens = refs.map(r => r.token);
  await host.sessions(ticket, tokens, (r, at) => { r.release(refs[0], at); });
  assert.equal(h.read().size, 31, "a departure keeps its complete body until ACK");
  const before = h.read(), depart = before.get(HOST.key).host.sessions.pending[0];
  h.fail(-1);
  await assert.rejects(host.sessions(ticket, tokens.slice(1), r => r.acknowledge(depart.id)), /injected delete/);
  assert.deepEqual(h.read(), before);
  await host.sessions(ticket, tokens.slice(1), r => r.acknowledge(depart.id));
  assert.equal(h.read().size, 30); assert.equal(h.read().has(BODY_STORAGE.prefix + 29), false);
  const stable = h.read(); h.capture((r, previous) => previous.map((p, i) => i ? p : { ...p, checkpoint: 'x'.repeat(8192) }));
  await assert.rejects(host.tick(ticket, tokens.slice(1))); assert.deepEqual(h.read(), stable);
});

test("failed writes and retries cannot split host authority from full bodies or leak speculative capture", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin("owner", 120000);
  const ref = (await host.connect(ticket, [], claim(0))).result.session, before = h.read();
  h.at(100250); h.fail(1);
  await assert.rejects(host.tick(ticket, [ref.token]), /injected partial write/); assert.deepEqual(h.read(), before);
  h.retry(); const captures = h.captures(); await host.tick(ticket, [ref.token]);
  assert.equal(h.captures() - captures, 2); const root = h.read().get(HOST.key);
  assert.equal(root.host.simulation.n, 1); assert.equal(h.read().get(BODY_STORAGE.prefix + 0).revision, root.revisions[0]);
  assert.deepEqual(h.read().get(BODY_STORAGE.prefix + 0), before.get(BODY_STORAGE.prefix + 0), 'unchanged bodies retain their exact referenced row');
  // Catching a storage write error inside a callback must still abort its writes.
  const stable = h.read(); h.fail(1);
  await assert.rejects(h.bank().transaction(async tx => {
    const r = await tx.get(HOST.key); r.revision++;
    try { await tx.put(HOST.key, r); } catch {}
  }), /body storage/); assert.deepEqual(h.read(), stable);
});

test("mixed versions, missing rows and wrong body generations refuse recovery without rewriting storage", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin("owner", 120000);
  const ref = (await host.connect(ticket, [], claim(0))).result.session;
  await assert.rejects(h.make(h.storage).tick(ticket, [ref.token]), /incompatible checkpoint/);
  const original = h.read(), k = BODY_STORAGE.prefix + 0, row = original.get(k);
  for (const bad of [undefined, { ...row, revision: row.revision - 1 }, { ...row, fence: row.fence + 1 },
    { ...row, world: "another" }, { ...row, profile: "another" }, { ...row, body: { ...row.body, generation: 99 } },
    { ...row, body: { ...row.body, checkpoint: "x".repeat(8192) } }]) {
    h.corrupt(k, bad); const broken = h.read();
    await assert.rejects(h.make().tick(ticket, [ref.token])); assert.deepEqual(h.read(), broken);
  }
  h.corrupt(k, row); h.corrupt(HOST.key, original.get(HOST.key).host);
  const legacy = h.read(); await assert.rejects(h.make().tick(ticket, [ref.token]), /body storage/); assert.deepEqual(h.read(), legacy);
  h.corrupt(HOST.key, undefined); const orphan = h.read();
  await assert.rejects(h.make().begin('replacement', 120000), /body storage/); assert.deepEqual(h.read(), orphan);
});

test("unchanged-row optimization preserves exact signed zero and small float changes", async () => {
  const h = harness({ value: -0 }), host = h.make(), ticket = await host.begin('owner', 120000);
  const ref = (await host.connect(ticket, [], claim(0))).result.session;
  for (const value of [0, Number.MIN_VALUE, -0]) {
    h.capture((r, previous) => previous.map(p => ({ ...p, checkpoint: { value } })));
    const before = h.read().get(BODY_STORAGE.prefix + 0).revision;
    await host.sessions(ticket, [ref.token], () => true);
    const rows = await h.bank().transaction(tx => tx.bodies());
    assert.ok(Object.is(rows[0].checkpoint.value, value));
    assert.ok(h.read().get(BODY_STORAGE.prefix + 0).revision > before);
  }
});

test("actual passive Clanker body and session motion commit together through rollback, retry and reconnect", async () => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
  };
  const reference = create(); let created = 0, disposed = 0;
  try {
    reference.start(); reference.sim.possess(reference.sim.list[0]); reference.codec.neutralize();
    for (let i = 0; i < 4; i++) reference.step();
    reference.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true });
    reference.step(); reference.codec.neutralize();
    const initial = reference.codec.capture(), motion = structuredClone(reference.codec.motion());
    const h = harness(initial), adapter = createClankerBodySessions({ recordFor: () => reference.codec.records, admit: () => initial,
      create: () => { created++; const f = create(); return { codec: f.codec, dispose() { disposed++; f.dispose(); } }; } });
    const make = () => h.make(h.bank(), adapter), host = make(); let ticket = await host.begin('owner', 120000);
    const first = (await host.connect(ticket, [], { ...claim(0), body: { ...claim(0).body, motion } })).result.session;
    const afterAdmission = created;
    const ref = (await host.connect(ticket, [first.token], { ...claim(0), body: undefined })).result.session;
    assert.equal(created, afterAdmission, 'duplicate acquisition neutralizes data without constructing another rig');
    assert.ok(ref.generation > first.generation);
    assert.equal((await host.disconnect(ticket, [ref.token], first, 100000)).result.state, 'live');
    const committedMotion = () => h.read().get(HOST.key).host.sessions.sessions[0].motion;
    await host.disconnect(ticket, [ref.token], ref, 100000); reference.codec.disconnect();
    assert.equal(created, afterAdmission, 'confirmed close neutralizes data without constructing a rig');
    assert.deepEqual(committedMotion(), structuredClone(reference.codec.motion()));
    const assertBody = async () => {
      const rows = await h.bank().transaction(tx => tx.bodies()), recovered = create();
      try { recovered.codec.restore(rows[0].checkpoint); assert.deepEqual(structuredClone(recovered.codec.motion()), committedMotion()); }
      finally { recovered.dispose(); }
    };
    h.at(100500); await host.tick(ticket, []);
    for (let i = 0; i < 10; i++) reference.codec.stepPassive(reference.codec.motion(), 50);
    assert.deepEqual(committedMotion(), structuredClone(reference.codec.motion())); await assertBody();
    const before = h.read(); h.at(100750); h.fail(1);
    await assert.rejects(host.tick(ticket, []), /injected partial write/); assert.deepEqual(h.read(), before);
    h.retry(); await assert.rejects(host.tick(ticket, []), /construction budget/);
    assert.deepEqual(h.read(), before, 'retry construction budget cannot publish speculative physics');
    await host.tick(ticket, []);
    for (let i = 0; i < 5; i++) reference.codec.stepPassive(reference.codec.motion(), 50);
    assert.deepEqual(committedMotion(), structuredClone(reference.codec.motion())); await assertBody();
    assert.equal(created, disposed, 'every successful, failed and retried body scope is disposed');
    h.at(110750); ticket = await make().claim('replacement');
    assert.equal(h.read().get(HOST.key).host.sessions.sessions[0].deadline, 160000);
    const resumed = await make().connectBody(ticket, [], 1, { ...claim(0), body: undefined }, await make().prepareBody(ticket, 1, 'body-0'));
    const next = resumed.result;
    assert.equal(next.resumed, true); assert.ok(next.session.generation > ref.generation);
    assert.equal(resumed.transfer.view.generation, next.session.generation);
    assert.equal(resumed.transfer.revision, h.read().get(HOST.key).host.revision);
    assert.deepEqual(resumed.transfer.view.motion, committedMotion());
    await assertBody(); assert.equal(committedMotion().grounded, true, 'retained body continued gravity to landing');
    const beforeTransfer = h.read(), transferConstructions = created;
    const transfer = await make().bodyForSession(ticket, next.session.accountId, next.session);
    assert.equal(transfer.resetResources, 'defaults'); assert.equal(transfer.view.generation, next.session.generation);
    assert.equal(transfer.revision, beforeTransfer.get(HOST.key).host.revision);
    assert.equal(transfer.expiresAt, beforeTransfer.get(HOST.key).host.leaseUntil);
    const recipient = create();
    try {
      recipient.codec.restore(transfer.checkpoint);
      assert.deepEqual(structuredClone(recipient.codec.motion()), transfer.view.motion);
      assert.equal(recipient.sim.player.health.value, recipient.sim.player.health.max);
    } finally { recipient.dispose(); }
    assert.equal(created, transferConstructions, 'transfer reads do not reconstruct host controllers');
    assert.equal(await make().confirmBody(ticket, next.session.accountId, next.session, transfer), true);
    assert.equal(created, transferConstructions, 'apply confirmation does not construct a host controller');
    assert.deepEqual(h.read(), beforeTransfer, 'transfer does not confirm presence or mutate ownership');
    assert.ok(!JSON.stringify(transfer).includes(next.session.token));
    transfer.view.motion.x = 999;
    assert.equal(await make().confirmBody(ticket, next.session.accountId, next.session, transfer), false);
    assert.deepEqual(h.read(), beforeTransfer, 'recipient cannot alias the authoritative record');
    assert.equal(await make().bodyForSession(ticket, ref.accountId, ref), null, 'old socket generation cannot read replacement body');
    await assert.rejects(make().bodyForSession(ticket, 999, next.session), /account mismatch/);
    await assert.rejects(make().bodyForSession({ ...ticket, fence: ticket.fence - 1 }, next.session.accountId, next.session), /fenced/);
    assert.equal((await make().disconnect(ticket, [next.session.token], ref, 100000)).result.state, 'live');
    const stable = h.read(), idleConstructions = created;
    await make().sessions(ticket, [next.session.token], () => true);
    assert.equal(created, idleConstructions, 'unchanged live bodies need no controller construction');
    await assert.rejects(make().sessions(ticket, [next.session.token], (r, at) => r.update(next.session, at,
      { motion: { ...committedMotion(), x: 999 } })), /body session/);
    // The intervening no-op committed a revision, but no unbacked motion can commit.
    assert.deepEqual(committedMotion(), stable.get(HOST.key).host.sessions.sessions[0].motion);
    assert.equal(created, disposed);
  } finally { reference.dispose(); }
});

test("body transfer refuses grace, foreign capabilities, expired authority and inconsistent body rows", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin('owner', 120000);
  const a = (await host.connect(ticket, [], claim(0))).result.session;
  const b = (await host.connect(ticket, [a.token], claim(1))).result.session;
  assert.equal(await host.bodyForSession(ticket, a.accountId, { ...a, token: b.token }), null);
  const transfer = await host.bodyForSession(ticket, a.accountId, a);
  assert.equal(transfer.view.bodyId, 'body-0'); assert.ok(!JSON.stringify(transfer).includes('body-1'));
  await host.disconnect(ticket, [a.token, b.token], a, 100000);
  const saved = h.read();
  assert.equal(await host.bodyForSession(ticket, a.accountId, a), null);
  assert.deepEqual(h.read(), saved, 'reading a disconnected body cannot renew or reclaim it');
  const rowKey = BODY_STORAGE.prefix + 1, row = saved.get(rowKey);
  h.corrupt(rowKey, { ...row, body: { ...row.body, generation: row.body.generation + 1 } });
  await assert.rejects(host.bodyForSession(ticket, b.accountId, b), /body storage/);
  h.corrupt(rowKey, row); h.at(110000);
  await assert.rejects(host.bodyForSession(ticket, b.accountId, b), /fenced/);
});

test("connect and complete-body transfer are one atomic operation, including failure and retry", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin('owner', 120000);
  const before = h.read();
  await assert.rejects(host.connectBody(ticket, [], 2, claim(0)), /account mismatch/);
  assert.deepEqual(h.read(), before);
  const prepared = await host.prepareBody(ticket, 1, 'body-0');
  h.fail(1); await assert.rejects(host.connectBody(ticket, [], 1, claim(0), prepared), /partial write/);
  assert.deepEqual(h.read(), before, 'no ownership survives a failed body write');
  h.retry();
  const joined = await host.connectBody(ticket, [], 1, claim(0), prepared);
  assert.equal(joined.transfer.view.generation, joined.result.session.generation);
  assert.equal(joined.transfer.revision, h.read().get(HOST.key).host.revision);
  assert.deepEqual(joined.transfer, await host.bodyForSession(ticket, 1, joined.result.session));
  const refused = await host.connectBody(ticket, [joined.result.session.token], 1, { ...claim(0), world: 'old-world' }, await host.prepareBody(ticket, 1, 'body-0'));
  assert.equal(refused.result.reason, 'version'); assert.equal(refused.transfer, null);

  // The registry write itself can succeed in a bare store. Failure to produce
  // the mandatory component afterward must still roll back that ownership.
  const bare = harness(), unsupported = bare.make(bare.storage), owner = await unsupported.begin('owner', 120000);
  const empty = bare.read();
  await assert.rejects(unsupported.connectBody(owner, [], 1, claim(0), await unsupported.prepareBody(owner, 1, 'body-0')), /complete body storage/);
  assert.deepEqual(bare.read(), empty);
});

test("apply confirmation tolerates unrelated commits but refuses changed bodies, equipment, capabilities and expiry without writes", async () => {
  const h = harness({ value: -0 }), host = h.make(); let ticket = await host.begin('owner', 120000);
  const prepared = await host.prepareBody(ticket, 1, 'body-0');
  const joined = await host.connectBody(ticket, [], 1, claim(0), prepared), ref = joined.result.session;
  const issued = joined.transfer;
  h.at(100250); await host.sessions(ticket, [ref.token], () => true);
  let before = h.read();
  assert.ok(before.get(HOST.key).host.revision > issued.revision);
  assert.equal(await host.confirmBody(ticket, 1, ref, issued), true);
  assert.deepEqual(h.read(), before, 'an ACK check cannot confirm presence or renew ownership');
  await assert.rejects(host.confirmBody(ticket, 2, ref, issued), /account mismatch/);
  assert.equal(await host.confirmBody(ticket, 1, { ...ref, token: '0'.repeat(32) }, issued), false);
  assert.equal(await host.confirmBody(ticket, 1, ref, { ...issued, revision: Number.MAX_SAFE_INTEGER }), false);
  assert.equal(await host.confirmBody(ticket, 1, ref, { ...issued, expiresAt: 100250 }), false);
  const zero = structuredClone(issued); zero.checkpoint.value = 0;
  assert.equal(await host.confirmBody(ticket, 1, ref, zero), false, 'signed zero cannot collapse in apply evidence');
  await host.sessions(ticket, [ref.token], (registry, at) => registry.update(ref, at,
    { equipment: { ...equipment, selectedSlot: 2 } }));
  assert.equal(await host.confirmBody(ticket, 1, ref, issued), false, 'unchanged body rows do not hide changed selected equipment');
  const current = await host.bodyForSession(ticket, 1, ref);
  h.capture((root, rows) => rows.map(row => ({ ...row, checkpoint: { value: 1 } })));
  await host.sessions(ticket, [ref.token], () => true);
  assert.equal(await host.confirmBody(ticket, 1, ref, current), false, 'matching session views do not hide a changed component');
  h.capture(null); // End component-only injection before the fixture captures a new generation.
  const replacement = (await host.connect(ticket, [ref.token], claim(0))).result.session;
  before = h.read();
  assert.equal(await host.confirmBody(ticket, 1, ref, current), false); assert.deepEqual(h.read(), before);
  const latest = await host.bodyForSession(ticket, 1, replacement);
  h.at(110000); ticket = await host.claim('replacement'); before = h.read();
  assert.equal(await host.confirmBody(ticket, 1, replacement, latest), false, 'an old epoch/lease cannot authorize activation after restart');
  assert.deepEqual(h.read(), before);
});

test("preparation neither claims nor refreshes presence, and stale readiness cannot replace or disconnect a newer body", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin('owner', 120000);
  const before = h.read(), prepared = await host.prepareBody(ticket, 1, 'body-0');
  assert.deepEqual(h.read(), before);
  assert.equal(prepared.generation, 0); assert.equal(prepared.nextGeneration, 1);
  assert.equal(JSON.stringify(prepared).includes('token'), false);
  await assert.rejects(host.connectBody(ticket, [], 1, claim(0)), /invalid body preparation/);
  const joined = await host.connectBody(ticket, [], 1, claim(0), prepared), ref = joined.result.session;
  const live = h.read();
  await assert.rejects(host.connectBody(ticket, [], 1, claim(0), prepared), /stale body preparation/);
  assert.deepEqual(h.read(), live, 'old transport census cannot move the replacement into grace');
  const ready = await host.prepareBody(ticket, 1, 'body-0');
  assert.equal(ready.generation, ref.generation); assert.equal(ready.nextGeneration, 0);
  h.at(100100); await host.disconnect(ticket, [ref.token], ref, 100100);
  const grace = h.read();
  const observed = await host.prepareBody(ticket, 1, 'body-0');
  assert.deepEqual(h.read(), grace, 'asset preparation does not pause physics or extend the deadline');
  assert.equal(observed.expiresAt, 110000);
  h.at(100250);
  const resumed = await host.connectBody(ticket, [], 1, { ...claim(0), body: undefined }, ready);
  assert.equal(resumed.result.resumed, true, 'same generation may enter grace while assets prepare');
  assert.equal(resumed.transfer.at, 100250);
  assert.equal(resumed.transfer.view.generation, ref.generation + 1);
  const committed = h.read();
  await assert.rejects(host.connectBody(ticket, [], 1, claim(0), observed), /stale body preparation/);
  assert.deepEqual(h.read(), committed);
});

test("preparation cannot resurrect an expired body, including a close inferred only during recovery", async () => {
  for (const inferred of [false, true]) {
    const h = harness(), host = h.make(); let ticket = await host.begin('owner', 120000);
    const ref = (await host.connect(ticket, [], claim(0))).result.session;
    if (!inferred) await host.disconnect(ticket, [ref.token], ref, 100000);
    h.at(159900); ticket = await host.claim('replacement');
    const prepared = await host.prepareBody(ticket, 1, 'body-0');
    assert.equal(prepared.expiresAt, inferred ? 169900 : 160000);
    h.at(160000); const before = h.read();
    await assert.rejects(host.connectBody(ticket, [], 1, claim(0), prepared),
      inferred ? /stale body preparation after recovery/ : /body preparation expired/);
    assert.deepEqual(h.read(), before, 'full fresh-body claim data must not turn expiry into a spawn');
  }
});

test("absent-body preparation detects admission and removal and survives no authority restart", async () => {
  const h = harness(), host = h.make(); let ticket = await host.begin('owner', 120000);
  const absent = await host.prepareBody(ticket, 1, 'body-0');
  const ref = (await host.connect(ticket, [], claim(0))).result.session;
  await host.sessions(ticket, [ref.token], (registry, at) => registry.release(ref, at));
  await assert.rejects(host.prepareBody(ticket, 1, 'body-0'), /departing/);
  await host.sessions(ticket, [], registry => {
    for (const p of registry.pending()) { registry.markApplied(p.id); registry.acknowledge(p.id); }
  });
  const removed = h.read();
  await assert.rejects(host.connectBody(ticket, [], 1, claim(0), absent), /stale body preparation/);
  assert.deepEqual(h.read(), removed, 'absence after a completed departure is a different admission');
  const fresh = await host.prepareBody(ticket, 1, 'body-0');
  h.at(110000); ticket = await host.claim('replacement');
  const restarted = h.read();
  await assert.rejects(host.connectBody(ticket, [], 1, claim(0), fresh), /stale body preparation/);
  assert.deepEqual(h.read(), restarted);
  const renewed = await host.prepareBody(ticket, 1, 'body-0');
  const joined = await host.connectBody(ticket, [], 1, claim(0), renewed);
  assert.equal(joined.result.ok, true);
  assert.ok(joined.result.session.generation > ref.generation);
});

test("body transaction registration and failed controller admission cannot leak speculative ownership", async () => {
  const h = harness(), adapter = createClankerBodySessions({ recordFor: () => { throw Error("invalid admission has no records"); }, admit: () => ({ invalid: true }), create: () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState), dispose: f.dispose };
  } });
  for (const passiveSteps of [1199, HOST.passiveSteps + 1, NaN])
    assert.throws(() => h.make(h.bank(), { ...adapter, passiveSteps }), /host adapters/);
  const host = h.make(h.bank(), adapter), ticket = await host.begin('owner', 120000), before = h.read();
  await assert.rejects(host.connect(ticket, [], claim(0))); assert.deepEqual(h.read(), before);
  await assert.rejects(h.bank().transaction(async tx => {
    tx.captureBodies(() => []);
    try { tx.captureBodies(() => []); } catch {}
    const r = await tx.get(HOST.key); r.revision++; await tx.put(HOST.key, r);
  }), /body storage/); assert.deepEqual(h.read(), before);
});

test("short-outage body work stays bounded, retains deadlines and prioritizes timely reconnect", async () => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
  };
  const reference = create(); let constructions = 0, disposals = 0;
  try {
    reference.start(); reference.sim.possess(reference.sim.list[0]); reference.codec.neutralize();
    for (let i = 0; i < 4; i++) reference.step();
    reference.sim.control({ x: .6, z: .8, heading: .7, jumpPressed: true, jumpHeld: true });
    reference.step(); reference.codec.neutralize();
    const initial = reference.codec.capture(), motion = structuredClone(reference.codec.motion()), h = harness(initial);
    const adapter = createClankerBodySessions({ admit: () => initial, recordFor: () => reference.codec.records,
      create: () => { constructions++; const f = create(); return { codec: f.codec, dispose() { disposals++; f.dispose(); } }; } });
    const host = h.make(h.bank(), adapter), ticket = await host.begin('owner', 120000), refs = [];
    const claims = [0, 1, 2].map(i => ({ ...claim(i), body: { ...claim(i).body, motion } }));
    const empty = h.read();
    await assert.rejects(host.sessions(ticket, [], (r, at) => claims.slice(0, 2).map(c => r.connect(c, at))), /construction budget/);
    assert.deepEqual(h.read(), empty, 'multiple new bodies cannot bypass construction admission');
    for (const c of claims) refs.push((await host.connect(ticket, refs.map(r => r.token), c)).result.session);
    h.at(100250); const count = constructions, first = await host.tick(ticket, []);
    assert.equal(constructions - count, 1, 'one controller despite three newly missing sockets');
    assert.equal(first.work.steps, 5); assert.equal(first.work.pendingBodies, 2); assert.equal(first.snapshot, null);
    const sessions = () => h.read().get(HOST.key).host.sessions.sessions;
    assert.deepEqual(sessions().map(r => r.stepAt), [100250, 100000, 100000]);
    assert.ok(sessions().every(r => r.deadline === 160000 && r.motion.vx === 0 && r.motion.vz === 0));
    const before = h.read(), attempted = constructions; h.retry();
    await assert.rejects(host.tick(ticket, []), /construction budget/);
    assert.equal(constructions - attempted, 1); assert.deepEqual(h.read(), before);
    const resumed = (await host.connect(ticket, [], { ...claims[2], body: undefined })).result;
    assert.equal(resumed.resumed, true); assert.equal(resumed.view.bodyId, 'body-2');
    assert.equal(sessions().find(r => r.accountId === 2).stepAt, 100000, 'priority precedes older unrelated body work');
    const last = await host.tick(ticket, [resumed.session.token]);
    assert.equal(last.work.pendingBodies, 0); assert.ok(last.snapshot);
    assert.equal(constructions, disposals);
  } finally { reference.dispose(); }
});


test("opt-in body batching preserves serial physics and bounds speculative retry work", async () => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
  };
  const reference = create();
  try {
    reference.start(); reference.sim.possess(reference.sim.list[0]); reference.codec.neutralize();
    for (let i = 0; i < 4; i++) reference.step();
    reference.sim.control({ x: .6, z: .8, heading: .7, jumpPressed: true, jumpHeld: true });
    reference.step(); reference.codec.neutralize();
    const initial = reference.codec.capture(), motion = structuredClone(reference.codec.motion()), outcomes = [];
    let admitted;
    for (const bodyLoads of [0, 5, 1.5, NaN, '4']) assert.throws(() => createClankerBodySessions({
      create, admit: () => initial, recordFor: () => reference.codec.records, bodyLoads }), /incompatible/);
    for (const bodyLoads of [1, 4]) {
      const h = harness(initial); let constructions = 0, disposals = 0;
      const adapter = createClankerBodySessions({ bodyLoads, admit: () => initial, recordFor: () => reference.codec.records,
        create: () => { constructions++; const f = create(); return { codec: f.codec, dispose() { disposals++; f.dispose(); } }; } });
      const host = h.make(h.bank(), adapter), ticket = await host.begin('owner', 120000), refs = [];
      if (admitted) for (const [key, value] of admitted) h.corrupt(key, structuredClone(value));
      else {
        for (let i = 0; i < 5; i++) refs.push((await host.connect(ticket, refs.map(r => r.token), {
          ...claim(i), body: { ...claim(i).body, motion } })).result.session);
        admitted = h.read();
      }
      h.at(100250); const before = h.read(), count = constructions; h.retry();
      await assert.rejects(host.tick(ticket, []), /construction budget/);
      assert.equal(constructions - count, bodyLoads, 'retries share the same construction budget');
      assert.deepEqual(h.read(), before, 'speculative batch changes no committed body or clock');
      let result, operations = 0;
      do {
        const count = constructions; result = await host.tick(ticket, []); operations++;
        assert.ok(constructions - count <= bodyLoads);
        if (result.work.pendingSteps) assert.equal(result.snapshot, null);
      } while (result.work.pendingSteps);
      assert.equal(operations, Math.ceil(5 / bodyLoads)); assert.ok(result.snapshot);
      const root = h.read().get(HOST.key).host, rows = await h.bank().transaction(tx => tx.bodies());
      outcomes.push({ sessions: root.sessions, simulation: root.simulation, rows });
      assert.equal(constructions, disposals, 'every speculative and committed controller is released');
    }
    assert.deepEqual(outcomes[1], outcomes[0], 'batch size changes no physical state, ownership, deadline or checkpoint');
  } finally { reference.dispose(); }
});


test("pending handoff writes are atomic and a lost ACK retains its original deadline after host restart", async () => {
  const h = harness(), host = h.make(); let ticket = await host.begin("owner", 120000);
  const prep = await host.prepareBody(ticket, 1, "body-0"), initial = h.read();
  h.fail(1); await assert.rejects(host.offerBody(ticket, [], 1, claim(0), prep), /injected partial write/);
  assert.deepEqual(h.read(), initial);
  const offer = await host.offerBody(ticket, [], 1, claim(0), prep), ref = offer.result.session;
  assert.equal(offer.transfer.protocol, "host-session-v4"); assert.equal(offer.transfer.view.state, "offered");
  assert.equal(offer.transfer.view.deadline, 160000); assert.equal(await host.bodyForSession(ticket, 1, ref), null);
  const saved = h.read(); h.at(100250); h.fail(1);
  await assert.rejects(host.activateBody(ticket, [], 1, ref, offer.transfer), /injected partial write/);
  assert.deepEqual(h.read(), saved);
  h.retry(); const active = await host.activateBody(ticket, [], 1, ref, offer.transfer);
  assert.equal(active.transfer.view.state, "starting"); assert.equal(active.transfer.expiresAt, 101250);
  const lease = h.read(); h.at(100750);
  const duplicate = await host.activateBody(ticket, [], 1, ref, offer.transfer);
  assert.equal(duplicate.result.ok, false); assert.deepEqual(h.read(), lease, "replayed preflight cannot mint another lease");
  await host.disconnect(ticket, [], ref, 100750);
  assert.equal(h.read().get(HOST.key).host.sessions.sessions[0].state, "starting");
  h.at(101250); await h.make().tick(ticket, []);
  let row = h.read().get(HOST.key).host.sessions.sessions[0];
  assert.equal(row.state, "grace"); assert.equal(row.deadline, 160000);
  const expired = h.read(); assert.equal((await host.startedBody(ticket, [], 1, ref, active.transfer)).result.ok, false);
  assert.deepEqual(h.read(), expired);
  h.at(111250); ticket = await h.make().claim("replacement"); await h.make().tick(ticket, []);
  row = h.read().get(HOST.key).host.sessions.sessions[0];
  assert.equal(row.deadline, 160000);
  const afterRestart = h.read();
  assert.equal((await host.activateBody(ticket, [], 1, ref, offer.transfer)).result.ok, false);
  assert.deepEqual(h.read(), afterRestart, "old epoch cannot regain control");
});

test("final body ACK is fenced, exact, atomic and idempotent without presence renewal", async () => {
  const h = harness({ value: -0 }), host = h.make(), ticket = await host.begin("owner", 120000);
  const offer = await host.offerBody(ticket, [], 1, claim(0), await host.prepareBody(ticket, 1, "body-0"));
  const ref = offer.result.session;
  h.at(100250); const active = await host.activateBody(ticket, [], 1, ref, offer.transfer);
  h.at(100500); const saved = h.read();
  await assert.rejects(host.startedBody(ticket, [], 2, ref, active.transfer), /account mismatch/);
  assert.equal((await host.startedBody(ticket, [], 1, { ...ref, token: "0".repeat(32) }, active.transfer)).result.ok, false);
  const altered = structuredClone(active.transfer); altered.checkpoint.value = 0;
  assert.equal((await host.startedBody(ticket, [], 1, ref, altered)).result.ok, false);
  assert.deepEqual(h.read(), saved);
  h.fail(1); await assert.rejects(host.startedBody(ticket, [], 1, ref, active.transfer), /injected partial write/);
  assert.deepEqual(h.read(), saved, "a failed ACK commit leaves the original lease and deadline");
  h.retry(); const done = await host.startedBody(ticket, [], 1, ref, active.transfer);
  assert.equal(done.result.ok, true); assert.equal(done.result.view.state, "live"); assert.equal(done.result.view.deadline, null);
  const live = h.read(); h.at(100750);
  assert.equal((await host.startedBody(ticket, [], 1, ref, active.transfer)).result.duplicate, true);
  assert.deepEqual(h.read(), live, "duplicate receipt does not refresh lastSeenAt or rewrite storage");
  const replacement = await host.offerBody(ticket, [ref.token], 1, claim(0), await host.prepareBody(ticket, 1, "body-0"));
  const newer = h.read(); assert.ok(replacement.result.session.generation > ref.generation);
  assert.equal((await host.startedBody(ticket, [], 1, ref, active.transfer)).result.ok, false);
  assert.deepEqual(h.read(), newer, "old receipt and census cannot disconnect a replacement");
});

test("real Clanker offer moves under host gravity; browser wire restores the final bounded control lease", async t => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
  };
  const source = create(); let rebuilt, constructions = 0, disposals = 0;
  try {
    source.start(); source.sim.possess(source.sim.list[0]); source.codec.neutralize();
    for (let i = 0; i < 4; i++) source.step();
    source.sim.control({ x: .6, z: .8, heading: .7, jumpPressed: true, jumpHeld: true }); source.step(); source.codec.neutralize();
    const initial = source.codec.capture(), h = harness(initial);
    const adapter = createClankerBodySessions({ browserTransfer: true, admit: () => initial, recordFor: () => source.codec.records,
      create: () => { constructions++; const f = create(); return { codec: f.codec, dispose() { disposals++; f.dispose(); } }; } });
    const host = h.make(h.bank(), adapter), ticket = await host.begin("owner", 120000);
    const c = { ...claim(0), body: { ...claim(0).body, motion: structuredClone(source.codec.motion()) } };
    const offer = await host.offerBody(ticket, [], 1, c, await host.prepareBody(ticket, 1, "body-0")), ref = offer.result.session;
    assert.equal(offer.transfer.view.motion.vx, 0); assert.equal(offer.transfer.view.motion.vz, 0);
    assert.equal(offer.transfer.view.motion.vy, c.body.motion.vy);
    h.at(100250); await host.tick(ticket, []);
    h.at(100500); const active = await host.activateBody(ticket, [], 1, ref, offer.transfer);
    assert.equal(active.result.ok, true); assert.equal(active.transfer.expiresAt, 101500);
    assert.notEqual(active.transfer.view.motion.y, offer.transfer.view.motion.y);
    assert.notDeepEqual(active.transfer.checkpoint, offer.transfer.checkpoint, "final snapshot follows the host-owned body, not old preflight");
    const count = constructions, rows = await h.bank().transaction(tx => tx.bodies());
    h.at(100750); await host.tick(ticket, []);
    assert.equal(constructions, count); assert.deepEqual(await h.bank().transaction(tx => tx.bodies()), rows);
    rebuilt = create(); rebuilt.B.clankerBodyTransfer.forBody(rebuilt.sim, world).restore(JSON.parse(JSON.stringify(active.transfer.checkpoint)));
    assert.equal(active.transfer.checkpoint.v, 1);
    assert.notDeepEqual(rows[0].checkpoint, active.transfer.checkpoint, 'public wire does not replace internal packed storage');
    assert.deepEqual(structuredClone(rebuilt.codec.motion()), active.transfer.view.motion);
    assert.equal(rebuilt.sim.player.animation.updates, 0);
    assert.equal(rebuilt.sim.player.health.value, rebuilt.sim.player.health.max);
    assert.equal(rebuilt.sim.player.drive.jumps, 1);
    t.diagnostic(JSON.stringify({ scope: 'representative JSON UTF-8, no provider overhead',
      wireComponentBytes: Buffer.byteLength(JSON.stringify(active.transfer.checkpoint)),
      completeTransferBytes: Buffer.byteLength(JSON.stringify(active.transfer)),
      completeSessionAndBodyRecordBytes: Buffer.byteLength(JSON.stringify({ session: h.read().get(HOST.key).host.sessions.sessions[0], body: rows[0] })) }));
    h.at(101500); await host.tick(ticket, []);
    const recovered = h.read().get(HOST.key).host.sessions.sessions[0];
    assert.equal(recovered.state, "grace"); assert.equal(recovered.deadline, 160000);
    assert.ok(recovered.motion.y < active.transfer.view.motion.y, "lost ACK returns a falling body to host physics");
    assert.equal(constructions, disposals);
    const combined = Buffer.byteLength(JSON.stringify({ session: recovered, body: (await h.bank().transaction(tx => tx.bodies()))[0] }));
    assert.ok(combined < HOST.sessionSlotBytes, "representative minimal state, not a worst-case proof");
  } finally { source.dispose(); rebuilt?.dispose(); }
});


test("publication cannot pass an expired handoff lease just because the saved clock has not advanced", async () => {
  const h = harness(), host = h.make(), ticket = await host.begin("owner", 120000);
  const offer = await host.offerBody(ticket, [], 1, claim(0), await host.prepareBody(ticket, 1, "body-0"));
  h.at(100250); const active = await host.activateBody(ticket, [], 1, offer.result.session, offer.transfer);
  h.at(active.transfer.expiresAt - 1);
  assert.ok(await host.transaction(tx => host.publicationRecord(tx, ticket, true)));
  h.at(active.transfer.expiresAt);
  assert.equal(await host.transaction(tx => host.publicationRecord(tx, ticket, true)), null);
  await assert.rejects(host.transaction(tx => host.publicationRecord(tx, ticket)), /body recovery pending/);
  await host.tick(ticket, []);
  assert.ok(await host.transaction(tx => host.publicationRecord(tx, ticket, true)));
});

test("opt-in browser wire stays exact through host reconstruction, ACK comparison and original-deadline abandonment", async () => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
  };
  const source = create();
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const initial = source.codec.capture(), h = harness(initial);
    const adapter = () => createClankerBodySessions({ browserTransfer: true, admit: () => initial, recordFor: () => source.codec.records,
      create: () => { const f = create(); return { codec: f.codec, dispose: f.dispose }; } });
    const make = () => h.make(h.bank(), adapter()), host = make(), ticket = await host.begin('owner', 120000);
    const offer = await host.offerBody(ticket, [], 1, claim(0), await host.prepareBody(ticket, 1, 'body-0'));
    h.at(100100); const final = await make().activateBody(ticket, [], 1, offer.result.session, offer.transfer);
    const before = h.read(), changed = structuredClone(final.transfer); changed.checkpoint.body[1] = .5;
    assert.equal((await make().startedBody(ticket, [], 1, final.result.session, changed)).result.ok, false);
    assert.deepEqual(h.read(), before);
    assert.equal((await make().startedBody(ticket, [], 1, final.result.session, final.transfer)).result.ok, true);
    const live = h.read();
    assert.equal((await make().startedBody(ticket, [], 1, final.result.session, final.transfer)).result.duplicate, true);
    assert.deepEqual(h.read(), live);
    h.at(100200); const restored = await make().abandonBody(ticket, [], 1, final.result.session, final.transfer);
    assert.equal(restored.result.ok, true); assert.equal(restored.result.view.deadline, 160000);
    assert.ok(source.codec.records.read((await h.bank().transaction(tx => tx.bodies()))[0].checkpoint));
  } finally { source.dispose(); }
});

test("deferred offer physics consumes no activation lease and cannot publish a stale body", async () => {
  const h = harness(), host = h.make(h.bank(), { stepPassive: m => m, canStep: () => false });
  const ticket = await host.begin("owner", 120000);
  const offer = await host.offerBody(ticket, [], 1, claim(0), await host.prepareBody(ticket, 1, "body-0"));
  h.at(100250); const active = await host.activateBody(ticket, [], 1, offer.result.session, offer.transfer);
  assert.equal(active.result.reason, "recovering"); assert.equal(active.transfer, null);
  const session = h.read().get(HOST.key).host.sessions.sessions[0];
  assert.equal(session.state, "offered"); assert.equal(session.stepAt, 100000); assert.equal(session.deadline, 160000);
  assert.equal(active.work.pendingSteps, 5);
  assert.equal(await host.transaction(tx => host.publicationRecord(tx, ticket, true)), null);
});

test('authenticated movement commits source physics atomically, fences replays across restart, and disconnects at the latest position', async t => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
  };
  const source = create(), moved = create(); let constructions = 0, disposals = 0;
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const initial = source.codec.capture(), h = harness(initial);
    const make = () => h.make(h.bank(), createClankerBodySessions({ admit: () => initial, recordFor: () => source.codec.records,
      create: () => { constructions++; const f = create(); return { codec: f.codec, dispose() { disposals++; f.dispose(); } }; } }));
    const host = make(), ticket = await host.begin('owner', 120000);
    const ref = (await host.connect(ticket, [], claim(0))).result.session;
    moved.sim.bodyCheckpoint.restoreBody(['fixture-0', 2, 3, 4, .5, .6, -1.5, .8, 1, 4]);
    const checkpoint = source.codec.records.transfer(moved.codec.capture()), sample = { sequence: 1, checkpoint };
    const original = h.read(); h.at(100100);
    for (const [account, reference, tokens] of [[2, ref, [ref.token]], [1, { ...ref, token: 'wrong' }, [ref.token]],
      [1, { ...ref, generation: ref.generation + 1 }, [ref.token]], [1, ref, []]]) {
      await assert.rejects(host.updateBody(ticket, tokens, account, reference, sample), /account|fenced/);
      assert.deepEqual(h.read(), original);
    }
    for (const n of [1, 2, 3, 4]) {
      h.fail(n); await assert.rejects(host.updateBody(ticket, [ref.token], 1, ref, sample), /injected/);
      assert.deepEqual(h.read(), original, `partial write ${n} rolls back physics, clock and receipt`);
    }
    assert.deepEqual(await host.updateBody(ticket, [ref.token], 1, ref, sample), { sequence: 1, at: 100100 });
    const committed = h.read(), session = () => h.read().get(HOST.key).host.sessions.sessions[0];
    assert.deepEqual(session().motion, structuredClone(moved.codec.motion()));
    const rows = await h.bank().transaction(tx => tx.bodies());
    assert.deepEqual(structuredClone(source.codec.records.motion(rows[0].checkpoint)), structuredClone(moved.codec.motion()));
    h.at(100200); const count = constructions;
    assert.deepEqual(await make().updateBody(ticket, [ref.token], 1, ref, sample), { sequence: 1, at: 100100 });
    assert.deepEqual(h.read(), committed); assert.equal(constructions, count, 'replay constructs no body or refreshes presence');
    const changed = structuredClone(sample); changed.checkpoint.body[1] = 3;
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, changed), /movement/);
    const next = { ...changed, sequence: 2 };
    await make().updateBody(ticket, [ref.token], 1, ref, next);
    const newer = h.read();
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, sample), /movement/);
    assert.deepEqual(h.read(), newer);
    const bad = structuredClone(next); bad.sequence = 3; bad.checkpoint.world = 'wrong';
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, bad), /transfer/);
    assert.deepEqual(h.read(), newer);
    const buried = structuredClone(next); buried.sequence = 3; buried.checkpoint.body[2] = -1;
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, buried), /profile/);
    assert.deepEqual(h.read(), newer, 'standard-pose placement rejects an underground body atomically');
    h.retry();
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, { ...next, sequence: 3 }), /construction budget/);
    assert.deepEqual(h.read(), newer, 'optimistic retries share the construction budget and cannot leak a receipt');
    await make().disconnect(ticket, [ref.token], ref, 100200);
    assert.equal(session().motion.x, 3); assert.equal(session().motion.vx, 0); assert.equal(session().motion.vz, 0);
    assert.equal(session().motion.vy, -1.5); assert.equal(session().deadline, 160200);
    const offline = h.read();
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, { ...next, sequence: 3 }), /fenced/);
    assert.deepEqual(h.read(), offline);
    const resumed = (await make().connect(ticket, [], { ...claim(0), body: undefined })).result.session;
    assert.ok(resumed.generation > ref.generation);
    const replacement = h.read();
    await assert.rejects(make().updateBody(ticket, [resumed.token], 1, ref, { ...next, sequence: 3 }), /fenced/);
    await assert.rejects(make().updateBody({ ...ticket, fence: ticket.fence + 1 }, [resumed.token], 1, resumed, sample), /fenced/);
    assert.deepEqual(h.read(), replacement, 'old session and host cannot alter the replacement');
    assert.deepEqual(await make().updateBody(ticket, [resumed.token], 1, resumed, sample), { sequence: 1, at: 100200 });
    assert.equal(constructions, disposals);
    t.diagnostic(JSON.stringify({ sampleBytes: Buffer.byteLength(JSON.stringify(sample)),
      receiptBytes: Buffer.byteLength(JSON.stringify(committed.get('host-body-movement-v1:1'))),
      scope: 'representative movement envelope and replay receipt; provider overhead excluded' }));
  } finally { source.dispose(); moved.dispose(); }
});

test('Room observation time survives delayed movement processing and keeps the original confirmed-close deadline', async () => {
  const create = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
  };
  const source = create();
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const initial = source.codec.capture(), h = harness(initial);
    const make = () => h.make(h.bank(), createClankerBodySessions({ admit: () => initial, recordFor: () => source.codec.records,
      create: () => { const f = create(); return { codec: f.codec, dispose: f.dispose }; } }));
    const host = make(), ticket = await host.begin('owner', 120000), ref = (await host.connect(ticket, [], claim(0))).result.session;
    const checkpoint = source.codec.records.transfer(initial);
    checkpoint.body = ['fixture-0', 3, 4, 0, 0, .5, -1.5, .5, 1, 4];
    const sample = { sequence: 1, checkpoint }, before = h.read(); h.at(100500);
    for (const observedAt of [99999, 100501]) {
      await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, sample, { observedAt }), /refused/);
      assert.deepEqual(h.read(), before);
    }
    assert.deepEqual(await host.updateObservedBody(ticket, [ref.token], 1, ref, sample, 100100), { sequence: 1, at: 100500 });
    const accepted = h.read();
    assert.equal(accepted.get(HOST.key).host.sessions.sessions[0].lastSeenAt, 100100);
    h.at(100600);
    assert.deepEqual(await make().updateBody(ticket, [ref.token], 1, ref, sample, { observedAt: 100100 }), { sequence: 1, at: 100500 });
    assert.deepEqual(h.read(), accepted, 'reply retry cannot move the observation or processing timestamp');
    await assert.rejects(make().updateBody(ticket, [ref.token], 1, ref, sample, { observedAt: 100200 }), /movement/);
    assert.deepEqual(h.read(), accepted, 'changing the observed time changes the retained command digest');
    await make().disconnect(ticket, [], ref, 100200);
    const offline = h.read().get(HOST.key).host.sessions.sessions[0];
    assert.equal(offline.deadline, 160200); assert.equal(offline.stepAt, 100600);
    assert.equal(offline.motion.x, 3); assert.equal(offline.motion.vx, 0); assert.ok(offline.motion.y < 4);
    assert.deepEqual(structuredClone(source.codec.records.motion((await h.bank().transaction(tx => tx.bodies()))[0].checkpoint)), offline.motion);
  } finally { source.dispose(); }
});
