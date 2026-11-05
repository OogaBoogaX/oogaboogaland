import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { managedRigs } from './fixtures/clanker-pose-rig.mjs';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';
const source = readFileSync(new URL('../../src/js/host-actor-bindings.js', import.meta.url), 'utf8');
const install = B => { runInNewContext(source, { window: { BL: B } }); return B.hostActorBindings; };
const equipment = { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false };
const view = state => ({ accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 1, zone: 'outside', state,
  presentation: state === 'live' ? null : 'open-hand', deadline: state === 'live' ? null : 160000, equipment });

test('actual independent player rig gets disconnect visuals while the NPC retains its pose and ghost appearance', () => {
  const f = managedRigs({ presence: true }), B = f.B, root = B.scene.createNode(), npc = f.make(), player = f.make();
  B.scene.addChild(root, npc.root, player.root); npc.poseManaged(.25, 4, 0, 5, .6, 2); player.poseManaged(.25, 4, 2, 5, .6, 0);
  const tracks = install(B).create({ root, capacity: 1 }), before = f.display(npc), playerBefore = f.display(player);
  const args = { bodyId: 'player:1', generation: 1, kind: 'clanker', actor: player, npc, freeArm: 'armR' };
  tracks.bind(args); assert.equal(f.display(npc), before); assert.equal(f.display(player), playerBefore);
  assert.equal(npc.parts.armR.smokeOpacity, B.hostActorBindings.GHOST); assert.equal(player.parts.armR.smokeOpacity, undefined);
  const presence = B.hostPresence.create({ root, capacity: 1, resolve: tracks.resolve });
  presence.prepare(); presence.render({ now: 100000, views: [view('grace')], departures: [] });
  assert.equal(presence.hands, 1); assert.equal(B.hostPresence.colorFor(player), '#ef4444'); assert.equal(B.hostPresence.colorFor(npc), null);
  assert.equal(f.display(npc), before, 'player presentation does not pose the ghost track');
  presence.prepare(); presence.render({ now: 100001, views: [view('live')], departures: [] });
  assert.equal(B.hostPresence.colorFor(player), '#22c55e'); assert.equal(npc.parts.armR.smokeOpacity, B.hostActorBindings.GHOST);
  assert.equal(tracks.release('player:1', 0), false); assert.equal(tracks.release('player:1', 1), true);
  assert.equal(npc.parts.armR.smokeOpacity, undefined); assert.equal(f.display(npc), before);
  presence.dispose(); tracks.dispose(); player.dispose(); npc.dispose(); assert.equal(root.children.length, 0);
});

test('ghost binding does not pause or consume the actual NPC controller track', () => {
  const tracked = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1' });
  const reference = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1' });
  const B = tracked.B, npc = tracked.sim.list[0], root = npc.root.parent, player = B.agent.create({ managed: true, groundAt: () => 0 });
  B.scene.addChild(root, player.root);
  const bindings = install(B).create({ root, capacity: 1 });
  try {
    bindings.bind({ bodyId: 'player:1', generation: 1, kind: 'clanker', actor: player, npc });
    for (let i = 0; i < 8; i++) {
      player.poseManaged(.25, i * 2, 3, -i, .5, 4); tracked.step(); reference.step();
      const other = reference.sim.list[0];
      assert.deepEqual([npc.root.position.x, npc.root.position.y, npc.root.position.z, npc.heading, npc.phase, npc.goalX, npc.goalZ],
        [other.root.position.x, other.root.position.y, other.root.position.z, other.heading, other.phase, other.goalX, other.goalZ]);
      assert.equal(npc.controlled, false); assert.equal(npc.remoteControlled, false);
    }
    assert.equal(npc.root.visible, true); assert.notEqual(player.root.position.x, npc.root.position.x);
  } finally { bindings.dispose(); player.dispose(); tracked.dispose(); reference.dispose(); }
});

test('generation, capacity, aliased actors and malformed ghost trees fail before changing existing bindings', () => {
  const f = managedRigs(), B = f.B, root = B.scene.createNode(), npc = f.make(), player = f.make(), replacement = f.make();
  B.scene.addChild(root, npc.root, player.root, replacement.root); const api = install(B), bindings = api.create({ root, capacity: 1 });
  const args = { bodyId: 'player:1', generation: 2, kind: 'clanker', actor: player, npc };
  bindings.bind(args);
  for (const changed of [{ generation: 1 }, { actor: npc }, { actor: replacement }, { bodyId: 'player:2' }])
    assert.throws(() => bindings.bind({ ...args, ...changed }), /independent/);
  assert.equal(bindings.resolve('player:1', 'clanker', 2).actor, player);
  bindings.bind({ ...args, actor: replacement, generation: 3 });
  assert.equal(bindings.release('player:1', 2), false); assert.equal(bindings.resolve('player:1', 'clanker', 2), null);
  const invalid = B.scene.createNode({ smokeOpacity: NaN }); B.scene.addChild(npc.root, invalid);
  assert.throws(() => bindings.refresh('player:1', 3), /independent/);
  assert.equal(npc.parts.armR.smokeOpacity, api.GHOST);
  B.scene.removeChild(npc.root, invalid); bindings.dispose();
  assert.equal(npc.parts.armR.smokeOpacity, undefined); assert.throws(() => bindings.resolve('player:1', 'clanker', 3), /independent/);
  npc.dispose(); player.dispose(); replacement.dispose();
});

test('new gear inherits ghost opacity once, removed gear and original opacity restore without shared geometry mutation', () => {
  const f = managedRigs(), B = f.B, root = B.scene.createNode(), npc = f.make(), player = f.make();
  B.scene.addChild(root, npc.root, player.root); const api = install(B), bindings = api.create({ root, capacity: 1 });
  npc.parts.armL.smokeOpacity = .5;
  const geometry = npc.parts.armL.geometry, keys = Reflect.ownKeys(geometry);
  bindings.bind({ bodyId: 'player:1', generation: 1, kind: 'clanker', actor: player, npc });
  const gear = B.scene.createNode({ geometry }); B.scene.addChild(npc.root, gear);
  bindings.refresh('player:1', 1); bindings.refresh('player:1', 1);
  assert.equal(gear.smokeOpacity, api.GHOST); assert.equal(npc.parts.armL.smokeOpacity, .5 * api.GHOST);
  B.scene.removeChild(npc.root, gear); bindings.refresh('player:1', 1); assert.equal(gear.smokeOpacity, undefined);
  assert.deepEqual(Reflect.ownKeys(geometry), keys); bindings.dispose();
  assert.equal(npc.parts.armL.smokeOpacity, .5); assert.equal(player.parts.armL.smokeOpacity, undefined);
  npc.dispose(); player.dispose();
});

test('bounded ghost tree and cross-account aliases refuse atomically, and later visual ownership survives release', () => {
  const f = managedRigs(), B = f.B, root = B.scene.createNode(), npc = f.make(), player = f.make(), other = f.make();
  B.scene.addChild(root, npc.root, player.root, other.root);
  const api = install(B), bindings = api.create({ root, capacity: 2 });
  const args = { bodyId: 'player:1', generation: 1, kind: 'clanker', actor: player, npc };
  bindings.bind(args);
  assert.throws(() => bindings.bind({ ...args, bodyId: 'player:2', actor: other }), /independent/);
  assert.throws(() => bindings.bind({ ...args, bodyId: 'player:2', actor: npc, npc: null }), /independent/);
  let count = 0; const visit = node => { count++; for (const child of node.children) visit(child); }; visit(npc.root);
  const added = [];
  while (count++ < api.NODES) { const node = B.scene.createNode(); B.scene.addChild(npc.root, node); added.push(node); }
  bindings.refresh('player:1', 1);
  const excess = B.scene.createNode(); B.scene.addChild(npc.root, excess);
  assert.throws(() => bindings.refresh('player:1', 1), /independent/);
  assert.equal(excess.smokeOpacity, undefined); assert.equal(added.at(-1).smokeOpacity, api.GHOST);
  npc.parts.armR.smokeOpacity = .6;
  bindings.release('player:1', 1); assert.equal(npc.parts.armR.smokeOpacity, .6, 'release must not overwrite a later visual owner');
  assert.equal(added.at(-1).smokeOpacity, undefined);
  for (const node of [...added, excess]) B.scene.removeChild(npc.root, node);
  bindings.dispose(); npc.dispose(); player.dispose(); other.dispose();
});
