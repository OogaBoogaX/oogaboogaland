import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';
import { createClankerBodyCheckpoint } from '../src/clanker-roaming.js';
const world = 'browser-wire-fixture-1';
const make = () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
  return { ...f, codec: createClankerBodyCheckpoint(f.sim, world) };
};

test('page-only decoder restores minimal signed-zero physics from packed host records, with no animation or resource continuation', () => {
  const source = make(), browser = make();
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', -0, 2, .25, -.5, -0, -1.5, Number.MIN_VALUE, 1, 4]);
    source.sim.player.health.value = 7;
    const stored = source.codec.capture(), wire = source.codec.records.transfer(stored);
    const decoder = browser.B.clankerBodyTransfer.forBody(browser.sim, world);
    assert.equal(decoder.restore(JSON.parse(JSON.stringify(wire))), true);
    const expected = source.sim.bodyCheckpoint.bodyState(), actual = browser.sim.bodyCheckpoint.bodyState();
    for (let i = 0; i < expected.length; i++) assert.ok(Object.is(actual[i], expected[i]), `physical slot ${i}`);
    assert.equal(browser.sim.player.animation.updates, 0);
    assert.equal(browser.sim.player.health.value, browser.sim.player.health.max);
    assert.throws(() => decoder.restore(wire), /transfer/);
    assert.deepEqual(source.codec.capture(), stored, 'wire projection cannot mutate persisted state');
  } finally { source.dispose(); browser.dispose(); }
});

test('wrong world, owner, profile, version, sparse/accessor tuples and extra state refuse before controlling the page body', () => {
  const source = make();
  try {
    source.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const wire = source.codec.records.transfer(source.codec.capture());
    const corrupt = [v => { v.world = 'other'; }, v => { v.body[0] = 'other'; }, v => { v.profile += ' '; },
      v => { v.v = 2; }, v => { v.ammo = 10; }, v => { delete v.body[1]; }, v => { v.body.push(1); },
      v => { v.body[2] = 10000; }, v => { v.body[9] = 32; }, v => { v.body[8] = '-zero'; },
      v => { Object.defineProperty(v.body, 1, { get() { throw Error('accessor executed'); } }); }];
    for (const alter of corrupt) {
      const f = make();
      try {
        const decoder = f.B.clankerBodyTransfer.forBody(f.sim, world), bad = structuredClone(wire); alter(bad);
        assert.throws(() => decoder.restore(bad), /transfer|profile/); assert.equal(f.sim.player, null);
        assert.throws(() => decoder.restore(wire), /transfer/, 'failed restore consumes the fresh body');
      } finally { f.dispose(); }
    }
  } finally { source.dispose(); }
});

test('wire bounds long identities and difficult numeric encodings without float rounding or quantity/history fields', t => {
  const f = make();
  try {
    const source = f.sim.bodyCheckpoint, owner = 'p'.repeat(80), baseline = source.baseline();
    const codec = f.B.clankerBodyTransfer.create({ world: 'w'.repeat(80), owner, baseline, rules: source.records });
    const values = [owner, -9999.999999999998, Number.MIN_VALUE, 9999.999999999998, -Math.PI,
      -9999.999999999998, -Number.MIN_VALUE, -0, 2, 30];
    const value = codec.encode(values), text = JSON.stringify(value), bytes = Buffer.byteLength(text);
    assert.ok(bytes <= f.B.clankerBodyTransfer.MAX_BYTES);
    const decoded = codec.read(JSON.parse(text));
    for (let i = 0; i < values.length; i++) assert.ok(Object.is(decoded[i], values[i]));
    const zeroCredits = [...values]; zeroCredits[8] = -0;
    assert.ok(Object.is(codec.read(JSON.parse(JSON.stringify(codec.encode(zeroCredits))))[8], -0));
    assert.deepEqual(Object.keys(value).sort(), ['body', 'profile', 'v', 'world']);
    t.diagnostic(JSON.stringify({ scope: 'adversarial component UTF-8 JSON; not a complete session or proof of maximum float encoding', bytes }));
  } finally { f.dispose(); }
});


test('live physical capture neither stops held controls nor changes the source trajectory, and remains bounded', t => {
  const f = make(), B = f.B, bodies = [];
  const newBody = () => {
    const sim = B.clankers.createPlayerBody({ profile: 'static-body-3', root: B.scene.createNode(),
      ownerId: 'fixture-0', name: 'fixture-0', groundAt: () => 0, clear: () => true });
    bodies.push(sim); return { sim, wire: B.clankerBodyTransfer.forBody(sim, world) };
  };
  try {
    f.sim.bodyCheckpoint.restoreBody(['fixture-0', 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const initial = f.codec.records.transfer(f.codec.capture()), subject = newBody(), reference = newBody();
    assert.throws(() => subject.wire.capture(), /transfer/);
    for (const value of [subject, reference]) {
      value.wire.restore(initial); assert.throws(() => value.wire.capture(), /transfer/);
      value.sim.activate(); value.sim.player.health.value = 7;
    }
    const state = sim => {
      const e = sim.player, d = e.drive;
      return { physical: Array.from(sim.bodyCheckpoint.liveBodyState()),
        held: [d.x, d.z, d.heading, d.run, d.jumpHeld, d.jumpDown, d.jumpPressed, d.jumpBuffer, d.cancelled],
        animation: e.animation.updates, health: e.health.value };
    };
    let latest, maxBytes = 0;
    for (let i = 0; i < 60; i++) {
      const command = { x: .6, z: .8, heading: .7, run: true, jumpPressed: i === 0, jumpHeld: i < 3 };
      for (const value of [subject, reference]) { value.sim.control(command); value.sim.update(.05); }
      const before = state(subject.sim);
      assert.throws(() => subject.sim.bodyCheckpoint.bodyState(), /profile/, 'neutral checkpoint contract remains strict');
      latest = JSON.parse(JSON.stringify(subject.wire.capture()));
      assert.deepEqual(state(subject.sim), before, 'capture changes no input, velocity, animation or resource');
      assert.deepEqual(state(subject.sim), state(reference.sim), 'capture frequency cannot change the driven trajectory');
      assert.deepEqual(Object.keys(latest).sort(), ['body', 'profile', 'v', 'world']);
      assert.equal(latest.body.length, 10);
      maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(latest)));
    }
    assert.ok(maxBytes <= B.clankerBodyTransfer.MAX_BYTES);
    for (const [object, key, bad] of [[subject.sim.player.drive, 'vx', Infinity],
      [subject.sim.player, 'capture', {}], [subject.sim.player.climb, 'active', true]]) {
      const previous = object[key]; object[key] = bad;
      assert.throws(() => subject.wire.capture(), /profile/);
      assert.equal(object[key], bad, 'capture refusal cannot repair or change the source');
      object[key] = previous;
    }
    const records = f.codec.records, packed = records.fromTransfer(latest);
    assert.deepEqual(Array.from(records.read(packed).body), Array.from(subject.sim.bodyCheckpoint.liveBodyState()));
    for (const patch of [{ world: "wrong" }, { profile: "wrong" }, { v: 2 }, { ammo: 7 }])
      assert.throws(() => records.fromTransfer({ ...latest, ...patch }), /transfer/);
    const wrongOwner = structuredClone(latest); wrongOwner.body[0] = "someone-else";
    assert.throws(() => records.fromTransfer(wrongOwner), /transfer/);
    const recovered = newBody(); recovered.wire.restore(latest); recovered.sim.activate();
    assert.deepEqual(Array.from(recovered.sim.bodyCheckpoint.bodyState()), Array.from(subject.sim.bodyCheckpoint.liveBodyState()));
    assert.equal(recovered.sim.player.health.value, recovered.sim.player.health.max);
    assert.equal(recovered.sim.player.drive.x, 0); assert.equal(recovered.sim.player.drive.run, false);
    subject.sim.suspend(); assert.throws(() => subject.wire.capture(), /transfer/);
    subject.sim.dispose(); assert.throws(() => subject.wire.capture(), /transfer/);
    f.dispose();
    assert.deepEqual(records.fromTransfer(latest), packed, 'conversion retains no live bootstrap controller');
    t.diagnostic(JSON.stringify({ captures: 60, maxComponentBytes: maxBytes,
      finalPackedBytes: Buffer.byteLength(JSON.stringify(packed)), scope: 'physical components only, excludes session and movement envelope' }));
  } finally { for (const sim of bodies) sim.dispose(); f.dispose(); }
});
