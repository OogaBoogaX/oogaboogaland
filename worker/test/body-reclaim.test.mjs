import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/js/body-reclaim.js';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';
import { createClankerBodyCheckpoint } from '../src/clanker-roaming.js';
import { fixture as terrainFixture, worldId as terrainWorld } from './fixtures/clanker-body-world-fixture.mjs';
const { create } = globalThis.BL.bodyReclaim;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const offer = (request = 'a'.repeat(32)) => ({ t: 'body-prepare', v: 2, request, accountId: 1,
  bodyId: 'gorilla:fixture', kind: 'clanker', world: 'body-reclaim-fixture', epoch: 2, expiresAt: 11000 });
const transfer = checkpoint => ({ v: 1, protocol: 'host-session-v5', world: 'body-reclaim-fixture',
  epoch: 2, revision: 19, at: 1000, expiresAt: 11000, resetResources: 'defaults',
  view: { accountId: 1, bodyId: 'gorilla:fixture', kind: 'clanker', generation: 7, state: 'offered', deadline: 61000 }, checkpoint });
const active = checkpoint => ({ t: 'body-active', request: offer().request, transfer: { ...transfer(checkpoint),
  revision: 20, at: 1200, expiresAt: 2200, view: { ...transfer(checkpoint).view, state: 'starting' } } });
const live = () => ({ t: 'body-live', request: offer().request, epoch: 2, generation: 7, revision: 20 });
function harness(adapter) {
  let now = 1000, mono = 1000, wall = 1000, next = 0; const sent = [], timers = new Map();
  const client = create({ send: m => sent.push(m), monotonic: () => mono, wall: () => wall,
    later: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, cancel: id => timers.delete(id) });
  client.setAdapter(adapter); client.open(1, 'connection', true);
  return { client, sent, timers, at(t, options = {}) { now = t; mono = options.mono ?? t; wall = options.wall ?? t; if (options.runTimers !== false) for (const [id, timer] of [...timers]) if (timer.at <= t) { timers.delete(id); timer.fn(); } } };
}

test('final body is newer than preflight, restored once, and never driven before the committed live receipt', async () => {
  const make = () => {
    const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
    return { ...f, codec: createClankerBodyCheckpoint(f.sim, offer().world, f.B.clankerState) };
  };
  const source = make(); let restored, prepared, applied = 0, preflights = 0, enabled = 0, disposed = 0;
  try {
    source.start(); source.sim.possess(source.sim.list[0]); source.codec.neutralize();
    for (let i = 0; i < 4; i++) source.step();
    source.sim.control({ x: 0, z: 0, heading: .7, jumpPressed: true, jumpHeld: true });
    source.step(); source.codec.neutralize(); source.sim.player.health.value = 12;
    const h = harness({ prepare: async () => (prepared = { preview: make(), body: (restored = make()) }),
      preflight(f, t) { preflights++; f.preview.codec.restore(t.checkpoint); return true; },
      apply(f, t) { applied++; f.body.codec.restore(t.checkpoint); return true; },
      activate(f) { assert.equal(f.body, restored); enabled++; return true; },
      release(f) { disposed++; f.preview.dispose(); f.body.dispose(); } });
    assert.equal(h.client.message(offer()), true); assert.equal(h.client.state.phase, 'preparing');
    assert.equal(h.client.allows('pose', offer().bodyId), false); await flush();
    assert.equal(h.sent.at(-1).t, 'body-ready'); assert.equal(h.timers.size, 1);
    const grant = { t: 'body-grant', request: offer().request, transfer: transfer(source.codec.capture()) };
    assert.equal(h.client.message(grant), true); assert.equal(h.sent.at(-1).t, 'body-applied');
    assert.equal(h.client.allows('pose', offer().bodyId), false);
    assert.equal(prepared.preview.sim.player.drive.jumps, 1);
    assert.equal(restored.sim.player, null, 'the final fresh controller has not consumed the older preflight');
    assert.equal(h.client.message(grant), true); assert.equal(preflights, 1); assert.equal(applied, 0);
    source.step(); source.codec.neutralize();
    const activation = active(source.codec.capture()), wrong = structuredClone(activation); wrong.transfer.view.generation++;
    assert.equal(h.client.message(wrong), false); assert.equal(enabled, 0);
    assert.equal(h.client.message(activation), true); assert.equal(h.sent.at(-1).t, 'body-started');
    assert.equal(enabled, 0); assert.equal(h.client.allows('pose', offer().bodyId), false);
    assert.equal(restored.sim.player.drive.jumps, 1); assert.equal(restored.sim.player.drive.airborne, true);
    assert.equal(restored.sim.player.health.value, restored.sim.player.health.max); assert.equal(restored.sim.player.animation.updates, 0);
    assert.deepEqual(structuredClone(restored.codec.motion()), structuredClone(source.codec.motion()));
    assert.equal(h.client.message(activation), true); assert.equal(applied, 1);
    assert.equal(h.client.message({ ...live(), generation: 8 }), false); assert.equal(enabled, 0);
    assert.equal(h.client.message(live()), true); assert.equal(h.client.message(live()), true);
    assert.equal(enabled, 1); assert.equal(h.timers.size, 0);
    assert.equal(h.client.allows('pose', offer().bodyId), true);
    assert.equal(h.client.allows('pose', 'another-body'), false);
    assert.equal(h.client.allows('body', offer().bodyId), false, 'legacy claims never replace an authoritative grant');
    assert.equal(h.client.message({ ...offer('d'.repeat(32)), v: 3, epoch: 3 }), false);
    assert.equal(h.client.allows('pose', offer().bodyId), false, 'incompatible newer authority revokes old controls');
    assert.equal(h.client.message(offer()), false, 'older compatible preparation cannot undo the newer fence');
    h.client.close(); assert.equal(disposed, 1); assert.equal(h.client.allows('pose', offer().bodyId), false);
    h.client.open(1, 'older-room', false); assert.equal(h.client.allows('pose', offer().bodyId), false);
  } finally { source.dispose(); }
});

test('disconnect, replacement and expiry fence asynchronous preparation and keep only one resource in flight', async () => {
  let finish, starts = 0; const released = [];
  const h = harness({ prepare() { starts++; return new Promise(resolve => { finish = resolve; }); },
    preflight: () => true, apply: () => true, activate: () => true, release: resource => released.push(resource) });
  h.client.message(offer()); await flush(); h.client.close(); h.client.open(1, 'replacement', true);
  const second = offer('b'.repeat(32));
  assert.equal(h.client.message(second), false); assert.equal(starts, 1);
  finish('old-resource'); await flush(); assert.deepEqual(released, ['old-resource']);
  assert.deepEqual(h.sent, [{ t: 'body-decline', request: second.request }]);
  const third = offer('c'.repeat(32));
  assert.equal(h.client.message(third), true); await flush(); assert.equal(starts, 2);
  h.at(11000); finish('expired-resource'); await flush();
    assert.deepEqual(released, ['old-resource', 'expired-resource']);
    assert.deepEqual(h.sent, [{ t: 'body-decline', request: second.request }, { t: 'body-decline', request: third.request }]); assert.equal(h.timers.size, 0);
  assert.equal(h.client.allows('pose', offer().bodyId), false);
  assert.equal(h.client.allows('mute', offer().bodyId), true, 'voice is not part of body reclaim');
});

test('wrong identity, mixed versions, oversized or changed grants and a lost activation fail closed', async () => {
  for (const variant of ['changed', 'timeout', 'version', 'identity', 'oversize', 'private-token', 'failed-apply']) {
    let applied = 0, released = 0;
    const h = harness({ prepare: () => ({}), preflight() { applied++; return variant !== 'failed-apply'; }, apply: () => true,
      activate: () => true, release() { released++; } });
    assert.equal(h.client.message({ ...offer(), accountId: 2 }), false);
    h.client.message(offer()); await flush();
    const good = { t: 'body-grant', request: offer().request, transfer: transfer({ data: 'fixture' }) };
    const bad = structuredClone(good);
    if (variant === 'version') bad.transfer.protocol = 'host-session-v4';
    if (variant === 'identity') bad.transfer.view.accountId = 2;
    if (variant === 'oversize') bad.transfer.checkpoint.data = 'x'.repeat(32768);
    if (variant === 'private-token') bad.transfer.view.token = 'private-host-token';
    if (['version', 'identity', 'oversize', 'private-token'].includes(variant)) {
      assert.equal(h.client.message(bad), false); assert.equal(applied, 0);
    } else {
      assert.equal(h.client.message(good), variant !== 'failed-apply');
      if (variant === 'changed') { bad.transfer.checkpoint.data = 'changed'; assert.equal(h.client.message(bad), false); }
    }
    h.at(11000); assert.equal(h.client.allows('pose', offer().bodyId), false);
    assert.equal(h.client.message(live()), false); assert.equal(released, 1); assert.equal(h.timers.size, 0);
  }
  const old = harness(null); old.client.open(1, 'new-version-room', false, true);
  assert.equal(old.client.allows('pose', offer().bodyId), false);
  assert.equal(old.client.message(offer()), false, 'unsupported negotiation never falls back to v1');
});


test('delays, duplicate replies and arbitrary server clock offsets cannot extend the inactive wait', async () => {
  for (const offset of [-100000, 0, 8000000000000]) {
    let enabled = 0, applied = 0;
    const h = harness({ prepare: () => ({}), preflight: () => true, apply() { applied++; return true; },
      activate() { enabled++; return true; }, release() {} });
    const shift = value => { value.at += offset + 200000; value.expiresAt += offset + 200000; value.view.deadline += offset + 200000; return value; };
    h.client.message(offer()); await flush();
    const grant = { t: 'body-grant', request: offer().request, transfer: shift(transfer({ fixture: true })) };
    assert.equal(h.client.message(grant), true);
    h.at(1600, { runTimers: false }); assert.equal(h.client.message(grant), true);
    const final = active({ fixture: true }); final.transfer = shift(final.transfer);
    assert.equal(h.client.message(final), true); assert.equal(applied, 1); assert.equal(enabled, 0);
    h.at(1900, { runTimers: false }); assert.equal(h.client.message(final), true);
    h.at(2000, { runTimers: false });
    assert.equal(h.client.message(live()), false, 'first request, not final receipt or duplicate arrival, owns the timeout');
    assert.equal(enabled, 0); assert.equal(h.client.state.phase, 'blocked');
  }
});

test('clock reversal, system sleep and a late timer cannot activate an expired final body', async () => {
  for (const clockCase of ['backward-wall', 'backward-mono', 'sleep', 'delay', 'suspend']) {
    let released = 0, enabled = 0;
    const h = harness({ prepare: () => ({}), preflight: () => true, apply: () => true,
      activate() { enabled++; return true; }, release() { released++; } });
    h.client.message(offer()); await flush();
    h.client.message({ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) });
    h.client.message(active({ fixture: true }));
    if (clockCase === 'backward-wall') h.at(1500, { wall: 900, runTimers: false });
    if (clockCase === 'backward-mono') h.at(1500, { mono: 900, runTimers: false });
    if (clockCase === 'sleep') h.at(3000, { mono: 1000, wall: 3000, runTimers: false });
    if (clockCase === 'delay') h.at(3000, { runTimers: false });
    if (clockCase === 'suspend') h.client.suspend();
    assert.equal(h.client.message(live()), false); assert.equal(enabled, 0); assert.equal(released, 1);
    assert.equal(h.client.allows('pose', offer().bodyId), false);
  }
});

test('final application time consumes its remaining wait and altered final duplicates never reset the body', async () => {
  for (const slow of [false, true]) {
    let applied = 0, enabled = 0;
    const h = harness({ prepare: () => ({}), preflight: () => true,
      apply() { applied++; if (slow) h.at(2001, { runTimers: false }); return true; },
      activate() { enabled++; return true; }, release() {} });
    h.client.message(offer()); await flush();
    h.client.message({ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) });
    const final = active({ fixture: true }); assert.equal(h.client.message(final), !slow);
    if (!slow) { final.transfer.checkpoint.fixture = false; assert.equal(h.client.message(final), false); }
    assert.equal(h.client.message(live()), false); assert.equal(enabled, 0); assert.equal(applied, 1);
  }
});

test('scene adapter teardown releases its body before decline and keeps voice available without repeating the close', async () => {
  let driving = false, releases = 0;
  const h = harness({ prepare: () => ({}), preflight: () => true, apply: () => true,
    activate() { driving = true; return true; }, release() { driving = false; releases++; } });
  h.client.message(offer()); await flush();
  h.client.message({ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) });
  h.client.message(active({ fixture: true })); h.client.message(live()); assert.equal(driving, true);
  h.client.setAdapter(null);
  assert.equal(driving, false); assert.equal(releases, 1); assert.equal(h.client.state.phase, 'blocked');
  assert.deepEqual(h.sent.at(-1), { t: 'body-decline', request: offer().request });
  assert.equal(h.client.allows('mute', offer().bodyId), true);
  h.client.setAdapter(null); h.client.suspend(); h.client.close();
  assert.equal(releases, 1); assert.equal(h.sent.filter(m => m.t === 'body-decline').length, 1);
});

test('independent source player factory follows grant/ACK ownership without consuming the NPC track', async () => {
  const npcWorld = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1' });
  const reference = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1' });
  const B = npcWorld.B, npc = npcWorld.sim.list[0], root = npc.root.parent;
  const makeBody = parent => {
    const sim = B.clankers.createPlayerBody({ profile: 'static-body-3', root: parent,
      ownerId: npc.owner.id, name: npc.owner.traits.name, groundAt: () => 0, clear: () => true });
    return { sim, codec: createClankerBodyCheckpoint(sim, offer().world) };
  };
  const server = makeBody(B.scene.createNode()); let clientBody, attachedView, resource, previews = 0, activated = 0;
  const p = npc.root.position;
  // An authored trusted first-login admission at the current source NPC position.
  // The production account/NPC mapping is not provided by this fixture.
  server.sim.bodyCheckpoint.restoreBody([npc.owner.id, p.x, p.y, p.z, npc.heading, 0, 0, 0, 0, 1]);
  server.sim.activate();
  const snapshot = () => server.codec.records.transfer(server.codec.capture());
  const adapter = B.clankerBodyTransfer.reclaimAdapter({ world: offer().world,
    createBody(_, preview) {
      const body = makeBody(preview ? B.scene.createNode() : root);
      if (preview) previews++; else clientBody = body;
      return body.sim;
    }, attach(body, preparation, view) {
      assert.equal(body, clientBody.sim); assert.equal(preparation.bodyId, offer().bodyId);
      attachedView = view; activated++; return true;
    }, detach() {} });
  const prepare = adapter.prepare;
  adapter.prepare = preparation => (resource = prepare(preparation));
  const h = harness(adapter);
  try {
    const initial = snapshot();
    h.client.message(offer()); await flush();
    assert.equal(clientBody.sim.activate(), false, 'dormant body has no restored player');
    assert.throws(() => adapter.capture(resource), /transfer/);
    assert.equal(clientBody.sim.control({ x: 1 }), false);
    h.client.message({ t: 'body-grant', request: offer().request, transfer: transfer(initial) });
    assert.equal(previews, 1); assert.equal(clientBody.sim.player, null);
    // A newer authoritative frozen checkpoint must also resume with zero momentum.
    server.sim.control({ x: .6, z: .8, heading: .7, jumpPressed: true, jumpHeld: true });
    server.sim.update(.25); server.codec.disconnect();
    const final = active(snapshot());
    final.transfer.view.equipment = { mode: "carry" };
    assert.equal(h.client.message(final), true);
    assert.equal(clientBody.sim.active, false); assert.equal(clientBody.sim.update(.25), false);
    assert.equal(clientBody.sim.control({ jumpPressed: true }), false);
    assert.throws(() => adapter.capture(resource), /transfer/, 'no live capture before final live attachment');
    assert.deepEqual(structuredClone(clientBody.codec.motion()), structuredClone(server.codec.motion()));
    assert.notEqual(clientBody.sim.player, npc); assert.notEqual(clientBody.sim.player.owner, npc.owner);
    assert.equal(npc.controlled, false); assert.equal(npc.remoteControlled, false);
    h.client.message(live()); assert.equal(activated, 1); assert.equal(clientBody.sim.active, true);
    assert.deepEqual(structuredClone(attachedView), final.transfer.view);
    attachedView.equipment.mode = "combat";
    assert.equal(final.transfer.view.equipment.mode, "carry", "scene attachment cannot mutate the final receipt");
    for (let i = 0; i < 8; i++) {
      clientBody.sim.control({ x: 1, z: 0, heading: .5 }); clientBody.sim.update(.25);
      npcWorld.step(); reference.step();
      const expected = reference.sim.list[0];
      assert.deepEqual([npc.root.position.x, npc.root.position.y, npc.root.position.z, npc.heading, npc.phase, npc.goalX, npc.goalZ],
        [expected.root.position.x, expected.root.position.y, expected.root.position.z, expected.heading, expected.phase, expected.goalX, expected.goalZ]);
    }
    assert.notEqual(clientBody.sim.player.root.position.x, npc.root.position.x);
    const liveSample = adapter.capture(resource);
    assert.equal(liveSample.world, offer().world); assert.equal(liveSample.body[0], npc.owner.id);
    assert.equal(clientBody.sim.player.drive.x, 1);
    h.client.close();
    assert.throws(() => adapter.capture(resource), /transfer/, 'released resource cannot produce another sample'); assert.equal(clientBody.sim.active, false); assert.equal(clientBody.sim.control({ x: 1 }), false);
    assert.equal(root.children.length, 1); assert.equal(root.children[0], npc.root);
    assert.equal(npc.root.visible, true); assert.equal(npc.controlled, false);
  } finally { h.client.close(); server.sim.dispose(); npcWorld.dispose(); reference.dispose(); }
});

test('page reclaim adapter fences changed placement and unwinds failed scene attachment without moving the restored body', async () => {
  for (const change of ['unchanged', 'support-removed', 'support-before-apply', 'obstacle-added', 'attach-failed', 'attach-threw', 'attach-suspended']) {
    const f = terrainFixture(), source = f.make(); f.seed(source);
    let body, releases = 0, attached = 0, detached = 0;
    const h = harness(f.B.clankerBodyTransfer.reclaimAdapter({ world: terrainWorld,
      createBody(_, preview) {
        const value = f.make();
        if (!preview) {
          body = value; const dispose = value.sim.dispose;
          value.sim.dispose = () => { releases++; dispose(); };
        }
        return value.sim;
      }, attach() {
        attached++;
        if (change === 'attach-threw') throw Error('scene attachment failed');
        if (change === 'attach-suspended') h.client.suspend();
        return change !== 'attach-failed';
      },
      detach() { detached++; } }));
    try {
      const saved = source.codec.records.transfer(source.codec.capture());
      assert.equal(h.client.message({ ...offer(), world: terrainWorld }), true); await flush();
      assert.equal(h.client.message({ t: 'body-grant', request: offer().request,
        transfer: { ...transfer(saved), world: terrainWorld } }), true);
      if (change === "support-before-apply") f.removeSupport();
      const final = active(saved); final.transfer.world = terrainWorld;
      assert.equal(h.client.message(final), true);
      const entry = body.sim.player, before = structuredClone(body.codec.motion()), updates = entry.animation.updates;
      assert.equal(body.sim.active, false); assert.equal(body.sim.control({ jumpPressed: true }), false);
      if (change === 'support-removed') f.removeSupport();
      if (change === 'obstacle-added') {
        const obstacle = f.B.scene.createNode({ geometry: f.B.models.box({ w: .5, h: 6, d: 40, color: '#888888' }),
          position: { x: 0, y: 5, z: 0 } });
        f.B.scene.addChild(f.root, obstacle); f.props.add(obstacle); f.props.sync();
      }
      const accepted = ['unchanged', 'support-removed', 'support-before-apply'].includes(change);
      assert.equal(h.client.message(live()), accepted);
      assert.equal(body.sim.active, accepted); assert.equal(h.client.allows('pose', offer().bodyId), accepted);
      assert.equal(releases, accepted ? 0 : 1);
      assert.deepEqual([entry.root.position.x, entry.root.position.y, entry.root.position.z,
        entry.drive.vx, entry.drive.vy, entry.drive.vz, entry.drive.grounded],
      [before.x, before.y, before.z, before.vx, before.vy, before.vz, change === "support-removed" ? false : before.grounded]);
      assert.equal(entry.animation.updates, updates, 'final validation cannot replay pose or animation');
      if (change.startsWith('support-')) {
        assert.equal(entry.drive.vy, 0, 'support correction adds no momentum');
        assert.equal(body.sim.update(.05), true);
        assert.ok(entry.root.position.y < before.y, 'gravity starts only after acknowledged live control');
      }
      if (!accepted) {
        assert.equal(h.client.state.phase, 'blocked'); assert.equal(h.client.message(live()), false);
        assert.deepEqual(h.sent.at(-1), { t: 'body-decline', request: offer().request });
        assert.equal(h.sent.filter(m => m.t === 'body-decline').length, 1);
        assert.equal(h.client.allows('mute', offer().bodyId), true, 'body refusal leaves voice controls available');
        assert.equal(body.sim.control({ jumpPressed: true }), false); assert.equal(body.sim.update(.05), false);
      }
    } finally { h.client.close(); f.dispose(); }
    assert.equal(releases, 1);
    assert.equal(attached, ['unchanged', 'support-removed', 'support-before-apply', 'attach-failed', 'attach-threw', 'attach-suspended'].includes(change) ? 1 : 0);
    assert.equal(detached, attached, 'partial scene attachment is always unwound');
  }
});


test('synchronous scene teardown cannot revive a disposed body or clear a replacement handoff', async () => {
  for (const stage of ['preflight', 'apply', 'activate']) for (const interrupt of ['close', 'suspend', 'replace', 'new-offer'])
    for (const throws of [false, true]) {
      let released = 0, calls = 0, driving = false;
      const newer = offer('b'.repeat(32));
      const adapter = { prepare: () => ({}), preflight: () => true, apply: () => true,
        activate() { driving = true; return true; }, release() { released++; driving = false; } };
      adapter[stage] = () => {
        calls++; if (stage === 'activate') driving = true;
        if (interrupt === 'close') h.client.close();
        if (interrupt === 'suspend') h.client.suspend();
        if (interrupt === 'replace') h.client.setAdapter(null);
        if (interrupt === 'new-offer') assert.equal(h.client.message(newer), true);
        if (throws) throw Error('attachment failed after scene changed');
        return true;
      };
      const h = harness(adapter);
      h.client.message(offer()); await flush();
      const messages = [{ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) }, active({ fixture: true }), live()];
      const index = ['preflight', 'apply', 'activate'].indexOf(stage);
      for (let i = 0; i <= index; i++) assert.equal(h.client.message(messages[i]), i < index);
      assert.equal(calls, 1); assert.equal(released, 1); assert.equal(driving, false);
      assert.equal(h.client.active, false); assert.equal(h.client.allows('pose', offer().bodyId), false);
      assert.equal(h.client.allows('mute', offer().bodyId), true);
      assert.equal(h.sent.some(m => m.request === offer().request && m.t === ['body-applied', 'body-started', 'impossible'][index]), false);
      if (interrupt === 'new-offer') {
        assert.equal(h.client.state.phase, 'preparing', 'old callback must not clear the replacement');
        await flush(); assert.equal(h.client.state.phase, 'ready');
        assert.equal(h.sent.at(-1).request, newer.request);
      } else assert.equal(h.client.state.phase, 'blocked');
      h.client.close();
    }
});

test('recursive receipts cannot reenter a recovery callback, and callback time cannot extend the deadline', async () => {
  for (const stage of ['preflight', 'apply', 'activate']) for (const slow of [false, true]) {
    let calls = 0, released = 0, driving = false;
    const messages = [{ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) }, active({ fixture: true }), live()];
    const index = ['preflight', 'apply', 'activate'].indexOf(stage);
    const adapter = { prepare: () => ({}), preflight: () => true, apply: () => true,
      activate() { driving = true; return true; }, release() { released++; driving = false; } };
    adapter[stage] = () => {
      calls++; if (stage === 'activate') driving = true;
      assert.equal(h.client.message(messages[index]), false, 'nested receipt must not invoke another callback');
      if (slow) h.at(stage === 'preflight' ? 11001 : 2001, { runTimers: false });
      return true;
    };
    const h = harness(adapter); h.client.message(offer()); await flush();
    for (let i = 0; i <= index; i++) assert.equal(h.client.message(messages[i]), i < index || !slow);
    assert.equal(calls, 1);
    if (slow) {
      assert.equal(released, 1); assert.equal(driving, false); assert.equal(h.client.active, false);
      assert.equal(h.client.message(live()), false); assert.equal(h.client.allows('pose', offer().bodyId), false);
      assert.deepEqual(h.sent.at(-1), { t: 'body-decline', request: offer().request });
    }
    h.client.close();
  }
});

test('live movement capture retains one sample until the exact durable ACK and survives callback teardown safely', async () => {
  let captures = 0, releases = 0, x = 1, closeOnCapture = false, client;
  const h = harness({ prepare: () => ({}), preflight: () => true, apply: () => true, activate: () => true,
    capture() { captures++; if (closeOnCapture === true) client.close();
      return closeOnCapture === 'encode' ? { toJSON() { client.close(); return { x }; } } : { x }; }, release() { releases++; } });
  client = h.client;
  assert.equal(client.captureMovement(), null);
  client.message(offer()); await flush();
  client.message({ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) });
  client.message(active({ fixture: true })); assert.equal(client.captureMovement(), null);
  client.message(live()); const sent = h.sent.length;
  const first = client.captureMovement();
  assert.deepEqual(first, { t: 'body-motion', request: offer().request, sequence: 1, checkpoint: { x: 1 } });
  first.checkpoint.x = 99; x = 2;
  assert.equal(client.captureMovement().checkpoint.x, 1); assert.equal(captures, 1);
  assert.equal(h.sent.length, sent, 'capture neither transmits nor starts a new timer');
  const ack = { t: 'body-motion-ack', request: offer().request, generation: 7, sequence: 1 };
  for (const bad of [{ ...ack, generation: 8 }, { ...ack, request: 'b'.repeat(32) }, { ...ack, sequence: 2 }, { ...ack, extra: 1 }])
    assert.equal(client.message(bad), false);
  assert.equal(client.message(ack), true); assert.equal(client.message(ack), true);
  assert.equal(client.captureMovement().checkpoint.x, 2); assert.equal(captures, 2);
  assert.equal(client.message(ack), false, 'old ACK cannot clear a newer sample');
  assert.equal(client.message({ ...ack, sequence: 2 }), true);
  closeOnCapture = true;
  assert.equal(client.captureMovement(), null); assert.equal(client.active, false); assert.equal(releases, 1);
  assert.equal(client.captureMovement(), null);
  closeOnCapture = false; client.open(1, 'replacement', true);
  client.message(offer()); await flush();
  client.message({ t: 'body-grant', request: offer().request, transfer: transfer({ fixture: true }) });
  client.message(active({ fixture: true })); client.message(live());
  closeOnCapture = 'encode';
  assert.equal(client.captureMovement(), null); assert.equal(client.active, false); assert.equal(releases, 2);
});


test('final activation cannot replace the original grace deadline or move server time backward', async () => {
  let applied = 0;
  const h = harness({ prepare: () => ({}), preflight: () => true, apply: () => { applied++; return true; },
    activate: () => true, release() {} });
  h.client.message(offer()); await flush();
  assert.equal(h.client.message({ t: 'body-grant', request: offer().request, transfer: transfer({}) }), true);
  for (const patch of [{ deadline: 62000 }, { deadline: 60000 }, { at: 999, expiresAt: 1999 }]) {
    const message = active({});
    if (patch.deadline) message.transfer.view.deadline = patch.deadline;
    else Object.assign(message.transfer, patch);
    assert.equal(h.client.message(message), false);
    assert.equal(applied, 0); assert.equal(h.client.active, false);
  }
  assert.equal(h.client.message(active({})), true); assert.equal(applied, 1);
  assert.equal(h.client.message(live()), true); assert.equal(h.client.active, true);
});

test('a negotiated offer without a scene adapter is explicitly declined without acquiring control', () => {
  const h = harness(null);
  const request = offer(); assert.equal(h.client.message(request), false);
  assert.deepEqual(h.sent, [{ t: 'body-decline', request: request.request }]);
  assert.equal(h.client.active, false); assert.equal(h.timers.size, 0);
  assert.equal(h.client.allows('mute', request.bodyId), true);
});
