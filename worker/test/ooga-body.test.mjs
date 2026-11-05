import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/js/ooga-body.js';
import '../../src/js/body-reclaim.js';
const api = globalThis.BL.oogaBody;
const identity = { world: 'world-1', profile: 'ooga-frozen-1', name: 'owner' };
const equipment = { weapon: 'gun', mode: 'combat', primaryOwned: true, secondaryOwned: true,
  selectedSlot: 2, unlimited: false, jetpack: false, jetpackOwned: false };
const position = { x: -0, y: 12, z: 3, yaw: 1.25 };
const record = () => api.codec(identity).encode(position, equipment);

test('Ooga recovery wire keeps position and equipment while rejecting resource/animation continuation and wrong worlds', () => {
  const codec = api.codec(identity), saved = record(), restored = codec.read(JSON.parse(JSON.stringify(saved)));
  assert.ok(Object.is(restored.position.x, -0)); assert.deepEqual(restored.equipment, equipment);
  for (const bad of [{ ...saved, ammo: 0 }, { ...saved, animation: [] }, { ...saved, world: 'other' },
    { ...saved, name: 'another' }, { ...saved, profile: 'future' },
    { ...saved, position: { ...saved.position, y: Infinity } },
    { ...saved, equipment: { ...equipment, health: 100 } },
    { ...saved, equipment: { ...equipment, secondaryOwned: false } }]) assert.throws(() => codec.read(bad), /Ooga/);
  const large = api.codec({ world: 'w'.repeat(80), profile: 'p'.repeat(80), name: 'n'.repeat(80) })
    .encode({ x: 999999.9999999999, y: -999999.9999999999, z: Number.MIN_VALUE, yaw: 6.283185307179586 }, equipment);
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 1024, 'this body wire fits; no combined session-record size claim');
});

// Adapter contract fixture only: no Hub, renderer or substitute physics. The
// source crew's gravity and real geometry remain unverified under the STOP.
function fixture() {
  const node = ({ visible = true } = {}) => ({ visible, children: [], parent: null,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  const scene = { createNode: node, addChild(p, c) { p.children.push(c); c.parent = p; },
    removeChild(p, c) { p.children.splice(p.children.indexOf(c), 1); c.parent = null; } };
  let updates = 0, clear = true, controls = 0, failInput = false;
  const targets = new Set(), originalWorld = { level: 10, health: new Map([['owner', { value: 5 }]]),
    weapons: new Map([['owner', { ammo: 0 }]]), magazine: { owned: true } };
  globalThis.BL.scene = scene;
  globalThis.BL.crew = { create(ctx) {
    const actor = { root: node(), baseY: 1, bodyRadius: .4, bodyHeight: 2, parts: {},
      weapon: { ammo: 30 }, health: { value: 100 }, jet: null, jetpackOwned: false };
    scene.addChild(ctx.root, actor.root); ctx.input.add(actor.root, { cave: actor });
    let player = null;
    return { cavemen: new Map([['owner', actor]]), get player() { return player; },
      control(a) { controls++; player = a; a.root.position.y = a.baseY; return true; },
      selectWeapon(slot, a) { a.weapon.primaryEquipped = slot === 1; a.weapon.equipped = slot === 2; return true; },
      setJetpackOwnership(a, owned) { a.jetpackOwned = owned; }, poseWeapon() {},
      relocatePlayer(p, yaw) { Object.assign(actor.root.position, { x: p.x, y: p.y + actor.baseY, z: p.z }); actor.root.rotation.y = yaw; },
      update() { updates++; }, release() { player = null; },
      dispose() { player = null; ctx.input.remove(actor.root); scene.removeChild(ctx.root, actor.root); } };
  } };
  const context = { root: node(), world: originalWorld, groundAt: () => 0, hud: {},
    input: { add(n) { targets.add(n); if (failInput) throw Error('target registration failed'); }, remove: n => targets.delete(n) } };
  const make = () => api.create({ ...identity, context, clear: () => clear });
  return { make, context, originalWorld, targets, updates: () => updates, controls: () => controls,
    obstruct: () => { clear = false; }, failInput: () => { failInput = true; } };
}

test('Ooga body stages separately, preserves airborne height after possession and enables updates only after activation', () => {
  const f = fixture(), body = f.make();
  assert.notEqual(body.context.world.health, f.originalWorld.health);
  assert.notEqual(body.context.world.weapons, f.originalWorld.weapons);
  assert.notEqual(body.context.world.magazine, f.originalWorld.magazine);
  body.restore(record()); assert.equal(body.actor.root.position.y, 13);
  assert.equal(f.controls(), 0); assert.equal(f.targets.size, 0); assert.equal(body.update(.25, 1), false);
  assert.equal(body.actor.root.parent.visible, false); assert.equal(f.updates(), 0);
  assert.equal(body.activate(), true); assert.equal(body.actor.root.position.y, 13); assert.equal(body.actor.hopV, 0);
  assert.equal(f.targets.size, 1); assert.deepEqual(body.capture(), record());
  body.update(.25, 1); assert.equal(f.updates(), 1);
  body.suspend(); assert.equal(f.targets.size, 0); assert.equal(body.update(.25, 2), false);
  assert.throws(() => body.activate(), /Ooga/); body.dispose(); body.dispose();
  assert.equal(f.context.root.children.length, 0); assert.equal(f.originalWorld.health.get('owner').value, 5);
});

test('Ooga activation rechecks occupancy and unwinds partially registered input without reviving a failed body', () => {
  for (const failure of ['occupancy', 'input']) {
    const f = fixture(), body = f.make(); body.restore(record());
    if (failure === 'occupancy') f.obstruct(); else f.failInput();
    assert.throws(() => body.activate()); assert.equal(body.active, false);
    assert.equal(body.actor.root.parent.visible, false); assert.equal(f.targets.size, 0);
    assert.throws(() => body.activate(), /Ooga/); body.dispose();
    assert.equal(f.context.root.children.length, 0);
  }
});

test('Ooga adapter waits for the actual reclaim coordinator live receipt and tears down its independent body', async () => {
  const f = fixture(), sent = []; let attached = 0, detached = 0;
  const client = globalThis.BL.bodyReclaim.create({ send: m => sent.push(m), monotonic: () => 1000,
    wall: () => 1000, later: () => 1, cancel() {} });
  client.setAdapter(api.reclaimAdapter({ createBody: f.make,
    attach(body) { assert.equal(body.active, true); attached++; return true; }, detach() { detached++; } }));
  client.open(1, 'connection', true);
  const request = 'a'.repeat(32), preparation = { t: 'body-prepare', v: 2, request, accountId: 1,
    bodyId: 'player:1', kind: 'ooga', world: identity.world, epoch: 1, expiresAt: 11000 };
  client.message(preparation); for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(sent.at(-1).t, 'body-ready');
  const transfer = { v: 1, protocol: 'host-session-v5', world: identity.world, epoch: 1, revision: 1,
    at: 1000, expiresAt: 11000, resetResources: 'defaults', checkpoint: record(),
    view: { accountId: 1, bodyId: 'player:1', kind: 'ooga', generation: 1, state: 'offered', deadline: 61000, equipment } };
  client.message({ t: 'body-grant', request, transfer });
  assert.equal(sent.at(-1).t, 'body-applied'); assert.equal(f.context.root.children.length, 1);
  client.message({ t: 'body-active', request, transfer: { ...transfer, revision: 2, expiresAt: 2000,
    view: { ...transfer.view, state: 'starting' } } });
  assert.equal(sent.at(-1).t, 'body-started'); assert.equal(attached, 0); assert.equal(f.targets.size, 0);
  client.message({ t: 'body-live', request, epoch: 1, generation: 1, revision: 2 });
  assert.equal(client.active, true); assert.equal(attached, 1); assert.equal(f.targets.size, 1);
  assert.deepEqual(client.captureMovement().checkpoint, record());
  client.close(); assert.equal(detached, 1); assert.equal(f.context.root.children.length, 0); assert.equal(f.targets.size, 0);
});
