import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { createPassiveBody } from "../src/passive-body.js";
import { rosterFixture } from "./fixtures/host-roster-fixture.mjs";

test("53 Ooga/Clanker pairs retain exact controller state through full slots, growth, failed commit and recovery", async t => {
  const f = await rosterFixture(53), codec = createCheckpointPack(f.simulation.checkpointBytes);
  let now = 100000, saved, fail = false, peak = 0;
  const storage = { async transaction(fn) {
    let next = structuredClone(saved);
    const out = await fn({ get: async () => structuredClone(next), put: async (_, value) => { next = structuredClone(value); } });
    if (fail) { fail = false; throw Error("roster commit failed"); }
    // Exercise the actual JSON storage representation, not only structuredClone.
    saved = JSON.parse(JSON.stringify(next)); peak = Math.max(peak, Buffer.byteLength(JSON.stringify(saved))); return out;
  } };
  const world = { ...f.mesh, radius: 2.25, height: 2.8 }, passive = createPassiveBody({ world: () => world, gravity: 9.8 });
  const make = () => new VirtualHost({ storage, simulation: f.simulation, clock: () => now, sessionAdapter: { stepPassive: passive } });
  let host = make(), ticket = await host.begin("first", 120000);
  const reference = f.source.initial(), equipment = { weapon: "gun", mode: "combat", magazine: 17, spareAmmo: [4, 22],
    primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true, fuel: .37 };
  const claim = i => ({ protocol: SESSION_PROTOCOL, world: f.simulation.version, accountId: i + 1, bodyId: `body-${i}`, zone: "outside",
    body: { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false }, equipment } });
  const joins = (await host.sessions(ticket, [], (r, at) => Array.from({ length: 31 }, (_, i) => r.connect(claim(i), at)))).result;
  assert.ok(joins.slice(0, 30).every(j => j.ok)); assert.equal(joins[30].reason, "full");
  const tokens = joins.slice(0, 30).map(j => j.session.token);
  for (let i = 0; i < 120; i++) {
    now += 250;
    if (i === 24) {
      const before = structuredClone(saved); fail = true; await assert.rejects(host.tick(ticket, tokens), /roster commit failed/);
      assert.deepEqual(saved, before); host = make();
    }
    const result = await host.tick(ticket, tokens); f.source.step(reference, 250);
    assert.equal(result.snapshot.npcs.length, 106); assert.deepEqual(codec.unpack(saved.simulation), reference);
  }
  const actorsBefore = structuredClone(saved.simulation);
  await host.sessions(ticket, tokens, (r, at) => joins.slice(0, 30).forEach(j => r.disconnect(j.session, at)));
  now += 59999; host = make(); ticket = await host.claim("restart");
  const resumed = await host.connect(ticket, [], claim(29)); assert.equal(resumed.result.resumed, true);
  assert.deepEqual(resumed.result.view.equipment, equipment); assert.equal(resumed.result.view.motion.grounded, true);
  now++; let result, commits = 0;
  do { result = await host.tick(ticket, [resumed.result.session.token]); assert.ok(++commits <= 10); } while (result.work.pendingSteps);
  assert.deepEqual(saved.simulation, actorsBefore, "outage recovery cannot replay NPC shots or decisions");
  assert.equal(saved.sessions.pending.length, 29);
  assert.ok(saved.sessions.pending.every(p => p.applied && p.handback === null && p.at <= now));
  assert.ok(peak < HOST.checkpointBytes);
  await assert.rejects(rosterFixture(54), /remeasure/);
  t.diagnostic(JSON.stringify({ actors: 106, retainedSlots: 30, peakCheckpointBytes: peak, physicalLimit: HOST.checkpointBytes }));
});
