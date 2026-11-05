import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createHostBodyStorage, BODY_STORAGE } from "../src/host-body-storage.js";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
const world = "body-store-fixture", profile = "clanker-body-2";
const equipment = { weapon: null, mode: "carry", magazine: 0, spareAmmo: [], primaryOwned: false,
  secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false, fuel: 0 };
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
  const make = (store = bank()) => new VirtualHost({ storage: store, simulation, clock: () => now, sessionAdapter: { stepPassive: m => m } });
  return { storage, bank, make, read: () => structuredClone(data), at: t => { now = t; },
    corrupt: (k, v) => { if (v === undefined) data.delete(k); else data.set(k, structuredClone(v)); },
    fail: n => { failAfter = n; }, retry: () => { retry = true; }, captures: () => captures,
    capture: fn => { captureOverride = fn; } };
}

test("complete actual body survives host ownership replacement and timely reclaim with the original deadline", async () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-2", start: false });
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
    restored = clankerController({ checkpointRandom: true, checkpointProfile: "body-2", start: false });
    const replacement = createClankerBodyCheckpoint(restored.sim, world, restored.B.clankerState);
    replacement.restore(rows[0].checkpoint);
    assert.deepEqual(pack.unpack(replacement.capture()).position, pack.unpack(component).position);
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
