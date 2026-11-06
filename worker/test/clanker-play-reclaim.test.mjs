// Actual controls/controller modules over the authored empty meadow. DOM and
// camera-handoff services are fixtures; no Hub, scene, renderer or browser runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';

function fixture(onAttach = () => true, onDetach = () => {}) {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1' }), B = f.B;
  const nodes = [], noop = () => {}, node = () => {
    const listeners = new Map(), value = { hidden: true, dataset: {}, style: { removeProperty: noop, setProperty: noop },
      classList: { toggle: noop, remove: noop }, hasPointerCapture: () => false,
      addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      get listenerCount() { return [...listeners.values()].reduce((n, callbacks) => n + callbacks.size, 0); } };
    nodes.push(value); return value;
  };
  const reticle = node(), canvas = node(), document = { ...node(), body: node(), getElementById: () => reticle, pointerLockElement: null };
  Object.assign(f.context.window, node());
  Object.assign(f.context, { document, performance: { now: () => 1000 } });
  B.controls = { uiKey: () => false };
  const camera = B.scene.createCamera(); Object.assign(camera.position, { x: 2, y: 10, z: 12 });
  Object.assign(camera.target, { x: 2, y: 8, z: 3 });
  const axes = { x: 0, y: 0, yaw: 0, orbitYaw: 0, pitch: 0, peek: false, shiftTap: false };
  const pilot = { player: null, orbit: {}, external: false, cursor: { stop: noop }, goPreset: noop, release: noop,
    controls: { clearPointer: noop, read: () => axes }, setExternalControl(on) { this.external = on; },
    cameraHandoff: { cancel: noop, begin: noop, apply: noop, capture: out => out },
    captureControl(out) { return Object.assign(out, { active: false, combat: false, view: 'orbit', yaw: 0, pitch: .3,
      distance: 9, height: 10, eyeX: camera.position.x, eyeY: camera.position.y, eyeZ: camera.position.z,
      fov: camera.fov, side: 1, focused: false }); } };
  const hud = { el: { tooltip: node(), tooltipText: node(), act: node(), gorillaSmash: node() },
    tooltip: { hide: noop, show: noop }, setGorilla: noop, setAct: noop, setGorillaSmashPower: noop };
  new Script(readFileSync(new URL('../../src/js/clanker-play.js', import.meta.url), 'utf8')).runInContext(f.context);
  const npc = f.sim.list[0], root = npc.root.parent;
  const body = B.clankers.createPlayerBody({ profile: 'static-body-3', root,
    ownerId: npc.owner.id, name: npc.owner.traits.name, groundAt: () => 0, clear: () => true });
  body.bodyCheckpoint.restoreBody([npc.owner.id, 2, 8, 3, .7, 0, 0, 0, 0, 1], false, true);
  assert.equal(body.activate(), true);
  let play, detached = 0, released = 0;
  play = B.clankerPlay.create({ canvas, camera, renderer: { size: { width: 100, height: 100 } }, pilot, hud, clankers: f.sim,
    attachPlayer: (entry, view, scope) => onAttach({ play, body, entry, view, scope, pilot }), detachPlayer: () => { detached++; onDetach(); } });
  const view = { kind: 'clanker', accountId: 1, bodyId: 'gorilla:fixture-0', generation: 1, state: 'starting', equipment: { mode: 'carry' } };
  const scope = { world: 'fixture-world', epoch: 1, revision: 2 };
  return { ...f, play, body, pilot, npc, axes, view, scope,
    attach: () => play.attachBody(body, { view, scope, onRelease: () => { released++; } }),
    counts: () => ({ detached, released }), listeners: () => nodes.reduce((n, value) => n + value.listenerCount, 0),
    close() { play.dispose(); body.dispose(); f.dispose(); } };
}

test('private reclaim attachment forwards scope, resumes gravity and drives only the independent body', () => {
  let received;
  const f = fixture(args => { received = args; return true; });
  try {
    const npcPosition = { ...f.npc.root.position };
    assert.equal(f.attach(), true); assert.equal(received.scope, f.scope); assert.equal(received.view, f.view);
    assert.equal(received.entry, f.body.player); assert.equal(f.play.independent, true); assert.equal(f.pilot.external, true);
    assert.equal(f.sim.player, null); assert.equal(f.npc.controlled, false);
    assert.equal(f.play.action('gorilla-smash'), false, 'restricted body adapter cannot replay combat');
    f.axes.x = 1; f.play.readInput(.1); f.play.stepBody(.1);
    assert.ok(f.body.player.root.position.y < 8, 'gravity resumes after activation');
    assert.deepEqual({ ...f.npc.root.position }, npcPosition, 'local controls do not consume or move the NPC');
    assert.equal(f.play.release(false), true); assert.equal(f.play.active, false); assert.equal(f.body.active, false);
    assert.equal(f.pilot.external, false); assert.deepEqual(f.counts(), { detached: 1, released: 0 });
    f.play.dispose(); assert.equal(f.listeners(), 0);
  } finally { f.close(); }
});

test('scene release or disposal during reclaim attachment cannot reactivate the released body or camera', () => {
  for (const dispose of [false, true]) {
    const f = fixture(({ play }) => { if (dispose) play.dispose(); else play.release(); return true; });
    try {
      assert.equal(f.attach(), false); assert.equal(f.play.active, false); assert.equal(f.play.independent, false);
      assert.equal(f.body.active, false); assert.equal(f.pilot.external, false); assert.equal(f.sim.player, null);
      assert.deepEqual(f.counts(), { detached: 1, released: 1 });
      assert.equal(f.play.stepBody(.1), false); f.play.dispose(); assert.equal(f.listeners(), 0);
    } finally { f.close(); }
  }
});

test('refused, suspended or throwing scene attachments release controls and leave NPC ownership untouched', () => {
  for (const outcome of ['refuse', 'suspend', 'throw']) {
    const f = fixture(({ body }) => {
      if (outcome === 'throw') throw Error('fixture attachment failure');
      if (outcome === 'suspend') body.suspend();
      return outcome !== 'refuse';
    });
    try {
      if (outcome === 'throw') assert.throws(f.attach, /fixture attachment failure/);
      else assert.equal(f.attach(), false);
      assert.equal(f.play.active, false); assert.equal(f.pilot.external, false); assert.equal(f.body.active, false);
      assert.equal(f.sim.player, null); assert.deepEqual(f.counts(), { detached: 1, released: 0 });
    } finally { f.close(); }
  }
});

test('a throwing scene detach still removes controls listeners during disposal', () => {
  const f = fixture(() => true, () => { throw Error('fixture detach failure'); });
  try {
    assert.equal(f.attach(), true); assert.ok(f.listeners() > 0);
    assert.throws(() => f.play.dispose(), /fixture detach failure/);
    assert.equal(f.body.active, false); assert.equal(f.play.active, false);
    assert.equal(f.pilot.external, false);
    assert.equal(f.listeners(), 0, 'failed teardown must not leave a retained keyboard or pointer controller');
    assert.equal(f.attach(), false, 'disposed controls cannot attach a replacement body');
    f.play.dispose(); assert.deepEqual(f.counts(), { detached: 1, released: 1 });
  } finally { f.close(); }
});

test('reclaim coordinator, body decoder and controls jointly gate gravity and release without consuming the NPC', async () => {
  for (const ending of ['server-stop', 'scene-leave', 'socket-close']) {
    const f = fixture(), B = f.B, root = f.npc.root.parent, sent = [], timers = new Map();
    const world = 'controls-reclaim-fixture', request = 'a'.repeat(32);
    new Script(readFileSync(new URL('../../src/js/body-reclaim.js', import.meta.url), 'utf8')).runInContext(f.context);
    const codec = B.clankerBodyTransfer.create({ world, baseline: f.body.bodyCheckpoint.baseline(),
      owner: f.npc.owner.id, rules: f.body.bodyCheckpoint.records });
    const checkpoint = codec.encode(f.body.bodyCheckpoint.liveBodyState());
    f.body.dispose();
    const npcPosition = { ...f.npc.root.position };
    let body, serial = 0;
    const client = B.bodyReclaim.create({ send: m => sent.push(m), monotonic: () => 1000, wall: () => 1000,
      later(fn) { timers.set(++serial, fn); return serial; }, cancel: id => timers.delete(id) });
    client.setAdapter(B.clankerBodyTransfer.reclaimAdapter({ world,
      createBody(_, preview) {
        const made = B.clankers.createPlayerBody({ profile: 'static-body-3', root, ownerId: f.npc.owner.id,
          name: f.npc.owner.traits.name, groundAt: () => 0, clear: () => true });
        if (!preview) body = made;
        return made;
      },
      attach: (sim, _, view, scope) => f.play.attachBody(sim, { view, scope, onRelease: () => client.suspend() }),
      detach: sim => f.play.detachBody(sim) }));
    client.open(1, 'fixture-connection', true);
    const preparation = { t: 'body-prepare', v: 2, request, accountId: 1, bodyId: 'player:1',
      kind: 'clanker', world, epoch: 2, expiresAt: 11000 };
    const transfer = { v: 1, protocol: 'host-session-v5', world, epoch: 2, revision: 19, at: 1000,
      expiresAt: 11000, resetResources: 'defaults', checkpoint,
      view: { accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 7,
        state: 'offered', deadline: 61000, equipment: { mode: 'carry' } } };
    const live = { t: 'body-live', request, epoch: 2, generation: 7, revision: 20 };
    try {
      assert.equal(client.message(preparation), true);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(sent.at(-1).t, 'body-ready');
      assert.equal(client.message({ t: 'body-grant', request, transfer }), true);
      assert.equal(client.message({ t: 'body-active', request, transfer: { ...transfer, revision: 20,
        expiresAt: 2000, view: { ...transfer.view, state: 'starting' } } }), true);
      assert.equal(f.play.active, false); assert.equal(f.play.stepBody(.1), false);
      assert.equal(body.active, false); assert.equal(body.player.root.parent.visible, false);
      assert.deepEqual({ ...body.player.root.position }, { x: 2, y: 8, z: 3 });
      assert.equal(body.player.health.value, body.player.health.max);
      assert.equal(client.message({ ...live, generation: 6 }), false);
      assert.equal(client.message(live), true); assert.equal(client.message(live), true);
      assert.equal(f.play.independent, true); assert.equal(body.player.root.parent, root);
      assert.equal(f.pilot.external, true); assert.equal(timers.size, 0);
      f.axes.x = 1; f.play.readInput(.1); f.play.stepBody(.1);
      assert.ok(body.player.root.position.y < 8, 'only committed live control resumes gravity');
      assert.deepEqual({ ...f.npc.root.position }, npcPosition); assert.equal(f.sim.player, null);
      const sample = client.captureMovement(); assert.ok(sample);
      assert.equal(sample.checkpoint.body[0], f.npc.owner.id);
      if (ending === 'server-stop') client.message({ t: 'body-stop', request });
      if (ending === 'scene-leave') f.play.dispose();
      if (ending === 'socket-close') client.close();
      assert.equal(client.active, false); assert.equal(f.play.active, false); assert.equal(body.active, false);
      assert.equal(client.captureMovement(), null); assert.equal(client.message(live), false);
      assert.equal(client.allows('mute'), true); assert.equal(f.pilot.external, false);
      assert.equal(root.children.length, 1); assert.equal(root.children[0], f.npc.root);
      assert.equal(f.npc.controlled, false); assert.equal(timers.size, 0);
      if (ending !== 'socket-close') assert.equal(sent.at(-1).t, 'body-decline');
      f.play.dispose(); assert.equal(f.listeners(), 0);
    } finally { client.close(); f.close(); }
  }
});
