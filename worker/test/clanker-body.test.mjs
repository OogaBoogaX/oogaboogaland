import { test } from "node:test";
import assert from "node:assert/strict";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint, createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const world = "controlled-body-fixture-1", persist = s => JSON.parse(JSON.stringify(s));
const gameplay = f => {
  const e = f.sim.player;
  return persist({ position: e.root.position, heading: e.heading,
    vx: e.drive.vx, vy: e.drive.vy, vz: e.drive.vz, grounded: e.drive.grounded, airborne: e.drive.airborne, jumps: e.drive.jumps,
    biped: e.biped, parked: e.parked, controlled: e.controlled });
};
const make = (start = false) => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
  const codec = createClankerBodyCheckpoint(f.sim, world, f.B.clankerState);
  if (start) {
    f.start(); assert.equal(f.sim.possess(f.sim.list[0]), true); codec.neutralize();
    for (let i = 0; i < 4; i++) f.step(); // Finish ordinary initial selection's rise from its lounge.
  }
  return { ...f, codec };
};

test("passive interaction getters keep possession and remote changes without per-actor accessor closures", () => {
  const f = clankerController({ count: 2, passiveNpcs: true }); let hosted;
  try {
    f.start();
    const [first, second] = f.sim.list;
    const policy = Object.getOwnPropertyDescriptor(first, 'nonInteractive');
    assert.equal(policy.enumerable, false);
    assert.equal(policy.configurable, false);
    assert.equal(policy.get, Object.getOwnPropertyDescriptor(second, 'nonInteractive').get,
      'cached accessor metadata must not capture a controller or individual actor');
    // Current browser scenes filter passive companions at their interaction query, without a blanket mesh flag.
    assert.equal(first.nonInteractive, true); assert.equal(first.root.collisionDisabled, undefined);
    assert.equal(f.sim.possess(first), true);
    assert.equal(first.nonInteractive, false); assert.equal(first.root.collisionDisabled, undefined);
    assert.equal(second.nonInteractive, true);
    assert.equal(f.sim.release(), true);
    assert.equal(first.nonInteractive, true); assert.equal(first.root.collisionDisabled, undefined);
    f.sim.setRemote(first.owner.traits.name, true);
    assert.equal(first.nonInteractive, false); assert.equal(first.root.collisionDisabled, undefined);
    f.sim.setRemote(first.owner.traits.name, false);
    assert.equal(first.nonInteractive, true); assert.equal(first.root.collisionDisabled, undefined);
    // The authoritative world still disables collision on its passive roots,
    // with the same cached accessor rather than a getter retaining each actor.
    const owners = f.sim.list.map(e => e.owner);
    hosted = f.B.clankers.create({ root: f.B.scene.createNode(), sites: [], groundAt: () => 0, clear: () => true,
      crew: { list: owners, cavemen: new Map(owners.map(o => [o.traits.name, o])), stateOf: o => o.state, authoritative: true },
      npcExecution: {}, npcClock: () => 0, npcPlacement: () => true });
    hosted.sync();
    const [hostFirst, hostSecond] = hosted.list;
    assert.equal(hostFirst.active, true); assert.equal(hostFirst.root.visible, true);
    const collision = Object.getOwnPropertyDescriptor(hostFirst.root, 'collisionDisabled');
    assert.equal(collision.enumerable, false); assert.equal(collision.configurable, false);
    assert.equal(collision.get, Object.getOwnPropertyDescriptor(hostSecond.root, 'collisionDisabled').get);
    assert.equal(collision.get, policy.get, 'body and collision policy share the receiver-keyed accessor');
    assert.equal(hostFirst.nonInteractive, true); assert.equal(hostFirst.root.collisionDisabled, true);
    assert.equal(hosted.possess(hostFirst), false, 'a host NPC cannot acquire local controls');
    assert.equal(hosted.setRemote(hostFirst.owner.traits.name, true), false, 'legacy remote control cannot replace host authority');
    assert.equal(hostFirst.nonInteractive, true); assert.equal(hostFirst.root.collisionDisabled, true);
  } finally { hosted?.dispose(); f.dispose(); }
});

test("controlled Clanker recovers gameplay in a fresh standard pose without possession resets or held input replay", () => {
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
    assert.deepEqual(gameplay(recovered), gameplay(original));
    assert.equal(recovered.sim.player.health.value, recovered.sim.player.health.max);
    assert.equal(recovered.sim.player.health.delay, 0, "health restarts at normal defaults");
    assert.equal(recovered.sim.player.animation.updates, 0, "old animation progress is not recovered");
    for (let i = 0; i < 48; i++) {
      if (i === 0) for (const f of [original, recovered]) f.sim.control({ x: 0, z: 0, heading: .7, jumpPressed: true, jumpHeld: true });
      original.step(); recovered.step();
      original.codec.neutralize(); recovered.codec.neutralize();
      if (i === 0) assert.equal(recovered.sim.player.drive.jumps, 2, "the remaining midair jump survives reclaim");
      saved = original.codec.capture();
      assert.deepEqual(gameplay(recovered), gameplay(original), `gameplay continuation at ${i}`);
      const d = recovered.sim.player.drive;
      assert.equal(d.jumpHeld || d.jumpPressed || d.jumpDown || d.run, false);
      assert.equal(d.x + d.z + d.climbAxis + d.climbSide + d.jumpBuffer, 0);
      if (i % 8 === 7) { recovered.dispose(); recovered = make(); recovered.codec.restore(persist(saved)); }
    }
    assert.equal(recovered.sim.player.drive.grounded, true, "gravity continues to a landing after repeated restarts");
  } finally { original.dispose(); recovered?.dispose(); }
});

test("body restoration rejects incompatible ownership and unsupported world interactions before use", () => {
  assert.throws(() => clankerController({ count: 2, checkpointRandom: true, checkpointProfile: "body-3" }), /unsupported/);
  for (const checkpointProfile of ["body-1", "body-2"])
    assert.throws(() => clankerController({ checkpointRandom: true, checkpointProfile }), /unsupported/);
  const source = make(true), pack = createCheckpointPack(8 * 1024, { intern: true });
  try {
    assert.throws(() => createClankerRoamingCheckpoint(source.sim, world, source.B.clankerState), /profile/);
    const saved = source.codec.capture();
    for (const corrupt of [s => { s.body[0] = 'another-owner'; }, s => { s.body[8] = 3; }, s => { s.world = "wrong"; },
      s => { s.v = 2; }, s => { s.baseline = "changed"; }, s => { s.rigs = {}; }, s => { s.body[1] = 10000; }, s => { s.body[9] = 32; }]) {
      const f = make();
      try {
        const state = pack.unpack(saved); corrupt(state);
        assert.throws(() => source.codec.records.disconnect(pack.pack(state), source.codec.motion()), undefined,
          'the data-only close path validates the same body profile before changing a record');
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

test("standard recovery omits display history and refuses a rebuilt torso overlapping a solid or peer", () => {
  const source = make(true), pack = createCheckpointPack(8192, { intern: true }); let safe, blocked, underground;
  try {
    source.sim.player.biped = source.sim.player.parked = true;
    const saved = source.codec.capture(), state = pack.unpack(saved);
    assert.equal(state.v, 3); assert.equal(Object.hasOwn(state, 'rigs'), false);
    const e = source.sim.player, p = e.root.position;
    e.animation.pending = 7; e.animation.updates = 999; e.motion.takeoff = 1; e.motion.landing = 1; e.motion.labPhase = 333;
    e.health.value = 3; e.health.delay = 3; e.random(); e.roam.plans = 999;
    e.gorilla.poseManaged(.2, p.x, p.y, p.z, e.heading, 4, true, e.biped, '', e.motion);
    assert.deepEqual(source.codec.capture(), saved, 'display, health, AI counters and RNG do not enter the body record');
    safe = make(); safe.codec.restore(saved);
    assert.equal(safe.sim.player.biped, true); assert.equal(safe.sim.player.parked, true);
    const hull = Array.from(safe.sim.player.gorilla.bodyHull(new Float64Array(24)));
    assert.ok(hull.every(Number.isFinite));
    let checks = 0;
    blocked = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false,
      clearance: (...args) => {
        checks++; const body = args[8], actual = body.gorilla.bodyHull(new Float64Array(24));
        assert.deepEqual(Array.from(actual), hull, 'clearance receives the rebuilt standard torso');
        return !blocked.B.convex.hullsOverlap(actual, hull);
      } });
    const codec = createClankerBodyCheckpoint(blocked.sim, world, blocked.B.clankerState);
    assert.throws(() => codec.restore(saved), /unsupported/);
    assert.equal(checks, 1); assert.throws(() => codec.capture(), /profile/, 'failed placement cannot publish or reclaim');
    const recovered = safe.codec.capture();
    assert.equal(safe.sim.player.motion.takeoff, 0); assert.equal(safe.sim.player.animation.updates, 0);
    assert.deepEqual(pack.unpack(recovered).body.slice(1, 4), state.body.slice(1, 4), 'recovery never silently relocates the player');
    let floor = 0;
    underground = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false, ground: () => floor });
    const underCodec = createClankerBodyCheckpoint(underground.sim, world, underground.B.clankerState);
    floor = p.y + 1;
    assert.throws(() => underCodec.restore(saved), /unsupported/, 'a changed floor cannot bury the standard body');
    assert.throws(() => underCodec.capture(), /profile/);
  } finally { source.dispose(); safe?.dispose(); blocked?.dispose(); underground?.dispose(); }
});

// Compare against actual source disconnect, not a second copy of its formula.
test("data-only disconnect matches real controller neutralization and outlives bootstrap disposal", () => {
  const f = make(true); let last, motion, records;
  try {
    for (let i = 0; i < 24; i++) {
      if (i < 2) f.sim.control({ x: .6, z: .8, heading: .7, jumpPressed: true, jumpHeld: true });
      f.step(); f.codec.neutralize();
      const saved = f.codec.capture(), before = structuredClone(f.codec.motion()), immutable = persist(saved);
      const stopped = f.codec.records.disconnect(saved, before);
      f.codec.disconnect();
      assert.deepEqual(stopped.checkpoint, f.codec.capture());
      assert.deepEqual(structuredClone(stopped.motion), structuredClone(f.codec.motion()));
      assert.deepEqual(saved, immutable, 'speculative close never mutates its committed input');
      assert.throws(() => f.codec.records.disconnect(saved, { ...before, y: before.y + 1 }), /profile/);
      f.sim.player.drive.vx = before.vx; f.sim.player.drive.vz = before.vz;
      last = saved; motion = before; records = f.codec.records;
    }
  } finally { f.dispose(); }
  assert.ok(records.disconnect(last, motion).checkpoint, 'pure records do not call the disposed controller');
});

test('independent player factory refuses unsupported worlds and freezes input and simulation on suspension', () => {
  const f = make(true), B = f.B, root = B.scene.createNode(); let body;
  const options = { profile: 'static-body-3', root, ownerId: 'fixture-0', name: 'fixture-0', groundAt: () => 0, clear: () => true };
  try {
    for (const changed of [{ profile: 'hub' }, { sites: [] }, { sleep: {} }, { supportAt: () => 0 }, { clear: null }, { ownerId: '' }])
      assert.throws(() => B.clankers.createPlayerBody({ ...options, ...changed }), /unsupported independent/);
    assert.equal(root.children.length, 0, 'invalid world options allocate no attached body');
    body = B.clankers.createPlayerBody(options);
    const codec = createClankerBodyCheckpoint(body, world);
    assert.equal(body.update(.25), false); assert.equal(body.control({ x: 1 }), false);
    codec.restore(f.codec.capture()); assert.equal(body.active, false);
    assert.equal(body.activate(), true); body.control({ x: 1, run: true }); body.update(.25);
    assert.throws(() => body.update(.26), /bounded/);
    const motion = () => {
      const e = body.player, p = e.root.position, d = e.drive;
      return [p.x, p.y, p.z, e.heading, d.vx, d.vy, d.vz, d.grounded, d.jumps];
    };
    const moving = motion();
    body.cancelInput();
    assert.equal(body.active, true, "clearing held controls does not surrender ownership");
    assert.deepEqual(motion(), moving, "blur preserves the current physical motion");
    assert.equal(body.player.drive.x, 0); assert.equal(body.player.drive.run, false);
    body.suspend(); const before = structuredClone(codec.motion());
    assert.equal(body.active, false); assert.equal(body.control({ x: -1 }), false); assert.equal(body.update(.25), false);
    assert.deepEqual(structuredClone(codec.motion()), before);
    assert.equal(body.player.drive.x, 0); assert.equal(body.player.drive.run, false);
    body.dispose(); body.dispose(); assert.equal(root.children.length, 0); assert.equal(body.activate(), false);
  } finally { body?.dispose(); f.dispose(); }
});
