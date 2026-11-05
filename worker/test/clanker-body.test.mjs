import { test } from "node:test";
import assert from "node:assert/strict";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint, createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const world = "controlled-body-fixture-1", persist = s => JSON.parse(JSON.stringify(s));
const make = (start = false) => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-1", start: false });
  const codec = createClankerBodyCheckpoint(f.sim, world, f.B.clankerState);
  if (start) {
    f.start(); assert.equal(f.sim.possess(f.sim.list[0]), true); codec.neutralize();
    for (let i = 0; i < 4; i++) f.step(); // Finish ordinary initial selection's rise from its lounge.
  }
  return { ...f, codec };
};

test("controlled Clanker restores the same airborne body and jump credits without possession resets or held input replay", () => {
  const original = make(true); let recovered;
  try {
    const e = original.sim.player;
    e.health.value = 137; e.health.delay = .7; e.biped = true;
    original.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpPressed: true, jumpHeld: true });
    original.step(); assert.equal(e.drive.airborne, true); assert.equal(e.drive.jumps, 1);
    assert.throws(() => original.codec.capture(), /profile/, "held controls must be explicitly neutralized before saving");
    const before = [e.drive.vx, e.drive.vy, e.drive.vz, e.drive.jumps, e.health.value, e.health.delay, e.biped,
      e.root.position.x, e.root.position.y, e.root.position.z];
    original.codec.neutralize();
    assert.deepEqual([e.drive.vx, e.drive.vy, e.drive.vz, e.drive.jumps, e.health.value, e.health.delay, e.biped,
      e.root.position.x, e.root.position.y, e.root.position.z], before);
    let saved = original.codec.capture();
    recovered = make();
    recovered.sim.possess = recovered.sim.travel = recovered.sim.release = () => { throw Error("ordinary acquisition must not run"); };
    recovered.codec.restore(persist(saved));
    assert.equal(recovered.sim.player, recovered.sim.list[0]);
    assert.deepEqual(recovered.codec.capture(), saved);
    for (let i = 0; i < 48; i++) {
      if (i === 0) for (const f of [original, recovered]) f.sim.control({ x: 0, z: 0, heading: .7, jumpPressed: true, jumpHeld: true });
      original.step(); recovered.step();
      original.codec.neutralize(); recovered.codec.neutralize();
      if (i === 0) assert.equal(recovered.sim.player.drive.jumps, 2, "the remaining midair jump survives reclaim");
      saved = original.codec.capture();
      assert.deepEqual(recovered.codec.capture(), saved, `physical/animation continuation at ${i}`);
      const d = recovered.sim.player.drive;
      assert.equal(d.jumpHeld || d.jumpPressed || d.jumpDown || d.run, false);
      assert.equal(d.x + d.z + d.climbAxis + d.climbSide + d.jumpBuffer, 0);
      if (i % 8 === 7) { recovered.dispose(); recovered = make(); recovered.codec.restore(persist(saved)); }
    }
    assert.equal(recovered.sim.player.drive.grounded, true, "gravity continues to a landing after repeated restarts");
  } finally { original.dispose(); recovered?.dispose(); }
});

test("body restoration rejects incompatible ownership and unsupported world interactions before use", () => {
  assert.throws(() => clankerController({ count: 2, checkpointRandom: true, checkpointProfile: "body-1" }), /unsupported/);
  const source = make(true), pack = createCheckpointPack(8 * 1024, { intern: true });
  try {
    assert.throws(() => createClankerRoamingCheckpoint(source.sim, world, source.B.clankerState), /profile/);
    const saved = source.codec.capture();
    for (const corrupt of [s => { s.clocks[15] = -1; }, s => { s.clocks[15] = 1; }, s => { s.world = "wrong"; }]) {
      const f = make();
      try {
        const state = pack.unpack(saved); corrupt(state);
        assert.throws(() => f.codec.restore(pack.pack(state)));
        assert.throws(() => f.codec.capture(), /profile/, "failed restore must be discarded");
      } finally { f.dispose(); }
    }
    for (const mutate of [e => { e.remoteControlled = true; }, e => { e.climb.active = true; },
      e => { e.capture = {}; }, e => { e.fire.rolling = true; }, e => { e.drive.vy = NaN; }, e => { e.health.value = -1; }]) {
      const f = make();
      try { f.codec.restore(saved); mutate(f.sim.player); assert.throws(() => f.codec.neutralize(), /unsupported/); }
      finally { f.dispose(); }
    }
  } finally { source.dispose(); }
});
